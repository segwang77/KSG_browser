import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  EyeOff,
  Globe,
  Lock,
  Plus,
  RotateCw,
  Search,
  Star,
  TriangleAlert,
  X,
} from 'lucide';
import { store } from './store';
import {
  closeOverlays,
  formatBytes,
  h,
  hostOf,
  icon,
  searchUrl,
  showMenu,
  showPopover,
  siteIcon,
  toUrl,
  uid,
  type MenuItem,
} from './util';
import { wm, type Win } from './wm';
import type { DownloadInfo } from '../shared/types';

interface Tab {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  loading: boolean;
  ready: boolean;
  canBack: boolean;
  canForward: boolean;
  zoom: number;
  view: HTMLElement;
  button: HTMLElement;
  webview?: Electron.WebviewTag;
  error?: { code: number; description: string; url: string };
}

const NEW_TAB_TITLE = '시작 페이지';

export const browsers = new Set<BrowserWin>();
const downloads: DownloadInfo[] = [];
let downloadsChanged: (() => void) | null = null;

export function trackDownload(info: DownloadInfo) {
  const index = downloads.findIndex((d) => d.id === info.id);
  if (index >= 0) downloads[index] = info;
  else downloads.unshift(info);
  for (const b of browsers) b.flashDownloads(index < 0);
  downloadsChanged?.();
}

/** 브라우저 창 하나: 통합 툴바 + 탭 + 탭마다 하나씩의 웹뷰 */
export class BrowserWin {
  readonly win: Win;
  readonly isPrivate: boolean;
  tabs: Tab[] = [];
  active!: Tab;
  private closedUrls: string[] = [];
  private readonly partition?: string;
  private addressFocused = false;

  private readonly backBtn = this.toolButton(ChevronLeft, '뒤로 (Alt+←)', () =>
    this.back(),
  );
  private readonly fwdBtn = this.toolButton(
    ChevronRight,
    '앞으로 (Alt+→)',
    () => this.forward(),
  );
  private readonly addressIcon = h('span', { class: 'addr-icon' });
  private readonly address = h('input', {
    class: 'addr-input',
    placeholder: '검색 또는 웹 사이트 이름 입력',
    spellcheck: 'false',
    autocomplete: 'off',
    'aria-label': '주소',
  });
  private readonly reloadBtn = h('button', {
    class: 'addr-btn',
    title: '새로고침 (Ctrl+R)',
  });
  private readonly progress = h('div', { class: 'addr-progress' });
  private readonly suggestions = h('div', {
    class: 'addr-suggest',
    hidden: true,
  });
  private readonly starBtn = this.toolButton(
    Star,
    '책갈피에 추가 (Ctrl+D)',
    () => this.bookmark(),
  );
  private readonly dlBtn = this.toolButton(Download, '다운로드', () =>
    this.showDownloads(),
  );
  private readonly tabBar = h('div', { class: 'bw-tabs', 'data-nodrag': true });
  private readonly views = h('div', { class: 'bw-views' });
  private readonly findBar = h('div', { class: 'bw-find', hidden: true });
  private readonly findInput = h('input', {
    class: 'field',
    placeholder: '페이지에서 찾기',
    spellcheck: 'false',
  });
  private readonly findCount = h('span', { class: 'bw-find-count' });
  private readonly unsubscribe: () => void;

