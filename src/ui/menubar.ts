import { Moon, Sun } from 'lucide';
import appIcon from '../../assets/icon.png';
import { actions } from './actions';
import { browserOf, topBrowser } from './browser';
import { store } from './store';
import {
  closeOverlays,
  h,
  hostOf,
  icon,
  showMenu,
  type MenuItem,
} from './util';
import { wm } from './wm';

const sep: MenuItem = { separator: true };

function currentBrowser() {
  return browserOf(wm.active) ?? topBrowser();
}

// 단축키 표기는 macOS처럼 기호로 적되, 실제 키는 Windows의 Ctrl(⌃)입니다
const MENUS: { title: string; build: () => MenuItem[] }[] = [
  {
    title: '파일',
    build: () => [
      {
        label: '새로운 창',
        shortcut: '⌃N',
        action: () => actions.shortcut('new-window'),
      },
      {
        label: '새로운 프라이빗 창',
        shortcut: '⇧⌃N',
        action: () => actions.shortcut('new-private-window'),
      },
      {
        label: '새로운 탭',
        shortcut: '⌃T',
        action: () => actions.shortcut('new-tab'),
      },
      sep,
      {
        label: '새로운 폴더',
        action: () => {
          store.addFolder();
          actions.openFinder('root');
        },
      },
      { label: '폴더 창 열기', action: () => actions.openFinder('root') },
      sep,
      {
        label: '탭 닫기',
        shortcut: '⌃W',
        disabled: !wm.active,
        action: () => actions.shortcut('close-tab'),
      },
      {
        label: '창 닫기',
        disabled: !wm.active,
        action: () => wm.active?.close(),
      },
    ],
  },
  {
    title: '보기',
    build: () => {
      const none = !currentBrowser();
      return [
        {
          label: '페이지 새로고침',
          shortcut: '⌃R',
          disabled: none,
          action: () => actions.shortcut('reload'),
        },
        {
          label: '페이지에서 찾기…',
          shortcut: '⌃F',
          disabled: none,
          action: () => actions.shortcut('find'),
        },
        sep,
        {
          label: '확대',
          shortcut: '⌃+',
          disabled: none,
          action: () => actions.shortcut('zoom-in'),
        },
        {
          label: '축소',
          shortcut: '⌃−',
          disabled: none,
          action: () => actions.shortcut('zoom-out'),
        },
        {
          label: '실제 크기',
          shortcut: '⌃0',
          disabled: none,
          action: () => actions.shortcut('zoom-reset'),
        },
        sep,
        {
          label: '전체 화면',
          shortcut: 'F11',
          action: () => actions.shortcut('fullscreen'),
        },
      ];
    },
  },
  {
    title: '방문 기록',
    build: () => {
      const b = currentBrowser();
      const recent = store.state.history.slice(0, 10);
      return [
        {
          label: '뒤로',
          shortcut: '⌥←',
          disabled: !b?.active.canBack,
          action: () => actions.shortcut('back'),
        },
        {
          label: '앞으로',
          shortcut: '⌥→',
          disabled: !b?.active.canForward,
          action: () => actions.shortcut('forward'),
        },
        {
          label: '닫은 탭 다시 열기',
          shortcut: '⇧⌃T',
          disabled: !b,
          action: () => actions.shortcut('reopen-tab'),
        },
        sep,
        ...(recent.length
          ? recent.map((e) => ({
              label:
                e.title.length > 36
                  ? `${e.title.slice(0, 36)}…`
                  : e.title || hostOf(e.url),
              action: () => actions.openUrl(e.url),
            }))
          : [{ label: '방문 기록 없음', disabled: true }]),
        sep,
        {
          label: '방문 기록 모두 보기',
          action: () => actions.openFinder('history'),
        },
        {
          label: '방문 기록 지우기',
          disabled: !recent.length,
          action: () => store.clearHistory(),
        },
      ];
    },
  },
  {
    title: '책갈피',
    build: () => {
      const items: MenuItem[] = [
        {
          label: '이 페이지를 책갈피에 추가…',
          shortcut: '⌃D',
          disabled: !currentBrowser()?.active.url,
          action: () => actions.shortcut('bookmark'),
        },
        { label: '모든 폴더 보기', action: () => actions.openFinder('root') },
      ];
      for (const folder of store.state.folders) {
        if (!folder.items.length) continue;
        items.push(sep, { header: true, label: folder.name });
        for (const b of folder.items.slice(0, 12)) {
          items.push({ label: b.title, action: () => actions.openUrl(b.url) });
        }
      }
      return items;
    },
  },
  {
    title: '윈도우',
    build: () => [
      {
        label: '최소화',
        disabled: !wm.active,
        action: () => wm.active?.minimize(),
      },
      {
        label: '확대/축소',
        disabled: !wm.active,
        action: () => wm.active?.toggleZoom(),
      },
      ...(wm.wins.length ? [sep] : []),
      ...wm.wins.map((w) => ({
        label: w.title.length > 36 ? `${w.title.slice(0, 36)}…` : w.title,
        checked: w === wm.active,
        action: () => (w.minimized ? w.restore() : w.focus()),
      })),
    ],
  },
];

