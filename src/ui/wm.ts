import { clamp, h, onDrag } from './util';

export type WinKind = 'browser' | 'finder' | 'settings' | 'about';

export interface WinInit {
  kind: WinKind;
  /** 메뉴 막대에 굵게 표시되는 앱 이름 */
  appName: string;
  title: string;
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  resizable?: boolean;
  className?: string;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

let zTop = 10;
let seq = 0;
const listeners = new Set<() => void>();
const notify = () => {
  for (const fn of listeners) fn();
};

/** 바탕화면 위에 떠 있는 창 하나 (신호등 버튼, 드래그, 크기 조절 포함) */
export class Win {
  readonly id = ++seq;
  readonly kind: WinKind;
  readonly appName: string;
  readonly el: HTMLElement;
  readonly toolbar: HTMLElement;
  readonly body: HTMLElement;
  title: string;
  minimized = false;
  zoomed = false;
  closed = false;
  /** 닫히기 직전에 호출됩니다 */
  onClose?: () => void;
  private rect: Rect;
  private readonly minWidth: number;
  private readonly minHeight: number;

  constructor(init: WinInit) {
    this.kind = init.kind;
    this.appName = init.appName;
    this.title = init.title;
    this.minWidth = init.minWidth ?? 360;
    this.minHeight = init.minHeight ?? 220;

    const area = wm.layer.getBoundingClientRect();
    const width = Math.min(init.width, area.width - 24);
    const height = Math.min(init.height, area.height - wm.dockHeight() - 16);
    const offset = (wm.wins.length % 6) * 28;
    this.rect = {
      width,
      height,
      left: Math.round(Math.max(12, (area.width - width) / 2 + offset - 56)),
      top: Math.round(
        Math.max(8, (area.height - wm.dockHeight() - height) / 2 + offset - 40),
      ),
    };

    const light = (
      name: string,
      label: string,
      glyph: string,
      action: () => void,
    ) =>
      h(
        'button',
        {
          class: `light light-${name}`,
          'aria-label': label,
          title: label,
          onclick: (e: Event) => {
            e.stopPropagation();
            action();
          },
        },
        h('span', null, glyph),
      );

    this.toolbar = h(
      'div',
      { class: 'win-toolbar' },
      h(
        'div',
        { class: 'lights' },
        light('close', '닫기', '×', () => this.close()),
        light('min', '최소화', '−', () => this.minimize()),
        light('zoom', '확대/축소', '+', () => this.toggleZoom()),
      ),
    );
    this.body = h('div', { class: 'win-body' });
    this.el = h(
      'section',
      {
        class: `win win-${init.kind} ${init.className ?? ''}`,
        'aria-label': init.title,
      },
      this.toolbar,
      this.body,
    );

    if (init.resizable !== false) {
      for (const dir of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
        const handle = h('div', { class: `rz rz-${dir}` });
        this.el.append(handle);
        this.setupResize(handle, dir);
      }
    } else {
      this.el.classList.add('fixed-size');
    }

    this.el.addEventListener('pointerdown', () => wm.focus(this), true);
    this.el.addEventListener('focusin', () => wm.focus(this));
    this.toolbar.addEventListener('dblclick', (e) => {
      if (
        !(e.target as HTMLElement).closest(
          'button, input, select, [data-nodrag]',
        )
      ) {
        this.toggleZoom();
      }
    });
    this.setupMove();
    this.apply();
  }

  private apply() {
    const { left, top, width, height } = this.rect;
    Object.assign(this.el.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
    });
  }

  private setupMove() {
    onDrag(this.toolbar, {
      start: (e) => {
        if (
          (e.target as HTMLElement).closest(
            'button, input, select, [data-nodrag]',
          )
        )
          return false;
        return { ...this.rect };
      },
      move: (e, dx, dy, origin) => {
        if (this.zoomed) {
          // 확대된 창을 끌면 원래 크기로 돌아가면서 포인터 아래에 붙습니다
          const area = wm.layer.getBoundingClientRect();
          this.zoomed = false;
          this.el.classList.remove('zoomed');
          origin.left = e.clientX - area.left - dx - this.rect.width / 2;
          origin.top = 0;
        }
        const area = wm.layer.getBoundingClientRect();
        this.rect.left = clamp(
          origin.left + dx,
          80 - this.rect.width,
          area.width - 80,
        );
        this.rect.top = clamp(origin.top + dy, 0, area.height - 40);
        this.apply();
      },
    });
  }

