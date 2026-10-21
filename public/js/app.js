/**
 * Application entry point: wires the editor, the execution controller, the
 * visualisation panels and the console together, and keeps them in sync through
 * the central store.
 */

import { hydrateIcons, iconSvg } from './icons.js';
import { STATUS, STATUS_LABEL, addLog, state, subscribe, update } from './state.js';
import { CodeEditor } from './editor.js';
import { DEFAULT_PROGRAM, EXAMPLES, EXAMPLE_CATEGORIES, findExample } from './examples.js';
import { ExecutionController } from './execution-controller.js';
import { currentStep } from './timeline.js';
import { VariableInspector } from './variable-inspector.js';
import { CallStackPanel } from './call-stack.js';
import { MemoryVisualizer } from './memory-visualizer.js';
import { ArraysPointersPanel } from './arrays-pointers.js';
import { FlowchartPanel } from './flowchart.js';
import { HistoryPanel } from './history.js';
import { ConsolePanel } from './console.js';
import { openDocs } from './docs.js';
import { LearnDrawer } from './learn.js';
import * as api from './api.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/* ------------------------------------------------------------------ icons */
hydrateIcons(document);

/* ------------------------------------------------------------------ theme */
const THEME_KEY = 'cvis.theme';
const storedTheme = localStorage.getItem(THEME_KEY);
// Dark-first: the interface is designed dark and stays dark unless the user
// explicitly switched to the light theme.
const initialTheme = storedTheme === 'light' ? 'light' : 'dark';
document.documentElement.dataset.theme = initialTheme;
update({ theme: initialTheme }, { immediate: true });

/* ----------------------------------------------------------------- editor */
const editor = new CodeEditor({
  textarea: $('#code-input'),
  highlight: $('#highlight'),
  gutter: $('#gutter'),
  codeArea: $('#code-area'),
  currentLine: $('#current-line'),
  breakpointMarks: $('#breakpoint-marks'),
  scroll: $('#editor-scroll'),
  onChange: (value) => {
    const firstEdit = !state.dirty;
    update({ source: value, dirty: true, stale: state.steps.length > 0 });
    if (firstEdit) addLog('info', 'Source edited — the previous trace no longer matches this code.');
    renderDirtyIndicator();
  },
  onCursor: ({ line, column, selected }) => {
    $('#cursor-pos').textContent = selected ? `Ln ${line}, Col ${column} (${selected} selected)` : `Ln ${line}, Col ${column}`;
  },
});

editor.onBreakpointsChange = (breakpoints) => {
  state.breakpoints = breakpoints;
  const info = $('#breakpoint-info');
  info.textContent = breakpoints.size
    ? `${breakpoints.size} breakpoint${breakpoints.size === 1 ? '' : 's'} (timeline filter)`
    : 'No breakpoints';
  renderToolbar(state);
};

const getSource = () => editor.getValue();
const getSourceLine = (line) => (getSource().split('\n')[line - 1] || '').trim();

/* --------------------------------------------------------------- controller */
const controller = new ExecutionController();

/* ---------------------------------------------------------------- panels */
class PanelHost {
  constructor(stage, options) {
    this.stage = stage;
    this.options = options;
    this.cache = new Map();
    this.current = null;
  }

  show(panelId, stateNow) {
    if (!panelId) {
      this.stage.hidden = true;
      return;
    }
    this.stage.hidden = false;
    if (!this.cache.has(panelId)) {
      this.cache.set(panelId, createPanel(panelId, this.stage, this.options));
    }
    this.current = panelId;
    this.cache.get(panelId).render(stateNow);
  }
}

function createPanel(id, stage, options) {
  switch (id) {
    case 'variables':
      return new VariableInspector(stage);
    case 'memory':
      return new MemoryVisualizer(stage);
    case 'stack':
      return new CallStackPanel(stage);
    case 'arrays':
      return new ArraysPointersPanel(stage, { getSourceLine: options.getSourceLine });
    case 'history':
      return new HistoryPanel(stage, { onSelectStep: options.onSelectStep, getSourceLine: options.getSourceLine });
    case 'flow':
    default:
      return new FlowchartPanel(stage, {
        getSource: options.getSource,
        onSelectStep: options.onSelectStep,
      });
  }
}

