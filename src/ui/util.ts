import { createElement as lucide, type IconNode } from 'lucide';
import type { SearchEngine } from '../shared/types';

type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> | null;

/** 아주 작은 DOM 생성 도우미: h('div', { class: 'a', onclick }, 자식...) */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2), value as EventListener);
      } else if (key === 'value' || key === 'checked' || key === 'disabled') {
        (el as unknown as Record<string, unknown>)[key] = value;
      } else {
        el.setAttribute(key, value === true ? '' : String(value));
      }
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

export function icon(node: IconNode, size = 16, strokeWidth = 1.8): SVGElement {
  const el = lucide(node);
  el.setAttribute('width', String(size));
  el.setAttribute('height', String(size));
  el.setAttribute('stroke-width', String(strokeWidth));
  el.setAttribute('aria-hidden', 'true');
  return el;
}

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

const SEARCH_URL: Record<SearchEngine, string> = {
  google: 'https://www.google.com/search?q=',
  naver: 'https://search.naver.com/search.naver?query=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  bing: 'https://www.bing.com/search?q=',
};

export const SEARCH_NAME: Record<SearchEngine, string> = {
  google: 'Google',
  naver: '네이버',
  duckduckgo: 'DuckDuckGo',
  bing: 'Bing',
};

export const searchUrl = (text: string, engine: SearchEngine) =>
  SEARCH_URL[engine] + encodeURIComponent(text.trim());

