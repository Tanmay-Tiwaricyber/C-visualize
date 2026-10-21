/**
 * Memory visualiser.
 *
 * Shows what the debugger actually knows: stack frames with the address of
 * every local, and pointers with their stored address and (when it matches an
 * inspected variable) the object they reference.
 *
 * Heap allocation tracking is explicitly reported as unsupported rather than
 * faked - see the capability note in the panel.
 */

import { iconSvg } from './icons.js';
import { currentStep } from './timeline.js';

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
}

function collectAddressIndex(frames) {
  const index = new Map();
  frames.forEach((frame) => {
    (frame.variables || []).forEach((variable) => {
      if (!variable.address) return;
      const address = Number.parseInt(variable.address, 16);
      if (!Number.isFinite(address)) return;
      index.set(address, { name: variable.name, fn: frame.fn, type: variable.type, kind: variable.kind });
    });
  });
  return index;
}

function pointerTarget(pointer, index) {
  if (!pointer) return { label: 'unknown', kind: 'unknown' };
  if (pointer.isNull) return { label: 'NULL', kind: 'null' };
  const hit = index.get(pointer.address);
  if (hit) return { label: `${hit.name} (${hit.fn === undefined ? '' : hit.fn + '()'})`, kind: 'resolved' };
  return { label: 'outside inspected frames', kind: 'unknown' };
}

export class MemoryVisualizer {
  constructor(container) {
    this.container = container;
  }

  render(state) {
    const step = currentStep(state);
    if (!step) {
      this.container.innerHTML = `
        <div class="panel">
          <div class="panel-header"><span class="panel-title">Memory</span></div>
          <div class="panel-empty">
            ${iconSvg('memory')}
            <p class="empty-title">Memory view is empty</p>
            <p>Run a program to see the stack frames, the address of every local variable and the pointers that reference them.</p>
          </div>
        </div>`;
      return;
    }

    const frames = step.frames;
    const index = collectAddressIndex(frames);
    const pointers = [];
    frames.forEach((frame) => {
      (frame.variables || []).forEach((variable) => {
        if (variable.kind === 'pointer') pointers.push({ ...variable, fn: frame.fn, depth: frame.depth });
      });
    });

    const stackMarkup = frames
      .map((frame) => {
        const vars = frame.variables || [];
        const rows = vars.length
          ? vars
              .map((variable) => {
                const target = variable.kind === 'pointer' ? pointerTarget(variable.pointer, index) : null;
                return `
                  <div class="frame-var">
                    <span class="fv-name">${escapeHtml(variable.name)}</span>
                    <span class="fv-value ${variable.pending || variable.uninitialized ? 'is-pending' : ''}">
                      ${escapeHtml(variable.display)}
                      ${target && target.kind === 'resolved' ? `<span class="tref">→ ${escapeHtml(target.label)}</span>` : ''}
                      ${target && target.kind === 'null' ? `<span class="tref" style="color:var(--red)">→ NULL</span>` : ''}
                      ${target && target.kind === 'unknown' ? `<span class="tref">→ ?</span>` : ''}
                    </span>
                    <span class="fv-addr">${escapeHtml(variable.address || '—')}</span>
                  </div>`;
              })
              .join('')
          : '<div class="frame-no-vars">No locals in this frame.</div>';

        return `
          <div class="frame-card" data-active="${frame.depth === 0}">
            <div class="frame-head">
              <span class="frame-fn">${escapeHtml(frame.fn)}()</span>
              <span class="frame-meta">prog.c:${frame.line}</span>
              <span class="frame-depth">${frame.depth === 0 ? 'top frame' : `frame ${frame.depth}`}</span>
            </div>
            <div class="frame-vars">${rows}</div>
          </div>`;
      })
      .join('');

    const pointerMarkup = pointers.length
      ? pointers
          .map((pointer) => {
            const target = pointerTarget(pointer.pointer, index);
            return `
              <div class="pointer-row">
                <span class="pointer-name">${escapeHtml(pointer.name)} <span class="muted">${escapeHtml(pointer.type || '')}</span></span>
                <span class="pointer-addr">${pointer.pointer && pointer.pointer.isNull ? '0x0' : escapeHtml(pointer.display)}</span>
                <span class="pointer-arrow">→</span>
                <span class="pointer-target ${
                  target.kind === 'null' ? 'is-null' : target.kind === 'unknown' ? 'is-unknown' : ''
                }">${escapeHtml(target.label)}${
                  pointer.pointer && pointer.pointer.string ? ` <span class="tref">"${escapeHtml(pointer.pointer.string)}"</span>` : ''
                }</span>
              </div>`;
          })
          .join('')
      : '<div class="memory-empty">No pointer variables are in scope at this step.</div>';

    this.container.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Memory</span>
          <span class="panel-sub">${frames.length} frame${frames.length === 1 ? '' : 's'} · ${pointers.length} pointer${pointers.length === 1 ? '' : 's'}</span>
          <div class="panel-actions"><span class="tag" data-tone="blue">debugger addresses</span></div>
        </div>
        <div class="panel-body">
          <div class="memory-layout">
            <section class="memory-section">
              <div class="memory-section-header">
                <span class="memory-section-title">Stack</span>
                <span class="panel-sub">one block per call frame, newest first</span>
              </div>
              <div class="memory-section-body">${stackMarkup}</div>
            </section>

            <section class="memory-section">
              <div class="memory-section-header">
                <span class="memory-section-title">Pointers</span>
                <span class="panel-sub">stored address and referenced object</span>
              </div>
              <div class="memory-section-body">${pointerMarkup}</div>
            </section>

            <section class="memory-section">
              <div class="memory-section-header">
                <span class="memory-section-title">Heap</span>
                <span class="tag" data-tone="amber">not tracked</span>
              </div>
              <div class="memory-section-body">
                <div class="memory-empty">
                  This build reads values through GDB and does not intercept <span class="mono">malloc</span>/<span class="mono">free</span>,
                  so heap block sizes, allocation sites and leaks are not reconstructed. Pointers whose target is not an inspected
                  variable are labelled “outside inspected frames” instead of being guessed.
                  Turn on <strong>Sanitizers</strong> to let AddressSanitizer and UBSan report heap overflows, use-after-free and leaks in the
                  Runtime tab.
                </div>
              </div>
            </section>
          </div>
        </div>
        <div class="note-strip">
          ${iconSvg('info')}
          <span>
            These addresses are the real addresses of the traced process, but the layout is reconstructed for teaching: it is not a
            byte-for-byte dump of physical memory, and addresses change between runs (stack ASLR).
          </span>
        </div>
      </div>
    `;
  }
}
