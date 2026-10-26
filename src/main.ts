import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type Session,
  type WebContents,
} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import started from 'electron-squirrel-startup';
// 아이콘을 코드에 포함시켜 개발 모드와 설치본 양쪽에서 경로 문제 없이 씁니다
import appIcon from '../assets/icon.png?inline';
import { GUEST_CURSOR_CSS } from './shared/cursors';
import { shortcutName } from './shared/shortcuts';
import type { DownloadInfo, ThemeMode } from './shared/types';

// Windows 설치/제거 시 바로가기 처리
if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let guestCursorEnabled = true;
const downloadPaths = new Map<string, string>();
let downloadSeq = 0;

const stateFile = () => path.join(app.getPath('userData'), 'state.json');

const isHttpUrl = (url: string) => /^https?:\/\//i.test(url);

// ───────────────────────── 창 생성 ─────────────────────────

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 620,
    frame: false, // Windows 기본 타이틀바 제거: 화면 전체를 직접 그립니다
    show: false,
    backgroundColor: '#1b1b2a',
    icon: nativeImage.createFromDataURL(appIcon), // 창과 작업 표시줄 아이콘
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: true, // 창 안의 웹페이지는 <webview>로 띄웁니다
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize();
    mainWindow?.show();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
};

// ───────────────────────── 보안 ─────────────────────────

/** 웹페이지 안에서 눌러도 브라우저가 가로채야 하는 단축키 */
const shortcutFor = (input: Electron.Input): string | null =>
  input.type === 'keyDown'
    ? shortcutName({
        key: input.key,
        ctrl: input.control || input.meta,
        alt: input.alt,
        shift: input.shift,
      })
    : null;

const setupGuest = (contents: WebContents) => {
  const host = () => contents.hostWebContents ?? mainWindow?.webContents;

  // 새 창으로 열리는 링크는 실제 창을 만들지 않고 새 탭으로 넘깁니다
  contents.setWindowOpenHandler(({ url, disposition }) => {
    if (isHttpUrl(url)) {
      host()?.send('guest:open', {
        openerId: contents.id,
        url,
        background: disposition === 'background-tab',
      });
    }
    return { action: 'deny' };
  });

  // http/https 외의 주소(file:, 사용자 지정 스킴 등)로는 이동시키지 않습니다
  const guard = (event: Electron.Event, url: string) => {
    if (!isHttpUrl(url) && url !== 'about:blank') event.preventDefault();
  };
  contents.on('will-navigate', guard);
  contents.on('will-redirect', guard);

  contents.on('before-input-event', (event, input) => {
    // Esc는 페이지에도 그대로 전달하면서, 열려 있는 메뉴가 닫히도록 UI에도 알립니다
    if (
      input.type === 'keyDown' &&
      input.key === 'Escape' &&
      !input.control &&
      !input.alt &&
      !input.meta
    ) {
      host()?.send('shortcut', 'escape');
      return;
    }
    const name = shortcutFor(input);
    if (name) {
      event.preventDefault();
      host()?.send('shortcut', name);
    }
  });

  contents.on('dom-ready', () => {
    if (guestCursorEnabled) {
      contents
        .insertCSS(GUEST_CURSOR_CSS, { cssOrigin: 'user' })
        .catch(() => {});
    }
  });
};

const setupHost = (contents: WebContents) => {
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    // 웹페이지 쪽에는 프리로드와 Node 권한을 절대 주지 않습니다
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    if (params.src && !isHttpUrl(params.src) && params.src !== 'about:blank') {
      event.preventDefault();
    }
  });

  // 직접 그린 UI 자체가 다른 주소로 이동하는 것을 막습니다
  contents.on('will-navigate', (event, url) => {
    const current = contents.getURL();
    const sameOrigin = (() => {
      try {
        return (
          new URL(url).origin === new URL(current).origin &&
          !url.startsWith('file:')
        );
      } catch {
        return false;
      }
    })();
    if (!sameOrigin) event.preventDefault();
  });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (!app.isPackaged) {
    contents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') {
        contents.toggleDevTools();
      }
    });
  }
};

