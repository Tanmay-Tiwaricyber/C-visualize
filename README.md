# C Visualizer — See Every Step. Understand Every Line.

An interactive C programming laboratory. Write C in the browser, compile it with a **real** toolchain,
run it under **GDB**, and replay the recorded execution as a synchronised timeline: source line, control
flow, variables, call stack, memory addresses, arrays/pointers and console output.

Nothing is simulated by pattern-matching the source: every line highlight, value and address below comes
from a compiled process stopped inside the debugger.

```
             browser (HTML/CSS/ES modules)
   editor ─► execution controller ─► timeline (recorded steps)
      │            │                      │
      │            │                      ├─► flowchart      (real transitions)
      │            │                      ├─► variables      (debugger snapshots)
      │            │                      ├─► memory         (real addresses)
      │            │                      ├─► call stack     (real frames)
      │            │                      ├─► arrays/pointers
      │            │                      └─► console output (attributed per step)
      │            ▼
      └──► REST API (Express) ─► job sandbox ─► gcc ─► gdb + Python tracer ─► JSONL events
```

---

## Quick start

Requirements: **Node.js ≥ 18**, **GCC** and **GDB**.

```bash
sudo apt-get install -y gcc gdb          # Debian/Ubuntu
npm install
cp .env.example .env                      # optional: tweak limits
npm start                                 # http://localhost:3000
```

The app opens with a working example; press **Run** (`Ctrl+Enter`).

Verify the toolchain:

```bash
curl -s localhost:3000/api/health | jq
```

`/api/health` returns `503` with `status: "degraded"` when GCC or GDB is missing — the UI shows this in
the status bar instead of failing silently.

### Deploy to Render

The repository includes a `Dockerfile` and `render.yaml`. The image installs GCC, GDB, Python 3 and
`util-linux`, so the deployed service does not depend on a compiler being installed on Render's host.

1. Push this repository to GitHub.
2. In Render, choose **New → Blueprint** and connect the repository.
3. Confirm the `c-visualizer` web service and deploy it. Render builds the root `Dockerfile` and
   provides the service's `PORT` environment variable automatically.
4. After deployment, open `https://<your-service>.onrender.com` and check
   `https://<your-service>.onrender.com/api/health`. A ready service reports both compiler and debugger
   as available.

The Render configuration disables per-job network namespaces because nested namespace support is not
guaranteed by a hosted container. `prlimit` resource limits remain enabled, and child processes receive
an allowlisted environment. This is not a security boundary for secrets: the Node service and child
processes still run as the same Linux user, so do not configure credentials on this demo deployment.

> **Security:** with namespaces disabled, submitted C programs can use the service container's network.
> This template is not safe for a public service that accepts arbitrary untrusted code. Before exposing
> it, move compilation and execution to a separately isolated worker running under a different OS
> identity, with no credentials or access to application services, and enforce network isolation there.

The free Render plan may sleep when idle, so the first request after inactivity can take longer. Job
sessions and their temporary files are in memory or `/tmp`; they are not persistent across restarts.

### Development

```bash
npm run dev        # node --watch
npm test           # backend + integration tests (node:test)
```

---

## Feature map

| Area | What it does |
| --- | --- |
| **Editor** | Dependency-free editor with C syntax highlighting, line numbers, current-line marker, gutter breakpoints, find, auto-indent, bracket-aware newline, diagnostics markers, `Ctrl+S` download, unsaved indicator. |
| **Execution** | `Run` starts an isolated job; `Stop` kills the whole process tree. Trace replay: play/pause, speed, step into/over/out, previous/next/first/last, timeline scrubber, run-to-breakpoint. |
| **Flowchart** | Built from the recorded trace: nodes = executed lines, edges = real transitions with traversal counts, loop back edges in their own lane, True/False labels inferred from the source shape. Zoom, pan, click a node to jump to that event. |
| **Variables** | Parameters, locals and globals with type, value, scope, address and change indicator (old → new). Arrays and structs expand. Declarations that have not executed yet show `—` instead of a meaningless raw value. |
| **Memory** | Stack frames with real addresses, pointer values and resolved targets, plus an explicit "heap not tracked" capability note. |
| **Call stack** | One card per frame, recursive calls marked, per-frame arguments and locals. |
| **Arrays & pointers** | Element grids with change highlights, index-variable highlighting, pointer → target rows, running counters for comparisons/element writes. |
| **Console** | Output synchronised with the cursor, stdin editor, compiler diagnostics (click to jump to the line), runtime/sanitizer reports, event log. |
| **Learn mode** | 12 lessons across Beginner / Intermediate / Advanced, each with concept, runnable example, expected output, what to watch, common mistakes and a challenge. |
| **Library** | 46 example programs: basics, loops, patterns, functions, recursion, arrays, searching/sorting, pointers, strings, structures, dynamic memory. |

