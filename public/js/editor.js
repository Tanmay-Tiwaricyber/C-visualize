/**
 * A dependency-free code editor: a transparent textarea layered over a
 * syntax-highlighted <pre>, plus a gutter with line numbers, breakpoints and
 * the current execution line.
 *
 * Keeping this in-house means the app works offline and inside sandboxed
 * preview frames where CDN-hosted editors cannot load.
 */

const KEYWORDS = new Set([
  'auto', 'break', 'case', 'continue', 'default', 'do', 'else', 'enum', 'extern', 'for', 'goto', 'if',
  'register', 'return', 'sizeof', 'static', 'struct', 'switch', 'typedef', 'union', 'volatile', 'while',
  'inline', 'restrict', '_Bool', '_Static_assert', 'alignof', 'alignas',
]);

const TYPE_WORDS = new Set([
  'char', 'const', 'double', 'float', 'int', 'long', 'short', 'signed', 'unsigned', 'void', 'size_t',
  'ssize_t', 'int8_t', 'int16_t', 'int32_t', 'int64_t', 'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t',
  'bool', 'FILE', 'intptr_t', 'uintptr_t',
]);

const CONSTANTS = new Set(['NULL', 'EOF', 'true', 'false', 'stdin', 'stdout', 'stderr', 'SEEK_SET', 'SEEK_END']);

const TOKEN_RE =
  /\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\n]*|^[ \t]*#[^\n]*|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|\b(?:0[xX][0-9a-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?)[fFuUlL]*\b|[A-Za-z_]\w*|[+\-*/%=<>!&|^~?:]+|[()[\]{};,.]/gm;

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

function escapeHtml(text) {
  return text.replace(/[&<>]/g, (char) => ESCAPES[char]);
}

/** Tokenise C source into highlighted HTML. Also used by lesson previews. */
export function highlightC(code) {
  let html = '';
  let lastIndex = 0;
  TOKEN_RE.lastIndex = 0;
  let match = TOKEN_RE.exec(code);
  while (match) {
    const token = match[0];
    const start = match.index;
    if (start > lastIndex) html += escapeHtml(code.slice(lastIndex, start));
    lastIndex = start + token.length;

    let cls = '';
    if (token.startsWith('/*') || token.startsWith('//')) cls = 'tok-comment';
    else if (token.startsWith('#')) cls = 'tok-preproc';
    else if (token.startsWith('"')) cls = 'tok-string';
    else if (token.startsWith("'")) cls = 'tok-char';
    else if (/^[0-9]/.test(token)) cls = 'tok-number';
    else if (/^[A-Za-z_]/.test(token)) {
      const after = code.slice(lastIndex, lastIndex + 1);
      if (KEYWORDS.has(token)) cls = 'tok-keyword';
      else if (TYPE_WORDS.has(token)) cls = 'tok-type';
      else if (CONSTANTS.has(token)) cls = 'tok-constant';
      else if (after === '(') cls = 'tok-function';
    } else if (/^\d/.test(token)) cls = 'tok-number';
    else if (/^[()[\]{};,.]$/.test(token)) cls = 'tok-punct';
    else cls = 'tok-operator';

    html += cls ? `<span class="${cls}">${escapeHtml(token)}</span>` : escapeHtml(token);
    match = TOKEN_RE.exec(code);
  }
  if (lastIndex < code.length) html += escapeHtml(code.slice(lastIndex));
  return html || '&#8203;';
}

export class CodeEditor {
  constructor({ textarea, highlight, gutter, codeArea, currentLine, breakpointMarks, scroll, onChange, onCursor }) {
    this.textarea = textarea;
    this.highlight = highlight;
    this.gutter = gutter;
    this.codeArea = codeArea;
    this.currentLineEl = currentLine;
    this.breakpointMarks = breakpointMarks;
    this.scroll = scroll;
    this.onChange = onChange || (() => {});
    this.onCursor = onCursor || (() => {});
    this.onBreakpointsChange = () => {};
    this.breakpoints = new Set();
    this.diagnostics = [];
    this.activeLine = null;
    this.lineCount = 0;
    this.lineHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--editor-line-height')) || 21;

    this._bind();
  }

  _bind() {
    this.textarea.addEventListener('input', () => this.handleInput());
    this.textarea.addEventListener('keydown', (event) => this.handleKeydown(event));
    this.textarea.addEventListener('keyup', () => this.updateCursor());
    this.textarea.addEventListener('click', () => this.updateCursor());
    this.textarea.addEventListener('scroll', () => {
      // The textarea never scrolls internally: the shared container does.
      if (this.textarea.scrollTop !== 0) this.textarea.scrollTop = 0;
      if (this.textarea.scrollLeft !== 0) this.textarea.scrollLeft = 0;
    });

    this.gutter.addEventListener('click', (event) => {
      const lineEl = event.target.closest('.gutter-line');
      if (!lineEl) return;
      const line = Number(lineEl.dataset.line);
      if (Number.isFinite(line)) this.toggleBreakpoint(line);
    });
  }

