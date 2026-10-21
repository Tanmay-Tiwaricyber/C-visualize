/**
 * Execution controller: owns the run/session lifecycle and trace playback.
 *
 * Run  -> POST /api/sessions -> poll -> full recorded trace -> cursor at 0
 * Stop -> POST /api/sessions/:id/stop (kills the sandboxed process tree)
 *
 * Playback (play/pause/step) never re-executes the program: it moves the cursor
 * over the recorded timeline, which is why the UI can always go backwards.
 */

import * as api from './api.js';
import { STATUS, state, update, addLog, resetExecution } from './state.js';
import { stepsOf, findStep, playoutDelay, nextBreakpoint } from './timeline.js';

export class ExecutionController {
  constructor() {
    this.abort = null;
    this.playTimer = null;
    this.running = false;
  }

  get isBusy() {
    return this.running || state.status === STATUS.COMPILING || state.status === STATUS.RUNNING;
  }

  async run() {
    if (this.isBusy) return;
    const source = state.source;
    if (!source || !source.trim()) {
      update({ status: STATUS.COMPILE_ERROR, statusDetail: 'Nothing to compile' });
      addLog('error', 'The editor is empty — nothing to compile.');
      return;
    }

    this.running = true;
    this.pause();
    this.abort = new AbortController();
    const started = performance.now();

    update({
      status: STATUS.COMPILING,
      statusDetail: 'Compiling with gcc',
      steps: [],
      result: null,
      cursor: -1,
      diagnostics: [],
      runtimeNotes: [],
      sessionId: null,
      sessionToken: null,
    });
    addLog('info', `Compile requested (${source.split('\n').length} lines, sanitizers ${state.sanitize ? 'on' : 'off'}).`);

    try {
      const session = await api.startSession(
        {
          source,
          stdin: state.stdin,
          options: { sanitize: state.sanitize, maxSteps: 5000 },
        },
        this.abort.signal,
      );

      update({ sessionId: session.id, sessionToken: session.token, status: STATUS.RUNNING, statusDetail: 'Executing' });
      addLog('info', 'Isolated execution job started.');

      const result = await api.waitForSession({
        id: session.id,
        token: session.token,
        signal: this.abort.signal,
        onStatus: (status) => {
          if (status === 'running') {
            update({ status: STATUS.RUNNING, statusDetail: 'Tracing with GDB' });
          }
        },
      });

      this.applyResult(result, started);
    } catch (error) {
      if (error.name === 'AbortError') {
        addLog('warn', 'Run cancelled before a trace was produced.');
        update({ status: STATUS.TERMINATED, statusDetail: 'Cancelled by user' });
      } else {
        const message = error.message || 'Execution failed.';
        addLog('error', message);
        update({ status: STATUS.TRACE_ERROR, statusDetail: message });
      }
    } finally {
      this.running = false;
      this.abort = null;
    }
  }

  applyResult(result, started) {
    const duration = result.durationMs != null ? result.durationMs : Math.round(performance.now() - started);
    const steps = stepsOf(result);
    const diagnostics = (result.compiler && result.compiler.diagnostics) || [];
    const runtimeNotes = [];
    if (result.program && result.program.stderr) {
      runtimeNotes.push({ severity: 'error', message: result.program.stderr.trim() });
    }
    if (result.message) {
      runtimeNotes.push({ severity: result.status === 'completed' ? 'info' : 'error', message: result.message });
    }

    const base = {
      result,
      steps,
      diagnostics,
      runtimeNotes,
      durationMs: duration,
      startedAt: Date.now(),
      cursor: steps.length ? 0 : -1,
      playing: false,
    };

    let status = STATUS.PAUSED;
    let detail = result.message || `${steps.length} steps recorded`;
    if (result.status === 'compile-error') {
      status = STATUS.COMPILE_ERROR;
      detail = 'Compilation failed';
      base.cursor = -1;
    } else if (result.status === 'runtime-error') {
      status = STATUS.RUNTIME_ERROR;
      detail = result.message || 'Program terminated abnormally';
      base.cursor = steps.length ? steps.length - 1 : -1;
    } else if (result.status === 'timed-out') {
      status = STATUS.TIMED_OUT;
      detail = result.message || 'Wall-clock limit reached';
    } else if (result.status === 'trace-error') {
      status = STATUS.TRACE_ERROR;
      detail = result.message || 'Trace incomplete';
    } else if (!steps.length) {
      status = STATUS.TRACE_ERROR;
      detail = 'No traceable steps were recorded';
    }

    update({ ...base, status, statusDetail: detail, consoleTab: status === STATUS.COMPILE_ERROR ? 'compiler' : state.consoleTab });

    if (result.compiler && result.compiler.ok) {
      addLog('info', `Compiled in ${result.compiler.durationMs} ms${result.compiler.sanitized ? ' with sanitizers' : ''}.`);
    }
    for (const item of result.trace && result.trace.notes ? result.trace.notes : []) {
      addLog(item.level === 'error' ? 'error' : item.level === 'warning' ? 'warn' : 'info', item.message);
    }
    if (steps.length) {
      addLog('info', `Recorded ${steps.length} execution events in ${duration} ms.`);
    }
    if (status === STATUS.RUNTIME_ERROR) {
      addLog('error', detail);
    }
    if (status === STATUS.COMPILE_ERROR) {
      addLog('error', `Compilation failed with ${diagnostics.length} diagnostic message(s).`);
    }
  }

