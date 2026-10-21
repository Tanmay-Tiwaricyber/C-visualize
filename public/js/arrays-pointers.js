/**
 * Arrays & pointers panel.
 *
 * Array cells, changed elements and pointer targets are driven by the recorded
 * trace (not by a hand-written animation). Loop-index highlighting is a
 * teaching aid: it is inferred from integer variables named i, j, k, mid, ...
 */

import { iconSvg } from './icons.js';
import { currentStep } from './timeline.js';

const INDEX_NAMES = new Set(['i', 'j', 'k', 'mid', 'low', 'high', 'start', 'end', 'left', 'right', 'index', 'pos']);
const COMPARISON_RE = /(==|!=|<=|>=|<|>)/;

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
}

function gatherArrays(step) {
  const seen = new Map();
  step.frames.forEach((frame) => {
    (frame.variables || []).forEach((variable) => {
      if (variable.kind !== 'array' || !variable.elements || !variable.elements.length) return;
      const key = `${variable.name}|${variable.address || frame.depth}`;
      if (!seen.has(key)) seen.set(key, { ...variable, fn: frame.fn, frameDepth: frame.depth });
    });
  });
  return [...seen.values()];
}

function gatherPointers(step) {
  const list = [];
  step.frames.forEach((frame) => {
    (frame.variables || []).forEach((variable) => {
      if (variable.kind === 'pointer') list.push({ ...variable, fn: frame.fn });
    });
  });
  return list;
}

export class ArraysPointersPanel {
  constructor(container, options = {}) {
    this.container = container;
    this.getSourceLine = options.getSourceLine || (() => '');
  }

