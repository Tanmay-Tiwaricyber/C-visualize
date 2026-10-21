/**
 * Bottom console: program output (synchronised with the trace cursor),
 * program input, compiler diagnostics, runtime/sanitizer reports and logs.
 */

import { iconSvg } from './icons.js';
import { outputAt, outputAtStream } from './timeline.js';

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
}

export class ConsolePanel {
  constructor(root, options = {}) {
    this.root = root;
    this.onSelectLine = options.onSelectLine || (() => {});
    this.onStdinChange = options.onStdinChange || (() => {});
    this.elements = {
      output: root.querySelector('#program-output'),
      outputEmpty: root.querySelector('#output-empty'),
      stdin: root.querySelector('#stdin-input'),
      diagnostics: root.querySelector('#diagnostics-list'),
      runtime: root.querySelector('#runtime-list'),
      logs: root.querySelector('#log-list'),
      badgeCompiler: root.querySelector('#badge-compiler'),
      badgeRuntime: root.querySelector('#badge-runtime'),
      badgeOutput: root.querySelector('#badge-output'),
    };
    this.clearedAt = 0;
    this.bind();
  }

  bind() {
    if (this.elements.stdin) {
      this.elements.stdin.addEventListener('input', () => this.onStdinChange(this.elements.stdin.value));
    }
    this.root.querySelectorAll('.diagnostic[data-line]').forEach(() => {});
    if (this.elements.diagnostics) {
      this.elements.diagnostics.addEventListener('click', (event) => {
        const item = event.target.closest('[data-line]');
        if (item && item.dataset.line) this.onSelectLine(Number(item.dataset.line));
      });
    }
  }

  setStdin(value) {
    if (this.elements.stdin && this.elements.stdin.value !== value) this.elements.stdin.value = value;
  }

  render(state) {
    this.renderOutput(state);
    this.renderDiagnostics(state);
    this.renderRuntime(state);
    this.renderLogs(state);
    this.setStdin(state.stdin || '');

    if (this.elements.badgeCompiler) {
      const errors = state.diagnostics.filter((item) => item.severity === 'error').length;
      const warnings = state.diagnostics.filter((item) => item.severity === 'warning').length;
      if (errors || warnings) {
        this.elements.badgeCompiler.hidden = false;
        this.elements.badgeCompiler.textContent = String(errors || warnings);
        this.elements.badgeCompiler.dataset.tone = errors ? 'error' : 'warn';
      } else {
        this.elements.badgeCompiler.hidden = true;
      }
    }
    if (this.elements.badgeRuntime) {
      const problems = state.runtimeNotes.filter((item) => item.severity === 'error').length;
      this.elements.badgeRuntime.hidden = problems === 0;
      this.elements.badgeRuntime.textContent = String(problems);
      this.elements.badgeRuntime.dataset.tone = 'error';
    }
  }

  renderOutput(state) {
    const { output, outputEmpty } = this.elements;
    if (!output) return;
    if (!state.steps.length) {
      output.textContent = '';
      if (outputEmpty) outputEmpty.hidden = false;
      return;
    }
    if (outputEmpty) outputEmpty.hidden = true;
    const text = outputAt(state.steps, state.cursor);
    const full = state.result && state.result.program ? state.result.program.stdout || '' : '';
    const pending = full.length > text.length;
    if (output.dataset.text === text && output.dataset.pending === String(pending)) return;
    output.dataset.text = text;
    output.dataset.pending = String(pending);
    const upcoming = pending ? full.slice(text.length).split('\n').filter((line) => line.length)[0] || '' : '';
    output.innerHTML =
      escapeHtml(text) +
      (pending
        ? `<span class="output-pending">${text ? '' : 'no output yet — the program prints later in the trace'}${
            upcoming ? ` (next: ${escapeHtml(upcoming.slice(0, 60))}${upcoming.length > 60 ? '…' : ''})` : ''
          }</span>`
        : '');
    output.scrollTop = output.scrollHeight;
  }

