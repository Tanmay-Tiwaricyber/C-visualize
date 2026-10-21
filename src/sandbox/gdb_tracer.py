"""GDB-based execution tracer for C Visualizer.

The backend runs this as:
    gdb -q -batch -nx -x gdb_tracer.py

JSON events are streamed, one object per line, to file descriptor 3. Program
stdout is routed through a pseudo terminal (so libc stays line-buffered) and
mirrored into a file; stderr goes to its own file. The backend reads the
mirrored files so each printf output can be attached to the step that produced
it.

Every recorded event comes from a real compiled process stopped inside GDB -
there is no source-code simulation anywhere in this file.
"""

import json
import os
import re
import traceback

import gdb

CONFIG_PATH = os.environ.get("CVIS_CONFIG", "")
FD = 3
OUTPUT_LIMIT = 256 * 1024


def emit(obj):
    try:
        os.write(FD, (json.dumps(obj, default=str) + "\n").encode("utf-8"))
    except OSError:
        pass


def note(message, level="info"):
    emit({"t": "note", "level": level, "message": message})


def gdb_exec(cmd):
    try:
        return gdb.execute(cmd, to_string=True)
    except gdb.error as exc:
        note("debugger command failed: %s (%s)" % (cmd.split()[0], exc), "debug")
        return ""


class OutputPump:
    """Collects inferior output and attributes it to the current step."""

    def __init__(self, out_path, err_path):
        self.out_path = out_path
        self.err_path = err_path
        self.positions = {"stdout": 0, "stderr": 0}
        self.emitted = 0
        self.truncated = False

    def drain(self):
        chunks = []
        for stream, path in (("stdout", self.out_path), ("stderr", self.err_path)):
            try:
                size = os.path.getsize(path)
            except OSError:
                continue
            pos = self.positions[stream]
            if size <= pos:
                continue
            try:
                with open(path, "rb") as fh:
                    fh.seek(pos)
                    raw = fh.read(128 * 1024)
            except OSError:
                continue
            self.positions[stream] = pos + len(raw)
            text = raw.decode("utf-8", "replace").replace("\r\n", "\n")
            if self.emitted + len(text) > OUTPUT_LIMIT:
                text = text[: max(0, OUTPUT_LIMIT - self.emitted)]
                if not self.truncated:
                    self.truncated = True
                    note("Program output truncated at 256 KiB.", "warning")
            self.emitted += len(text)
            if text:
                chunks.append((stream, text))
        for stream, text in chunks:
            emit({"t": "output", "stream": stream, "text": text})


class PtyBridge:
    """Pseudo terminal that keeps the inferior's stdout line buffered."""

    def __init__(self, mirror_path):
        self.master, self.slave = os.openpty()
        self.slave_name = os.ttyname(self.slave)
        self.mirror_path = mirror_path
        self.fh = open(mirror_path, "ab", buffering=0)
        os.set_blocking(self.master, False)

    def pump(self):
        moved = False
        while True:
            try:
                data = os.read(self.master, 65536)
            except (BlockingIOError, OSError):
                break
            if not data:
                break
            self.fh.write(data)
            moved = True
        return moved


def strip_typedefs(t):
    try:
        while t.code == gdb.TYPE_CODE_TYPEDEF:
            t = t.target()
    except gdb.error:
        return t
    return t