  render(state) {
    const step = currentStep(state);
    if (!step) {
      this.container.innerHTML = `
        <div class="panel">
          <div class="panel-header"><span class="panel-title">Arrays &amp; pointers</span></div>
          <div class="panel-empty">
            ${iconSvg('pointer')}
            <p class="empty-title">No data structures in view</p>
            <p>Run a program that uses arrays, strings or pointers. Every element is drawn from the debugger snapshot at the current step.</p>
          </div>
        </div>`;
      return;
    }

    const arrays = gatherArrays(step);
    const pointers = gatherPointers(step);
    const previous = state.cursor > 0 ? state.steps[state.cursor - 1] : null;
    const previousArrays = previous ? gatherArrays(previous) : [];
    const previousByName = new Map(previousArrays.map((array) => [`${array.name}|${array.address}`, array]));

    const indexVars = [];
    step.frames.forEach((frame) => {
      (frame.variables || []).forEach((variable) => {
        if (variable.kind === 'scalar' && INDEX_NAMES.has(variable.name) && /^\d+$/.test(variable.display)) {
          indexVars.push({ name: variable.name, value: Number(variable.display), fn: frame.fn });
        }
      });
    });

    const sourceLine = this.getSourceLine(step.line) || '';
    // If the current statement indexes the array with "<var> + 1", highlight the
    // neighbour as well: both cells take part in the comparison.
    const neighbourIndexes = indexVars
      .filter((variable) => new RegExp(`\\b${variable.name}\\s*\\+\\s*1`).test(sourceLine))
      .map((variable) => variable.value + 1);

    const stats = this.stats(state, step);

    const cards = arrays.length
      ? arrays
          .map((array) => {
            const before = previousByName.get(`${array.name}|${array.address}`);
            const cells = array.elements
              .map((element, offset) => {
                const index = (array.indexBase || 0) + offset;
                const changed = before && before.elements[offset] && before.elements[offset].display !== element.display;
                const pointedBy = pointers.filter(
                  (pointer) => pointer.pointer && !pointer.pointer.isNull && pointer.address === array.address && index === (array.indexBase || 0),
                );
                const comparedBy = indexVars.filter((variable) => variable.value === index);
                const comparedNeighbour = neighbourIndexes.includes(index);
                if (comparedNeighbour) comparedBy.push({ name: 'neighbour' });
                return `
                  <div class="array-cell ${changed ? 'is-changed' : ''} ${
                    pointedBy.length ? 'is-pointed' : ''
                  } ${comparedBy.length && !changed ? 'is-compared' : ''}"
                    title="${escapeHtml(array.name)}[${index}] = ${escapeHtml(element.display)}">
                    <span class="cell-index">${index}</span>
                    <span class="cell-value">${escapeHtml(element.display)}</span>
                  </div>`;
              })
              .join('');

            return `
              <div class="array-card">
                <div class="array-card-header">
                  <span class="array-name">${escapeHtml(array.name)}</span>
                  <span class="array-meta">${escapeHtml(array.type || '')} · ${array.length ?? array.elements.length} elements · ${escapeHtml(array.address || 'address n/a')}</span>
                  <span class="grow"></span>
                  <span class="tag">${escapeHtml(array.fn)}()</span>
                  ${array.kind === 'string' ? '<span class="tag" data-tone="green">string</span>' : ''}
                </div>
                <div class="array-cells">${cells}</div>
                ${array.kind === 'string' ? `<div class="ptr-note">${iconSvg('info')} ${escapeHtml(array.display)}</div>` : ''}
              </div>`;
          })
          .join('')
      : `<div class="panel-empty" style="min-height:120px">
           ${iconSvg('pointer')}
           <p>No array or string variables are in scope in this frame.</p>
         </div>`;

    const pointerRows = pointers.length
      ? pointers
          .map((pointer) => {
            const addressIndex = `${pointer.name}`;
            let target = 'not inspected';
            let tone = 'is-unknown';
            if (pointer.pointer && pointer.pointer.isNull) {
              target = 'NULL';
              tone = 'is-null';
            } else if (pointer.pointer) {
              const match = arrays.find((array) => array.address === `0x${pointer.pointer.address.toString(16)}`);
              if (match) {
                target = `${match.name}[0]`;
                tone = '';
              } else if (pointer.pointer.string) {
                target = `"${pointer.pointer.string}"`;
                tone = '';
              } else if (pointer.pointer.deref) {
                target = `*p = ${pointer.pointer.deref}`;
                tone = '';
              }
            }
            return `
              <div class="pointer-row" data-pointer="${escapeHtml(addressIndex)}">
                <span class="pointer-name">${escapeHtml(pointer.name)} <span class="muted">${escapeHtml(pointer.type || '')}</span></span>
                <span class="pointer-addr">${escapeHtml(pointer.display)}</span>
                <span class="pointer-arrow">→</span>
                <span class="pointer-target ${tone}">${escapeHtml(target)}</span>
              </div>`;
          })
          .join('')
      : '<div class="memory-empty">No pointer variables in scope.</div>';

    this.container.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Arrays &amp; pointers</span>
          <span class="panel-sub">step ${state.cursor + 1} of ${state.steps.length} · ${step.fn}():${step.line}</span>
          <div class="panel-actions">
            <span class="tag" data-tone="${stats.arrayWrites ? 'amber' : 'blue'}">${stats.arrayWrites} element writes</span>
            <span class="tag" data-tone="purple">${stats.comparisons} comparisons</span>
          </div>
        </div>
        <div class="panel-body">
          <div class="algo-panel">
            <div class="algo-explain">
              <strong>line ${step.line}:</strong> ${escapeHtml(sourceLine.trim() || '—')}
              ${stats.hint ? `<span class="muted"> · ${escapeHtml(stats.hint)}</span>` : ''}
            </div>
            <div class="algo-stats">
              <span class="algo-stat"><strong>${stats.stepsTaken}</strong> steps replayed</span>
              <span class="algo-stat"><strong>${indexVars.map((v) => `${v.name}=${v.value}`).join(' ') || '—'}</strong> index variables</span>
              <span class="algo-stat"><strong>${arrays.length}</strong> arrays</span>
            </div>
            ${cards}
            <section class="memory-section">
              <div class="memory-section-header">
                <span class="memory-section-title">Pointers</span>
                <span class="panel-sub">resolved against the visible arrays and variables</span>
              </div>
              <div class="memory-section-body">${pointerRows}</div>
            </section>
          </div>
        </div>
        <div class="note-strip">
          ${iconSvg('info')}
          <span>
            Cell values and change highlights are real trace data. Index highlighting is a teaching aid: it follows integer variables
            named <code>i, j, k, mid, low, high, start, end…</code> and is not a claim about the C compiler's behaviour.
          </span>
        </div>
      </div>
    `;
  }

  stats(state, step) {
    let comparisons = 0;
    let arrayWrites = 0;
    let stepsTaken = state.cursor + 1;
    for (let i = 0; i <= state.cursor && i < state.steps.length; i += 1) {
      const candidate = state.steps[i];
      const line = this.getSourceLine(candidate.line) || '';
      if (COMPARISON_RE.test(line) && /(if|while|for)\s*\(/.test(line)) comparisons += 1;
      if (i > 0) {
        const before = gatherArrays(state.steps[i - 1]);
        const after = gatherArrays(candidate);
        for (const array of after) {
          const match = before.find((item) => item.name === array.name && item.address === array.address);
          if (!match) continue;
          const changes = array.elements.filter(
            (element, index) => match.elements[index] && match.elements[index].display !== element.display,
          ).length;
          arrayWrites += changes;
        }
      }
    }
    const line = this.getSourceLine(step.line) || '';
    let hint = '';
    if (/\[[^\]]+\]/.test(line) && /=[^=]/.test(line)) hint = 'element assignment';
    else if (/(if|while)\s*\(/.test(line) && COMPARISON_RE.test(line)) hint = 'condition evaluated';
    else if (/\bswap|temp\b/.test(line)) hint = 'swap in progress';
    return { comparisons, arrayWrites, stepsTaken, hint };
  }
}