  constructor(opts: { url?: string; isPrivate?: boolean } = {}) {
    this.isPrivate = !!opts.isPrivate;
    // persist: 접두사가 없는 파티션은 메모리에만 저장되어 창을 닫으면 쿠키와 캐시가 사라집니다
    this.partition = this.isPrivate ? `private-${uid()}` : undefined;
    this.win = wm.open({
      kind: 'browser',
      appName: 'KSG',
      title: NEW_TAB_TITLE,
      width: 1120,
      height: 720,
      minWidth: 560,
      minHeight: 360,
      className: this.isPrivate ? 'private' : '',
    });

    const addressBox = h(
      'div',
      { class: 'addr', 'data-nodrag': true },
      this.addressIcon,
      this.address,
      this.reloadBtn,
      this.progress,
      this.suggestions,
    );
    this.win.toolbar.append(
      h('div', { class: 'tb-group' }, this.backBtn, this.fwdBtn),
      this.isPrivate
        ? h('span', { class: 'private-badge' }, icon(EyeOff, 13), '프라이빗')
        : '',
      h('div', { class: 'tb-spacer' }),
      addressBox,
      h('div', { class: 'tb-spacer' }),
      h(
        'div',
        { class: 'tb-group' },
        this.starBtn,
        this.dlBtn,
        this.toolButton(Plus, '새 탭 (Ctrl+T)', () => this.newTab()),
      ),
    );
    this.win.body.before(this.tabBar);
    this.win.body.append(
      this.findBar,
      this.views,
      h('div', { class: 'win-shield' }),
    );
    this.win.body.classList.add('bw-body');
    this.buildFindBar();
    this.wireAddress();

    this.reloadBtn.addEventListener('click', () =>
      this.active.loading ? this.stop() : this.reload(),
    );
    this.unsubscribe = store.subscribe(() => this.onStoreChange());
    this.win.onClose = () => {
      this.unsubscribe();
      browsers.delete(this);
    };
    browsers.add(this);
    this.newTab(opts.url);
  }

  private toolButton(
    glyph: Parameters<typeof icon>[0],
    title: string,
    action: () => void,
  ) {
    return h(
      'button',
      { class: 'tb-btn', title, 'aria-label': title, onclick: action },
      icon(glyph, 18),
    );
  }

  // ─────────── 탭 ───────────