def render_value(val, depth=0):
    """Turn a gdb.Value into an honest, JSON friendly description."""
    if val is None:
        return {"kind": "unknown", "display": "?"}
    try:
        t = strip_typedefs(val.type)
    except gdb.error:
        return {"kind": "unknown", "display": "?"}

    out = {"kind": "scalar", "display": str(val), "cType": str(val.type)}
    try:
        base_name = (t.name or "").strip()
        if base_name in ("char", "signed char", "unsigned char") and t.code != gdb.TYPE_CODE_PTR:
            text = str(val)
            try:
                code = int(val)
                printable = chr(code) if 32 <= code < 127 else "\\x%02x" % (code & 0xFF)
                out["display"] = "'%s' (%s)" % (printable, text)
                out["charCode"] = code
            except (gdb.error, ValueError):
                pass
    except gdb.error:
        pass
    try:
        if t.code == gdb.TYPE_CODE_ARRAY:
            lo, hi = t.range()
            length = hi - lo + 1
            elem_t = strip_typedefs(t.target())
            if elem_t.code == gdb.TYPE_CODE_CHAR or (elem_t.name or "").strip() in (
                "char",
                "signed char",
                "unsigned char",
            ):
                try:
                    text = val.string(encoding="utf-8", errors="replace")
                    out.update(kind="string", length=length, display='"%s"' % text)
                except gdb.error:
                    out.update(kind="array", length=length, display="<unterminated char array>")
                return out
            elements = []
            for i in range(min(length, 128)):
                try:
                    elements.append(render_value(val[i], depth + 1))
                except gdb.error:
                    elements.append({"kind": "unknown", "display": "?"})
            out.update(
                kind="array",
                length=length,
                elements=elements,
                indexBase=lo,
                display="[%d] %s" % (length, " ".join(e["display"] for e in elements[:16])),
            )
        elif t.code in (gdb.TYPE_CODE_STRUCT, gdb.TYPE_CODE_UNION):
            fields = []
            if depth < 2:
                for field in t.fields():
                    if getattr(field, "bitpos", None) is None:
                        continue
                    try:
                        fields.append({"name": field.name, "value": render_value(val[field.name], depth + 1)})
                    except gdb.error:
                        continue
            name = t.name or ""
            if fields:
                rendered_fields = ", ".join("%s: %s" % (f["name"], f["value"]["display"]) for f in fields)
                out.update(kind="struct", fields=fields, display="{%s}" % rendered_fields)
            else:
                out.update(kind="struct", fields=fields, display=("%s {...}" % name) if name else "{...}")
            if name:
                out["typeName"] = name
        elif t.code == gdb.TYPE_CODE_PTR:
            addr = int(val)
            target_t = strip_typedefs(t.target())
            if addr == 0:
                out.update(kind="pointer", pointer={"address": 0, "isNull": True})
            else:
                info = {"address": addr, "isNull": False, "targetType": str(t.target())}
                if target_t.code == gdb.TYPE_CODE_CHAR:
                    try:
                        info["string"] = val.string(encoding="utf-8", errors="replace")
                    except gdb.error:
                        pass
                elif target_t.code in (gdb.TYPE_CODE_INT, gdb.TYPE_CODE_FLT, gdb.TYPE_CODE_ENUM):
                    try:
                        info["deref"] = render_value(val.dereference(), depth + 1)
                    except gdb.error:
                        pass
                out.update(kind="pointer", pointer=info)
        elif t.code == gdb.TYPE_CODE_BOOL:
            out.update(kind="bool")
        elif t.code == gdb.TYPE_CODE_ENUM:
            out.update(kind="enum")
    except gdb.error:
        pass
    return out


def collect_frame_vars(frame, current_line=0):
    variables = []
    try:
        block = frame.block()
    except gdb.error:
        return variables
    seen = set()
    guard = 0
    while block is not None and guard < 8:
        guard += 1
        try:
            symbols = list(block)
        except gdb.error:
            symbols = []
        for sym in symbols:
            try:
                if not (sym.is_variable or sym.is_argument):
                    continue
                if sym.name in seen:
                    continue
                seen.add(sym.name)
                value = sym.value(frame)
                rendered = render_value(value)
                rendered["name"] = sym.name
                rendered["scope"] = "param" if sym.is_argument else "local"
                try:
                    if value.address is not None:
                        rendered["address"] = "0x%x" % int(value.address)
                except gdb.error:
                    pass
                decl_line = getattr(sym, "line", 0) or 0
                if decl_line:
                    rendered["declLine"] = decl_line
                    if decl_line > current_line:
                        # The declaration has not been reached yet: the raw bytes
                        # in the frame slot are meaningless, so do not show them.
                        rendered["pending"] = True
                        rendered["rawDisplay"] = rendered.get("display")
                        rendered["display"] = "—"
                    elif decl_line == current_line and not sym.is_argument:
                        rendered["uninitialized"] = True
                        rendered["rawDisplay"] = rendered.get("display")
                        rendered["display"] = "—"
                variables.append(rendered)
            except gdb.error:
                continue
        if block.function is not None:
            break
        block = block.superblock
    return variables


