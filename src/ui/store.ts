import type { AppState, Bookmark, Folder, Settings } from '../shared/types';
import { hostOf, uid } from './util';

const bm = (title: string, url: string): Bookmark => ({
  id: uid(),
  title,
  url,
});

const defaults = (): AppState => ({
  version: 1,
  folders: [
    {
      id: uid(),
      name: '즐겨찾기',
      x: 24,
      y: 20,
      items: [
        bm('네이버', 'https://www.naver.com'),
        bm('Google', 'https://www.google.com'),
        bm('YouTube', 'https://www.youtube.com'),
        bm('위키백과', 'https://ko.wikipedia.org'),
      ],
    },
    {
      id: uid(),
      name: '개발',
      x: 24,
      y: 124,
      items: [
        bm('GitHub', 'https://github.com'),
        bm('MDN', 'https://developer.mozilla.org/ko/'),
        bm('Electron 문서', 'https://www.electronjs.org/docs/latest'),
        bm('Stack Overflow', 'https://stackoverflow.com'),
      ],
    },
    { id: uid(), name: '나중에 읽기', x: 24, y: 228, items: [] },
  ],
  history: [],
  icons: {},
  settings: {
    theme: 'auto',
    wallpaper: 0,
    searchEngine: 'google',
    macCursor: true,
  },
});

let state: AppState = defaults();
const listeners = new Set<() => void>();
let saveTimer: number | undefined;

function changed() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    window.bridge?.saveState(state).catch(() => {});
  }, 250);
  for (const fn of listeners) fn();
}

/** 저장 파일이 손상됐거나 옛 형식이어도 앱이 죽지 않게 필요한 필드만 골라 담습니다 */
function sanitize(raw: unknown): AppState {
  const base = defaults();
  if (!raw || typeof raw !== 'object') return base;
  const input = raw as Partial<AppState>;
  if (!Array.isArray(input.folders)) return base;
  const folders: Folder[] = input.folders
    .filter((f) => f && typeof f.name === 'string')
    .map((f, i) => ({
      id: typeof f.id === 'string' ? f.id : uid(),
      name: f.name,
      x: Number.isFinite(f.x) ? f.x : 24,
      y: Number.isFinite(f.y) ? f.y : 20 + i * 104,
      items: (Array.isArray(f.items) ? f.items : [])
        .filter(
          (b) => b && typeof b.url === 'string' && /^https?:\/\//i.test(b.url),
        )
        .map((b) => ({
          id: typeof b.id === 'string' ? b.id : uid(),
          title: typeof b.title === 'string' ? b.title : b.url,
          url: b.url,
        })),
    }));
  return {
    version: 1,
    folders,
    history: (Array.isArray(input.history) ? input.history : [])
      .filter(
        (e) => e && typeof e.url === 'string' && typeof e.time === 'number',
      )
      .slice(0, 500),
    icons: input.icons && typeof input.icons === 'object' ? input.icons : {},
    settings: { ...base.settings, ...input.settings },
  };
}