/** 주소창 입력을 실제 주소로 바꿉니다. 주소처럼 보이지 않으면 검색어로 처리합니다. */
export function toUrl(text: string, engine: SearchEngine): string {
  const t = text.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  if (!/\s/.test(t)) {
    if (/^(localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?(\/.*)?$/i.test(t))
      return `http://${t}`;
    if (/^[^\s/:@]+(\.[^\s/:@.]+)*\.[a-z¡-￿]{2,}(:\d+)?([/?#].*)?$/i.test(t)) {
      return `https://${t}`;
    }
  }
  return SEARCH_URL[engine] + encodeURIComponent(t);
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

const TILE_COLORS = [
  '#ff6b6b',
  '#ff9f43',
  '#f7b731',
  '#26de81',
  '#2bcbba',
  '#45aaf2',
  '#4b7bec',
  '#a55eea',
  '#fd79a8',
  '#778ca3',
];

/** 사이트 아이콘. 저장된 파비콘이 없거나 불러오지 못하면 글자 타일을 보여줍니다. */
export function siteIcon(
  label: string,
  url: string,
  iconUrl?: string,
  size = 16,
): HTMLElement {
  const host = hostOf(url) || label;
  let hash = 0;
  for (const ch of host) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const letter = (label.trim() || host || '?').charAt(0).toUpperCase();
  const el = h(
    'span',
    {
      class: 'site-icon',
      style: `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.55)}px;background:${TILE_COLORS[hash % TILE_COLORS.length]}`,
    },
    letter,
  );
  if (iconUrl && /^(https?:|data:image\/)/i.test(iconUrl)) {
    const img = h('img', { src: iconUrl, alt: '', draggable: 'false' });
    img.addEventListener('load', () => el.classList.add('has-img'));
    img.addEventListener('error', () => img.remove());
    el.append(img);
  }
  return el;
}

// ───────────────────────── 드래그 ─────────────────────────

interface DragHandlers<T> {
  /** false를 돌려주면 드래그를 시작하지 않습니다 */
  start(e: PointerEvent): T | false;
  move(e: PointerEvent, dx: number, dy: number, ctx: T): void;
  end?(e: PointerEvent, ctx: T, moved: boolean): void;
  threshold?: number;
}

/** 포인터 드래그 공통 처리. 웹페이지 위를 지나가도 끊기지 않게 body에 dragging 클래스를 답니다. */
export function onDrag<T>(el: HTMLElement, handlers: DragHandlers<T>) {
  el.addEventListener('pointerdown', (down) => {
    if (down.button !== 0) return;
    const ctx = handlers.start(down);
    if (ctx === false) return;
    const threshold = handlers.threshold ?? 3;
    let moved = false;
    const move = (e: PointerEvent) => {
      const dx = e.clientX - down.clientX;
      const dy = e.clientY - down.clientY;
      if (!moved && Math.hypot(dx, dy) < threshold) return;
      if (!moved) {
        moved = true;
        document.body.classList.add('dragging');
      }
      handlers.move(e, dx, dy, ctx);
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      document.body.classList.remove('dragging');
      handlers.end?.(e, ctx, moved);
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  });
}

// ───────────────────────── 메뉴 / 팝오버 ─────────────────────────

export interface MenuItem {
  label?: string;
  action?: () => void;
  separator?: boolean;
  disabled?: boolean;
  checked?: boolean;
  header?: boolean;
  shortcut?: string;
  icon?: HTMLElement | SVGElement;
}

let closeCurrent: (() => void) | null = null;

export function closeOverlays() {
  closeCurrent?.();
}

function openOverlay(content: HTMLElement, onClose?: () => void) {
  closeOverlays();
  // 웹페이지에 키보드 포커스가 있으면 Esc나 Enter가 메뉴가 아니라 페이지로 가므로 포커스를 가져옵니다
  const focused = document.activeElement as HTMLElement | null;
  if (focused?.tagName === 'WEBVIEW') focused.blur();
  const backdrop = h('div', { class: 'overlay-backdrop' });
  const close = () => {
    if (closeCurrent !== close) return;
    closeCurrent = null;
    backdrop.remove();
    content.remove();
    window.removeEventListener('keydown', onKey, true);
    onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  backdrop.addEventListener('pointerdown', close);
  backdrop.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    close();
  });
  window.addEventListener('keydown', onKey, true);
  document.body.append(backdrop, content);
  content.tabIndex = -1;
  content.focus({ preventScroll: true });
  closeCurrent = close;
  return close;
}

function place(el: HTMLElement, x: number, y: number, alignRight = false) {
  const rect = el.getBoundingClientRect();
  let left = alignRight ? x - rect.width : x;
  let top = y;
  left = clamp(left, 6, window.innerWidth - rect.width - 6);
  if (top + rect.height > window.innerHeight - 6)
    top = Math.max(6, window.innerHeight - rect.height - 6);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

export function showMenu(
  items: MenuItem[],
  x: number,
  y: number,
  opts: { onClose?: () => void; className?: string } = {},
) {
  const menu = h('div', {
    class: `menu ${opts.className ?? ''}`,
    role: 'menu',
  });
  const close = openOverlay(menu, opts.onClose);
  for (const item of items) {
    if (item.separator) {
      menu.append(h('div', { class: 'menu-sep' }));
      continue;
    }
    if (item.header) {
      menu.append(h('div', { class: 'menu-header' }, item.label));
      continue;
    }
    const row = h(
      'button',
      { class: 'menu-item', role: 'menuitem', disabled: item.disabled },
      h('span', { class: 'menu-check' }, item.checked ? '✓' : ''),
      item.icon ? h('span', { class: 'menu-icon' }, item.icon) : null,
      h('span', { class: 'menu-label' }, item.label),
      item.shortcut
        ? h('span', { class: 'menu-shortcut' }, item.shortcut)
        : null,
    );
    row.addEventListener('click', () => {
      close();
      item.action?.();
    });
    menu.append(row);
  }
  place(menu, x, y);
  return close;
}

export function showPopover(
  anchor: Element,
  content: HTMLElement,
  onClose?: () => void,
) {
  const pop = h('div', { class: 'popover' }, content);
  const close = openOverlay(pop, onClose);
  const rect = anchor.getBoundingClientRect();
  place(pop, rect.right, rect.bottom + 8, true);
  return close;
}

/** 이름을 그 자리에서 고치는 입력창 */
export function inlineEdit(
  target: HTMLElement,
  value: string,
  commit: (next: string) => void,
  onDone?: () => void,
) {
  const input = h('input', {
    class: 'inline-edit',
    value,
    spellcheck: 'false',
  });
  let done = false;
  const finish = (save: boolean) => {
    if (done) return;
    done = true;
    const next = input.value.trim();
    input.replaceWith(target);
    if (save && next && next !== value) commit(next);
    onDone?.();
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
  input.addEventListener('pointerdown', (e) => e.stopPropagation());
  input.addEventListener('dblclick', (e) => e.stopPropagation());
  target.replaceWith(input);
  input.focus();
  input.select();
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)}KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)}MB`;
  return `${(n / 1024 ** 3).toFixed(2)}GB`;
}

/** 직접 그린 파란 폴더 아이콘 */
export function folderIcon(size = 64): HTMLElement {
  const el = h('span', {
    class: 'folder-icon',
    style: `width:${size}px;height:${Math.round(size * 0.82)}px`,
  });
  el.innerHTML = `<svg viewBox="0 0 64 52" width="100%" height="100%" aria-hidden="true">
    <defs>
      <linearGradient id="folder-body" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#6cc8ff"/><stop offset="1" stop-color="#1d8fe9"/>
      </linearGradient>
      <linearGradient id="folder-tab" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#45b0f7"/><stop offset="1" stop-color="#1f86dc"/>
      </linearGradient>
    </defs>
    <path d="M3 9a5 5 0 0 1 5-5h15.2a5 5 0 0 1 3.6 1.5l3 3.1H56a5 5 0 0 1 5 5V20H3z" fill="url(#folder-tab)"/>
    <rect x="3" y="13.5" width="58" height="35.5" rx="5.5" fill="url(#folder-body)"/>
    <rect x="3.6" y="14" width="56.8" height="1.4" rx=".7" fill="#fff" opacity=".45"/>
  </svg>`;
  return el;
}

/** macOS 경고창 모양의 확인 상자 */
export function confirmBox(
  title: string,
  detail: string,
  okLabel = '삭제',
): Promise<boolean> {
  return new Promise((resolve) => {
    const finish = (value: boolean) => {
      window.removeEventListener('keydown', onKey, true);
      scrim.remove();
      resolve(value);
    };
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') finish(false);
      if (e.key === 'Enter') finish(true);
    };
    const ok = h(
      'button',
      { class: 'btn btn-danger', onclick: () => finish(true) },
      okLabel,
    );
    const scrim = h(
      'div',
      { class: 'alert-scrim' },
      h(
        'div',
        { class: 'alert', role: 'alertdialog', 'aria-label': title },
        folderIcon(52),
        h('h2', null, title),
        h('p', null, detail),
        h(
          'div',
          { class: 'alert-actions' },
          h('button', { class: 'btn', onclick: () => finish(false) }, '취소'),
          ok,
        ),
      ),
    );
    window.addEventListener('keydown', onKey, true);
    document.body.append(scrim);
    ok.focus();
  });
}
