'use strict';

/**
 * Execution service: owns the full lifecycle of one program run.
 *
 *   compile  ->  write stdin  ->  trace under GDB  ->  normalise  ->  cleanup
 *
 * The C program never runs inside this Node process; it runs inside a
 * sandboxed child process tree (see sandbox-adapter.js).
 */

const fs = require('fs');
const fsp = require('fs/promises');
const config = require('../config');
const logger = require('../utils/logger');
const sandbox = require('../sandbox/sandbox-adapter');
const { compileSource } = require('./compiler');
const { buildTrace } = require('./trace-service');

/** Simple counting semaphore so a burst of runs cannot exhaust the host. */
class Semaphore {
  constructor(limit) {
    this.limit = Math.max(1, limit);
    this.active = 0;
    this.queue = [];
  }

  async acquire() {
    if (this.active < this.limit) {
      this.active += 1;
      return;
    }
    await new Promise((resolve) => this.queue.push(resolve));
    this.active += 1;
  }

  release() {
    this.active -= 1;
    const next = this.queue.shift();
    if (next) next();
  }

  snapshot() {
    return { active: this.active, queued: this.queue.length, limit: this.limit };
  }
}

const jobSlots = new Semaphore(config.maxConcurrentJobs);

function sanitizerFindings(stderr) {
  if (!stderr) return null;
  const markers = ['AddressSanitizer', 'UndefinedBehaviorSanitizer', 'runtime error:', 'LeakSanitizer'];
  if (!markers.some((marker) => stderr.includes(marker))) return null;
  const firstLines = stderr
    .split('\n')
    .filter((line) => line.trim())
    .slice(0, 30)
    .join('\n');
  return firstLines;
}

async function runTracer(job, options) {
  const configPath = job.file('cvis-config.json');
  const stdoutPath = job.file('program.out');
  const stderrPath = job.file('program.err');
  const stdinPath = job.file('program.in');

  await fsp.writeFile(stdinPath, options.stdin || '', 'utf8');
  await fsp.writeFile(
    configPath,
    JSON.stringify({
      programPath: job.file('prog'),
      stdoutPath,
      stderrPath,
      stdinPath,
      maxSteps: options.maxSteps,
      sanitize: options.sanitize,
    }),
    'utf8',
  );

  const { child, done, kill } = sandbox.spawnLimited({
    command: config.gdb,
    args: ['-q', '-batch', '-nx', '-x', config.tracerScript],
    cwd: job.dir,
    env: {
      CVIS_CONFIG: configPath,
      LC_ALL: 'C.UTF-8',
      LANG: 'C.UTF-8',
      ASAN_OPTIONS: 'detect_leaks=1:allocator_may_return_null=1:abort_on_error=0',
      UBSAN_OPTIONS: 'print_stacktrace=1',
    },
    skipAddressSpaceLimit: options.sanitize === true,
    stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
    timeoutMs: config.wallTimeoutMs,
  });

  if (typeof options.onProcess === 'function') options.onProcess(kill);

  let traceBuffer = '';
  let stderr = '';
  let gdbStderr = '';
  let gdbStdout = '';

  const traceStream = child.stdio[3];
  if (traceStream) {
    traceStream.setEncoding('utf8');
    traceStream.on('data', (chunk) => {
      if (traceBuffer.length < 24 * 1024 * 1024) traceBuffer += chunk;
    });
  }
  child.stderr.on('data', (chunk) => {
    if (stderr.length < 64 * 1024) stderr += chunk.toString('utf8');
  });
  child.stdout.on('data', (chunk) => {
    if (gdbStdout.length < 64 * 1024) gdbStdout += chunk.toString('utf8');
  });

  // gdb's own stderr (warnings about missing debug info, etc.)
  const result = await done;
  gdbStderr = stderr;

  return {
    raw: traceBuffer,
    gdbStdout,
    gdbStderr: gdbStderr.slice(-8000),
    timedOut: result.timedOut,
    exitStatus: result.code,
    killed: typeof kill === 'function',
  };
}

function classify({ compile, trace, timedOut, gdbStderr }) {
  const findings = sanitizerFindings(trace.stderr);
  if (timedOut) {
    return {
      status: 'timed-out',
      message: `Execution stopped after the ${config.wallTimeoutMs} ms wall-clock limit.`,
    };
  }
  if (findings) {
    return { status: 'runtime-error', message: 'A sanitizer reported undefined behaviour during execution.' };
  }
  if (trace.end.signal) {
    return {
      status: 'runtime-error',
      message: `The program was terminated by ${trace.end.signal}.`,
    };
  }
  if (trace.end.reason === 'error' || trace.end.reason === 'debugger-error') {
    return { status: 'trace-error', message: 'The debugger could not record a complete trace.' };
  }
  const notes = trace.notes.filter((note) => note.level === 'error');
  if (notes.length && trace.steps.length === 0) {
    return { status: 'trace-error', message: notes[0].message };
  }
  if (trace.end.reason === 'step-limit') {
    return {
      status: 'completed',
      message: `Trace truncated at ${config.maxSteps} recorded steps to keep the session responsive.`,
    };
  }
  if (!trace.steps.length) {
    return {
      status: 'trace-error',
      message: gdbStderr ? 'No execution steps could be recorded.' : 'The program produced no traceable steps.',
    };
  }
  if (!compile.ok) {
    return { status: 'compile-error', message: 'Compilation failed.' };
  }
  return { status: 'completed', message: null };
}