  async stop() {
    const wasRunning = state.status === STATUS.COMPILING || state.status === STATUS.RUNNING;
    if (state.sessionId && state.sessionToken) {
      try {
        await api.stopSession(state.sessionId, state.sessionToken);
        addLog('warn', 'Session stopped — the sandboxed process tree was killed.');
      } catch (error) {
        addLog('warn', `Stop request failed: ${error.message}`);
      }
    }
    if (this.abort) this.abort.abort();
    this.pause();
    if (wasRunning) {
      update({ status: STATUS.TERMINATED, statusDetail: 'Stopped by user', steps: [], result: null, cursor: -1 });
    }
  }

  clear() {
    this.pause();
    resetExecution();
    addLog('info', 'Session cleared.');
  }

  goTo(index) {
    if (!state.steps.length) return;
    const clamped = Math.max(0, Math.min(index, state.steps.length - 1));
    const atEnd = clamped === state.steps.length - 1;
    let status = state.status;
    if (status === STATUS.PAUSED || status === STATUS.COMPLETED) {
      status = atEnd ? STATUS.COMPLETED : STATUS.PAUSED;
    }
    update({ cursor: clamped, status });
    if (atEnd) this.pause();
  }

  step(mode) {
    if (!state.steps.length) return;
    this.pause();
    const index = findStep(state.steps, state.cursor, mode);
    if (index !== -1) this.goTo(index);
  }

  play() {
    if (!state.steps.length) return;
    if (state.cursor >= state.steps.length - 1) this.goTo(0);
    update({ playing: true });
    const tick = () => {
      if (!state.playing) return;
      const next = state.cursor + 1;
      if (next >= state.steps.length) {
        this.pause();
        update({ status: STATUS.COMPLETED, statusDetail: 'Reached the end of the trace' });
        return;
      }
      const target = state.steps[next];
      if (state.breakpoints.has(target.line) && !this.ignoreBreakpointOnce) {
        this.ignoreBreakpointOnce = false;
        update({ cursor: next, status: STATUS.PAUSED });
        this.pause();
        addLog('warn', `Playback paused at breakpoint on line ${target.line}.`);
        return;
      }
      update({ cursor: next, status: STATUS.PAUSED });
      this.playTimer = setTimeout(tick, playoutDelay(state.speed));
    };
    this.playTimer = setTimeout(tick, playoutDelay(state.speed));
  }

  pause() {
    if (this.playTimer) {
      clearTimeout(this.playTimer);
      this.playTimer = null;
    }
    if (state.playing) update({ playing: false });
  }

  /** Jump to the next recorded event that sits on a breakpoint line. */
  runToBreakpoint() {
    if (!state.steps.length) return;
    this.pause();
    const index = nextBreakpoint(state.steps, state.cursor, state.breakpoints);
    if (index === -1) {
      addLog('warn', 'No breakpoint ahead in the trace. Add one by clicking the editor gutter.');
      return;
    }
    this.goTo(index);
    update({ status: STATUS.PAUSED });
    addLog('info', `Stopped at breakpoint on line ${state.steps[index].line}.`);
  }

  restart() {
    if (!state.steps.length) return;
    this.pause();
    this.goTo(0);
    addLog('info', 'Trace cursor returned to the first recorded event.');
  }
}
