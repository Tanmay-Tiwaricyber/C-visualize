/**
 * Timeline helpers.
 *
 * The backend returns a fully recorded list of execution events. Everything the
 * UI does - stepping, playing, jumping to a breakpoint - is navigation over that
 * recorded list, which is why "previous step" is always exact and instant.
 */

export function stepsOf(result) {
  return (result && result.trace && result.trace.steps) || [];
}

/** Concatenated program output visible at a given step index. */
export function outputAt(steps, index) {
  if (!steps.length) return '';
  let text = '';
  const limit = Math.min(index, steps.length - 1);
  for (let i = 0; i <= limit; i += 1) {
    for (const chunk of steps[i].output || []) {
      text += chunk.text;
    }
  }
  return text;
}

export function outputAtStream(steps, index, stream) {
  if (!steps.length) return '';
  let text = '';
  const limit = Math.min(index, steps.length - 1);
  for (let i = 0; i <= limit; i += 1) {
    for (const chunk of steps[i].output || []) {
      if (chunk.stream === stream) text += chunk.text;
    }
  }
  return text;
}

export function currentStep(state) {
  if (!state.steps.length) return null;
  return state.steps[Math.max(0, Math.min(state.cursor, state.steps.length - 1))];
}

/** Human readable one-line description of what a step did. */
export function summariseStep(step, previous) {
  const parts = [];

  if (step.reason === 'call' && previous) {
    const entered = step.frames[0];
    parts.push(`entered ${entered.fn}()`);
  } else if (step.reason === 'return' && previous) {
    parts.push(`returned to ${step.frames[0].fn}()`);
  }

  for (const variable of step.variables) {
    if (!variable.changed) continue;
    if (parts.length >= 2) break;
    parts.push(`${variable.name} ${variable.previousDisplay} → ${variable.display}`);
  }

  for (const chunk of step.output || []) {
    const text = chunk.text.replace(/\n/g, '⏎').trim();
    if (!text) continue;
    parts.push(`put "${text.slice(0, 48)}${text.length > 48 ? '…' : ''}"`);
    break;
  }

  if (step.signal) parts.push(`${step.signal}`);

  if (!parts.length) {
    const line = (step.sourceLine || '').trim();
    parts.push(line ? `line ${step.line}` : `step ${step.index}`);
  }

  return parts.join(' · ');
}

export function changedVariables(step, previous) {
  if (!previous) return [];
  const previousByName = new Map();
  for (const variable of previous.variables) previousByName.set(variable.name + '|' + variable.scope, variable);
  const changes = [];
  for (const variable of step.variables) {
    const before = previousByName.get(variable.name + '|' + variable.scope);
    if (before && before.display !== variable.display) {
      changes.push({ name: variable.name, from: before.display, to: variable.display, scope: variable.scope });
    }
  }
  return changes;
}

/** Navigation for the trace-replay step buttons. */
export function findStep(steps, from, mode) {
  if (!steps.length) return -1;
  const base = Math.max(-1, Math.min(from, steps.length - 1));
  if (mode === 'next' || mode === 'into') {
    return Math.min(steps.length - 1, base + 1);
  }
  if (mode === 'prev') {
    return Math.max(0, base - 1);
  }
  if (mode === 'over' || mode === 'out') {
    const current = steps[base] || steps[0];
    const targetDepth = mode === 'over' ? current.depth : current.depth - 1;
    for (let i = base + 1; i < steps.length; i += 1) {
      const candidate = steps[i];
      if (candidate.depth <= targetDepth) return i;
    }
    return steps.length - 1;
  }
  return base;
}

/** Next step index that sits on one of the user's breakpoint lines. */
export function nextBreakpoint(steps, from, breakpoints) {
  if (!breakpoints || !breakpoints.size) return -1;
  for (let i = Math.max(0, from + 1); i < steps.length; i += 1) {
    if (breakpoints.has(steps[i].line)) return i;
  }
  return -1;
}

export function previousBreakpoint(steps, from, breakpoints) {
  if (!breakpoints || !breakpoints.size) return -1;
  for (let i = Math.min(from - 1, steps.length - 1); i >= 0; i -= 1) {
    if (breakpoints.has(steps[i].line)) return i;
  }
  return -1;
}

/** All variables visible in the active frame at a step. */
export function variablesAt(step) {
  if (!step) return { locals: [], globals: [], params: [] };
  const locals = [];
  const params = [];
  const globals = [];
  for (const variable of step.variables) {
    if (variable.scope === 'global') globals.push(variable);
    else if (variable.scope === 'param') params.push(variable);
    else locals.push(variable);
  }
  return { locals, params, globals };
}

/** Every frame of the current step, newest first, with its variables. */
export function framesAt(step) {
  return step ? step.frames : [];
}

/** State description used by the status chip and status bar. */
export function describeStatus(state) {
  const step = currentStep(state);
  if (!step) return '';
  return `${step.fn}() · line ${step.line}`;
}

export function playoutDelay(speed) {
  const base = 520;
  return Math.max(16, Math.round(base / Math.max(0.25, speed)));
}