const panelOptions = {
  getSource,
  getSourceLine,
  onSelectStep: (index) => controller.goTo(index),
};

const primaryHost = new PanelHost($('#panel-primary'), panelOptions);
const secondaryHost = new PanelHost($('#panel-secondary'), panelOptions);

/* --------------------------------------------------------------- console */
const consolePanel = new ConsolePanel(document, {
  onSelectLine: (line) => {
    editor.goToLine(line);
    editor.setActiveLine(state.cursor >= 0 ? state.steps[state.cursor].line : line);
  },
  onStdinChange: (value) => update({ stdin: value }),
});

/* ------------------------------------------------------------------ learn */
const learnDrawer = new LearnDrawer($('#drawer-root'), {
  onClose: () => update({ learnOpen: false }),
  onLoad: (lesson) => loadSource(lesson.code, lesson.stdin || '', lesson.title),
  onRun: (lesson) => {
    loadSource(lesson.code, lesson.stdin || '', lesson.title);
    controller.run();
  },
});

/* ---------------------------------------------------------------- toasts */
let toastTimer = null;
function showToast(message, tone = 'info') {
  const stack = $('#toast-stack');
  const toast = document.createElement('div');
  const iconName = tone === 'error' ? 'x-circle' : tone === 'warn' ? 'warning' : tone === 'success' ? 'check' : 'info';
  toast.className = 'toast';
  toast.dataset.tone = tone;
  toast.innerHTML = `${iconSvg(iconName)}<span>${message}</span>`;
  stack.appendChild(toast);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(6px)';
    setTimeout(() => toast.remove(), 200);
  }, 4200);
}

/* --------------------------------------------------------------- examples */
function buildExamplesMenu() {
  const menu = $('#examples-menu');
  menu.innerHTML = EXAMPLE_CATEGORIES.map(
    (category) => `
      <div class="menu-group-title">${category}</div>
      <div class="menu-grid">
        ${EXAMPLES.filter((item) => item.category === category)
          .map(
            (item) => `
            <button class="menu-item" data-example="${item.id}" role="menuitem">
              ${iconSvg(item.algorithm ? 'target' : item.unsafe ? 'warning' : 'code')}
              <span>
                <span class="menu-item-title">${item.title}</span>
                <span class="menu-item-sub">${item.description}</span>
              </span>
            </button>`,
          )
          .join('')}
      </div>`,
  ).join('');
  menu.querySelectorAll('[data-example]').forEach((button) => {
    button.addEventListener('click', () => {
      const example = findExample(button.dataset.example);
      if (example) loadExample(example);
      closeMenus();
    });
  });
}

function buildExampleSelect() {
  const select = $('#example-select');
  select.innerHTML =
    '<option value="">Load example…</option>' +
    EXAMPLE_CATEGORIES.map(
      (category) =>
        `<optgroup label="${category}">${EXAMPLES.filter((item) => item.category === category)
          .map((item) => `<option value="${item.id}">${item.title}</option>`)
          .join('')}</optgroup>`,
    ).join('');
  select.addEventListener('change', () => {
    const example = findExample(select.value);
    if (example) loadExample(example);
    select.value = '';
  });
}

function loadExample(example) {
  loadSource(example.code, example.stdin || '', example.title);
  update({ activeExampleId: example.id });
  showToast(`Loaded “${example.title}”. Press Run to trace it.`, 'info');
}

function loadSource(code, stdin = '', label = '') {
  editor.setValue(code);
  update({
    source: code,
    stdin,
    dirty: false,
    savedSource: code,
    activeExampleId: '',
    steps: [],
    cursor: -1,
    status: STATUS.IDLE,
    statusDetail: label ? `Loaded ${label}` : '',
    result: null,
    diagnostics: [],
    runtimeNotes: [],
    stale: false,
  });
  editor.setDiagnostics([]);
  editor.setActiveLine(null);
  editor.scrollToTop();
  consolePanel.setStdin(stdin);
  renderDirtyIndicator();
  addLog('info', label ? `Loaded example: ${label}` : 'New program created.');
}

