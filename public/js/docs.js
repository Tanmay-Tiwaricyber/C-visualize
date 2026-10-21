/** Documentation modal: how the tool works, shortcuts, limitations and API. */

import { iconSvg } from './icons.js';

export const DOCS_HTML = `
  <h3>What this is</h3>
  <p>
    C Visualizer compiles your C program with a real toolchain (GCC by default), runs it under the GNU debugger inside a sandboxed
    process tree, and records a timeline of execution events. Every line highlight, variable value and address you see comes from that
    recorded run — nothing is inferred by scanning the source for keywords.
  </p>

  <h3>How a run works</h3>
  <ol>
    <li>The browser posts the source and standard input to <code>POST /api/sessions</code>.</li>
    <li>The backend writes the file into a private job directory and compiles it with <code>gcc -g -O0 -Wall -Wextra</code>.</li>
    <li>GDB stops before every source statement, and a Python tracer streams the frames, variables, addresses and program output as JSON lines.</li>
    <li>Limits apply: 5000 recorded steps, a wall-clock timeout, CPU and memory rlimits, and a separate user/network namespace.</li>
    <li>The normalised timeline is returned, and the browser replays it. Stepping back is exact because the timeline is data.</li>
  </ol>

  <h3>Controls</h3>
  <div class="kbd-row"><kbd>Ctrl</kbd><kbd>Enter</kbd><span class="kbd-desc">Run the program</span></div>
  <div class="kbd-row"><kbd>Ctrl</kbd><kbd>S</kbd><span class="kbd-desc">Download the current file</span></div>
  <div class="kbd-row"><kbd>Ctrl</kbd><kbd>F</kbd><span class="kbd-desc">Find in the editor</span></div>
  <div class="kbd-row"><kbd>[</kbd><span class="kbd-desc">Previous recorded step</span></div>
  <div class="kbd-row"><kbd>]</kbd><span class="kbd-desc">Next recorded step</span></div>
  <div class="kbd-row"><kbd>Space</kbd><span class="kbd-desc">Play / pause the trace (when the editor is not focused)</span></div>
  <div class="kbd-row"><kbd>Esc</kbd><span class="kbd-desc">Close dialogs and the find bar</span></div>
  <p>Click the gutter next to a line number to add a breakpoint. The timeline slider scrubs the whole run.</p>

  <h3>What the panels show</h3>
  <ul>
    <li><strong>Flowchart</strong> — the control flow the program actually executed; edges are real transitions, with traversal counts.</li>
    <li><strong>Variables</strong> — parameters, locals and globals of the active frame, with type, value, scope and address.</li>
    <li><strong>Memory</strong> — stack frames with real addresses and pointer references. Heap bookkeeping is reported as unsupported.</li>
    <li><strong>Call stack</strong> — every active frame, including recursive ones, with its own copy of the parameters.</li>
    <li><strong>Arrays &amp; pointers</strong> — element grids, changed cells and pointer targets.</li>
    <li><strong>History</strong> — the full event list; click any row to jump there.</li>
  </ul>

  <h3>Honest limitations</h3>
  <ul>
    <li>Trace replay is not reverse execution: the program ran once and the states were recorded in order.</li>
    <li>Breakpoints are timeline filters, not live debugger breakpoints — the trace is already complete when you set them.</li>
    <li>Standard input is supplied before the run; live keystroke feeding is not implemented in this build.</li>
    <li>Heap allocation tracking (block sizes, leaks) is not reconstructed. Use the Sanitizers switch for real AddressSanitizer/UBSan reports.</li>
    <li>Addresses are real for the traced process but change between runs because of ASLR.</li>
    <li>Only executed lines appear in the flowchart; code that never ran has no node.</li>
    <li>Programs that read more stdin than supplied see EOF — the trace shows where.</li>
  </ul>

  <h3>REST API</h3>
  <pre>POST /api/compile            { source, options }        → diagnostics
POST /api/execute            { source, stdin, options }  → compile + full trace
POST /api/sessions           { source, stdin, options }  → { id, token }, 202
GET  /api/sessions/:id       header x-session-token      → status / result
POST /api/sessions/:id/stop  header x-session-token      → kills the process tree
GET  /api/health                                          → toolchain + limits</pre>
  <p>Errors always return <code>{ ok: false, error: { code, message } }</code> with an appropriate status code.</p>

  <h3>Security model</h3>
  <p>
    Submitted code never runs inside the Node process. Each job runs in its own process group under a fresh user and network namespace,
    with CPU, address-space, file-size and process-count limits, a wall-clock kill and automatic cleanup of temporary files. This is
    process isolation, not a virtual machine: for public deployments run the service inside a container with a read-only filesystem and a
    dedicated user, and keep the request limits small.
  </p>
`;

export function openDocs(root, onClose) {
  root.hidden = false;
  root.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="docs-title">
      <div class="modal-header">
        ${iconSvg('book')}
        <div class="modal-title" id="docs-title">C Visualizer — documentation</div>
        <button class="btn btn-icon btn-ghost modal-close" data-docs-close aria-label="Close documentation">${iconSvg('close')}</button>
      </div>
      <div class="modal-body">${DOCS_HTML}</div>
      <div class="modal-footer">
        <span class="panel-sub">Every visualisation is driven by a real GCC + GDB execution trace.</span>
      </div>
    </div>
  `;
  const close = () => {
    root.hidden = true;
    root.innerHTML = '';
    if (onClose) onClose();
  };
  root.querySelector('[data-docs-close]').addEventListener('click', close);
  root.addEventListener('click', (event) => {
    if (event.target === root) close();
  });
  return close;
}
