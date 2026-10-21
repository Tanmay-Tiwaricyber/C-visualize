/**
 * Call stack panel: one card per active frame, newest call first.
 * Recursive frames are marked so factorial/fibonacci recursion is obvious.
 */

import { iconSvg } from './icons.js';
import { currentStep } from './timeline.js';

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
}

export class CallStackPanel {
  constructor(container) {
    this.container = container;
    this.lastDepth = -1;
    this.selectedOffset = 0; // 0 = deepest frame
    this.cursor = -2;
  }

  /** Called by the app when the cursor moves: default to the deepest frame. */
  selectDeepestFrame(cursor) {
    if (cursor === this.cursor) return;
    this.cursor = cursor;
    this.selectedOffset = 0;
    if (this.state) this.render(this.state);
  }

  render(state) {
    this.state = state;
    const step = currentStep(state);
    if (!step) {
      this.container.innerHTML = `
        <div class="panel">
          <div class="panel-header"><span class="panel-title">Call stack</span></div>
          <div class="panel-empty">
            ${iconSvg('stack')}
            <p class="empty-title">No active frames</p>
            <p>Frames appear while the program is executing. Run a program and step through the trace to watch functions being called and returning.</p>
          </div>
        </div>`;
      this.lastDepth = -1;
      return;
    }

    const frames = step.frames;
    if (state.cursor !== this.cursor) {
      this.cursor = state.cursor;
      this.selectedOffset = 0;
    }
    this.selectedOffset = Math.min(this.selectedOffset, frames.length - 1);
    const counts = new Map();
    frames.forEach((frame) => counts.set(frame.fn, (counts.get(frame.fn) || 0) + 1));
    const deepest = frames.length - 1;

    const cards = frames
      .map((frame, index) => {
        const isTop = index === this.selectedOffset;
        const isCurrent = index === 0;
        const recursive = counts.get(frame.fn) > 1;
        const args = frame.variables.filter((variable) => variable.scope === 'param');
        const locals = frame.variables.filter((variable) => variable.scope !== 'param');
        const entering = index === 0 && this.lastDepth >= 0 && frames.length > this.lastDepth;

        return `
          <div class="stack-frame ${entering ? 'is-entering' : ''}" data-active="${isTop}" data-current="${isCurrent}" data-offset="${index}">
            <div class="stack-frame-head">
              <span class="stack-fn-name">${escapeHtml(frame.fn)}()</span>
              <span class="stack-fn-loc">prog.c:${frame.line}</span>
              ${recursive ? `<span class="recursion-badge">${iconSvg('restart')} recursive call</span>` : ''}
              <span class="grow"></span>
              <span class="tag" ${isCurrent ? 'data-tone="blue"' : ''}>${
                isCurrent ? 'executing now' : `returns to ${frames[index - 1].fn}()`
              }</span>
            </div>
            ${
              args.length
                ? `<div class="stack-args">${args
                    .map(
                      (arg) =>
                        `<span class="arg-chip"><span class="arg-name">${escapeHtml(arg.name)}</span> ${escapeHtml(arg.type || '')} = ${escapeHtml(arg.display)}</span>`,
                    )
                    .join('')}</div>`
                : ''
            }
            ${
              locals.length
                ? `<div class="stack-locals">${locals
                    .map(
                      (variable) => `
                      <div class="stack-local">
                        <span class="sl-name">${escapeHtml(variable.name)}</span>
                        <span class="sl-value">${escapeHtml(variable.display)}</span>
                      </div>`,
                    )
                    .join('')}</div>`
                : `<div class="stack-no-vars">No local variables in this frame yet.</div>`
            }
          </div>
        `;
      })
      .join('');

    this.container.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Call stack</span>
          <span class="panel-sub">${frames.length} frame${frames.length === 1 ? '' : 's'} · depth ${deepest}</span>
            <div class="panel-actions">
            <span class="tag" data-tone="${frames.length > 1 ? 'purple' : 'blue'}">${frames.length > 1 ? 'nested calls' : 'single frame'}</span>
          </div>
        </div>
        <div class="panel-body">
          <div class="stack-panel">${cards}</div>
        </div>
        <div class="note-strip">
          ${iconSvg('info')}
          <span>Each card is a real stack frame read from the debugger. Arguments and locals show the values at this exact step; return values are not tracked by this tracer.</span>
        </div>
      </div>
    `;

    this.container.querySelectorAll('[data-offset]').forEach((card) => {
      card.addEventListener('click', () => {
        this.selectedOffset = Number(card.dataset.offset);
        this.render(this.state);
      });
    });

    this.lastDepth = frames.length;
  }
}