  newTab(url?: string, opts: { background?: boolean; after?: Tab } = {}): Tab {
    const tab: Tab = {
      id: uid(),
      url: '',
      title: NEW_TAB_TITLE,
      loading: false,
      ready: false,
      canBack: false,
      canForward: false,
      zoom: 0,
      view: h('div', { class: 'bw-view' }),
      button: h('div', { class: 'bw-tab', role: 'tab' }),
    };
    tab.button.addEventListener('pointerdown', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        this.closeTab(tab);
      } else if (
        e.button === 0 &&
        !(e.target as HTMLElement).closest('.bw-tab-close')
      ) {
        this.select(tab);
      }
    });
    tab.button.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showMenu(
        [
          {
            label: '새 탭',
            action: () => this.newTab(undefined, { after: tab }),
          },
          {
            label: '탭 복제',
            disabled: !tab.url,
            action: () => this.newTab(tab.url, { after: tab }),
          },
          { separator: true },
          { label: '탭 닫기', action: () => this.closeTab(tab) },
          {
            label: '다른 탭 닫기',
            disabled: this.tabs.length < 2,
            action: () =>
              this.tabs
                .filter((t) => t !== tab)
                .forEach((t) => this.closeTab(t)),
          },
        ],
        e.clientX,
        e.clientY,
      );
    });

    const index = opts.after
      ? this.tabs.indexOf(opts.after) + 1
      : this.tabs.length;
    this.tabs.splice(index, 0, tab);
    this.views.append(tab.view);
    this.renderStartPage(tab);
    this.renderTabBar();
    if (!opts.background || !this.active) this.select(tab);
    if (url) this.load(tab, url);
    else if (tab === this.active) this.focusAddress();
    return tab;
  }

  closeTab(tab: Tab) {
    const index = this.tabs.indexOf(tab);
    if (index < 0) return;
    if (tab.url) this.closedUrls.push(tab.url);
    this.tabs.splice(index, 1);
    tab.view.remove();
    if (this.tabs.length === 0) {
      this.win.close();
      return;
    }
    if (this.active === tab)
      this.select(this.tabs[Math.min(index, this.tabs.length - 1)]);
    this.renderTabBar();
  }

  reopenTab() {
    const url = this.closedUrls.pop();
    if (url) this.newTab(url);
  }

  select(tab: Tab) {
    this.active = tab;
    for (const t of this.tabs) t.view.classList.toggle('on', t === tab);
    this.hideFind();
    this.renderTabBar();
    this.renderChrome();
  }

  cycle(direction: 1 | -1) {
    const index = this.tabs.indexOf(this.active);
    this.select(
      this.tabs[(index + direction + this.tabs.length) % this.tabs.length],
    );
  }

  tabByGuestId(id: number): Tab | undefined {
    return this.tabs.find((t) => {
      try {
        return t.ready && t.webview?.getWebContentsId() === id;
      } catch {
        return false;
      }
    });
  }

  // ─────────── 이동 ───────────

  /** 주소창 입력(주소 또는 검색어)으로 이동 */
  navigate(input: string) {
    const url = toUrl(input, store.state.settings.searchEngine);
    if (url) this.load(this.active, url);
  }

  private load(tab: Tab, url: string) {
    if (!/^https?:\/\//i.test(url)) return;
    tab.url = url;
    tab.error = undefined;
    if (tab.title === NEW_TAB_TITLE) tab.title = hostOf(url) || url;
    if (!tab.webview) {
      this.createWebview(tab, url);
    } else if (tab.ready) {
      tab.webview.loadURL(url).catch(() => {});
    } else {
      tab.webview.src = url;
    }
    this.renderView(tab);
    this.renderTab(tab);
    if (tab === this.active) this.renderChrome();
  }

  private createWebview(tab: Tab, url: string) {
    const webview = document.createElement('webview');
    tab.webview = webview;
    if (this.partition) webview.partition = this.partition;
    webview.setAttribute('allowpopups', '');
    webview.src = url;

    const update = () => {
      if (!tab.ready) return;
      try {
        tab.canBack = webview.canGoBack();
        tab.canForward = webview.canGoForward();
      } catch {
        // 웹뷰가 이미 제거된 경우
      }
      this.renderTab(tab);
      if (tab === this.active) this.renderChrome();
    };

    webview.addEventListener('dom-ready', () => {
      tab.ready = true;
      if (tab.zoom) webview.setZoomLevel(tab.zoom);
      update();
    });
    webview.addEventListener('did-start-loading', () => {
      tab.loading = true;
      update();
    });
    webview.addEventListener('did-stop-loading', () => {
      tab.loading = false;
      update();
    });
    webview.addEventListener('did-navigate', (e) => {
      tab.url = e.url;
      tab.error = undefined;
      tab.favicon = undefined;
      this.renderView(tab);
      if (!this.isPrivate) store.addHistory(e.url, '');
      update();
    });
    webview.addEventListener('did-navigate-in-page', (e) => {
      if (!e.isMainFrame) return;
      tab.url = e.url;
      update();
    });
    webview.addEventListener('page-title-updated', (e) => {
      tab.title = e.title;
      if (!this.isPrivate) store.updateHistoryTitle(tab.url, e.title);
      update();
    });
    webview.addEventListener('page-favicon-updated', (e) => {
      tab.favicon = e.favicons[0];
      if (!this.isPrivate && tab.favicon) store.setIcon(tab.url, tab.favicon);
      update();
    });
    webview.addEventListener('did-fail-load', (e) => {
      // -3은 사용자가 이동을 취소한 경우라 오류로 보지 않습니다
      if (!e.isMainFrame || e.errorCode === -3) return;
      tab.error = {
        code: e.errorCode,
        description: e.errorDescription,
        url: e.validatedURL,
      };
      tab.loading = false;
      this.renderView(tab);
      update();
    });
    webview.addEventListener('found-in-page', (e) => {
      if (tab !== this.active) return;
      const { matches, activeMatchOrdinal } = e.result;
      this.findCount.textContent = matches
        ? `${activeMatchOrdinal}/${matches}`
        : '결과 없음';
    });
    webview.addEventListener('enter-html-full-screen', () =>
      this.win.el.classList.add('html-fs'),
    );
    webview.addEventListener('leave-html-full-screen', () =>
      this.win.el.classList.remove('html-fs'),
    );
    webview.addEventListener('context-menu', (e) =>
      this.pageMenu(tab, e.params),
    );
    webview.addEventListener('focus', () => closeOverlays());
    tab.view.append(webview);
  }

  back() {
    if (this.active.ready && this.active.canBack) this.active.webview?.goBack();
  }

  forward() {
    if (this.active.ready && this.active.canForward)
      this.active.webview?.goForward();
  }

  reload() {
    const tab = this.active;
    if (tab.error) this.load(tab, tab.error.url || tab.url);
    else if (tab.ready) tab.webview?.reload();
  }

  stop() {
    if (this.active.ready) this.active.webview?.stop();
  }

  zoom(delta: number | null) {
    const tab = this.active;
    tab.zoom = delta === null ? 0 : Math.min(4, Math.max(-3, tab.zoom + delta));
    if (tab.ready) tab.webview?.setZoomLevel(tab.zoom);
  }

  // ─────────── 화면 갱신 ───────────

  private onStoreChange() {
    for (const tab of this.tabs) if (!tab.webview) this.renderStartPage(tab);
    this.renderChrome();
  }

  private renderTabBar() {
    this.tabBar.replaceChildren(...this.tabs.map((t) => t.button));
    this.win.el.classList.toggle('multi-tab', this.tabs.length > 1);
    for (const tab of this.tabs) this.renderTab(tab);
  }

  private renderTab(tab: Tab) {
    tab.button.classList.toggle('on', tab === this.active);
    tab.button.title = tab.title;
    tab.button.replaceChildren(
      h(
        'button',
        {
          class: 'bw-tab-close',
          title: '탭 닫기 (Ctrl+W)',
          onclick: () => this.closeTab(tab),
        },
        icon(X, 12, 2.2),
      ),
      tab.loading
        ? h('span', { class: 'spinner' })
        : tab.url
          ? siteIcon(tab.title, tab.url, tab.favicon, 14)
          : icon(Globe, 14),
      h('span', { class: 'bw-tab-title' }, tab.title),
    );
  }

  private renderChrome() {
    const tab = this.active;
    if (!tab) return;
    this.backBtn.disabled = !tab.canBack;
    this.fwdBtn.disabled = !tab.canForward;
    this.win.setTitle(tab.title);

    if (!this.addressFocused)
      this.address.value = tab.url ? hostOf(tab.url) || tab.url : '';
    const secure = tab.url.startsWith('https://');
    this.addressIcon.replaceChildren(
      !tab.url
        ? icon(Search, 13)
        : secure
          ? icon(Lock, 12, 2.2)
          : icon(TriangleAlert, 13),
    );
    this.addressIcon.title = !tab.url
      ? ''
      : secure
        ? '보안 연결 (HTTPS)'
        : '안전하지 않은 연결 (HTTP)';
    this.addressIcon.classList.toggle('warn', !!tab.url && !secure);

    this.reloadBtn.replaceChildren(
      tab.loading ? icon(X, 14, 2.2) : icon(RotateCw, 13, 2.2),
    );
    this.reloadBtn.title = tab.loading ? '중지' : '새로고침 (Ctrl+R)';
    this.reloadBtn.hidden = !tab.url;
    this.progress.classList.toggle('loading', tab.loading);

    const saved = !!tab.url && !!store.bookmarkByUrl(tab.url);
    this.starBtn.classList.toggle('on', saved);
    this.starBtn.disabled = !tab.url;
    this.starBtn.title = saved
      ? '책갈피 편집 (Ctrl+D)'
      : '책갈피에 추가 (Ctrl+D)';
  }

  /** 웹뷰 / 시작 페이지 / 오류 페이지 중 무엇을 보여줄지 */
  private renderView(tab: Tab) {
    tab.view.querySelector('.start-page')?.remove();
    tab.view.querySelector('.error-page')?.remove();
    if (tab.error) {
      tab.view.append(
        h(
          'div',
          { class: 'error-page' },
          icon(TriangleAlert, 44, 1.4),
          h('h2', null, '페이지를 열 수 없습니다'),
          h(
            'p',
            null,
            `${hostOf(tab.error.url) || tab.error.url} 에 연결하지 못했습니다.`,
          ),
          h(
            'p',
            { class: 'error-code' },
            `${tab.error.description} (${tab.error.code})`,
          ),
          h(
            'button',
            { class: 'btn btn-primary', onclick: () => this.reload() },
            '다시 시도',
          ),
        ),
      );
    }
  }

  private renderStartPage(tab: Tab) {
    tab.view.querySelector('.start-page')?.remove();
    const page = h('div', { class: 'start-page' });
    if (this.isPrivate) {
      page.append(
        h(
          'div',
          { class: 'start-private' },
          icon(EyeOff, 20),
          h(
            'div',
            null,
            h('strong', null, '프라이빗 브라우징'),
            h(
              'p',
              null,
              '이 창에서 방문한 기록은 저장되지 않고, 창을 닫으면 쿠키와 캐시가 지워집니다.',
            ),
          ),
        ),
      );
    }
    for (const folder of store.state.folders) {
      if (folder.items.length === 0) continue;
      page.append(
        h('h2', null, folder.name),
        h(
          'div',
          { class: 'start-grid' },
          ...folder.items.map((b) =>
            h(
              'button',
              {
                class: 'start-tile',
                title: b.url,
                onclick: () => this.load(tab, b.url),
              },
              siteIcon(b.title, b.url, store.iconFor(b.url), 52),
              h('span', null, b.title),
            ),
          ),
        ),
      );
    }
    const recent = this.isPrivate ? [] : store.state.history.slice(0, 6);
    if (recent.length) {
      page.append(
        h('h2', null, '최근 방문'),
        h(
          'div',
          { class: 'start-recent' },
          ...recent.map((e) =>
            h(
              'button',
              {
                class: 'start-row',
                title: e.url,
                onclick: () => this.load(tab, e.url),
              },
              siteIcon(e.title, e.url, store.iconFor(e.url), 18),
              h('span', { class: 'start-row-title' }, e.title),
              h('span', { class: 'start-row-host' }, hostOf(e.url)),
            ),
          ),
        ),
      );
    }
    tab.view.append(page);
  }

  // ─────────── 주소창 ───────────

  focusAddress() {
    this.win.focus();
    this.address.focus();
    this.address.select();
  }

  private wireAddress() {
    let highlighted = -1;
    let options: { url: string; title: string }[] = [];

    const renderSuggestions = () => {
      const q = this.address.value.trim().toLowerCase();
      options = [];
      if (q && this.addressFocused) {
        const seen = new Set<string>();
        const consider = (title: string, url: string) => {
          if (options.length >= 6 || seen.has(url)) return;
          if (
            title.toLowerCase().includes(q) ||
            url.toLowerCase().includes(q)
          ) {
            seen.add(url);
            options.push({ title, url });
          }
        };
        for (const f of store.state.folders)
          for (const b of f.items) consider(b.title, b.url);
        if (!this.isPrivate)
          for (const e of store.state.history) consider(e.title, e.url);
      }
      highlighted = Math.min(highlighted, options.length - 1);
      this.suggestions.hidden = options.length === 0;
      this.suggestions.replaceChildren(
        ...options.map((o, i) => {
          const row = h(
            'div',
            { class: `addr-option${i === highlighted ? ' on' : ''}` },
            siteIcon(o.title, o.url, store.iconFor(o.url), 16),
            h('span', { class: 'addr-option-title' }, o.title),
            h('span', { class: 'addr-option-url' }, hostOf(o.url)),
          );
          // blur보다 먼저 처리되도록 pointerdown에서 이동합니다
          row.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            this.address.blur();
            this.load(this.active, o.url);
          });
          return row;
        }),
      );
    };

    this.address.addEventListener('focus', () => {
      this.addressFocused = true;
      this.address.value = this.active.url;
      this.address.select();
    });
    this.address.addEventListener('blur', () => {
      this.addressFocused = false;
      highlighted = -1;
      this.suggestions.hidden = true;
      this.renderChrome();
    });
    this.address.addEventListener('input', () => {
      highlighted = -1;
      renderSuggestions();
    });
    this.address.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!options.length) return;
        e.preventDefault();
        highlighted =
          (highlighted +
            (e.key === 'ArrowDown' ? 1 : -1) +
            options.length +
            1) %
          (options.length + 1);
        if (highlighted === options.length) highlighted = -1;
        renderSuggestions();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const choice = options[highlighted];
        const input = this.address.value;
        this.address.blur();
        if (choice) this.load(this.active, choice.url);
        else this.navigate(input);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.address.blur();
      }
    });
  }

  // ─────────── 책갈피 / 다운로드 ───────────

  bookmark() {
    const tab = this.active;
    if (!tab.url) return;
    const existing = store.bookmarkByUrl(tab.url);
    const title = h('input', {
      class: 'field',
      value: existing?.bookmark.title ?? tab.title,
      spellcheck: 'false',
    });
    const folder = h(
      'select',
      { class: 'field' },
      ...store.state.folders.map((f) => {
        const option = h('option', { value: f.id }, f.name);
        option.selected = existing ? existing.folder.id === f.id : false;
        return option;
      }),
    );
    let close = () => {};
    const form = h(
      'form',
      { class: 'pop-form' },
      h('h3', null, existing ? '책갈피 편집' : '책갈피 추가'),
      h('label', null, '이름', title),
      h('label', null, '폴더', folder),
      h(
        'div',
        { class: 'pop-actions' },
        existing
          ? h(
              'button',
              {
                class: 'btn',
                type: 'button',
                onclick: () => {
                  store.removeBookmark(existing.bookmark.id);
                  close();
                },
              },
              '삭제',
            )
          : null,
        h(
          'button',
          { class: 'btn btn-primary', type: 'submit' },
          existing ? '저장' : '추가',
        ),
      ),
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let folderId = folder.value;
      if (!folderId) folderId = store.addFolder('즐겨찾기').id;
      if (existing) {
        store.updateBookmark(existing.bookmark.id, { title: title.value });
        store.moveBookmark(existing.bookmark.id, folderId);
      } else {
        store.addBookmark(folderId, title.value, tab.url);
      }
      close();
    });
    close = showPopover(this.starBtn, form);
    title.focus();
    title.select();
  }

  flashDownloads(isNew: boolean) {
    this.dlBtn.classList.add('has-items');
    if (isNew && this.win === wm.active) {
      this.dlBtn.classList.remove('bump');
      void this.dlBtn.offsetWidth;
      this.dlBtn.classList.add('bump');
    }
  }

  private showDownloads() {
    const list = h('div', { class: 'dl-list' });
    const render = () => {
      list.replaceChildren(
        h('h3', null, '다운로드'),
        ...(downloads.length
          ? downloads.map((d) => {
              const done = d.state === 'completed';
              const label =
                d.state === 'progressing'
                  ? `${formatBytes(d.received)}${d.total ? ` / ${formatBytes(d.total)}` : ''}`
                  : done
                    ? `${formatBytes(d.total || d.received)} · 폴더에서 보기`
                    : d.state === 'cancelled'
                      ? '취소됨'
                      : '중단됨';
              return h(
                'button',
                {
                  class: 'dl-row',
                  disabled: !done,
                  onclick: () => window.bridge?.showDownload(d.id),
                },
                h('span', { class: 'dl-name' }, d.name),
                h('span', { class: 'dl-state' }, label),
                d.state === 'progressing'
                  ? h(
                      'span',
                      { class: 'dl-bar' },
                      h('span', {
                        style: `width:${d.total ? Math.round((d.received / d.total) * 100) : 30}%`,
                      }),
                    )
                  : null,
              );
            })
          : [h('p', { class: 'dl-empty' }, '다운로드한 항목이 없습니다.')]),
      );
    };
    render();
    downloadsChanged = render;
    showPopover(this.dlBtn, list, () => {
      downloadsChanged = null;
    });
  }

  // ─────────── 페이지에서 찾기 ───────────

  private buildFindBar() {
    const step = (forward: boolean) => this.find(forward, false);
    this.findBar.append(
      this.findInput,
      this.findCount,
      h(
        'button',
        { class: 'tb-btn', title: '이전', onclick: () => step(false) },
        icon(ChevronUp, 16),
      ),
      h(
        'button',
        { class: 'tb-btn', title: '다음', onclick: () => step(true) },
        icon(ChevronDown, 16),
      ),
      h('button', { class: 'btn', onclick: () => this.hideFind() }, '완료'),
    );
    this.findInput.addEventListener('input', () => this.find(true, true));
    this.findInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.find(!e.shiftKey, false);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.hideFind();
      }
    });
  }

  showFind() {
    if (!this.active.webview) return;
    this.findBar.hidden = false;
    this.findInput.focus();
    this.findInput.select();
  }

  /** newSession: 검색어가 바뀌어 새로 찾는 경우 true, 다음/이전 결과로 이동할 때는 false */
  private find(forward: boolean, newSession: boolean) {
    const tab = this.active;
    const text = this.findInput.value;
    if (!tab.ready || !tab.webview) return;
    if (!text) {
      tab.webview.stopFindInPage('clearSelection');
      this.findCount.textContent = '';
      return;
    }
    tab.webview.findInPage(text, { forward, findNext: newSession });
  }

  private hideFind() {
    if (this.findBar.hidden) return;
    this.findBar.hidden = true;
    this.findInput.blur();
    this.findCount.textContent = '';
    for (const tab of this.tabs) {
      if (tab.ready) {
        try {
          tab.webview?.stopFindInPage('clearSelection');
        } catch {
          // 무시
        }
      }
    }
  }

  // ─────────── 웹페이지 오른쪽 클릭 메뉴 ───────────

  private pageMenu(tab: Tab, params: Electron.ContextMenuEvent['params']) {
    const webview = tab.webview;
    if (!webview) return;
    const rect = webview.getBoundingClientRect();
    const items: MenuItem[] = [];
    const link = /^https?:\/\//i.test(params.linkURL) ? params.linkURL : '';
    if (link) {
      items.push(
        {
          label: '새 탭에서 링크 열기',
          action: () => this.newTab(link, { after: tab, background: true }),
        },
        {
          label: '새 창에서 링크 열기',
          action: () =>
            new BrowserWin({ url: link, isPrivate: this.isPrivate }),
        },
        { label: '링크 복사', action: () => window.bridge?.copyText(link) },
        { separator: true },
      );
    }
    if (params.isEditable) {
      items.push(
        {
          label: '잘라내기',
          disabled: !params.editFlags.canCut,
          action: () => webview.cut(),
        },
        {
          label: '복사',
          disabled: !params.editFlags.canCopy,
          action: () => webview.copy(),
        },
        {
          label: '붙여넣기',
          disabled: !params.editFlags.canPaste,
          action: () => webview.paste(),
        },
        { separator: true },
      );
    } else if (params.selectionText.trim()) {
      const text = params.selectionText.trim();
      const short = text.length > 20 ? `${text.slice(0, 20)}…` : text;
      items.push(
        { label: '복사', action: () => webview.copy() },
        {
          label: `'${short}' 검색`,
          action: () =>
            this.newTab(searchUrl(text, store.state.settings.searchEngine), {
              after: tab,
            }),
        },
        { separator: true },
      );
    }
    items.push(
      { label: '뒤로', disabled: !tab.canBack, action: () => this.back() },
      {
        label: '앞으로',
        disabled: !tab.canForward,
        action: () => this.forward(),
      },
      { label: '새로고침', action: () => this.reload() },
      { separator: true },
      { label: '이 페이지를 책갈피에 추가…', action: () => this.bookmark() },
      {
        label: '페이지 주소 복사',
        action: () => window.bridge?.copyText(tab.url),
      },
    );
    showMenu(items, rect.left + params.x, rect.top + params.y);
  }
}

/** 가장 위에 있는 브라우저 창 */
export function topBrowser(includeMinimized = false): BrowserWin | undefined {
  const win = wm
    .ordered()
    .find((w) => w.kind === 'browser' && (includeMinimized || !w.minimized));
  return win ? browserOf(win) : undefined;
}

export function browserOf(win: Win | null): BrowserWin | undefined {
  if (!win) return undefined;
  for (const b of browsers) if (b.win === win) return b;
  return undefined;
}
