/**
 * Variable inspector: live table of every variable in the active frame, with
 * type, value, scope, address and change tracking.
 *
 * Values come straight from the debugger snapshot for each recorded step. A
 * variable whose declaration line has not been executed yet is shown as
 * "not in scope" instead of a meaningless raw value.
 */

import { iconSvg } from './icons.js';
import { currentStep, variablesAt } from './timeline.js';

const KIND_LABEL = {
  array: 'array',
  struct: 'struct',
  pointer: 'pointer',
  string: 'string',
  bool: 'bool',
  enum: 'enum',
  scalar: '',
  unknown: '',
};

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
}

export class VariableInspector {
  constructor(container) {
    this.container = container;
    this.expanded = new Set();
    this.showGlobals = true;
    this.onlyChanged = false;
    this.lastCursor = -2;
    this.container.addEventListener('click', (event) => this.onClick(event));
  }

  onClick(event) {
    const toggle = event.target.closest('[data-expand]');
    if (toggle) {
      const key = toggle.dataset.expand;
      if (this.expanded.has(key)) this.expanded.delete(key);
      else this.expanded.add(key);
      this.render(this.state, { force: true });
      return;
    }
    const row = event.target.closest('[data-variable-row]');
    if (row) {
      const key = row.dataset.variableRow;
      if (this.expanded.has(key)) this.expanded.delete(key);
      else if (this.canExpand(key)) this.expanded.add(key);
      this.render(this.state, { force: true });
    }
  }

  canExpand(key) {
    const variable = (this.currentVariables || []).find((item) => item.key === key);
    return Boolean(variable && (variable.kind === 'array' || variable.kind === 'struct'));
  }