export const store = {
  get state() {
    return state;
  },

  async load() {
    try {
      const saved = await window.bridge?.loadState();
      if (saved) state = sanitize(saved);
    } catch {
      // 저장된 상태를 읽지 못하면 기본값으로 시작합니다
    }
  },

  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  folder(id: string) {
    return state.folders.find((f) => f.id === id);
  },

  findBookmark(id: string): { folder: Folder; bookmark: Bookmark } | undefined {
    for (const folder of state.folders) {
      const bookmark = folder.items.find((b) => b.id === id);
      if (bookmark) return { folder, bookmark };
    }
    return undefined;
  },

  bookmarkByUrl(url: string) {
    for (const folder of state.folders) {
      const bookmark = folder.items.find((b) => b.url === url);
      if (bookmark) return { folder, bookmark };
    }
    return undefined;
  },

  iconFor(url: string): string | undefined {
    return state.icons[hostOf(url)];
  },

  addFolder(name = '새 폴더', x?: number, y?: number): Folder {
    const names = new Set(state.folders.map((f) => f.name));
    let unique = name;
    for (let n = 2; names.has(unique); n++) unique = `${name} ${n}`;
    const folder: Folder = {
      id: uid(),
      name: unique,
      x: x ?? 24 + 104 * Math.floor(state.folders.length / 6),
      y: y ?? 20 + 104 * (state.folders.length % 6),
      items: [],
    };
    state.folders.push(folder);
    changed();
    return folder;
  },

  renameFolder(id: string, name: string) {
    const folder = this.folder(id);
    if (!folder || !name.trim()) return;
    folder.name = name.trim();
    changed();
  },

  removeFolder(id: string) {
    state.folders = state.folders.filter((f) => f.id !== id);
    changed();
  },

  moveFolder(id: string, x: number, y: number) {
    const folder = this.folder(id);
    if (!folder) return;
    folder.x = Math.round(x);
    folder.y = Math.round(y);
    changed();
  },

  arrangeFolders() {
    state.folders.forEach((folder, i) => {
      folder.x = 24 + 104 * Math.floor(i / 6);
      folder.y = 20 + 104 * (i % 6);
    });
    changed();
  },

  addBookmark(
    folderId: string,
    title: string,
    url: string,
  ): Bookmark | undefined {
    const folder = this.folder(folderId);
    if (!folder || !/^https?:\/\//i.test(url)) return undefined;
    const bookmark: Bookmark = {
      id: uid(),
      title: title.trim() || hostOf(url) || url,
      url,
    };
    folder.items.push(bookmark);
    changed();
    return bookmark;
  },

  updateBookmark(id: string, patch: Partial<Pick<Bookmark, 'title' | 'url'>>) {
    const found = this.findBookmark(id);
    if (!found) return;
    if (patch.title?.trim()) found.bookmark.title = patch.title.trim();
    if (patch.url && /^https?:\/\//i.test(patch.url))
      found.bookmark.url = patch.url;
    changed();
  },

  removeBookmark(id: string) {
    const found = this.findBookmark(id);
    if (!found) return;
    found.folder.items = found.folder.items.filter((b) => b.id !== id);
    changed();
  },

  /** 주소를 다른 폴더로 옮깁니다 */
  moveBookmark(id: string, toFolderId: string) {
    const found = this.findBookmark(id);
    const target = this.folder(toFolderId);
    if (!found || !target || found.folder === target) return;
    found.folder.items = found.folder.items.filter((b) => b.id !== id);
    target.items.push(found.bookmark);
    changed();
  },

  addHistory(url: string, title: string) {
    if (!/^https?:\/\//i.test(url)) return;
    const latest = state.history[0];
    if (latest && latest.url === url) {
      latest.time = Date.now();
      if (title) latest.title = title;
    } else {
      state.history.unshift({
        url,
        title: title || hostOf(url) || url,
        time: Date.now(),
      });
      if (state.history.length > 500) state.history.length = 500;
    }
    changed();
  },

  updateHistoryTitle(url: string, title: string) {
    const entry = state.history.find((e) => e.url === url);
    if (!entry || !title || entry.title === title) return;
    entry.title = title;
    changed();
  },

  clearHistory() {
    state.history = [];
    changed();
  },

  setIcon(url: string, iconUrl: string) {
    const host = hostOf(url);
    if (
      !host ||
      !/^https?:\/\//i.test(iconUrl) ||
      state.icons[host] === iconUrl
    )
      return;
    state.icons[host] = iconUrl;
    // 아이콘 목록이 끝없이 커지지 않게 오래된 것부터 지웁니다
    const hosts = Object.keys(state.icons);
    for (const old of hosts.slice(0, Math.max(0, hosts.length - 400)))
      delete state.icons[old];
    changed();
  },

  setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    if (state.settings[key] === value) return;
    state.settings[key] = value;
    changed();
  },
};