  private setupResize(handle: HTMLElement, dir: string) {
    onDrag(handle, {
      threshold: 0,
      start: () => (this.zoomed ? false : { ...this.rect }),
      move: (_e, dx, dy, origin) => {
        const area = wm.layer.getBoundingClientRect();
        const r = { ...origin };
        if (dir.includes('e'))
          r.width = Math.max(this.minWidth, origin.width + dx);
        if (dir.includes('s'))
          r.height = Math.max(this.minHeight, origin.height + dy);
        if (dir.includes('w')) {
          r.width = Math.max(this.minWidth, origin.width - dx);
          r.left = origin.left + origin.width - r.width;
        }
        if (dir.includes('n')) {
          const top = clamp(
            origin.top + dy,
            0,
            origin.top + origin.height - this.minHeight,
          );
          r.height = origin.height + (origin.top - top);
          r.top = top;
        }
        r.height = Math.min(r.height, area.height - r.top);
        this.rect = r;
        this.apply();
      },
    });
  }

  setTitle(title: string) {
    if (this.title === title) return;
    this.title = title;
    this.el.setAttribute('aria-label', title);
    notify();
  }

  focus() {
    wm.focus(this);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.onClose?.();
    this.el.classList.add('closing');
    window.setTimeout(() => this.el.remove(), 140);
    wm.remove(this);
  }

  minimize() {
    if (this.minimized) return;
    this.minimized = true;
    this.el.classList.add('minimized');
    wm.focusTop();
    notify();
  }

  restore() {
    this.minimized = false;
    this.el.classList.remove('minimized');
    wm.focus(this);
  }

  toggleZoom() {
    if (this.el.classList.contains('fixed-size')) return;
    this.zoomed = !this.zoomed;
    this.el.classList.toggle('zoomed', this.zoomed);
    notify();
  }

  /** 앱 창 크기가 줄어도 창이 화면 밖으로 사라지지 않게 합니다 */
  keepVisible() {
    const area = wm.layer.getBoundingClientRect();
    this.rect.left = clamp(
      this.rect.left,
      80 - this.rect.width,
      area.width - 80,
    );
    this.rect.top = clamp(this.rect.top, 0, area.height - 40);
    this.apply();
  }
}

export const wm = {
  wins: [] as Win[],
  active: null as Win | null,
  layer: null as unknown as HTMLElement,

  init(layer: HTMLElement) {
    this.layer = layer;
    window.addEventListener('resize', () => {
      for (const win of this.wins) win.keepVisible();
    });
  },

  dockHeight() {
    return (
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--dock-h'),
      ) || 84
    );
  },

  open(init: WinInit): Win {
    const win = new Win(init);
    this.wins.push(win);
    this.layer.append(win.el);
    this.focus(win);
    return win;
  },

  focus(win: Win | null) {
    if (win && (win.closed || win.minimized)) return;
    if (this.active === win) return;
    this.active?.el.classList.remove('active');
    this.active = win;
    if (win) {
      win.el.style.zIndex = String(++zTop);
      win.el.classList.add('active');
    }
    notify();
  },

  /** 화면에 보이는 창 가운데 가장 위에 있는 창으로 포커스를 옮깁니다 */
  focusTop() {
    this.active?.el.classList.remove('active');
    this.active = null;
    const top = this.ordered().find((w) => !w.minimized);
    if (top) this.focus(top);
    else notify();
  },

  blur() {
    if (!this.active) return;
    this.active.el.classList.remove('active');
    this.active = null;
    notify();
  },

  remove(win: Win) {
    this.wins = this.wins.filter((w) => w !== win);
    if (this.active === win) this.focusTop();
    else notify();
  },

  /** 위에 있는 창부터 */
  ordered(): Win[] {
    return [...this.wins].sort(
      (a, b) => Number(b.el.style.zIndex || 0) - Number(a.el.style.zIndex || 0),
    );
  },

  topOfKind(kind: WinKind): Win | undefined {
    return this.ordered().find((w) => w.kind === kind);
  },

  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
