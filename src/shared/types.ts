export interface Bookmark {
  id: string;
  title: string;
  url: string;
  icon?: string;
}

export interface Folder {
  id: string;
  name: string;
  /** 바탕화면에서의 위치(px) */
  x: number;
  y: number;
  items: Bookmark[];
}

export interface HistoryEntry {
  url: string;
  title: string;
  time: number;
}

export type ThemeMode = 'auto' | 'light' | 'dark';
export type SearchEngine = 'google' | 'naver' | 'duckduckgo' | 'bing';

export interface Settings {
  theme: ThemeMode;
  wallpaper: number;
  searchEngine: SearchEngine;
  macCursor: boolean;
}

export interface AppState {
  version: 1;
  folders: Folder[];
  history: HistoryEntry[];
  /** 사이트(호스트)별 파비콘 주소 */
  icons: Record<string, string>;
  settings: Settings;
}

export interface DownloadInfo {
  id: string;
  name: string;
  received: number;
  total: number;
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
}

export interface GuestOpenRequest {
  /** 링크를 연 웹페이지의 webContents id */
  openerId: number;
  url: string;
  background: boolean;
}

/** 프리로드가 렌더러에 노출하는 API */
export interface Bridge {
  loadState(): Promise<AppState | null>;
  saveState(state: AppState): Promise<void>;
  quit(): void;
  minimize(): void;
  toggleFullscreen(): void;
  setTheme(mode: ThemeMode): void;
  setGuestCursor(enabled: boolean): void;
  showDownload(id: string): void;
  copyText(text: string): void;
  onGuestOpen(cb: (req: GuestOpenRequest) => void): void;
  onShortcut(cb: (name: string) => void): void;
  onDownload(cb: (info: DownloadInfo) => void): void;
}
