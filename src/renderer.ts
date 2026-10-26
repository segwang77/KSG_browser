/**
 * 렌더러(직접 그리는 UI)의 시작점.
 * 메뉴 막대, 바탕화면, 창, Dock을 만들고 메인 프로세스에서 오는 이벤트를 연결합니다.
 */
import 'pretendard/dist/web/variable/pretendardvariable.css';
import './index.css';
import { CURSOR_ARROW, CURSOR_HAND } from './shared/cursors';
import { shortcutName } from './shared/shortcuts';
import { actions } from './ui/actions';
import {
  BrowserWin,
  browserOf,
  browsers,
  topBrowser,
  trackDownload,
} from './ui/browser';
import { initDesktop } from './ui/desktop';
import { initDock } from './ui/dock';
import { openFinder } from './ui/finder';
import { initMenubar } from './ui/menubar';
import { openAbout, openSettings } from './ui/settings';
import { store } from './ui/store';
import { closeOverlays, h } from './ui/util';
import { wm } from './ui/wm';

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const isDark = () => {
  const mode = store.state.settings.theme;
  return mode === 'dark' || (mode === 'auto' && darkQuery.matches);
};

function applySettings() {
  const root = document.documentElement;
  const { theme, macCursor } = store.state.settings;
  root.dataset.theme = isDark() ? 'dark' : 'light';
  root.classList.toggle('mac-cursor', macCursor);
  window.bridge?.setTheme(theme);
  window.bridge?.setGuestCursor(macCursor);
}

function shortcut(name: string) {
  const activeBrowser = browserOf(wm.active);
  const b = activeBrowser ?? topBrowser();
  switch (name) {
    case 'new-window':
      actions.newWindow();
      break;
    case 'new-private-window':
      actions.newWindow(undefined, true);
      break;
    case 'new-tab':
      if (b) {
        b.win.focus();
        b.newTab();
      } else actions.newWindow();
      break;
    case 'close-tab':
      if (activeBrowser) activeBrowser.closeTab(activeBrowser.active);
      else wm.active?.close();
      break;
    case 'reopen-tab':
      b?.reopenTab();
      break;
    case 'next-tab':
      b?.cycle(1);
      break;
    case 'prev-tab':
      b?.cycle(-1);
      break;
    case 'focus-address':
      b?.focusAddress();
      break;
    case 'reload':
      b?.reload();
      break;
    case 'back':
      b?.back();
      break;
    case 'forward':
      b?.forward();
      break;
    case 'find':
      b?.showFind();
      break;
    case 'bookmark':
      b?.bookmark();
      break;
    case 'zoom-in':
      b?.zoom(0.5);
      break;
    case 'zoom-out':
      b?.zoom(-0.5);
      break;
    case 'zoom-reset':
      b?.zoom(null);
      break;
    case 'fullscreen':
      window.bridge?.toggleFullscreen();
      break;
    case 'quit':
      window.bridge?.quit();
      break;
    case 'escape':
      closeOverlays();
      break;
  }
}

async function start() {
  await store.load();

  const root = document.documentElement;
  root.style.setProperty('--cursor-arrow', CURSOR_ARROW);
  root.style.setProperty('--cursor-hand', CURSOR_HAND);

  const menubar = h('header', { id: 'menubar' });
  const desktop = h('main', { id: 'desktop', 'aria-label': '바탕화면' });
  const layer = h('div', { id: 'windows' });
  const dock = h('nav', { id: 'dock', 'aria-label': 'Dock' });
  document.body.append(
    menubar,
    h('div', { id: 'stage' }, desktop, layer, dock),
  );

  wm.init(layer);

  Object.assign(actions, {
    newWindow: (url?: string, isPrivate = false) => {
      new BrowserWin({ url, isPrivate });
    },
    openUrl: (url: string, opts: { newWindow?: boolean } = {}) => {
      // 프라이빗 창이 아닌 브라우저 창 가운데 가장 위에 있는 창에 새 탭으로 엽니다
      const target = opts.newWindow
        ? undefined
        : wm
            .ordered()
            .map((w) => browserOf(w))
            .find((b) => b && !b.isPrivate);
      if (!target) {
        new BrowserWin({ url });
        return;
      }
      if (target.win.minimized) target.win.restore();
      else target.win.focus();
      // 비어 있는 시작 페이지 탭이면 그 탭을 그대로 씁니다
      if (!target.active.url) target.navigate(url);
      else target.newTab(url);
    },
    openFinder,
    openSettings,
    openAbout,
    shortcut,
  });

  applySettings();
  store.subscribe(applySettings);
  darkQuery.addEventListener('change', applySettings);

  initDesktop(desktop);
  const refreshMenubar = initMenubar(menubar, isDark);
  darkQuery.addEventListener('change', refreshMenubar);
  initDock(dock);

  // 직접 그린 UI에 포커스가 있을 때의 단축키 (웹페이지 안에서는 메인 프로세스가 대신 전달)
  window.addEventListener('keydown', (e) => {
    const name = shortcutName({
      key: e.key,
      ctrl: e.ctrlKey || e.metaKey,
      alt: e.altKey,
      shift: e.shiftKey,
    });
    if (!name) return;
    e.preventDefault();
    shortcut(name);
  });
  window.bridge?.onShortcut(shortcut);

  // 웹페이지가 새 창을 열려고 하면 같은 브라우저 창의 새 탭으로 엽니다
  window.bridge?.onGuestOpen(({ openerId, url, background }) => {
    for (const b of browsers) {
      const opener = b.tabByGuestId(openerId);
      if (opener) {
        b.newTab(url, { after: opener, background });
        return;
      }
    }
    actions.openUrl(url);
  });
  window.bridge?.onDownload(trackDownload);

  new BrowserWin();
}

void start();