def collect_globals(frame):
    results = []
    try:
        block = frame.block()
    except gdb.error:
        return results
    while block is not None and not block.is_global:
        block = block.superblock
    if block is None:
        return results
    try:
        symbols = list(block)
    except gdb.error:
        return results
    for sym in symbols:
        if len(results) >= 48:
            break
        try:
            if not (sym.is_variable and not sym.is_argument):
                continue
            symtab = getattr(sym, "symtab", None)
            if symtab is not None and not symtab.filename.endswith("prog.c"):
                continue
            if getattr(sym, "is_constant", False):
                continue
            value = sym.value()
            rendered = render_value(value)
            rendered["name"] = sym.name
            rendered["scope"] = "global"
            try:
                if value.address is not None:
                    rendered["address"] = "0x%x" % int(value.address)
            except gdb.error:
                pass
            results.append(rendered)
        except gdb.error:
            continue
    return results


def collect_all_frames(max_frames=8):
    """Snapshot of the call stack including each frame's locals and params."""
    result = []
    try:
        frame = gdb.newest_frame()
    except gdb.error:
        return result
    depth = 0
    while frame is not None and depth < max_frames:
        try:
            sal = frame.find_sal()
        except gdb.error:
            sal = None
        line = sal.line if sal and sal.line else 0
        entry = {
            "fn": frame.name() or "??",
            "line": line,
            "file": os.path.basename(sal.symtab.filename) if sal and sal.symtab else "",
            "depth": depth,
            "vars": [],
        }
        if line:
            try:
                entry["vars"] = collect_frame_vars(frame, line)
            except gdb.error:
                entry["vars"] = []
        result.append(entry)
        try:
            frame = frame.older()
        except gdb.error:
            break
        depth += 1
    return result


def frames_snapshot():
    frames = []
    try:
        frame = gdb.newest_frame()
    except gdb.error:
        return frames
    depth = 0
    while frame is not None and depth < 64:
        try:
            sal = frame.find_sal()
        except gdb.error:
            sal = None
        frames.append(
            {
                "fn": frame.name() or "??",
                "line": sal.line if sal and sal.line else 0,
                "file": os.path.basename(sal.symtab.filename) if sal and sal.symtab else "",
                "depth": depth,
            }
        )
        try:
            frame = frame.older()
        except gdb.error:
            break
        depth += 1
    return frames


SIGNAL_RE = re.compile(r"Program (?:received signal|terminated with signal) (SIG[A-Z]+)")
STOP_SIGNALS = ("SIGSEGV", "SIGFPE", "SIGBUS", "SIGABRT", "SIGILL")

# The stop-event handler is the reliable source of truth for signals and exit
# codes; parsing gdb's textual output is only a fallback.
STOP_STATE = {"signal": None, "exitCode": None}


def _on_stop(event):
    if isinstance(event, gdb.SignalEvent):
        if event.stop_signal in STOP_SIGNALS:
            STOP_STATE["signal"] = event.stop_signal
    elif isinstance(event, gdb.ExitedEvent):
        STOP_STATE["exitCode"] = event.exit_code


try:
    gdb.events.stop.connect(_on_stop)
except Exception:  # pragma: no cover - very old gdb
    pass


