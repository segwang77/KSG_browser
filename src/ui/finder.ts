import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Folder as FolderGlyph,
  LayoutGrid,
  List,
  Plus,
  Search,
} from 'lucide';
import { actions } from './actions';
import { deleteFolder, folderMenu } from './desktop';
import { makeBookmarkDraggable } from './dnd';
import { store } from './store';
import {
  folderIcon,
  h,
  hostOf,
  icon,
  inlineEdit,
  showMenu,
  showPopover,
  siteIcon,
  toUrl,
  type MenuItem,
} from './util';
import { wm, type Win } from './wm';
import type { Bookmark } from '../shared/types';

type Location = 'root' | 'history' | string;

const timeLabel = (time: number) =>
  new Date(time).toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

/** 폴더 창: 폴더 사이를 이동하고, 폴더에 담긴 주소를 열거나 옮깁니다 */
class FinderWin {
  readonly win: Win;
  private location: Location;
  private back: Location[] = [];
  private forward: Location[] = [];
  private view: 'icon' | 'list' = 'icon';
  private query = '';
  private selected: string | null = null;
  private adding = false;
  private readonly titleEl = h('div', { class: 'fd-title' });
  private readonly backBtn = h(
    'button',
    { class: 'tb-btn', title: '뒤로', onclick: () => this.go(-1) },
    icon(ChevronLeft, 18),
  );
  private readonly fwdBtn = h(
    'button',
    { class: 'tb-btn', title: '앞으로', onclick: () => this.go(1) },
    icon(ChevronRight, 18),
  );
  private readonly iconBtn = h(
    'button',
    {
      class: 'seg-btn',
      title: '아이콘 보기',
      onclick: () => this.setView('icon'),
    },
    icon(LayoutGrid, 15),
  );
  private readonly listBtn = h(
    'button',
    {
      class: 'seg-btn',
      title: '목록 보기',
      onclick: () => this.setView('list'),
    },
    icon(List, 15),
  );
  private readonly addBtn = h(
    'button',
    { class: 'tb-btn', title: '추가', onclick: () => this.add() },
    icon(Plus, 18),
  );
  private readonly search = h('input', {
    class: 'fd-search-input',
    placeholder: '검색',
    spellcheck: 'false',
  });
  private readonly sidebar = h('nav', { class: 'fd-sidebar' });
  private readonly main = h('div', { class: 'fd-main', tabindex: '0' });
  private readonly status = h('div', { class: 'fd-status' });
  private readonly unsubscribe: () => void;