app.on('web-contents-created', (_event, contents) => {
  const type = contents.getType();
  if (type === 'webview') setupGuest(contents);
  else if (type === 'window') setupHost(contents);
});

/** 웹사이트가 요청할 때 묻지 않고 허용해도 되는 권한 */
const ALLOWED_PERMISSIONS = new Set([
  'fullscreen',
  'pointerLock',
  'clipboard-sanitized-write',
]);

const setupSession = (sess: Session) => {
  // Electron 기본값은 "모두 허용"이므로, 위치·카메라·마이크·알림 등은 막습니다
  sess.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });
  sess.setPermissionCheckHandler((_wc, permission) =>
    ALLOWED_PERMISSIONS.has(permission),
  );

  sess.on('will-download', (_event, item) => {
    const id = `d${++downloadSeq}`;
    const report = (state: DownloadInfo['state']) => {
      const info: DownloadInfo = {
        id,
        name: item.getFilename(),
        received: item.getReceivedBytes(),
        total: item.getTotalBytes(),
        state,
      };
      mainWindow?.webContents.send('download', info);
    };
    report('progressing');
    item.on('updated', (_e, state) => report(state));
    item.once('done', (_e, state) => {
      if (state === 'completed') downloadPaths.set(id, item.getSavePath());
      report(state);
    });
  });
};

app.on('session-created', setupSession);

// ───────────────────────── IPC ─────────────────────────

const fromMainWindow = (event: IpcMainEvent | IpcMainInvokeEvent) =>
  !!mainWindow && event.sender === mainWindow.webContents;

const registerIpc = () => {
  ipcMain.handle('state:load', async (event) => {
    if (!fromMainWindow(event)) return null;
    try {
      const parsed: unknown = JSON.parse(
        await fs.readFile(stateFile(), 'utf8'),
      );
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  });

  let writing: Promise<void> = Promise.resolve();
  ipcMain.handle('state:save', (event, state: unknown) => {
    if (!fromMainWindow(event) || !state || typeof state !== 'object') return;
    const json = JSON.stringify(state);
    if (json.length > 5_000_000) return;
    // 쓰다가 꺼져도 파일이 깨지지 않도록 임시 파일에 쓴 뒤 이름을 바꿉니다
    writing = writing
      .then(async () => {
        const tmp = `${stateFile()}.tmp`;
        await fs.writeFile(tmp, json, 'utf8');
        await fs.rename(tmp, stateFile());
      })
      .catch((error) => console.error('상태 저장 실패:', error));
    return writing;
  });

  const on = (channel: string, fn: (...args: unknown[]) => void) =>
    ipcMain.on(channel, (event, ...args) => {
      if (fromMainWindow(event)) fn(...args);
    });

  on('app:quit', () => app.quit());
  on('app:minimize', () => mainWindow?.minimize());
  on('app:toggle-fullscreen', () =>
    mainWindow?.setFullScreen(!mainWindow.isFullScreen()),
  );
  on('app:set-theme', (mode) => {
    const map: Record<ThemeMode, 'system' | 'light' | 'dark'> = {
      auto: 'system',
      light: 'light',
      dark: 'dark',
    };
    nativeTheme.themeSource = map[mode as ThemeMode] ?? 'system';
  });
  on('app:set-guest-cursor', (enabled) => {
    guestCursorEnabled = enabled === true;
  });
  on('clipboard:write', (text) => {
    if (typeof text === 'string') clipboard.writeText(text.slice(0, 100_000));
  });
  on('download:show', (id) => {
    const file = downloadPaths.get(String(id));
    if (file) shell.showItemInFolder(file);
  });
};

// ───────────────────────── 시작 ─────────────────────────

app.whenReady().then(() => {
  // 기본 메뉴의 Ctrl+W(창 닫기), Ctrl+R(UI 새로고침) 단축키가 탭 단축키와 겹치지 않게 제거
  Menu.setApplicationMenu(null);
  registerIpc();
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
