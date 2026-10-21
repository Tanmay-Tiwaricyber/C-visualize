/**
 * Inline SVG icon set. Kept local (no CDN) so the app works offline and inside
 * sandboxed preview frames.
 */

const PATHS = {
  logo: `<rect x="2.2" y="2.2" width="19.6" height="19.6" rx="5.4" stroke-width="1.5"/><path d="M9.6 8.3v7.4l6-3.7z" fill="currentColor" stroke="none"/><circle cx="6.8" cy="6.8" r="0.9" fill="currentColor" stroke="none"/>`,
  play: `<polygon points="6 3.5 20 12 6 20.5"/>`,
  pause: `<rect x="6.5" y="4.5" width="4" height="15" rx="1"/><rect x="13.5" y="4.5" width="4" height="15" rx="1"/>`,
  stop: `<rect x="5.5" y="5.5" width="13" height="13" rx="2"/>`,
  restart: `<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4.2v5h5"/>`,
  'skip-back': `<polygon points="19 19.5 9 12 19 4.5"/><line x1="5" y1="19" x2="5" y2="5"/>`,
  'skip-forward': `<polygon points="5 4.5 15 12 5 19.5"/><line x1="19" y1="5" x2="19" y2="19"/>`,
  'chevron-left': `<path d="m15 5-7 7 7 7"/>`,
  'chevron-right': `<path d="m9 5 7 7-7 7"/>`,
  'chevron-up': `<path d="m5 15 7-7 7 7"/>`,
  'chevron-down': `<path d="m5 9 7 7 7-7"/>`,
  'step-into': `<path d="M12 3v9"/><path d="m8 8.5 4 4 4-4"/><rect x="4.5" y="16" width="15" height="4.5" rx="1.5"/>`,
  'step-over': `<path d="M4 10h11"/><path d="m11.5 6 4 4-4 4"/><circle cx="19" cy="18" r="2"/><path d="M4 18h10"/>`,
  'step-out': `<path d="M12 21v-9"/><path d="m8 15.5 4-4 4 4"/><path d="M4.5 6.5h15"/>`,
  'file-plus': `<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 12v5"/><path d="M9.5 14.5h5"/>`,
  folder: `<path d="M3 7.5A2 2 0 0 1 5 5.5h3.6l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>`,
  download: `<path d="M12 3v11"/><path d="m8 10.5 4 4 4-4"/><path d="M4 18.5h16"/>`,
  copy: `<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5v-3a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>`,
  search: `<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>`,
  close: `<path d="M6 6l12 12M18 6 6 18"/>`,
  book: `<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 5.5v15"/>`,
  moon: `<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>`,
  sun: `<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/>`,
  code: `<path d="m9 6.5-6 5.5 6 5.5"/><path d="m15 6.5 6 5.5-6 5.5"/>`,
  flow: `<rect x="3" y="3" width="6.5" height="5" rx="1.2"/><rect x="14.5" y="9.5" width="6.5" height="5" rx="1.2"/><rect x="3" y="16" width="6.5" height="5" rx="1.2"/><path d="M6.2 8v8"/><path d="M14.5 12H9.5a3.3 3.3 0 0 1-3.3-3.3"/>`,
  variables: `<path d="M8.5 3.5c-2 0-2.5 1-2.5 2.5v3c0 1.5-.6 2.5-2 3 1.4.5 2 1.5 2 3v3c0 1.5.5 2.5 2.5 2.5"/><path d="M15.5 3.5c2 0 2.5 1 2.5 2.5v3c0 1.5.6 2.5 2 3-1.4.5-2 1.5-2 3v3c0 1.5-.5 2.5-2.5 2.5"/>`,
  memory: `<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3"/>`,
  stack: `<path d="m12 3 9 4.5-9 4.5-9-4.5z"/><path d="m3 12 9 4.5 9-4.5"/><path d="m3 16.5 9 4.5 9-4.5"/>`,
  pointer: `<path d="m5 3 14 7.6-6.3 1.5L10.6 19z"/>`,
  history: `<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4.2v5h5"/><path d="M12 8v4.5l3 1.8"/>`,
  terminal: `<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="m7 10 2.5 2.5L7 15"/><path d="M12.5 15h4.5"/>`,
  keyboard: `<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M6 13h.01M9.5 13h.01M13 13h.01M16.5 13h.01M8 16h8"/>`,
  'alert-circle': `<circle cx="12" cy="12" r="8.5"/><path d="M12 8v5"/><circle cx="12" cy="16.2" r="0.9" fill="currentColor" stroke="none"/>`,
  warning: `<path d="M12 4.5 21 19H3z"/><path d="M12 10v4"/><circle cx="12" cy="16.8" r="0.9" fill="currentColor" stroke="none"/>`,
  bug: `<rect x="8" y="6.5" width="8" height="11" rx="4"/><path d="M8 11h8M8 14h8"/><path d="M8 8.5 5.5 6M16 8.5l2.5-2.5M8 14.5 5 17M16 14.5 19 17M4 11h2M18 11h2"/>`,
  list: `<path d="M8 6.5h12M8 12h12M8 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01"/>`,
  eraser: `<path d="m8 20-4-4a2 2 0 0 1 0-2.8L13.5 3.7a2 2 0 0 1 2.8 0l4 4a2 2 0 0 1 0 2.8L10.5 20z"/><path d="M8 20h12"/>`,
  graduation: `<path d="m12 3 10 5-10 5L2 8z"/><path d="M6 10.2V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.8"/>`,
  info: `<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none"/>`,
  check: `<path d="m5 12.5 5 5L19.5 7"/>`,
  'x-circle': `<circle cx="12" cy="12" r="8.5"/><path d="m9 9 6 6M15 9l-6 6"/>`,
  split: `<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M12 4v16"/>`,
  gauge: `<path d="M12 13.5 16 9"/><circle cx="12" cy="13.5" r="1"/><path d="M4 18a9 9 0 1 1 16 0"/>`,
  activity: `<path d="M3 12h4l2.5-6 4 12 2.5-6h5"/>`,
  'play-circle': `<circle cx="12" cy="12" r="8.5"/><path d="M10.5 8.7 15.5 12l-5 3.3z"/>`,
  layers: `<path d="m12 3 9 4.5-9 4.5L3 7.5z"/><path d="m3 12.5 9 4.5 9-4.5"/>`,
  arrowRight: `<path d="M4 12h15"/><path d="m14 7 5 5-5 5"/>`,
  cpu: `<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5"/>`,
  sparkle: `<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m6.5 6.5 2.5 2.5M15 15l2.5 2.5M17.5 6.5 15 9M9 15l-2.5 2.5"/>`,
  eraser2: `<path d="M4 20h16"/>`,
  target: `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.8" fill="currentColor"/>`,
  bolt: `<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>`,
};

export function iconSvg(name, extraClass = '') {
  const path = PATHS[name] || PATHS.info;
  return `<span class="icon ${extraClass}" aria-hidden="true"><svg viewBox="0 0 24 24" data-icon="${name}">${path}</svg></span>`;
}

/** Replace every `[data-icon]` placeholder inside `root` with its SVG. */
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((node) => {
    const name = node.getAttribute('data-icon');
    if (!name || node.querySelector('svg')) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = PATHS[name] || PATHS.info;
    node.classList.add('icon');
    node.appendChild(svg);
  });
}

export const iconNames = Object.keys(PATHS);