Keyboard: `Ctrl+Enter` run · `Ctrl+S` download · `Ctrl+F` find · `[` / `]` previous/next step ·
`Space` play/pause · `Esc` close overlays.

---

## How execution tracing works

1. `POST /api/sessions` validates the payload (size, types, NUL bytes, step limits).
2. The job gets a private directory; the source is written as `prog.c` and compiled with
   `gcc -std=c11 -g3 -O0 -Wall -Wextra` (plus `-fsanitize=address,undefined` when **Sanitizers** is on).
3. GDB loads the binary, breaks on `main`, and runs the program with stdin redirected from the input you
   supplied. GDB is started with `set startup-with-shell on` because Debian's GDB ships without Python's
   `select` module, so shell redirection is used instead of `run < file > file`.
4. Once the program is running, the tracer arms a breakpoint on **every source line** of `prog.c` and then
   issues `continue` repeatedly. That gives an exact statement-level timeline *and* stays responsive inside
   tight loops — `next`-based stepping can hang GDB itself in a `while (1) { i++; }` loop.
5. Stdout goes through a pseudo terminal (so libc stays line-buffered and `printf` output lands next to the
   statement that produced it) and is mirrored to a file; stderr goes to its own file.
6. `src/sandbox/gdb_tracer.py` stops before every source statement, and after each stop emits one JSON line:
   line, function, all frames with their locals/parameters, addresses, rendered values, and the output that
   the previous statement produced.
7. `trace-service.js` normalises that stream into the schema the UI renders: `steps[]`, `frames[]`,
   `variables[]`, per-step `output[]`, change tracking per call path, and an `end` record with exit code
   or signal.
8. The browser polls `GET /api/sessions/:id` (with the session token) and, on completion, replays the
   timeline locally. Because the timeline is data, "previous step" is exact and instant.

Limits: 5000 recorded steps, 20 s wall clock, 10 s CPU, 1 GB address space (skipped for sanitizer builds,
which reserve huge shadow memory), output capped at 256 KiB, 2 concurrent jobs, per-IP rate limiting.

### Tracing model in one sentence

This is **trace replay**, not live reverse debugging: the program runs once, the states are recorded in
order, and the UI navigates that recording.

---

## API