function newProgram() {
  loadSource(
    `#include <stdio.h>\n\nint main(void) {\n    \n    return 0;\n}\n`,
    '',
    'Untitled program',
  );
  editor.focus();
}

function renderDirtyIndicator() {
  $('#dirty-dot').hidden = !state.dirty;
  $('#editor-empty').hidden = state.source.trim().length > 0;
}

/* ------------------------------------------------------------- rendering */
function setStatusChip(s) {
  const chip = $('#exec-status');
  chip.dataset.state = s.status;
  const label = STATUS_LABEL[s.status] || 'Idle';
  chip.querySelector('.status-text').textContent = label;
  chip.title = s.statusDetail || label;
}

function renderToolbar(s) {
  const hasTrace = s.steps.length > 0;
  const busy = s.status === STATUS.COMPILING || s.status === STATUS.RUNNING;
  const set = (action, enabled) => {
    $$(`[data-action="${action}"]`).forEach((button) => {
      button.disabled = !enabled;
    });
  };
  set('run', !busy);
  set('stop', busy || hasTrace);
  set('restart', hasTrace);
  set('play', hasTrace && !s.playing);
  set('pause', s.playing);
  set('next', hasTrace);
  set('prev', hasTrace);
  set('first', hasTrace);
  set('last', hasTrace);
  set('step-into', hasTrace);
  set('step-over', hasTrace);
  set('step-out', hasTrace);
  set('to-breakpoint', hasTrace && s.breakpoints.size > 0);

  $('#stop-btn').disabled = !busy;
  $('#run-btn').disabled = busy;
  $('#run-btn').querySelector('.label').textContent = busy ? 'Running…' : 'Run';
  $('#run-btn').classList.toggle('is-active', s.stale);

  const current = $('#step-current');
  const total = $('#step-total');
  const range = $('#timeline-range');
  current.textContent = hasTrace ? String(s.cursor + 1) : '–';
  total.textContent = hasTrace ? String(s.steps.length) : '–';
  range.max = hasTrace ? String(Math.max(0, s.steps.length - 1)) : '0';
  range.value = String(Math.max(0, s.cursor));
  range.disabled = !hasTrace;

  const step = currentStep(s);
  $('#status-frame').textContent = step ? `${step.fn}() · line ${step.line} · depth ${step.depth}` : 'No frame';
  $('#status-steps').textContent = hasTrace ? `${s.steps.length} steps` : '0 steps';
  $('#status-time').textContent = s.durationMs != null ? `${s.durationMs} ms traced` : '—';
  $('#status-mode-text').textContent = s.stale
    ? 'Source changed — re-run to refresh'
    : s.playing
      ? 'Playing trace'
      : STATUS_LABEL[s.status] || 'Ready';
}

function renderConsoleTabs(s) {
  $$('#console-tabs .tab').forEach((tab) => {
    tab.setAttribute('aria-selected', String(tab.dataset.console === s.consoleTab));
  });
  $$('[data-console-pane]').forEach((pane) => {
    pane.hidden = pane.dataset.consolePane !== s.consoleTab;
  });
}

function renderVizTabs(s) {
  $$('#viz-tabs .tab').forEach((tab) => {
    tab.setAttribute('aria-selected', String(tab.dataset.panel === s.panel));
  });
  const select = $('#split-select');
  if (select.value !== s.splitPanel) select.value = s.splitPanel;
  $('#split-divider').hidden = !s.splitPanel;
}

let lastSignature = '';
let lastCursor = -2;

