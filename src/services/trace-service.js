'use strict';

/**
 * Trace service: converts the raw JSON-line stream produced by the GDB tracer
 * into the normalised execution timeline the frontend renders.
 */

const MAX_VARS_PER_STEP = 200;

function asString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normaliseVariable(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = asString(raw.name);
  if (!name) return null;
  const kind = ['scalar', 'array', 'struct', 'pointer', 'string', 'bool', 'enum', 'unknown'].includes(raw.kind)
    ? raw.kind
    : 'scalar';
  const variable = {
    name,
    kind,
    display: asString(raw.display, '?'),
    type: asString(raw.cType, ''),
    scope: raw.scope === 'global' ? 'global' : raw.scope === 'param' ? 'param' : 'local',
    address: asString(raw.address) || null,
    declLine: Number.isFinite(raw.declLine) ? raw.declLine : null,
    pending: raw.pending === true,
    uninitialized: raw.uninitialized === true,
  };
  if (kind === 'array') {
    variable.length = Number.isFinite(raw.length) ? raw.length : null;
    variable.indexBase = Number.isFinite(raw.indexBase) ? raw.indexBase : 0;
    variable.elements = Array.isArray(raw.elements)
      ? raw.elements.slice(0, 256).map((element) => ({
          display: asString(element && element.display, '?'),
          kind: asString(element && element.kind, 'scalar'),
          type: asString(element && element.cType, ''),
          charCode: element && Number.isFinite(element.charCode) ? element.charCode : undefined,
        }))
      : [];
  }
  if (kind === 'struct') {
    variable.fields = Array.isArray(raw.fields)
      ? raw.fields.slice(0, 64).map((field) => ({
          name: asString(field.name),
          display: asString(field.value && field.value.display, '?'),
          kind: asString(field.value && field.value.kind, 'scalar'),
        }))
      : [];
  }
  if (kind === 'pointer' && raw.pointer && typeof raw.pointer === 'object') {
    variable.pointer = {
      address: Number.isFinite(raw.pointer.address) ? raw.pointer.address : 0,
      isNull: raw.pointer.isNull === true,
      targetType: asString(raw.pointer.targetType),
      deref: raw.pointer.deref ? asString(raw.pointer.deref.display, '?') : null,
      string: asString(raw.pointer.string) || null,
    };
  }
  return variable;
}

function normaliseFrames(rawFrames) {
  if (!Array.isArray(rawFrames)) return [];
  return rawFrames.slice(0, 64).map((frame, depth) => ({
    fn: asString(frame && frame.fn, '??'),
    line: Number.isFinite(frame && frame.line) ? frame.line : 0,
    file: asString(frame && frame.file),
    depth,
    variables: Array.isArray(frame && frame.vars)
      ? frame.vars
          .map(normaliseVariable)
          .filter(Boolean)
          .slice(0, 64)
      : [],
  }));
}

/**
 * @param {string} rawText JSONL produced by gdb_tracer.py
 * @returns {{steps:Array, stdout:string, stderr:string, notes:Array, end:Object}}
 */