  render(state, options = {}) {
    this.state = state;
    const step = currentStep(state);
    const cursorChanged = state.cursor !== this.lastCursor;

    if (!state.steps.length) {
      this.container.innerHTML = this.emptyMarkup(state);
      this.lastCursor = state.cursor;
      return;
    }
    if (!step) {
      this.container.innerHTML = this.emptyMarkup(state);
      return;
    }

    const { locals, params, globals } = variablesAt(step);
    const rows = [];
    params.forEach((variable) => rows.push({ ...variable, scopeLabel: 'param' }));
    locals.forEach((variable) => rows.push({ ...variable, scopeLabel: 'local' }));
    if (this.showGlobals) globals.forEach((variable) => rows.push({ ...variable, scopeLabel: 'global' }));

    const visible = this.onlyChanged ? rows.filter((row) => row.changed) : rows;
    this.currentVariables = visible.map((row) => ({ ...row, key: `${row.scope}:${row.name}` }));

    const body = visible.map((variable) => this.rowMarkup(variable, cursorChanged)).join('');
    const changedCount = rows.filter((row) => row.changed).length;

    this.container.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Variables</span>
          <span class="panel-sub">${step.fn}() · frame ${step.depth - 1} · line ${step.line}</span>
          <div class="panel-actions">
            <span class="tag" data-tone="${changedCount ? 'amber' : 'blue'}">${changedCount} changed</span>
            <label class="switch" title="Show file-scope variables">
              <input type="checkbox" data-toggle="globals" ${this.showGlobals ? 'checked' : ''}>
              <span class="switch-track"><span class="switch-thumb"></span></span>
              <span class="switch-label">Globals</span>
            </label>
            <label class="switch" title="Only show variables whose value changed at this step">
              <input type="checkbox" data-toggle="changed" ${this.onlyChanged ? 'checked' : ''}>
              <span class="switch-track"><span class="switch-thumb"></span></span>
              <span class="switch-label">Changed</span>
            </label>
          </div>
        </div>
        ${
          visible.length
            ? `<div class="panel-body">
                 <table class="data-table">
                   <thead>
                     <tr>
                       <th style="width:26px"></th>
                       <th>Variable</th>
                       <th>Type</th>
                       <th>Value</th>
                       <th>Scope</th>
                       <th>Address</th>
                       <th>Change</th>
                     </tr>
                   </thead>
                   <tbody>${body}</tbody>
                 </table>
               </div>`
            : `<div class="panel-empty">
                 ${iconSvg('variables')}
                 <p class="empty-title">No variables to show</p>
                 <p>${this.onlyChanged ? 'Nothing changed at this step. Turn off the “Changed” filter to see every variable.' : 'This frame has no local variables yet.'}</p>
               </div>`
        }
        <div class="note-strip">
          ${iconSvg('info')}
          <span>Values, types and addresses are read from the live debugger frame. A dash means the declaration has not executed yet.
          A declared-but-not-yet-assigned variable shows the raw contents of its stack slot, which in C is an indeterminate value — that is exactly why the language asks you to initialise variables.</span>
        </div>
      </div>
    `;

    this.container.querySelectorAll('[data-toggle]').forEach((input) => {
      input.addEventListener('change', () => {
        if (input.dataset.toggle === 'globals') this.showGlobals = input.checked;
        if (input.dataset.toggle === 'changed') this.onlyChanged = input.checked;
        this.render(state, { force: true });
      });
    });

    this.lastCursor = state.cursor;
  }

  rowMarkup(variable, cursorChanged) {
    const key = `${variable.scope}:${variable.name}`;
    const expandable = variable.kind === 'array' || variable.kind === 'struct';
    const isOpen = this.expanded.has(key);
    const kindLabel = KIND_LABEL[variable.kind] || '';
    const pending = variable.pending || variable.uninitialized;
    const valueClass = [
      'var-value',
      pending ? 'is-pending' : '',
      variable.kind === 'string' ? 'is-string' : '',
      cursorChanged && variable.changed ? 'value-flash' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const change = variable.changed
      ? `<span class="change-badge"><span class="old">${escapeHtml(variable.previousDisplay || '—')}</span>→ ${escapeHtml(variable.display)}</span>`
      : '';

    const main = `
      <tr data-variable-row="${escapeHtml(key)}" class="${variable.changed && cursorChanged ? 'is-changed' : ''}">
        <td>
          ${
            expandable
              ? `<button class="expand-toggle" data-expand="${escapeHtml(key)}" aria-label="Toggle details" aria-expanded="${isOpen}">
                   ${iconSvg(isOpen ? 'chevron-down' : 'chevron-right')}
                 </button>`
              : ''
          }
        </td>
        <td>
          <span class="var-name">${escapeHtml(variable.name)}</span>
          ${kindLabel ? `<span class="tag" style="margin-left:6px">${escapeHtml(kindLabel)}</span>` : ''}
        </td>
        <td class="var-type">${escapeHtml(variable.type || '—')}</td>
        <td><span class="${valueClass}">${escapeHtml(variable.display)}</span></td>
        <td><span class="var-scope" data-scope="${variable.scope}">${variable.scope === 'param' ? 'param' : variable.scope}</span></td>
        <td class="var-address">${escapeHtml(variable.address || '—')}</td>
        <td>${change}</td>
      </tr>
    `;

    if (!isOpen) return main;

    const children = [];
    if (variable.kind === 'array' && variable.elements) {
      variable.elements.forEach((element, offset) => {
        const index = (variable.indexBase || 0) + offset;
        children.push(`<div class="child-item"><span class="child-key">[${index}]</span><span class="child-val">${escapeHtml(element.display)}</span></div>`);
      });
    }
    if (variable.kind === 'struct' && variable.fields) {
      if (!variable.fields.length) {
        children.push('<div class="child-item"><span class="child-key muted">fields</span><span class="child-val muted">not reported by the debugger</span></div>');
      }
      variable.fields.forEach((field) => {
        children.push(`<div class="child-item"><span class="child-key">.${escapeHtml(field.name)}</span><span class="child-val">${escapeHtml(field.display)}</span></div>`);
      });
    }
    if (variable.kind === 'pointer' && variable.pointer) {
      const pointer = variable.pointer;
      children.push(
        `<div class="child-item"><span class="child-key">points to</span><span class="child-val">${
          pointer.isNull
            ? 'NULL'
            : `0x${pointer.address.toString(16)}${pointer.string ? ` → "${escapeHtml(pointer.string)}"` : ''}${pointer.deref ? ` → ${escapeHtml(pointer.deref)}` : ''}`
        }</span></div>`,
      );
    }

    const detail = children.length
      ? `<tr class="child-row"><td></td><td colspan="6"><div class="child-list">${children.join('')}</div></td></tr>`
      : '';

    return main + detail;
  }

  emptyMarkup(state) {
    const hasError = state.status === 'compile-error';
    return `
      <div class="panel">
        <div class="panel-header"><span class="panel-title">Variables</span></div>
        <div class="panel-empty">
          ${iconSvg(hasError ? 'alert-circle' : 'variables')}
          <p class="empty-title">${hasError ? 'Nothing was executed' : 'No variables yet'}</p>
          <p>${
            hasError
              ? 'Compilation failed, so no execution frame exists. Check the Compiler tab for the exact line.'
              : 'Run the program, then move through the trace. Local variables, parameters, globals and their addresses appear here as each frame is created.'
          }</p>
        </div>
      </div>
    `;
  }
}
