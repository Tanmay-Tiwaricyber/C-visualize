/**
 * Central application state.
 *
 * Every panel reads from this single object and re-renders through subscribers,
 * so the editor, flowchart, variables, memory and console can never disagree
 * about which execution event is current.
 */

export const STATUS = {
  IDLE: 'idle',
  COMPILING: 'compiling',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  COMPILE_ERROR: 'compile-error',
  RUNTIME_ERROR: 'runtime-error',
  TIMED_OUT: 'timed-out',
  TERMINATED: 'terminated',
  TRACE_ERROR: 'trace-error',
};

export const STATUS_LABEL = {
  idle: 'Idle',
  compiling: 'Compiling',
  running: 'Running',
  paused: 'Paused',
  completed: 'Completed',
  'compile-error': 'Compile error',
  'runtime-error': 'Runtime error',
  'timed-out': 'Timed out',
  terminated: 'Terminated',
  'trace-error': 'Trace incomplete',
};

const listeners = new Set();

export const state = {
  // Program text
  source: '',
  savedSource: '',
  dirty: false,
  activeExampleId: '',
  stdin: '',

  // Execution
  status: STATUS.IDLE,
  statusDetail: '',
  result: null,
  steps: [],
  cursor: -1,
  playing: false,
  speed: 1,
  sanitize: false,
  sessionId: null,
  sessionToken: null,
  durationMs: null,
  startedAt: null,
  stale: false,

  // Debug aids
  breakpoints: new Set(),

  // Layout / preferences
  panel: 'flow',
  splitPanel: '',
  consoleTab: 'output',
  consoleCollapsed: false,
  theme: 'dark',
  learnOpen: false,
  clearOutputView: false,

  // Rich text views
  logs: [],
  diagnostics: [],
  runtimeNotes: [],
  toast: null,
};

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let frame = null;

function notify(meta) {
  if (meta && meta.immediate) {
    frame = null;
    listeners.forEach((listener) => listener(state, meta));
    return;
  }
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    listeners.forEach((listener) => listener(state, meta));
  });
}

export function update(patch, meta = {}) {
  let changed = false;
  for (const [key, value] of Object.entries(patch)) {
    if (state[key] !== value) {
      state[key] = value;
      changed = true;
    }
  }
  if (changed || meta.force) notify(meta);
}

export function addLog(level, message) {
  const entry = {
    time: new Date().toLocaleTimeString('en-GB', { hour12: false }),
    level,
    message,
  };
  state.logs = [...state.logs.slice(-299), entry];
  update({ logs: state.logs });
}

export function markDirty(value) {
  update({ dirty: value, savedSource: value ? state.savedSource : state.source });
}

export function resetExecution() {
  update({
    status: STATUS.IDLE,
    statusDetail: '',
    result: null,
    steps: [],
    cursor: -1,
    playing: false,
    sessionId: null,
    sessionToken: null,
    diagnostics: [],
    runtimeNotes: [],
    durationMs: null,
    startedAt: null,
    clearOutputView: false,
  });
}