function renderAll(s) {
  setStatusChip(s);
  renderToolbar(s);
  renderVizTabs(s);
  renderConsoleTabs(s);

  const step = currentStep(s);
  if (s.cursor !== lastCursor) {
    lastCursor = s.cursor;
    editor.setActiveLine(step ? step.line : null);
    if (step) editor.revealLine(step.line);
    // When the call stack is on screen, follow the deepest frame automatically.
    const stackHost = s.panel === 'stack' ? primaryHost : s.splitPanel === 'stack' ? secondaryHost : null;
    if (stackHost && step && stackHost.current === 'stack') {
      const panel = stackHost.cache.get('stack');
      if (panel) panel.selectDeepestFrame(s.cursor);
    }
  }

  const signature = [
    s.cursor,
    s.status,
    s.steps.length,
    s.panel,
    s.splitPanel,
    s.logs.length,
    s.diagnostics.length,
    s.runtimeNotes.length,
    s.result ? 1 : 0,
    s.learnOpen,
  ].join('|');
  if (signature === lastSignature) return;
  lastSignature = signature;

  primaryHost.show(s.panel, s);
  secondaryHost.show(s.splitPanel, s);
  consolePanel.render(s);

  if (s.status === STATUS.COMPILE_ERROR) editor.setDiagnostics(s.diagnostics);
  else if (s.diagnostics.length) editor.setDiagnostics(s.diagnostics.filter((item) => item.severity === 'error'));
  else editor.setDiagnostics([]);

  const consoleEl = $('#console');
  consoleEl.classList.toggle('is-collapsed', s.consoleCollapsed);
  if (!$('#output-empty')) {
    // Console markup is static; nothing to restore.
  }
}

/* ------------------------------------------------------------------ health */
async function refreshHealth(notify = false) {
  const health = await api.checkHealth();
  const dot = $('#status-backend .health-dot');
  const text = $('#status-backend-text');
  if (health.ok) {
    dot.dataset.state = 'ok';
    const compiler = (health.toolchain && health.toolchain.compiler && health.toolchain.compiler.version) || 'compiler';
    const debuggerVersion = (health.toolchain && health.toolchain.debugger && health.toolchain.debugger.version) || 'debugger';
    text.textContent = `${compiler.split(' (')[0]} · ${debuggerVersion.split(' (')[0]}`;
    text.title = `${compiler}\n${debuggerVersion}\nIsolation: namespaces=${health.isolation.namespaces}, rlimits=${health.isolation.rlimits}`;
  } else {
    dot.dataset.state = health.status === 'degraded' ? 'degraded' : 'down';
    text.textContent = health.status === 'degraded' ? 'Toolchain incomplete' : 'Backend offline';
    text.title = health.error || 'The execution service is not reachable.';
    if (notify) showToast(health.error || 'The execution service is not reachable.', 'error');
  }
  return health;
}

/* ------------------------------------------------------------------ menus */
function closeMenus() {
  $$('.menu').forEach((menu) => {
    menu.hidden = true;
  });
  $$('[data-menu-toggle]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
}

/* --------------------------------------------------------------- actions */
async function handleAction(action) {
  switch (action) {
    case 'run':
      await refreshHealth(false);
      controller.run();
      break;
    case 'stop':
      controller.pause();
      await controller.stop();
      showToast('Stopped. The sandboxed process tree was terminated.', 'warn');
      break;
    case 'restart':
      controller.restart();
      break;
    case 'play':
      controller.play();
      break;
    case 'pause':
      controller.pause();
      break;
    case 'next':
      controller.step('next');
      break;
    case 'prev':
      controller.step('prev');
      break;
    case 'first':
      controller.goTo(0);
      break;
    case 'last':
      controller.goTo(state.steps.length - 1);
      break;
    case 'step-into':
      controller.step('into');
      break;
    case 'step-over':
      controller.step('over');
      break;
    case 'step-out':
      controller.step('out');
      break;
    case 'to-breakpoint':
      controller.runToBreakpoint();
      break;
    case 'new':
      newProgram();
      break;
    case 'save':
    case 'download':
      downloadSource();
      break;
    case 'copy':
      await copySource();
      break;
    case 'theme': {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      localStorage.setItem(THEME_KEY, next);
      update({ theme: next });
      const button = $('[data-action="theme"]');
      button.innerHTML = iconSvg(next === 'dark' ? 'moon' : 'sun');
      break;
    }
    case 'docs':
      openDocs($('#modal-root'));
      break;
    case 'learn':
      update({ learnOpen: true });
      learnDrawer.open();
      break;
    case 'find':
      openFind();
      break;
    case 'find-next':
      findNext(false);
      break;
    case 'find-prev':
      findNext(true);
      break;
    case 'find-close':
      closeFind();
      break;
    case 'toggle-console':
      update({ consoleCollapsed: !state.consoleCollapsed });
      break;
    case 'console-collapse':
      update({ consoleCollapsed: true });
      break;
    case 'clear-output':
      $('#program-output').dataset.text = '';
      $('#program-output').textContent = '';
      showToast('Output view cleared. Step the trace to show output again.', 'info');
      break;
    default:
      break;
  }
}

function downloadSource() {
  const blob = new Blob([editor.getValue()], { type: 'text/x-csrc' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'prog.c';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  update({ dirty: false });
  renderDirtyIndicator();
  addLog('info', 'prog.c downloaded.');
  showToast('prog.c downloaded.', 'success');
}

async function copySource() {
  try {
    await navigator.clipboard.writeText(editor.getValue());
    showToast('Code copied to the clipboard.', 'success');
  } catch (_) {
    showToast('Clipboard access is blocked in this context. Use Save instead.', 'warn');
  }
}

/* ------------------------------------------------------------------- find */
let findResults = { count: 0, current: 0 };

function openFind() {
  $('#find-bar').hidden = false;
  const input = $('#find-input');
  input.focus();
  input.select();
}

function closeFind() {
  $('#find-bar').hidden = true;
  editor.focus();
}

function findNext(backwards) {
  const query = $('#find-input').value;
  if (!query) return;
  const from = editor.textarea.selectionStart;
  const result = editor.find(query, backwards ? from : editor.textarea.selectionEnd, backwards);
  findResults = editor.countMatches(query);
  $('#find-count').textContent = result ? `${findResults.current}/${findResults.count}` : `0/${findResults.count}`;
  if (!result) showToast('No matches.', 'warn');
}

/* --------------------------------------------------------------- dividers */
function setupDivider(divider, onMove) {
  let dragging = false;
  divider.addEventListener('pointerdown', (event) => {
    dragging = true;
    divider.classList.add('is-dragging');
    divider.setPointerCapture(event.pointerId);
  });
  divider.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    onMove(event);
  });
  const stop = () => {
    dragging = false;
    divider.classList.remove('is-dragging');
  };
  divider.addEventListener('pointerup', stop);
  divider.addEventListener('pointercancel', stop);
  divider.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      onMove(null, event.key === 'ArrowLeft' ? -24 : 24);
    }
  });
}