function buildTrace(rawText) {
  const lines = String(rawText || '').split('\n');
  const steps = [];
  const notes = [];
  const capabilities = {};
  let stdout = '';
  let stderr = '';
  let pendingOutput = [];
  let end = { reason: 'unknown', exitCode: null, signal: null, steps: 0, truncated: false };
  let instrumented = [];

  const flushOutput = () => {
    const chunk = pendingOutput;
    pendingOutput = [];
    return chunk;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let event;
    try {
      event = JSON.parse(trimmed);
    } catch (_) {
      continue;
    }
    switch (event.t) {
      case 'start':
        capabilities.stepLimit = Number.isFinite(event.maxSteps) ? event.maxSteps : null;
        break;
      case 'compiled':
        instrumented = Array.isArray(event.instrumented) ? event.instrumented : [];
        break;
      case 'note':
        notes.push({ level: asString(event.level, 'info'), message: asString(event.message) });
        break;
      case 'output': {
        const stream = event.stream === 'stderr' ? 'stderr' : 'stdout';
        const text = asString(event.text);
        if (!text) break;
        if (stream === 'stdout') stdout += text;
        else stderr += text;
        // Output is flushed after the statement that produced it, so it belongs
        // to the step that was just recorded.
        if (steps.length) steps[steps.length - 1].output.push({ stream, text });
        else pendingOutput.push({ stream, text });
        break;
      }
      case 'step': {
        if (steps.length >= 20000) break;
        let variables = (Array.isArray(event.vars) ? event.vars : [])
          .map(normaliseVariable)
          .filter(Boolean)
          .slice(0, MAX_VARS_PER_STEP);
        const globals = (Array.isArray(event.globals) ? event.globals : [])
          .map(normaliseVariable)
          .filter(Boolean)
          .slice(0, MAX_VARS_PER_STEP)
          .map((variable) => ({ ...variable, scope: 'global' }));
        variables = variables.concat(globals);
        const frames = normaliseFrames(
          Array.isArray(event.framesWithVars) && event.framesWithVars.length ? event.framesWithVars : event.frames,
        );
        steps.push({
          index: steps.length,
          line: Number.isFinite(event.line) ? event.line : 0,
          fn: asString(event.fn, 'main'),
          file: asString(event.file, 'prog.c'),
          frames,
          depth: frames.length,
          variables,
          changedGlobals: Array.isArray(event.changedGlobals) ? event.changedGlobals : [],
          signal: asString(event.signal) || null,
          output: flushOutput(),
        });
        break;
      }
      case 'end':
        end = {
          reason: asString(event.reason, 'unknown'),
          exitCode: Number.isFinite(event.exitCode) ? event.exitCode : null,
          signal: asString(event.signal) || null,
          steps: Number.isFinite(event.steps) ? event.steps : steps.length,
          truncated: event.truncated === true,
        };
        break;
      case 'error':
        notes.push({ level: 'error', message: asString(event.message, 'Tracer error') });
        if (end.reason === 'unknown') end.reason = 'error';
        break;
      case 'fatal':
        notes.push({ level: 'error', message: asString(event.message, 'Tracer crashed') });
        end.reason = 'error';
        break;
      default:
        break;
    }
  }

  if (pendingOutput.length && steps.length) {
    // Output produced before the first source step (e.g. buffered stdout).
    steps[0].output.unshift(...flushOutput());
  }

  // Classify each step (call / return / crash / step) by comparing frames.
  for (let i = 0; i < steps.length; i += 1) {
    const previous = i > 0 ? steps[i - 1] : null;
    let reason = 'step';
    if (previous) {
      if (steps[i].depth > previous.depth) reason = 'call';
      else if (steps[i].depth < previous.depth) reason = 'return';
    } else {
      reason = 'entry';
    }
    if (steps[i].signal) reason = 'crash';
    steps[i].reason = reason;
    steps[i].callDepth = steps[i].depth;
  }

  // Change tracking: compare each variable against the previous step that had
  // the same call path, so recursion frames do not overwrite each other.
  const lastSeen = new Map();
  for (const step of steps) {
    const pathKey = step.frames
      .slice()
      .reverse()
      .map((frame) => frame.fn)
      .join('>');
    for (const variable of step.variables) {
      const key = `${pathKey}|${variable.name}`;
      const previous = lastSeen.get(key);
      // A transition from "not in scope / uninitialized" (shown as an em dash)
      // is not a value change, and neither is the noise of a slot that was
      // never written. Real old → new transitions are reported.
      const comparable =
        previous !== undefined && previous !== '—' && variable.display !== '—' && previous !== variable.display;
      if (comparable && !variable.pending && !variable.uninitialized) {
        variable.changed = true;
        variable.previousDisplay = previous;
      }
      lastSeen.set(key, variable.display);
    }
  }

  return {
    steps,
    stdout,
    stderr,
    notes,
    end,
    functions: instrumented,
    capabilities,
  };
}

module.exports = { buildTrace };