  getValue() {
    return this.textarea.value;
  }

  setValue(code, { silent = false } = {}) {
    this.textarea.value = code;
    this.render();
    if (!silent) this.onChange(code);
    this.updateCursor();
  }

  setReadOnly(readOnly) {
    this.textarea.readOnly = readOnly;
  }

  focus() {
    this.textarea.focus();
  }

  handleInput() {
    this.render();
    this.onChange(this.textarea.value);
    this.updateCursor();
  }

  render() {
    const value = this.textarea.value;
    this.highlight.innerHTML = highlightC(value) + '\n';
    const lines = value.split('\n').length;
    if (lines !== this.lineCount) {
      this.lineCount = lines;
      this.renderGutter();
    }
    this.applyDiagnosticMarkers();
    this.positionCurrentLine();
  }

  renderGutter() {
    const chunks = [];
    for (let i = 1; i <= this.lineCount; i += 1) {
      const isBp = this.breakpoints.has(i);
      chunks.push(
        `<div class="gutter-line" data-line="${i}"${isBp ? ' data-breakpoint="true"' : ''}><span class="bp-hit"></span><span class="ln">${i}</span></div>`,
      );
    }
    this.gutter.innerHTML = chunks.join('');
    this.renderBreakpointMarks();
    this.applyDiagnosticMarkers();
    this.updateActiveLine();
  }

  renderBreakpointMarks() {
    const marks = [...this.breakpoints]
      .sort((a, b) => a - b)
      .map((line) => `<div class="bp-mark" style="top:${(line - 1) * this.lineHeight}px"></div>`);
    this.breakpointMarks.innerHTML = marks.join('');
  }

  setBreakpoints(lines) {
    this.breakpoints = new Set(lines);
    this.renderGutter();
  }

  toggleBreakpoint(line) {
    if (this.breakpoints.has(line)) this.breakpoints.delete(line);
    else this.breakpoints.add(line);
    this.renderGutter();
    this.onBreakpointsChange(new Set(this.breakpoints));
  }

  setDiagnostics(diagnostics) {
    this.diagnostics = (diagnostics || []).filter((item) => Number.isFinite(item.line));
    this.applyDiagnosticMarkers();
  }

  applyDiagnosticMarkers() {
    if (!this.gutter) return;
    const worst = new Map();
    for (const item of this.diagnostics) {
      const current = worst.get(item.line);
      if (current === 'error') continue;
      if (!current || item.severity === 'error' || (item.severity === 'warning' && current !== 'warning')) {
        worst.set(item.line, item.severity === 'error' ? 'error' : 'warning');
      }
    }
    this.gutter.querySelectorAll('.gutter-line').forEach((lineEl) => {
      const line = Number(lineEl.dataset.line);
      const severity = worst.get(line);
      if (severity === 'error') lineEl.dataset.error = 'true';
      else delete lineEl.dataset.error;
      if (severity === 'warning') lineEl.dataset.warning = 'true';
      else delete lineEl.dataset.warning;
    });
  }

  setActiveLine(line) {
    this.activeLine = line && line > 0 ? line : null;
    this.updateActiveLine();
  }

  updateActiveLine() {
    if (!this.gutter) return;
    this.gutter.querySelectorAll('.gutter-line[data-active]').forEach((el) => {
      delete el.dataset.active;
    });
    if (!this.activeLine) {
      this.currentLineEl.hidden = true;
      return;
    }
    const lineEl = this.gutter.querySelector(`.gutter-line[data-line="${this.activeLine}"]`);
    if (lineEl) lineEl.dataset.active = 'true';
    this.positionCurrentLine();
  }

  positionCurrentLine() {
    if (!this.activeLine) {
      this.currentLineEl.hidden = true;
      return;
    }
    this.currentLineEl.hidden = false;
    this.currentLineEl.style.transform = `translateY(${(this.activeLine - 1) * this.lineHeight}px)`;
  }

  revealLine(line) {
    const top = (line - 1) * this.lineHeight;
    const view = this.scroll.getBoundingClientRect();
    const target = this.codeArea.getBoundingClientRect();
    const absoluteTop = target.top - view.top + this.scroll.scrollTop + top;
    const padding = this.lineHeight * 3;
    if (absoluteTop < this.scroll.scrollTop + padding) {
      this.scroll.scrollTo({ top: Math.max(0, absoluteTop - padding), behavior: 'smooth' });
    } else if (absoluteTop + this.lineHeight > this.scroll.scrollTop + view.height - padding) {
      this.scroll.scrollTo({ top: absoluteTop - view.height + padding * 2, behavior: 'smooth' });
    }
  }