All endpoints return `{ ok: true, ... }` on success and `{ ok: false, error: { code, message } }` on failure.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/compile` | Compile only, return normalised diagnostics. |
| `POST` | `/api/execute` | Compile + trace in one request (bounded by the limits). |
| `POST` | `/api/sessions` | Start a background job → `202 { id, token }`. |
| `GET` | `/api/sessions/:id` | Poll status; returns the full result once `status === "finished"`. Requires `x-session-token`. |
| `POST` | `/api/sessions/:id/stop` | Terminate the job (kills the process group). Requires `x-session-token`. |
| `GET` | `/api/health` | Toolchain availability, isolation mode and limits. |

Request body:

```json
{
  "source": "#include <stdio.h>\nint main(void){ return 0; }",
  "stdin": "",
  "options": { "sanitize": false, "maxSteps": 5000 }
}
```

Result schema (abridged):

```json
{
  "jobId": "…",
  "status": "completed | compile-error | runtime-error | timed-out | terminated | trace-error",
  "compiler": { "ok": true, "sanitized": false, "durationMs": 64, "diagnostics": [] },
  "program": { "stdout": "5\n", "stderr": "", "exitCode": 0, "signal": null, "stepCount": 18, "truncated": false },
  "trace": {
    "steps": [
      {
        "index": 0, "line": 5, "fn": "main", "reason": "entry",
        "frames": [{ "fn": "main", "line": 5, "depth": 0,
                     "variables": [{ "name": "a", "kind": "scalar", "type": "int", "display": "2",
                                     "scope": "local", "address": "0x7ffd…" }] }],
        "variables": [], "output": [{ "stream": "stdout", "text": "5\n" }]
      }
    ],
    "notes": [], "end": { "reason": "exit", "exitCode": 0 },
    "capabilities": { "heapTracking": false, "interactiveStdin": false }
  }
}
```

---

## Project structure

```
c-visualizer/
├── public/
│   ├── index.html
│   ├── assets/favicon.svg
│   ├── css/      tokens · base · layout · components · editor · flowchart · memory · responsive
│   └── js/       app · state · api · icons · editor · examples · execution-controller · timeline
│                 variable-inspector · memory-visualizer · call-stack · arrays-pointers
│                 flowchart · history · console · learn · docs
├── src/
│   ├── server.js            process entry (listen + graceful shutdown)
│   ├── app.js               express app (static, CSP, routes, error handling)
│   ├── config.js            environment-driven configuration
│   ├── routes/              health · execute · compile · sessions
│   ├── services/            compiler · execution-service · trace-service · session-manager
│   ├── sandbox/             sandbox-adapter.js · gdb_tracer.py
│   ├── validators/          request-validation.js
│   └── utils/               errors · logger · rate-limit
├── tests/
│   ├── backend/             validation · compiler diagnostics · trace normalisation
│   ├── frontend/            timeline navigation · output slicing · C tokeniser
│   └── integration/         REST contract + a real gcc/gdb run
├── .env.example · .gitignore · LICENSE · README.md · package.json
```

---

## Security model

Submitted code **never** runs inside the Node process.

* Each job runs in its own directory under `CVIS_WORK_ROOT` (mode 0700) and is deleted afterwards.
* `unshare -Urn` gives each job a fresh user namespace and an **empty network namespace** (no interfaces).
* `prlimit` applies CPU time, address space, process count, file size and open-file limits; the wall clock
  kill (`SIGKILL` to the whole process group) covers infinite loops and blocking reads.
* The API never accepts a command, only source text with a byte limit; output is capped; per-IP rate limit
  and a job semaphore prevent resource exhaustion.
* CSP `default-src 'self'` (no CDN at runtime), `nosniff`, `no-referrer`, `SAMEORIGIN`.

This is **process isolation, not a virtual machine**. For a public deployment, additionally run the service
in a container as a dedicated user with a read-only root filesystem, drop capabilities, and keep the limits
small. Sanitizers detect many but not all memory errors.

---

## Honest limitations

* Reverse stepping replays recorded states; it is not reverse execution.
* Breakpoints filter the recorded timeline and are not live debugger breakpoints.
* Standard input is fixed before the run (no interactive keystroke feeding). Reading past the end yields
  EOF, and the trace shows where.
* Heap allocation tracking (block sizes, leaks, allocation sites) is not reconstructed — use Sanitizers for
  real AddressSanitizer/UBSan reports.
* Addresses are real for the traced process but change between runs (ASLR).
* Only executed lines appear in the flowchart.
* Return values are not tracked as separate events; the caller's variable shows the result.
* Tracing requires GDB with Python support; the tracer is Linux-specific (namespaces and `prlimit`).

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Status bar shows **Backend offline** | `npm start` is not running, or the port is blocked. |
| **Toolchain incomplete** | Install `gcc` and/or `gdb`, or point `CVIS_CC` / `CVIS_GDB` at the right binaries. |
| Every run ends with *trace incomplete* | GDB cannot start the program. Check `CVIS_USE_NAMESPACES` — on hosts without unprivileged user namespaces set it to `false` (weaker isolation). |
| Sanitizer build fails with *ReserveShadowMemoryRange failed* | ASan cannot reserve shadow memory under a strict address-space limit; this service already skips `RLIMIT_AS` for sanitizer runs. |
| Long programs stop at 5000 steps | Raise `CVIS_MAX_STEPS`, or narrow the loop. |

---

## License

MIT — see [LICENSE](LICENSE).