  renderDiagnostics(state) {
    const target = this.elements.diagnostics;
    if (!target) return;
    if (!state.diagnostics.length) {
      target.innerHTML = `
        <div class="console-empty">
          ${iconSvg('check')}
          <span>${state.result && state.result.compiler && state.result.compiler.ok ? 'Compiled cleanly — no diagnostics.' : 'No compiler output yet. Run the program to compile it.'}</span>
        </div>`;
      return;
    }
    target.innerHTML = state.diagnostics
      .map((item) => {
        const iconName = item.severity === 'error' ? 'x-circle' : item.severity === 'warning' ? 'warning' : 'info';
        const location = Number.isFinite(item.line) ? `prog.c:${item.line}${item.column ? `:${item.column}` : ''}` : '';
        const children = (item.children || []).map((child) => escapeHtml(child.message)).join('<br>');
        return `
          <button class="diagnostic" data-severity="${item.severity}" ${Number.isFinite(item.line) ? `data-line="${item.line}"` : ''}>
            ${iconSvg(iconName)}
            <span class="diagnostic-body">
              <span class="diagnostic-message">${escapeHtml(item.message)}</span>
              ${item.option ? `<span class="diagnostic-option"> [${escapeHtml(item.option)}]</span>` : ''}
              ${children ? `<span class="diagnostic-children">${children}</span>` : ''}
            </span>
            <span class="diagnostic-loc">${location}</span>
          </button>`;
      })
      .join('');
  }

  renderRuntime(state) {
    const target = this.elements.runtime;
    if (!target) return;
    const notes = [...state.runtimeNotes];
    const stderrText = state.result && state.result.program ? state.result.program.stderr || '' : '';
    const hasSanitizer = /AddressSanitizer|UndefinedBehaviorSanitizer|runtime error:/.test(stderrText);

    let html = '';

    if (hasSanitizer) {
      const cleaned = stderrText
        .replace(/\/tmp\/cvis-jobs\/job-[0-9a-f]+\//g, '')
        .replace(/\/tmp\/[^\s:]+\/prog\.c/g, 'prog.c')
        .split('\n')
        .join('\n')
        .trim();
      html += `
        <div class="diagnostic" data-severity="error" style="cursor:default">
          ${iconSvg('bug')}
          <span class="diagnostic-body">
            <span class="diagnostic-message">Sanitizer report</span>
            <pre class="diagnostic-raw">${escapeHtml(cleaned.slice(0, 4000))}</pre>
          </span>
          <span class="diagnostic-loc">stderr</span>
        </div>`;
    }

    if (notes.length) {
      html += notes
        .map(
          (note) => `
          <div class="diagnostic" data-severity="${note.severity === 'error' ? 'error' : 'info'}" style="cursor:default">
            ${iconSvg(note.severity === 'error' ? 'x-circle' : 'info')}
            <span class="diagnostic-body"><span class="diagnostic-message">${escapeHtml(note.message)}</span></span>
          </div>`,
        )
        .join('');
    }

    const exitInfo = [];
    if (state.result && state.result.program) {
      const program = state.result.program;
      if (program.signal) exitInfo.push(`terminated by ${program.signal}`);
      if (program.exitCode !== null && program.exitCode !== undefined) exitInfo.push(`exit code ${program.exitCode}`);
      if (program.timedOut) exitInfo.push('wall-clock limit reached');
      if (program.truncated) exitInfo.push('trace truncated at the step limit');
    }

    if (exitInfo.length) {
      html += `
        <div class="console-empty" style="color:var(--text-muted)">
          ${iconSvg('activity')}
          <span>Program ${escapeHtml(exitInfo.join(' · '))}.</span>
        </div>`;
    }

    if (!html) {
      html = `
        <div class="console-empty">
          ${iconSvg('check')}
          <span>No runtime errors were reported. Enable Sanitizers in the toolbar to catch memory errors that do not crash the program.</span>
        </div>`;
    }
    if (target.dataset.html === html) return;
    target.dataset.html = html;
    target.innerHTML = html;
  }

  renderLogs(state) {
    const target = this.elements.logs;
    if (!target) return;
    if (!state.logs.length) {
      target.innerHTML = '<li class="log-empty">Execution logs appear here: compile timings, trace size, sanitizer status and errors.</li>';
      return;
    }
    target.innerHTML = state.logs
      .slice(-200)
      .map(
        (entry) => `
        <li class="log-item" data-level="${entry.level}">
          <span class="log-time">${escapeHtml(entry.time)}</span>
          <span class="log-msg">${escapeHtml(entry.message)}</span>
        </li>`,
      )
      .join('');
  }

  stderrSummary(steps, index) {
    return outputAtStream(steps, index, 'stderr');
  }
}
