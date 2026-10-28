export type Child = Node | string | number | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'className') {
      node.className = String(value);
    } else if (key === 'text') {
      node.textContent = String(value);
    } else if (key === 'html') {
      node.innerHTML = String(value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (
      key === 'disabled' ||
      key === 'checked' ||
      key === 'selected' ||
      key === 'autofocus'
    ) {
      (node as unknown as Record<string, boolean>)[key] = Boolean(value);
      if (value) node.setAttribute(key, '');
    } else if (key === 'value') {
      (node as unknown as HTMLInputElement).value = String(value);
    } else {
      node.setAttribute(key, String(value));
    }
  }
  appendChildren(node, children);
  return node;
}

export function appendChildren(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (typeof child === 'string' || typeof child === 'number') {
      parent.appendChild(document.createTextNode(String(child)));
    } else {
      parent.appendChild(child);
    }
  }
}

export function clear(node: Node): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function svgIcon(name: string, size = 18): SVGSVGElement {
  const paths: Record<string, string> = {
    undo: '<path d="M9 7H5V3M5.2 7.2A7.5 7.5 0 1 1 4.5 14" />',
    redo: '<path d="M15 7h4V3M18.8 7.2A7.5 7.5 0 1 0 19.5 14" />',
    reset: '<path d="M4 4v6h6M4.6 10A7.5 7.5 0 1 0 6 5.3" />',
    help: '<circle cx="12" cy="12" r="9" /><path d="M9.6 9a2.5 2.5 0 1 1 3.6 2.3c-.8.5-1.2 1-1.2 1.9M12 17.2v.1" />',
    eye: '<path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.6" />',
    label: '<path d="M4 5h10l6 7-6 7H4Z" /><path d="M8 12h6" />',
    lonePair:
      '<circle cx="8" cy="12" r="2.2" /><circle cx="16" cy="12" r="2.2" /><path d="M10.2 12h3.6" />',
    dipole: '<path d="M4 16 18 8M18 8l-4.2.2M18 8l-.4 4.1" />',
    implicitH:
      '<circle cx="12" cy="12" r="8.5" stroke-dasharray="3 3" /><path d="M9.5 8.5v7M14.5 8.5v7M9.5 12h5" />',
    rotate: '<path d="M20 12a8 8 0 1 1-2.3-5.6M20 3.5V8h-4.5" />',
    camera: '<path d="M4 8h3l1.4-2h7.2L17 8h3v10H4Z" /><circle cx="12" cy="13" r="3" />',
    trash: '<path d="M4 7h16M9 7V4.5h6V7M7 7l1 13h8l1-13M10 11v5M14 11v5" />',
    bond: '<circle cx="6" cy="17" r="2.4" /><circle cx="18" cy="7" r="2.4" /><path d="M8 15.2 16 8.8" />',
    select: '<path d="M5 3l14 8-6.3 1.8L9.4 19Z" />',
    atom: '<circle cx="12" cy="12" r="3" /><ellipse cx="12" cy="12" rx="9" ry="4.2" transform="rotate(-35 12 12)" />',
    check: '<path d="m4 12.5 5 5L20 6.5" />',
    close: '<path d="m6 6 12 12M18 6 6 18" />',
    arrowRight: '<path d="M4 12h15M13 5l7 7-7 7" />',
    print: '<path d="M7 8V4h10v4M7 17H4V9h16v8h-3M7 14h10v6H7Z" />',
    cup: '<path d="M8 21h8M9 21v-4M15 21v-4M7 3h10v6a5 5 0 0 1-10 0Z" />',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5Z" /><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" />',
    alert: '<path d="M12 3 2.8 20h18.4Z" /><path d="M12 9v5M12 17.4v.1" />',
    info: '<circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.4v.1" />',
    spark: '<path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6Z" />'
  };
  const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  wrapper.setAttribute('viewBox', '0 0 24 24');
  wrapper.setAttribute('width', String(size));
  wrapper.setAttribute('height', String(size));
  wrapper.setAttribute('fill', 'none');
  wrapper.setAttribute('stroke', 'currentColor');
  wrapper.setAttribute('stroke-width', '1.7');
  wrapper.setAttribute('stroke-linecap', 'round');
  wrapper.setAttribute('stroke-linejoin', 'round');
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.innerHTML = paths[name] ?? '';
  return wrapper;
}

export function iconButton(
  name: string,
  label: string,
  onClick: () => void,
  extra: Record<string, string | number | boolean | null | undefined> = {}
): HTMLButtonElement {
  const button = el(
    'button',
    {
      type: 'button',
      className: 'icon-btn',
      'aria-label': label,
      title: label,
      ...extra
    },
    svgIcon(name)
  );
  button.addEventListener('click', onClick);
  return button;
}

export function formatFormulaHtml(formula: string): string {
  return formula.replace(/(\d+)/g, '<sub>$1</sub>');
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function levelIcon(level: 'error' | 'warning' | 'info'): SVGSVGElement {
  return svgIcon(level === 'info' ? 'info' : 'alert', 16);
}