const SYSTEM_MENU = (): MenuItem[] => [
  { label: 'KSG에 관하여', action: () => actions.openAbout() },
  sep,
  { label: '설정…', action: () => actions.openSettings() },
  sep,
  {
    label: '전체 화면',
    shortcut: 'F11',
    action: () => actions.shortcut('fullscreen'),
  },
  { label: '앱 창 최소화', action: () => window.bridge?.minimize() },
  sep,
  { label: '종료', shortcut: '⌃Q', action: () => actions.shortcut('quit') },
];

export function initMenubar(bar: HTMLElement, isDark: () => boolean) {
  let openItem: HTMLElement | null = null;

  const item = (
    content: Node | string,
    build: () => MenuItem[],
    className = '',
  ) => {
    const el = h('button', { class: `mb-item ${className}` }, content);
    const open = () => {
      const rect = el.getBoundingClientRect();
      showMenu(build(), rect.left, rect.bottom + 2, {
        onClose: () => {
          el.classList.remove('open');
          if (openItem === el) openItem = null;
        },
      });
      el.classList.add('open');
      openItem = el;
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (openItem === el) closeOverlays();
      else open();
    });
    // 메뉴가 열려 있을 때는 옆 항목에 올리기만 해도 바뀝니다
    el.addEventListener('pointerenter', () => {
      if (openItem && openItem !== el) open();
    });
    return el;
  };

  const appName = h('span');
  const themeBtn = h('button', {
    class: 'mb-item mb-icon',
    title: '화면 모드 전환',
  });
  themeBtn.addEventListener('click', () =>
    store.setSetting('theme', isDark() ? 'light' : 'dark'),
  );
  const clock = h('span', { class: 'mb-clock' });

  bar.append(
    item(
      h('img', {
        class: 'mb-logo-img',
        src: appIcon,
        alt: '',
        draggable: 'false',
      }),
      SYSTEM_MENU,
      'mb-logo',
    ),
    item(
      appName,
      () => {
        const win = wm.active;
        return [
          {
            label: `${win?.appName ?? '데스크탑'}에 관하여`,
            action: () => actions.openAbout(),
          },
          sep,
          { label: '설정…', action: () => actions.openSettings() },
          sep,
          {
            label: `${win?.appName ?? '데스크탑'} 창 닫기`,
            disabled: !win,
            action: () => win?.close(),
          },
        ];
      },
      'mb-app',
    ),
    ...MENUS.map((m) => item(m.title, m.build)),
    h('div', { class: 'mb-drag' }),
    themeBtn,
    clock,
  );

  const tick = () => {
    clock.textContent = new Date().toLocaleString('ko-KR', {
      month: 'long',
      day: 'numeric',
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  };
  tick();
  window.setInterval(tick, 5000);

  const refresh = () => {
    appName.textContent = wm.active?.appName ?? '데스크탑';
    themeBtn.replaceChildren(icon(isDark() ? Sun : Moon, 14, 2));
  };
  refresh();
  wm.subscribe(refresh);
  store.subscribe(refresh);
  return refresh;
}
