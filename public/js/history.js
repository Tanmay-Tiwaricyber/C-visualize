/**
 * Execution history: the full event list with windowed rendering so a 5000-step
 * trace stays responsive. Clicking a row jumps the timeline to that event.
 */

import { iconSvg } from './icons.js';
import { summariseStep } from './timeline.js';

const ROW_HEIGHT = 26;
const OVERSCAN = 12;

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
}

export class HistoryPanel {
  constructor(container, options = {}) {
    this.container = container;
    this.onSelectStep = options.onSelectStep || (() => {});
    this.getSourceLine = options.getSourceLine || (() => '');
    this.filter = '';
    this.listEl = null;
    this.rows = [];
    this.lastCursor = null;
  }

  render(state) {
    this.state = state;
    if (!state.steps.length) {
      this.container.innerHTML = `
        <div class="panel">
          <div class="panel-header"><span class="panel-title">Execution history</span></div>
          <div class="panel-empty">
            ${iconSvg('history')}
            <p class="empty-title">No events recorded</p>
            <p>Every recorded execution event will be listed here: function calls, returns, variable changes and program output.</p>
          </div>
        </div>`;
      this.listEl = null;
      return;
    }

    this.rows = state.steps.map((step, index) => ({
      index,
      line: step.line,
      fn: step.fn,
      type: step.reason,
      summary: summariseStep(step, index > 0 ? state.steps[index - 1] : null),
      changed: step.variables.some((variable) => variable.changed),
    }));

    if (!this.listEl || !this.container.contains(this.listEl)) {
      this.container.innerHTML = `
        <div class="panel">
          <div class="panel-header">
            <span class="panel-title">Execution history</span>
            <span class="panel-sub" data-history-count></span>
            <div class="panel-actions">
              <input class="history-filter" type="search" placeholder="Filter function, line or text…" data-history-filter />
            </div>
          </div>
          <div class="history-panel">
            <div class="history-toolbar">
              <span>${iconSvg('info')} Click any event to move the execution cursor to it.</span>
              <span class="grow"></span>
              <span data-history-pos></span>
            </div>
            <div class="history-list" data-history-list></div>
          </div>
        </div>
      `;
      this.listEl = this.container.querySelector('[data-history-list]');
      const filterInput = this.container.querySelector('[data-history-filter]');
      filterInput.value = this.filter;
      filterInput.addEventListener('input', () => {
        this.filter = filterInput.value.toLowerCase();
        this.window = null;
        this.renderWindow(true);
      });
      this.listEl.addEventListener('click', (event) => {
        const row = event.target.closest('[data-history-index]');
        if (row) this.onSelectStep(Number(row.dataset.historyIndex));
      });
      this.listEl.addEventListener('scroll', () => this.renderWindow());
      this.filtered = null;
    }

    const countEl = this.container.querySelector('[data-history-count]');
    if (countEl) countEl.textContent = `${state.steps.length} events · step ${state.cursor + 1}`;
    const posEl = this.container.querySelector('[data-history-pos]');
    if (posEl) posEl.textContent = `${state.cursor + 1} / ${state.steps.length}`;

    this.filtered = this.filter
      ? this.rows.filter(
          (row) =>
            row.fn.toLowerCase().includes(this.filter) ||
            row.summary.toLowerCase().includes(this.filter) ||
            String(row.line) === this.filter,
        )
      : this.rows;

    this.renderWindow();
    if (this.lastCursor !== state.cursor) {
      this.revealCurrent(state.cursor);
      this.lastCursor = state.cursor;
    }
  }

  revealCurrent(cursor) {
    if (!this.listEl || !this.filtered) return;
    const rowIndex = this.filtered.findIndex((row) => row.index === cursor);
    if (rowIndex < 0) return;
    const top = rowIndex * ROW_HEIGHT;
    const viewTop = this.listEl.scrollTop;
    const viewBottom = viewTop + this.listEl.clientHeight;
    if (top < viewTop + ROW_HEIGHT || top > viewBottom - ROW_HEIGHT * 2) {
      this.listEl.scrollTop = Math.max(0, top - this.listEl.clientHeight / 2);
      this.renderWindow();
    }
  }

  renderWindow(force = false) {
    if (!this.listEl || !this.filtered) return;
    const viewportHeight = this.listEl.clientHeight || 240;
    const scrollTop = this.listEl.scrollTop;
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const visible = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
    const end = Math.min(this.filtered.length, start + visible);

    if (!force && this.window && this.window.start === start && this.window.end === end && this.window.cursor === this.state.cursor) {
      return;
    }
    this.window = { start, end, cursor: this.state.cursor };

    const rowsMarkup = this.filtered
      .slice(start, end)
      .map((row) => {
        const current = row.index === this.state.cursor;
        return `
          <button class="history-row" data-history-index="${row.index}" data-type="${row.type}" data-current="${current}">
            <span class="history-idx">${row.index + 1}</span>
            <span class="history-line">L${row.line}</span>
            <span class="history-fn">${escapeHtml(row.fn)}()</span>
            <span class="history-summary">${this.summaryMarkup(row)}</span>
          </button>`;
      })
      .join('');

    this.listEl.innerHTML = `
      <div class="history-virtual-spacer" style="height:${this.filtered.length * ROW_HEIGHT}px">
        <div style="position:absolute;top:${start * ROW_HEIGHT}px;left:0;right:0">${rowsMarkup}</div>
      </div>`;
  }

  summaryMarkup(row) {
    const summary = escapeHtml(row.summary);
    return summary
      .replace(/([A-Za-z_]\w*) (—|[\w.'"\-+&*\[\]]+) → /g, '$1 <span class="from">$2</span> → ')
      .replace(/put (&quot;.*?&quot;)/g, 'put <span class="out">$1</span>');
  }
}