/**
 * Execute one program and return the complete result (compile info + trace).
 */
async function executeProgram({ source, stdin = '', options = {} }) {
  const started = Date.now();
  await jobSlots.acquire();
  const job = await sandbox.createJobDir();

  try {
    const maxSteps = options.maxSteps || config.maxSteps;
    const sanitize = options.sanitize === true;

    const compile = await compileSource(job, source, { sanitize });

    if (!compile.ok) {
      return {
        jobId: job.id,
        status: 'compile-error',
        durationMs: Date.now() - started,
        compiler: {
          ok: false,
          sanitized: compile.sanitized,
          durationMs: compile.durationMs,
          diagnostics: compile.diagnostics,
        },
        program: {
          stdout: '',
          stderr: '',
          exitCode: null,
          signal: null,
          stepCount: 0,
          truncated: false,
          timedOut: false,
        },
        trace: { steps: [], notes: [], end: { reason: 'not-started' }, functions: [], capabilities: {} },
        message: 'The program did not compile, so execution never started.',
      };
    }

    const run = await runTracer(job, { stdin, maxSteps, sanitize, onProcess: options.onProcess });
    const trace = buildTrace(run.raw);
    const verdict = classify({ compile, trace, timedOut: run.timedOut, gdbStderr: run.gdbStderr });

    if (sanitize && !trace.notes.some((note) => note.message.includes('sanitizer'))) {
      trace.notes.push({
        level: 'info',
        message: 'Built with -fsanitize=address,undefined. Sanitizers detect many, but not all, memory errors.',
      });
    }

    return {
      jobId: job.id,
      status: verdict.status,
      message: verdict.message,
      durationMs: Date.now() - started,
      compiler: {
        ok: true,
        sanitized: compile.sanitized,
        durationMs: compile.durationMs,
        diagnostics: compile.diagnostics,
      },
      program: {
        stdout: trace.stdout.slice(0, config.maxOutputBytes),
        stderr: trace.stderr.slice(0, config.maxOutputBytes),
        exitCode: trace.end.exitCode,
        signal: trace.end.signal,
        stepCount: trace.steps.length,
        truncated: trace.end.truncated === true,
        timedOut: run.timedOut,
        stdinProvided: Boolean(stdin),
      },
      trace: {
        steps: trace.steps,
        notes: trace.notes,
        end: trace.end,
        functions: trace.functions,
        capabilities: {
          stepLimit: maxSteps,
          debugger: 'gdb',
          sourceMapping: true,
          variableValues: true,
          addresses: true,
          heapTracking: false,
          interactiveStdin: false,
          sanitizers: sanitize,
        },
      },
      limits: {
        maxSteps,
        wallTimeoutMs: config.wallTimeoutMs,
        memoryMb: config.memoryMb,
        maxOutputBytes: config.maxOutputBytes,
      },
    };
  } catch (error) {
    logger.error('execution failed', { message: error.message, jobId: job.id });
    return {
      jobId: job.id,
      status: 'trace-error',
      message: `The execution service failed: ${error.message}`,
      durationMs: Date.now() - started,
      compiler: { ok: false, diagnostics: [], sanitized: false, durationMs: 0 },
      program: { stdout: '', stderr: '', exitCode: null, signal: null, stepCount: 0, truncated: false, timedOut: false },
      trace: { steps: [], notes: [{ level: 'error', message: error.message }], end: {}, functions: [], capabilities: {} },
    };
  } finally {
    jobSlots.release();
    // Temporary artifacts are removed even when the run failed.
    setImmediate(() => {
      job.cleanup();
    });
  }
}

/** Compile-only helper used by POST /api/compile. */
async function compileOnly({ source, options = {} }) {
  await jobSlots.acquire();
  const job = await sandbox.createJobDir();
  try {
    const compile = await compileSource(job, source, { sanitize: options.sanitize === true });
    return {
      jobId: job.id,
      ok: compile.ok,
      sanitized: compile.sanitized,
      durationMs: compile.durationMs,
      diagnostics: compile.diagnostics,
    };
  } finally {
    jobSlots.release();
    setImmediate(() => job.cleanup());
  }
}

function poolSnapshot() {
  return jobSlots.snapshot();
}

module.exports = { executeProgram, compileOnly, poolSnapshot };