def parse_exit_code(text):
    if STOP_STATE["exitCode"] is not None:
        return STOP_STATE["exitCode"]
    if text:
        match = re.search(r"exited with code (\d+)", text)
        if match:
            return int(match.group(1))
        if "exited normally" in text:
            return 0
    return exit_code_value()


def convenience(name):
    try:
        value = gdb.convenience_variable(name)
        if value is None:
            return None
        return value
    except gdb.error:
        return None


def source_line_count(path):
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            return len(fh.read().split("\n"))
    except OSError:
        return 0


def set_line_breakpoints(source_path, max_lines=1200):
    """Put a breakpoint on every source line that carries code.

    Stepping with `next` makes GDB single-step the target line by line, and in a
    tight `while (1) { i++; }` loop it never hands control back to the CLI.
    Breakpoints at each source line + `continue` give the same line-level
    timeline, stay responsive in loops, and cannot hang inside GDB's stepping
    machinery.
    """
    total = source_line_count(source_path)
    installed = 0
    for line in range(1, min(total, max_lines) + 1):
        try:
            gdb.execute("break %s:%d" % (source_path, line), to_string=True)
            installed += 1
        except gdb.error:
            continue
    return installed


def user_functions():
    """Names of functions defined in the submitted translation unit."""
    names = []
    try:
        text = gdb.execute("info functions", to_string=True)
    except gdb.error:
        return names
    current_file = ""
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("File "):
            current_file = stripped[5:].strip().rstrip(":")
            continue
        if "Non-debugging symbols" in stripped:
            break
        match = re.match(r"^\d+:\s+.*?([A-Za-z_]\w*)\s*\(", stripped)
        if not match:
            continue
        if not current_file.endswith("prog.c"):
            continue
        name = match.group(1)
        if name in names or name in ("main",):
            continue
        names.append(name)
    return names


