/**
 * Control-flow visualisation.
 *
 * The graph is built from the *recorded execution trace*: every node is a
 * source line the program actually reached and every edge is a transition that
 * really happened (with a traversal count). Only the True/False edge labels are
 * inferred from the source structure, and the panel says so.
 *
 * This avoids the classic "decorative flowchart that has nothing to do with the
 * running program" failure mode: if a line never executed it is not drawn.
 */

import { iconSvg } from './icons.js';
import { currentStep } from './timeline.js';

const NODE_W = 356;
const NODE_H = 30;
const DECISION_H = 36;
const GAP = 14;
const BASE_X = 44;
const LANE_W = 46;
const PAD = 40;

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
}

const DECISION_RE = /^\s*(?:\}\s*)?(?:else\s+)?(?:if|for|while|switch)\s*\(/;
const DO_RE = /^\s*do\s*\{?$/;
const RETURN_RE = /^\s*return\b/;
const CALL_RE = /([A-Za-z_]\w*)\s*\(/;

/** Body line ranges for condition lines, used for True/False labels. */
function branchBodies(lines) {
  const bodies = new Map();
  lines.forEach((line, index) => {
    const lineNo = index + 1;
    if (!/^\s*(?:\}\s*)?(?:else\s+)?(?:if|for|while)\s*\(/.test(line)) return;
    const next = (lines[index + 1] || '').trim();
    if (!next) return;
    let bodyStart = lineNo + 1;
    if (next === '{') bodyStart = lineNo + 2;
    let depth = 0;
    let bodyEnd = bodyStart;
    for (let i = bodyStart - 1; i < lines.length; i += 1) {
      const text = lines[i];
      for (const char of text) {
        if (char === '{') depth += 1;
        else if (char === '}') depth -= 1;
      }
      bodyEnd = i + 1;
      if (depth <= 0 && (text.includes(';') || text.includes('}'))) break;
    }
    bodies.set(lineNo, { bodyStart, bodyEnd: Math.max(bodyStart, bodyEnd) });
  });
  return bodies;
}

export class FlowchartPanel {
  constructor(container, options = {}) {
    this.container = container;
    this.getSource = options.getSource || (() => '');
    this.onSelectStep = options.onSelectStep || (() => {});
    this.fn = null;
    this.zoom = 1;
    this.loc = { x: 0, y: 0 };
    this.userAdjusted = false;
    this.dragging = null;
  }

  setFunction(fn) {
    this.fn = fn;
    this.userAdjusted = false;
    if (this.state) this.render(this.state);
  }

  render(state) {
    this.state = state;
    if (!state.steps.length) {
      this.container.innerHTML = this.emptyMarkup(state);
      return;
    }

    const step = currentStep(state);
    const functions = [...new Set(state.steps.map((item) => item.fn))];
    if (!this.fn || !functions.includes(this.fn)) {
      this.fn = step ? step.fn : functions[0];
      this.userAdjusted = false;
    }

    const graph = this.buildGraph(state, this.fn);
    if (!graph.nodes.length) {
      this.container.innerHTML = this.emptyMarkup(state);
      return;
    }
    const activeLine = step && step.fn === this.fn ? step.line : null;
    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    const sourceLines = this.getSource().split('\n');

    const contentW = BASE_X + NODE_W + LANE_W + LANE_W + PAD;
    const contentH = graph.height + PAD + 34;

    const edgesMarkup = graph.edges
      .map((edge) => {
        const from = nodesById.get(edge.from);
        const to = nodesById.get(edge.to);
        if (!from || !to) return '';
        const isBack = to.order <= from.order;
        const nextStep = state.steps[state.cursor + 1];
        const isActive = activeLine !== null && from.line === activeLine && nextStep && nextStep.line === to.line;
        const visited = from.order <= graph.cursorOrder && to.order <= graph.cursorOrder;
        const edgeLabel = edge.label || '';

        const sx = from.x + NODE_W / 2;
        const sy = from.y + from.height;
        const tx = to.x + NODE_W / 2;
        const ty = to.y;

        let path;
        let labelX;
        let labelY;
        if (!isBack) {
          if (Math.abs(from.x - to.x) < 1) {
            path = `M ${sx} ${sy} L ${tx} ${ty}`;
          } else {
            const midY = (sy + ty) / 2;
            path = `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;
          }
          // Place the branch label just under the decision, on the side the
          // edge leaves towards, so True and False never collide.
          if (edgeLabel === 'True' || edgeLabel === 'False') {
            labelX = sx + (tx >= sx ? 18 : -18);
            labelY = sy + 15;
          } else {
            labelX = Math.max(sx, tx) + 8;
            labelY = (sy + ty) / 2 + 4;
          }
        } else {
          const corridor = Math.max(from.x, to.x) + NODE_W + (from.x === to.x ? 24 : 30);
          const rightEdge = to.x + NODE_W;
          const targetY = to.y + to.height / 2;
          path = `M ${sx} ${sy} V ${sy + 10} H ${corridor - 10} Q ${corridor} ${sy + 10} ${corridor} ${sy + 20} V ${
            targetY - 10
          } Q ${corridor} ${targetY} ${corridor - 10} ${targetY} H ${rightEdge}`;
          labelX = corridor - 26;
          labelY = targetY - 8;
        }

        const classes = [
          'flow-edge',
          visited ? 'is-visited' : '',
          isActive ? 'is-active' : '',
          isBack ? 'is-back' : '',
          edge.label === 'True' ? 'is-true' : '',
          edge.label === 'False' ? 'is-false' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return `
          <g class="flow-edge-group">
            <path class="${classes}" d="${path}" marker-end="url(#flow-arrow)"/>
            ${
              edge.label
                ? `<text class="flow-edge-label ${edge.label === 'True' ? 'is-true' : 'is-false'}" x="${labelX}" y="${labelY}" text-anchor="${
                    isBack ? 'start' : 'middle'
                  }">${edge.label}</text>`
                : ''
            }
            ${isBack && edge.count > 1 ? `<text class="flow-edge-count" x="${labelX}" y="${labelY + 12}">×${edge.count}</text>` : ''}
          </g>`;
      })
      .join('');

    const nodesMarkup = graph.nodes
      .map((node) => {
        const nodeState = activeLine === node.line ? 'active' : node.firstIndex <= state.cursor ? 'visited' : 'unvisited';
        const isDecision = node.role === 'decision';
        const height = node.height;
        const x = node.x;
        const width = NODE_W;
        const label = node.text.length > 46 ? `${node.text.slice(0, 45)}…` : node.text;
        const shape = isDecision
          ? `<polygon points="${x + 12},${node.y} ${x + width - 12},${node.y} ${x + width},${node.y + height / 2} ${x + width - 12},${node.y + height} ${x + 12},${node.y + height} ${x},${node.y + height / 2}"/>`
          : `<rect x="${x}" y="${node.y}" width="${width}" height="${height}" rx="5"/>`;
        return `
          <g class="flow-node" data-node-line="${node.line}" data-node-index="${node.firstIndex}" data-state="${nodeState}" data-role="${node.role}" tabindex="0" role="button" aria-label="Line ${node.line}: ${escapeHtml(label)}">
            ${shape}
            <text class="node-line" x="${x + 12}" y="${node.y + 12}">L${node.line}${node.count > 1 ? ` · executed ×${node.count}` : ''}</text>
            <text class="node-label" x="${x + 12}" y="${node.y + height - 9}">${escapeHtml(label)}</text>
          </g>`;
      })
      .join('');

    const first = graph.nodes[0];
    const last = graph.nodes[graph.nodes.length - 1];
    const entryMarkup = `
      <g class="flow-node" data-role="entry" data-state="visited">
        <rect x="${BASE_X + NODE_W / 2 - 66}" y="10" width="132" height="26" rx="13"/>
        <text class="node-label" x="${BASE_X + NODE_W / 2}" y="27" text-anchor="middle">ENTRY ${escapeHtml(this.fn)}()</text>
      </g>
      <path class="flow-edge is-visited" d="M ${BASE_X + NODE_W / 2} 36 L ${BASE_X + NODE_W / 2} ${first.y}" marker-end="url(#flow-arrow)"/>
      <g class="flow-node" data-role="exit" data-state="visited">
        <rect x="${BASE_X + NODE_W / 2 - 52}" y="${last.y + last.height + 26}" width="104" height="26" rx="13"/>
        <text class="node-label" x="${BASE_X + NODE_W / 2}" y="${last.y + last.height + 43}" text-anchor="middle">EXIT</text>
      </g>
      <path class="flow-edge is-visited" d="M ${BASE_X + NODE_W / 2} ${last.y + last.height} L ${
        BASE_X + NODE_W / 2
      } ${last.y + last.height + 26}" marker-end="url(#flow-arrow)"/>
    `;

    const nowBlock = `
            <div class="flow-now" data-flow-now>
              <span class="flow-now-line">${activeLine ? `L${activeLine}` : '—'}</span>
              <span class="flow-now-code">${escapeHtml(
                activeLine ? (sourceLines[activeLine - 1] || '').trim() : 'This function is not on the stack at this step.',
              )}</span>
            </div>`;

    const currentOutput = state.steps
      .slice(0, state.cursor + 1)
      .reduce((text, item) => text + (item.output || []).map((chunk) => chunk.text).join(''), '');

    this.container.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Flowchart</span>
          <span class="panel-sub">recorded control flow · ${graph.nodes.length} nodes · ${graph.edges.length} transitions</span>
          <div class="panel-actions">
            <select class="select select-sm" data-flow-fn aria-label="Function shown in the flowchart">
              ${functions.map((name) => `<option value="${escapeHtml(name)}" ${name === this.fn ? 'selected' : ''}>${escapeHtml(name)}()</option>`).join('')}
            </select>
            <button class="btn btn-sm btn-icon btn-ghost" data-flow-fit title="Fit the graph to the panel" aria-label="Fit graph">${iconSvg('target')}</button>
          </div>
        </div>
        <div class="flow-wrap">
          ${nowBlock}
          <div class="flow-canvas" data-flow-canvas>
            <div class="flow-scroll" data-flow-scroll>
            <svg data-flow-svg aria-label="Control flow of ${escapeHtml(this.fn)}">
              <defs>
                <marker id="flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/>
                </marker>
              </defs>
              <g data-flow-viewport>
                ${edgesMarkup}
                ${nodesMarkup}
                ${entryMarkup}
              </g>
            </svg>
            </div>

            <div class="flow-controls">
              <button class="btn btn-icon btn-ghost btn-sm" data-flow-zoom="in" title="Zoom in" aria-label="Zoom in">${iconSvg('chevron-up')}</button>
              <button class="btn btn-icon btn-ghost btn-sm" data-flow-zoom="out" title="Zoom out" aria-label="Zoom out">${iconSvg('chevron-down')}</button>
              <button class="btn btn-icon btn-ghost btn-sm" data-flow-fit title="Fit the graph" aria-label="Fit graph">${iconSvg('target')}</button>
            </div>
          </div>
          <div class="flow-footer">
            <span class="legend-item"><span class="legend-swatch" data-kind="active"></span>active</span>
            <span class="legend-item"><span class="legend-swatch" data-kind="visited"></span>executed</span>
            <span class="legend-item"><span class="legend-swatch" data-kind="decision"></span>condition</span>
            <span class="legend-item"><span class="legend-line"></span>loop back edge</span>
            <span class="grow"></span>
            <span class="flow-zoom" data-flow-zoom-label>100%</span>
          </div>
        </div>
        <div class="note-strip">
          ${iconSvg('info')}
          <span>
            Nodes and arrows are the transitions the program actually made (edges are counted). True/False labels are inferred from the
            source layout, so single-line bodies or unusual formatting can leave an edge unlabelled. Code that never ran has no node.
            ${currentOutput ? '' : ''}
          </span>
        </div>
      </div>
    `;

    this.mountInteractions({ contentW, contentH, activeLine });
  }

  buildGraph(state, fn) {
    const steps = state.steps;
    const lines = this.getSource().split('\n');
    const nodes = [];
    const nodeByLine = new Map();
    const edges = [];
    const edgeMap = new Map();
    let previous = null;

    steps.forEach((step, index) => {
      if (step.fn !== fn) {
        previous = null;
        return;
      }
      if (!nodeByLine.has(step.line)) {
        const text = (lines[step.line - 1] || '').trim();
        nodeByLine.set(step.line, {
          id: `n${step.line}`,
          line: step.line,
          order: nodes.length,
          firstIndex: index,
          count: 0,
          text: text || `line ${step.line}`,
          y: 0,
          x: BASE_X,
          height: DECISION_RE.test(text) || DO_RE.test(text) ? DECISION_H : NODE_H,
          role: DECISION_RE.test(text) || DO_RE.test(text) ? 'decision' : RETURN_RE.test(text) ? 'return' : 'stmt',
        });
        nodes.push(nodeByLine.get(step.line));
      }
      nodeByLine.get(step.line).count += 1;

      if (previous && previous.fn === fn) {
        const key = `${previous.line}->${step.line}`;
        if (!edgeMap.has(key)) {
          edgeMap.set(key, { from: `n${previous.line}`, to: `n${step.line}`, count: 0, label: '', fromLine: previous.line, toLine: step.line });
          edges.push(edgeMap.get(key));
        }
        edgeMap.get(key).count += 1;
      }
      previous = step;
    });

    // Rows in first-execution order. Nodes that receive a back edge (loop heads)
    // are shifted right so the loop's return path has a lane of its own.
    const orderById = new Map(nodes.map((node) => [node.id, node.order]));
    const backTargets = new Set(
      edges.filter((edge) => orderById.get(edge.to) <= orderById.get(edge.from)).map((edge) => edge.to),
    );

    let y = 78;
    let previousNode = null;
    nodes.forEach((node) => {
      const loopHead = backTargets.has(node.id);
      if (loopHead && previousNode && previousNode.x === BASE_X) {
        node.x = BASE_X + LANE_W + 16;
        y += 10;
      }
      node.y = y;
      y += node.height + GAP;
      previousNode = node;
    });

    // True/False labels.
    const bodies = branchBodies(lines);
    for (const node of nodes) {
      if (node.role !== 'decision') continue;
      const body = bodies.get(node.line);
      if (!body) continue;
      for (const edge of edges) {
        if (edge.from !== node.id) continue;
        if (edge.toLine >= body.bodyStart && edge.toLine <= body.bodyEnd + 1) edge.label = 'True';
        else if (edge.toLine > body.bodyEnd) edge.label = 'False';
      }
    }

    return {
      nodes,
      edges,
      height: y + 60,
      cursorOrder: nodes.filter((node) => node.firstIndex <= state.cursor).length - 1,
    };
  }

  mountInteractions({ contentW, contentH, activeLine }) {
    const canvas = this.container.querySelector('[data-flow-canvas]');
    const scroller = this.container.querySelector('[data-flow-scroll]');
    const svg = this.container.querySelector('[data-flow-svg]');
    const viewport = this.container.querySelector('[data-flow-viewport]');
    const zoomLabel = this.container.querySelector('[data-flow-zoom-label]');
    if (!canvas || !svg || !viewport || !scroller) return;

    // The graph is rendered at a readable scale and the panel scrolls; zooming
    // changes the render scale, not just a transform, so labels stay crisp.
    const layout = () => {
      const width = canvas.clientWidth;
      const widthScale = (width - 40) / contentW;
      const zoom = this.zoom || Math.max(0.55, Math.min(1, widthScale));
      this.zoom = zoom;
      const renderedW = Math.max(width, contentW * zoom);
      const renderedH = Math.max(canvas.clientHeight, contentH * zoom);
      svg.setAttribute('width', renderedW);
      svg.setAttribute('height', renderedH);
      svg.setAttribute('viewBox', `0 0 ${renderedW} ${renderedH}`);
      const offsetX = Math.max(0, (renderedW - contentW * zoom) / 2);
      viewport.setAttribute('transform', `translate(${offsetX} ${topInset}) scale(${zoom})`);
      if (zoomLabel) zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    };

    const topInset = 12;
    let firstLayout = true;
    layout();

    const revealActive = () => {
      const activeNode = this.container.querySelector('.flow-node[data-state="active"]');
      if (!activeNode) return;
      const shape = activeNode.querySelector('rect, polygon');
      const y = Number(shape && shape.getAttribute('y'));
      if (!Number.isFinite(y)) return;
      const scaled = y * this.zoom + topInset;
      const view = scroller.clientHeight;
      const current = scroller.scrollTop;
      if (scaled < current + 24 || scaled > current + view - 80) {
        scroller.scrollTop = Math.max(0, scaled - view / 2);
      }
    };

    if (activeLine !== null) revealActive();
    if (firstLayout) {
      firstLayout = false;
      scroller.scrollTop = 0;
    }

    const zoomBy = (factor) => {
      this.zoom = Math.max(0.4, Math.min(2, this.zoom * factor));
      this.userAdjusted = true;
      layout();
      revealActive();
    };

    canvas.addEventListener(
      'wheel',
      (event) => {
        if (!event.ctrlKey && !event.metaKey) return; // plain wheel scrolls the panel
        event.preventDefault();
        zoomBy(event.deltaY < 0 ? 1.1 : 1 / 1.1);
      },
      { passive: false },
    );

    // Drag to pan by scrolling the viewport.
    let drag = null;
    canvas.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.flow-controls, .flow-node')) return;
      drag = { x: event.clientX, y: event.clientY, top: scroller.scrollTop, left: scroller.scrollLeft };
      canvas.classList.add('is-panning');
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!drag) return;
      scroller.scrollTop = drag.top - (event.clientY - drag.y);
      scroller.scrollLeft = drag.left - (event.clientX - drag.x);
    });
    const endDrag = () => {
      drag = null;
      canvas.classList.remove('is-panning');
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    canvas.querySelectorAll('[data-flow-zoom]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        zoomBy(button.dataset.flowZoom === 'in' ? 1.15 : 1 / 1.15);
      });
    });
    this.container.querySelectorAll('[data-flow-fit]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.userAdjusted = false;
        this.zoom = null;
        layout();
        scroller.scrollTop = 0;
      });
    });

    const fnSelect = this.container.querySelector('[data-flow-fn]');
    if (fnSelect) fnSelect.addEventListener('change', () => this.setFunction(fnSelect.value));

    this.container.querySelectorAll('[data-node-index]').forEach((node) => {
      const jump = (event) => {
        event.stopPropagation();
        this.onSelectStep(Number(node.dataset.nodeIndex));
      };
      node.addEventListener('click', jump);
      node.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          jump(event);
        }
      });
    });

    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        layout();
        revealActive();
      });
      this.resizeObserver.observe(canvas);
    }
  }

  emptyMarkup(state) {
    const isError = state.status === 'compile-error' || state.status === 'trace-error';
    return `
      <div class="panel">
        <div class="panel-header"><span class="panel-title">Flowchart</span></div>
        <div class="panel-empty">
          ${iconSvg('flow')}
          <p class="empty-title">${isError ? 'No control flow to draw' : 'Nothing recorded yet'}</p>
          <p>${
            isError
              ? 'The program did not produce an execution trace. Fix the diagnostics in the Compiler tab and run again.'
              : 'Run a program to build the control-flow graph from the execution trace. Conditions, loops and calls become nodes you can click.'
          }</p>
        </div>
      </div>
    `;
  }
}