function setupLayout() {
  const workspace = $('#workspace');
  const editorDivider = $('#editor-divider');
  const savedWidth = Number(localStorage.getItem('cvis.editorWidth'));
  if (Number.isFinite(savedWidth) && savedWidth > 200) {
    workspace.style.gridTemplateColumns = `${savedWidth}px 6px minmax(0, 1fr)`;
  }

  setupDivider(editorDivider, (event, delta) => {
    const rect = workspace.getBoundingClientRect();
    if (window.innerWidth <= 960) {
      const current = $('#editor-pane').getBoundingClientRect().height;
      const next = Math.max(160, Math.min(rect.height - 220, event ? event.clientY - rect.top : current + delta));
      workspace.style.gridTemplateRows = `${next}px 6px minmax(0, 1fr)`;
      return;
    }
    const next = Math.max(260, Math.min(rect.width - 360, event ? event.clientX - rect.left : 0));
    workspace.style.gridTemplateColumns = `${next}px 6px minmax(0, 1fr)`;
    localStorage.setItem('cvis.editorWidth', String(Math.round(next)));
  });

  const splitDivider = $('#split-divider');
  setupDivider(splitDivider, (event, delta) => {
    const secondary = $('#panel-secondary');
    const body = $('#viz-body').getBoundingClientRect();
    const next = Math.max(120, Math.min(body.height - 160, event ? body.bottom - event.clientY : 0));
    secondary.style.flexBasis = `${event ? next : Math.max(120, secondary.getBoundingClientRect().height - delta)}px`;
  });
}