def run(config):
    max_steps = int(config.get("maxSteps", 4000))
    out_path = config["stdoutPath"]
    err_path = config["stderrPath"]
    stdin_path = config.get("stdinPath") or "/dev/null"

    emit({"t": "start", "maxSteps": max_steps})

    program_path = config.get("programPath")
    if program_path:
        try:
            gdb.execute("file %s" % program_path)
        except gdb.error as exc:
            emit({"t": "error", "message": "Could not load program: %s" % exc})
            emit({"t": "end", "reason": "error", "exitCode": None})
            return

    for cmd in (
        "set pagination off",
        "set confirm off",
        "set breakpoint pending on",
        "set print elements 128",
        "set print array off",
        "set charset UTF-8",
        "set width 0",
        "set height 0",
        "set startup-with-shell on",
        "handle SIGALRM nostop noprint pass",
        "handle SIGPIPE nostop noprint pass",
        "handle SIGSEGV stop print nopass",
        "handle SIGFPE stop print nopass",
        "handle SIGBUS stop print nopass",
        "handle SIGABRT stop print nopass",
    ):
        gdb_exec(cmd)

    bridge = PtyBridge(out_path)
    pump = OutputPump(out_path, err_path)

    functions = user_functions()
    source_path = os.path.join(os.getcwd(), "prog.c")
    emit({"t": "compiled", "instrumented": functions})
    note("Tracing with GDB: source lines, call frames, variables and addresses are read from the live process.")
    if config.get("sanitize"):
        note("This build uses -fsanitize=address,undefined. Sanitizer findings appear in the compiler/runtime panel.")

    # Start the program, then arm a breakpoint on every source line.
    try:
        gdb.execute("break main", to_string=True)
    except gdb.error as exc:
        emit({"t": "error", "message": "Entry point 'main' was not found: %s" % exc})
        emit({"t": "end", "reason": "error", "exitCode": None})
        return

    run_cmd = "run < %s > %s 2>> %s" % (stdin_path, bridge.slave_name, err_path)
    try:
        gdb.execute(run_cmd)
    except gdb.error as exc:
        bridge.pump()
        pump.drain()
        message = str(exc)
        if "exited" in message or "not being run" in message.lower():
            emit({"t": "end", "reason": "exit", "exitCode": exit_code_value(), "steps": 0})
            return
        emit({"t": "error", "message": message})
        emit({"t": "end", "reason": "error", "exitCode": None, "steps": 0})
        return

    installed = set_line_breakpoints(source_path)
    bridge.pump()
    pump.drain()
    note("Breakpoints armed on %d source lines (line-level timeline)." % installed)

    step_index = 0
    previous_globals = {}
    stop_reason = "exit"
    last_signal = None

    while True:
        # Read the pseudo terminal first, then emit whatever the previous
        # statement printed: the output event then follows the step that caused
        # it, which is what the frontend expects.
        bridge.pump()
        pump.drain()
        frames = frames_snapshot()
        top = frames[0] if frames else None
        has_source = bool(top and top["line"] > 0 and top["file"].endswith(".c"))
        if STOP_STATE["signal"]:
            last_signal = STOP_STATE["signal"]
        signal_name = last_signal

        if has_source:
            variables, globals_now, frame_vars = [], [], []
            try:
                frame = gdb.newest_frame()
                variables = collect_frame_vars(frame, int(top["line"]))
                globals_now = collect_globals(frame)
                frame_vars = collect_all_frames()
            except gdb.error:
                pass
            changed = []
            for item in globals_now:
                key = item["name"]
                if key in previous_globals and previous_globals[key] != item.get("display"):
                    changed.append({"name": key, "oldDisplay": previous_globals[key]})
                previous_globals[key] = item.get("display")
            emit(
                {
                    "t": "step",
                    "i": step_index,
                    "line": top["line"],
                    "fn": top["fn"],
                    "file": top["file"],
                    "frames": frames,
                    "vars": variables,
                    "framesWithVars": frame_vars,
                    "globals": globals_now,
                    "changedGlobals": changed,
                    "signal": signal_name,
                }
            )
            step_index += 1

        if signal_name and signal_name in STOP_SIGNALS:
            last_signal = signal_name
            stop_reason = "signal"
            break
        if step_index >= max_steps:
            stop_reason = "step-limit"
            break
        if top is not None and not has_source and len(frames) <= 1:
            stop_reason = "exit"
            break

        try:
            step_output = gdb.execute("continue", to_string=True) or ""
            match = SIGNAL_RE.search(step_output)
            if match:
                last_signal = match.group(1)
        except gdb.error as exc:
            message = str(exc)
            if (
                "exited" in message
                or "not being run" in message.lower()
                or "Cannot find bounds" in message
                or "No symbol table" in message
            ):
                stop_reason = "exit"
                break
            note("debugger: %s" % message, "warning")
            stop_reason = "debugger-error"
            break

    bridge.pump()
    pump.drain()
    for _ in range(3):
        if not bridge.pump():
            break
        pump.drain()

    final_output = ""
    try:
        final_output = gdb.execute("continue", to_string=True) or ""
    except gdb.error as exc:
        final_output += str(exc)
    match = SIGNAL_RE.search(final_output)
    if match:
        last_signal = match.group(1)
    emit(
        {
            "t": "end",
            "reason": "signal" if last_signal else stop_reason,
            "exitCode": parse_exit_code(final_output),
            "signal": last_signal,
            "steps": step_index,
            "truncated": stop_reason == "step-limit",
        }
    )


def exit_code_value():
    value = convenience("_exitcode")
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def main():
    config = {}
    if CONFIG_PATH and os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, "r", encoding="utf-8") as fh:
            config = json.load(fh)
    try:
        run(config)
    except Exception:
        emit({"t": "fatal", "message": traceback.format_exc()[-2000:]})
    finally:
        try:
            gdb.execute("kill", to_string=True)
        except gdb.error:
            pass
        try:
            os.close(FD)
        except OSError:
            pass


main()