  goToLine(line) {
    const lines = this.textarea.value.split('\n');
    const clamped = Math.max(1, Math.min(lines.length, line));
    let offset = 0;
    for (let i = 0; i < clamped - 1; i += 1) offset += lines[i].length + 1;
    this.textarea.focus();
    this.textarea.setSelectionRange(offset, offset + lines[clamped - 1].length);
    this.revealLine(clamped);
    this.updateCursor();
  }

  handleKeydown(event) {
    const { textarea } = this;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;

    if (event.key === 'Tab') {
      event.preventDefault();
      const indent = '    ';
      if (start !== end || event.shiftKey) {
        this.indentSelection(event.shiftKey, indent);
        return;
      }
      this.insertText(indent);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const before = value.slice(0, start);
      const lineStart = before.lastIndexOf('\n') + 1;
      const currentLineText = before.slice(lineStart);
      const indentMatch = currentLineText.match(/^[ \t]*/);
      let indent = indentMatch ? indentMatch[0] : '';
      if (/[{(]\s*$/.test(currentLineText)) indent += '    ';
      const after = value.slice(end);
      if (/^\s*}/.test(after) && indent.length >= 4) {
        // Keep the closing brace aligned with its opening line.
        const dedented = indent.slice(0, indent.length - 4);
        this.insertText(`\n${indent}\n${dedented}`);
        const caret = start + 1 + indent.length;
        textarea.setSelectionRange(caret, caret);
        return;
      }
      this.insertText(`\n${indent}`);
      return;
    }

    if (event.key === 'Backspace' && start === end) {
      const before = value.slice(0, start);
      const currentLine = before.slice(before.lastIndexOf('\n') + 1);
      if (currentLine.length > 0 && currentLine.trim() === '') {
        event.preventDefault();
        const remove = Math.min(4, currentLine.length);
        textarea.setSelectionRange(start - remove, start);
        this.insertText('');
      }
    }
  }

  indentSelection(dedent, indent) {
    const { textarea } = this;
    const value = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const block = value.slice(lineStart, end);
    const lines = block.split('\n');
    const updated = lines.map((line) => {
      if (dedent) return line.startsWith(indent) ? line.slice(indent.length) : line.replace(/^[ \t]{1,4}/, '');
      return indent + line;
    });
    const replacement = updated.join('\n');
    textarea.setSelectionRange(lineStart, end);
    this.insertText(replacement);
    textarea.setSelectionRange(lineStart, lineStart + replacement.length);
  }

  insertText(text) {
    const { textarea } = this;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    textarea.value = value.slice(0, start) + text + value.slice(end);
    const caret = start + text.length;
    textarea.setSelectionRange(caret, caret);
    this.render();
    this.onChange(textarea.value);
    this.updateCursor();
  }

  updateCursor() {
    const index = this.textarea.selectionStart;
    const value = this.textarea.value;
    const before = value.slice(0, index);
    const line = before.split('\n').length;
    const column = index - before.lastIndexOf('\n');
    const selected = this.textarea.selectionEnd - index;
    this.onCursor({ line, column, selected });
  }

  scrollToTop() {
    this.scroll.scrollTo({ top: 0, left: 0 });
  }

  find(query, from = 0, backwards = false) {
    if (!query) return null;
    const value = this.textarea.value;
    const haystack = value.toLowerCase();
    const needle = query.toLowerCase();
    let index;
    if (backwards) {
      index = haystack.lastIndexOf(needle, Math.max(0, from - 1));
      if (index === -1) index = haystack.lastIndexOf(needle);
    } else {
      index = haystack.indexOf(needle, from);
      if (index === -1) index = haystack.indexOf(needle);
    }
    if (index === -1) return null;
    this.textarea.focus();
    this.textarea.setSelectionRange(index, index + query.length);
    const line = value.slice(0, index).split('\n').length;
    this.revealLine(line);
    this.updateCursor();
    return { index, line };
  }

  countMatches(query) {
    if (!query) return { count: 0, current: 0 };
    const value = this.textarea.value.toLowerCase();
    const needle = query.toLowerCase();
    let count = 0;
    let index = value.indexOf(needle);
    while (index !== -1) {
      count += 1;
      index = value.indexOf(needle, index + needle.length);
    }
    const before = this.textarea.value.slice(0, this.textarea.selectionStart).toLowerCase();
    let current = 0;
    if (count) {
      let cursor = before.indexOf(needle);
      while (cursor !== -1) {
        current += 1;
        cursor = before.indexOf(needle, cursor + needle.length);
      }
      if (current === 0) current = 1;
    }
    return { count, current };
  }
}