/* ------------------------------------------------------------ interaction */
function wireEvents() {
  document.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-action]');
    if (actionButton) {
      event.preventDefault();
      handleAction(actionButton.dataset.action);
      return;
    }

    const menuToggle = event.target.closest('[data-menu-toggle]');
    if (menuToggle) {
      const id = `${menuToggle.dataset.menuToggle}-menu`;
      const menu = document.getElementById(id);
      const isOpen = menu && !menu.hidden;
      closeMenus();
      if (menu && !isOpen) {
        menu.hidden = false;
        menuToggle.setAttribute('aria-expanded', 'true');
      }
      return;
    }

    if (!event.target.closest('.menu-anchor')) closeMenus();

    const vizTab = event.target.closest('#viz-tabs .tab');
    if (vizTab) {
      update({ panel: vizTab.dataset.panel });
      return;
    }

    const consoleTab = event.target.closest('#console-tabs .tab');
    if (consoleTab) {
      update({ consoleTab: consoleTab.dataset.console, consoleCollapsed: false });
      return;
    }
  });

  $('#split-select').addEventListener('change', (event) => {
    update({ splitPanel: event.target.value });
    $('#panel-secondary').style.flexBasis = '';
  });

  $('#timeline-range').addEventListener('input', (event) => {
    controller.pause();
    controller.goTo(Number(event.target.value));
  });

  $('#speed-select').addEventListener('change', (event) => {
    update({ speed: Number(event.target.value) });
  });

  $('#sanitize-toggle').addEventListener('change', (event) => {
    update({ sanitize: event.target.checked, stale: state.steps.length > 0 });
    addLog('info', event.target.checked ? 'Sanitizers enabled for the next run.' : 'Sanitizers disabled for the next run.');
  });

  $('#find-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      findNext(event.shiftKey);
    }
    if (event.key === 'Escape') closeFind();
  });
  $('#find-input').addEventListener('input', () => {
    const query = $('#find-input').value;
    const counts = editor.countMatches(query);
    $('#find-count').textContent = query ? `${counts.current}/${counts.count}` : '0/0';
  });

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing = target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    const meta = event.ctrlKey || event.metaKey;

    if (meta && event.key === 'Enter') {
      event.preventDefault();
      handleAction('run');
      return;
    }
    if (meta && event.key.toLowerCase() === 's') {
      event.preventDefault();
      downloadSource();
      return;
    }
    if (meta && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      openFind();
      return;
    }
    if (event.key === 'Escape') {
      closeMenus();
      if (!$('#modal-root').hidden) {
        $('#modal-root').hidden = true;
        $('#modal-root').innerHTML = '';
      }
      if (!state.learnOpen) closeFind();
      return;
    }
    if (typing) return;
    if (event.key === '[') {
      event.preventDefault();
      handleAction('prev');
    } else if (event.key === ']') {
      event.preventDefault();
      handleAction('next');
    } else if (event.key === ' ') {
      event.preventDefault();
      handleAction(state.playing ? 'pause' : 'play');
    }
  });

  const themeButton = $('[data-action="theme"]');
  themeButton.innerHTML = iconSvg(initialTheme === 'dark' ? 'moon' : 'sun');

  $('#modal-root').addEventListener('click', (event) => {
    if (event.target.id === 'modal-root') {
      $('#modal-root').hidden = true;
      $('#modal-root').innerHTML = '';
    }
  });

  $('#drawer-root').addEventListener('click', (event) => {
    if (event.target.id === 'drawer-root') {
      learnDrawer.close();
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 960) $('#workspace').style.gridTemplateRows = '';
  });
}

/* ------------------------------------------------------------------- init */
function init() {
  hydrateIcons(document);
  buildExamplesMenu();
  buildExampleSelect();
  setupLayout();
  wireEvents();

  const saved = localStorage.getItem('cvis.source');
  const initial = saved || DEFAULT_PROGRAM;
  editor.setValue(initial, { silent: true });
  update({ source: initial, savedSource: initial, dirty: false, stale: false });
  editor.render();
  renderDirtyIndicator();
  editor.onCursor({ line: 1, column: 1, selected: 0 });

  if (saved) addLog('info', 'Restored the last program from this browser.');
  addLog('info', 'C Visualizer ready. Every visualisation comes from a real GCC + GDB trace.');

  subscribe(renderAll);
  renderAll(state);

  window.addEventListener('beforeunload', (event) => {
    localStorage.setItem('cvis.source', editor.getValue());
    if (state.dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  setInterval(() => localStorage.setItem('cvis.source', editor.getValue()), 8000);

  refreshHealth(true);

  // Expose a tiny debugging handle (no secrets, read-only usage).
  window.cVisualizer = { state, controller, editor };
}

init();