  constructor(location: Location) {
    this.location = location;
    this.win = wm.open({
      kind: 'finder',
      appName: '폴더',
      title: '폴더',
      width: 780,
      height: 480,
      minWidth: 520,
      minHeight: 300,
    });
    this.win.toolbar.append(
      h('div', { class: 'tb-group' }, this.backBtn, this.fwdBtn),
      this.titleEl,
      h('div', { class: 'tb-spacer' }),
      h('div', { class: 'seg' }, this.iconBtn, this.listBtn),
      this.addBtn,
      h('label', { class: 'fd-search' }, icon(Search, 14), this.search),
    );
    this.win.body.append(
      this.sidebar,
      h('div', { class: 'fd-content' }, this.main, this.status),
    );
    this.win.body.classList.add('fd-body');

    this.search.addEventListener('input', () => {
      this.query = this.search.value.trim().toLowerCase();
      this.renderMain();
    });
    this.main.addEventListener('pointerdown', (e) => {
      if (
        e.target === this.main ||
        (e.target as HTMLElement).classList.contains('fd-grid')
      )
        this.select(null);
    });
    this.main.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if ((e.target as HTMLElement).closest('.fd-item')) return;
      const items: MenuItem[] = [
        { label: '새로운 폴더', action: () => this.newFolder() },
      ];
      if (this.folder)
        items.unshift({ label: '새 주소 추가', action: () => this.add() });
      showMenu(items, e.clientX, e.clientY);
    });
    this.main.addEventListener('keydown', (e) => this.onKey(e));

    this.unsubscribe = store.subscribe(() => {
      // 주소를 입력하는 도중에는 입력창이 지워지지 않게 사이드바만 갱신합니다
      if (this.adding && this.main.contains(document.activeElement))
        this.renderSidebar();
      else this.render();
    });
    this.win.onClose = () => {
      this.unsubscribe();
      finders.delete(this);
    };
    this.render();
  }

  get current(): Location {
    return this.location;
  }

  private get folder() {
    return this.location === 'root' || this.location === 'history'
      ? undefined
      : store.folder(this.location);
  }

  navigate(location: Location) {
    if (location === this.location) return;
    this.back.push(this.location);
    this.forward = [];
    this.show(location);
  }

  private go(direction: -1 | 1) {
    const from = direction < 0 ? this.back : this.forward;
    const to = direction < 0 ? this.forward : this.back;
    const next = from.pop();
    if (next === undefined) return;
    to.push(this.location);
    this.show(next);
  }

  private show(location: Location) {
    this.location = location;
    this.selected = null;
    this.adding = false;
    this.render();
  }

  private setView(view: 'icon' | 'list') {
    this.view = view;
    this.render();
  }

  private select(id: string | null) {
    this.selected = id;
    for (const el of this.main.querySelectorAll<HTMLElement>('.fd-item')) {
      el.classList.toggle('selected', el.dataset.id === id);
    }
  }

  private add() {
    if (!this.folder) {
      this.newFolder();
      return;
    }
    this.adding = true;
    this.renderMain();
    this.main.querySelector<HTMLInputElement>('.fd-add input')?.focus();
  }

  private newFolder() {
    const folder = store.addFolder();
    if (this.location !== 'root') this.navigate('root');
    this.select(folder.id);
    this.renameFolder(folder.id);
  }

  private renameFolder(folderId: string) {
    const label = this.main.querySelector<HTMLElement>(
      `[data-id="${folderId}"] .fd-name`,
    );
    const folder = store.folder(folderId);
    if (label && folder)
      inlineEdit(label, folder.name, (name) =>
        store.renameFolder(folderId, name),
      );
  }

  private onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest('input')) return;
    if (!this.selected) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      this.openItem(this.selected);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (this.location === 'root') void deleteFolder(this.selected);
      else if (this.folder) store.removeBookmark(this.selected);
    }
  }

  private openItem(id: string) {
    if (this.location === 'root') this.navigate(id);
    else {
      const found = store.findBookmark(id);
      if (found) actions.openUrl(found.bookmark.url);
    }
  }

  // ─────────── 그리기 ───────────

  private render() {
    if (
      this.location !== 'root' &&
      this.location !== 'history' &&
      !this.folder
    ) {
      // 보고 있던 폴더가 삭제된 경우
      this.location = 'root';
      this.back = this.back.filter(
        (l) => l === 'root' || l === 'history' || store.folder(l),
      );
    }
    const title =
      this.folder?.name ??
      (this.location === 'history' ? '방문 기록' : '모든 폴더');
    this.titleEl.textContent = title;
    this.win.setTitle(title);
    this.backBtn.disabled = this.back.length === 0;
    this.fwdBtn.disabled = this.forward.length === 0;
    this.iconBtn.classList.toggle('on', this.view === 'icon');
    this.listBtn.classList.toggle('on', this.view === 'list');
    this.addBtn.title = this.folder ? '주소 추가' : '새로운 폴더';
    this.addBtn.disabled = this.location === 'history';
    this.renderSidebar();
    this.renderMain();
  }

  private renderSidebar() {
    const row = (
      location: Location,
      label: string,
      glyph: SVGElement,
      drop?: string,
    ) => {
      const el = h(
        'button',
        {
          class: `fd-side-row${this.location === location ? ' on' : ''}`,
          'data-drop-folder': drop,
          onclick: () => this.navigate(location),
        },
        glyph,
        h('span', null, label),
        drop
          ? h(
              'span',
              { class: 'fd-count' },
              String(store.folder(drop)?.items.length ?? 0),
            )
          : null,
      );
      if (drop) {
        el.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          showMenu(folderMenu(drop), e.clientX, e.clientY);
        });
      }
      return el;
    };
    this.sidebar.replaceChildren(
      h('div', { class: 'fd-side-head' }, '위치'),
      row('root', '모든 폴더', icon(LayoutGrid, 15)),
      row('history', '방문 기록', icon(Clock, 15)),
      h('div', { class: 'fd-side-head' }, '폴더'),
      ...store.state.folders.map((f) =>
        row(f.id, f.name, icon(FolderGlyph, 15), f.id),
      ),
    );
  }

  private renderMain() {
    const scroll = this.main.scrollTop;
    this.main.replaceChildren();
    const match = (...texts: string[]) =>
      !this.query || texts.some((t) => t.toLowerCase().includes(this.query));
    let count = 0;

    if (this.location === 'root') {
      const grid = h('div', { class: 'fd-grid' });
      for (const folder of store.state.folders.filter((f) => match(f.name))) {
        count++;
        const el = h(
          'div',
          {
            class: `fd-item${this.selected === folder.id ? ' selected' : ''}`,
            'data-id': folder.id,
            'data-drop-folder': folder.id,
          },
          h('div', { class: 'fd-art' }, folderIcon(56)),
          h('span', { class: 'fd-name' }, folder.name),
          h('span', { class: 'fd-sub' }, `주소 ${folder.items.length}개`),
        );
        el.addEventListener('pointerdown', () => this.select(folder.id));
        el.addEventListener('dblclick', () => this.navigate(folder.id));
        el.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.select(folder.id);
          showMenu(
            folderMenu(folder.id, () => this.renameFolder(folder.id)),
            e.clientX,
            e.clientY,
          );
        });
        grid.append(el);
      }
      this.main.append(grid);
      if (count === 0)
        this.main.append(
          this.empty(
            this.query
              ? '일치하는 폴더가 없습니다.'
              : '폴더가 없습니다. + 버튼으로 새 폴더를 만드세요.',
          ),
        );
    } else if (this.location === 'history') {
      const list = h('div', { class: 'fd-list' });
      for (const entry of store.state.history
        .filter((e) => match(e.title, e.url))
        .slice(0, 200)) {
        count++;
        const el = h(
          'div',
          { class: 'fd-item fd-row', title: entry.url },
          siteIcon(entry.title, entry.url, store.iconFor(entry.url), 18),
          h('span', { class: 'fd-name' }, entry.title),
          h('span', { class: 'fd-url' }, hostOf(entry.url)),
          h('span', { class: 'fd-time' }, timeLabel(entry.time)),
        );
        el.addEventListener('dblclick', () => actions.openUrl(entry.url));
        el.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          showMenu(
            [
              { label: '열기', action: () => actions.openUrl(entry.url) },
              {
                label: '새 창에서 열기',
                action: () => actions.openUrl(entry.url, { newWindow: true }),
              },
              { separator: true },
              { header: true, label: '폴더에 추가' },
              ...store.state.folders.map((f) => ({
                label: f.name,
                action: () =>
                  void store.addBookmark(f.id, entry.title, entry.url),
              })),
            ],
            e.clientX,
            e.clientY,
          );
        });
        list.append(el);
      }
      this.main.append(list);
      if (count === 0)
        this.main.append(
          this.empty(
            this.query ? '일치하는 기록이 없습니다.' : '방문 기록이 없습니다.',
          ),
        );
    } else if (this.folder) {
      const folder = this.folder;
      if (this.adding) this.main.append(this.addForm(folder.id));
      const container = h('div', {
        class: this.view === 'icon' ? 'fd-grid' : 'fd-list',
      });
      for (const bookmark of folder.items.filter((b) =>
        match(b.title, b.url),
      )) {
        count++;
        container.append(this.bookmarkItem(bookmark));
      }
      this.main.append(container);
      if (count === 0 && !this.adding) {
        this.main.append(
          this.empty(
            this.query
              ? '일치하는 주소가 없습니다.'
              : '이 폴더는 비어 있습니다. + 버튼으로 주소를 추가하세요.',
          ),
        );
      }
    }
    this.status.textContent = `${count}개 항목`;
    this.main.scrollTop = scroll;
  }

  private empty(text: string) {
    return h('div', { class: 'fd-empty' }, text);
  }

  private bookmarkItem(bookmark: Bookmark) {
    const iconUrl = store.iconFor(bookmark.url);
    const el =
      this.view === 'icon'
        ? h(
            'div',
            { class: 'fd-item', 'data-id': bookmark.id, title: bookmark.url },
            h(
              'div',
              { class: 'fd-art' },
              siteIcon(bookmark.title, bookmark.url, iconUrl, 48),
            ),
            h('span', { class: 'fd-name' }, bookmark.title),
            h('span', { class: 'fd-sub' }, hostOf(bookmark.url)),
          )
        : h(
            'div',
            {
              class: 'fd-item fd-row',
              'data-id': bookmark.id,
              title: bookmark.url,
            },
            siteIcon(bookmark.title, bookmark.url, iconUrl, 18),
            h('span', { class: 'fd-name' }, bookmark.title),
            h('span', { class: 'fd-url' }, bookmark.url),
          );
    if (this.selected === bookmark.id) el.classList.add('selected');
    el.addEventListener('pointerdown', () => this.select(bookmark.id));
    el.addEventListener('dblclick', () => actions.openUrl(bookmark.url));
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.select(bookmark.id);
      const others = store.state.folders.filter((f) => f.id !== this.location);
      showMenu(
        [
          { label: '열기', action: () => actions.openUrl(bookmark.url) },
          {
            label: '새 창에서 열기',
            action: () => actions.openUrl(bookmark.url, { newWindow: true }),
          },
          { separator: true },
          { label: '편집…', action: () => this.edit(bookmark, el) },
          {
            label: '주소 복사',
            action: () => window.bridge?.copyText(bookmark.url),
          },
          ...(others.length
            ? [
                { separator: true },
                { header: true, label: '다른 폴더로 이동' },
                ...others.map((f) => ({
                  label: f.name,
                  action: () => store.moveBookmark(bookmark.id, f.id),
                })),
              ]
            : []),
          { separator: true },
          { label: '삭제', action: () => store.removeBookmark(bookmark.id) },
        ],
        e.clientX,
        e.clientY,
      );
    });
    makeBookmarkDraggable(el, bookmark.id, bookmark.title);
    return el;
  }

  private edit(bookmark: Bookmark, anchor: HTMLElement) {
    const title = h('input', {
      class: 'field',
      value: bookmark.title,
      spellcheck: 'false',
    });
    const url = h('input', {
      class: 'field',
      value: bookmark.url,
      spellcheck: 'false',
    });
    let close = () => {};
    const form = h(
      'form',
      { class: 'pop-form' },
      h('h3', null, '주소 편집'),
      h('label', null, '이름', title),
      h('label', null, '주소', url),
      h(
        'div',
        { class: 'pop-actions' },
        h('button', { class: 'btn btn-primary', type: 'submit' }, '저장'),
      ),
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      store.updateBookmark(bookmark.id, {
        title: title.value,
        url: toUrl(url.value, store.state.settings.searchEngine),
      });
      close();
    });
    close = showPopover(anchor, form);
    title.focus();
    title.select();
  }

  private addForm(folderId: string) {
    const title = h('input', {
      class: 'field',
      placeholder: '이름 (비워 두면 사이트 이름)',
      spellcheck: 'false',
    });
    const url = h('input', {
      class: 'field',
      placeholder: '주소 (예: naver.com)',
      spellcheck: 'false',
    });
    const form = h(
      'form',
      { class: 'fd-add' },
      url,
      title,
      h('button', { class: 'btn btn-primary', type: 'submit' }, '추가'),
      h(
        'button',
        {
          class: 'btn',
          type: 'button',
          onclick: () => {
            this.adding = false;
            this.renderMain();
          },
        },
        '취소',
      ),
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const target = toUrl(url.value, store.state.settings.searchEngine);
      if (!target) {
        url.focus();
        return;
      }
      this.adding = false;
      store.addBookmark(folderId, title.value, target);
    });
    form.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.adding = false;
        this.renderMain();
      }
    });
    return form;
  }
}

const finders = new Set<FinderWin>();

export function openFinder(location: Location = 'root') {
  // 같은 폴더를 보여주는 창이 이미 있으면 그 창을 앞으로 가져옵니다
  for (const finder of finders) {
    if (finder.current === location && location !== 'root') {
      if (finder.win.minimized) finder.win.restore();
      else finder.win.focus();
      return;
    }
  }
  finders.add(new FinderWin(location));
}
