import {
  Compass,
  EyeOff,
  FolderOpen,
  Info,
  Settings,
  type IconNode,
} from 'lucide';
import appIcon from '../../assets/icon.png';
import { actions } from './actions';
import { h, icon } from './util';
import { wm, type Win, type WinKind } from './wm';

const GLYPH: Record<WinKind, IconNode> = {
  browser: Compass,
  finder: FolderOpen,
  settings: Settings,
  about: Info,
};

interface DockApp {
  id: string;
  label: string;
  glyph: IconNode;
  /** 실행 중 표시(점)를 띄울 창 */
  match: (w: Win) => boolean;
  launch: () => void;
}

const APPS: DockApp[] = [
  {
    id: 'finder',
    label: '폴더',
    glyph: FolderOpen,
    match: (w) => w.kind === 'finder',
    launch: () => actions.openFinder('root'),
  },
  {
    id: 'browser',
    label: 'KSG',
    glyph: Compass,
    match: (w) => w.kind === 'browser' && !w.el.classList.contains('private'),
    launch: () => actions.newWindow(),
  },
  {
    id: 'private',
    label: 'KSG 프라이빗 창',
    glyph: EyeOff,
    match: (w) => w.kind === 'browser' && w.el.classList.contains('private'),
    launch: () => actions.newWindow(undefined, true),
  },
  {
    id: 'settings',
    label: '설정',
    glyph: Settings,
    match: (w) => w.kind === 'settings',
    launch: () => actions.openSettings(),
  },
];

export function initDock(dock: HTMLElement) {
  const render = () => {
    const ordered = wm.ordered();
    const item = (
      className: string,
      label: string,
      glyph: IconNode,
      running: boolean,
      onclick: () => void,
    ) =>
      h(
        'button',
        {
          class: `dock-item ${className}${running ? ' running' : ''}`,
          'aria-label': label,
          onclick,
        },
        // 브라우저 타일에는 앱 아이콘 이미지를 그대로 씁니다
        className.split(' ').includes('dock-browser') &&
          !className.includes('dock-private')
          ? h('img', {
              class: 'dock-tile dock-app-icon',
              src: appIcon,
              alt: '',
              draggable: 'false',
            })
          : h('span', { class: 'dock-tile' }, icon(glyph, 28, 1.7)),
        h('span', { class: 'dock-label' }, label),
      );

    const apps = APPS.map((app) => {
      const wins = ordered.filter(app.match);
      return item(
        `dock-${app.id}`,
        app.label,
        app.glyph,
        wins.length > 0,
        () => {
          // 창이 있으면 맨 위 창을 앞으로(최소화돼 있으면 복원), 없으면 새로 엽니다
          const target = wins.find((w) => !w.minimized) ?? wins[0];
          if (!target) app.launch();
          else if (target.minimized) target.restore();
          else if (target === wm.active) app.launch();
          else target.focus();
        },
      );
    });

    const minimized = wm.wins
      .filter((w) => w.minimized)
      .map((w) =>
        item(
          `dock-min dock-${w.kind}${w.el.classList.contains('private') ? ' dock-private' : ''}`,
          w.title,
          GLYPH[w.kind],
          false,
          () => w.restore(),
        ),
      );

    dock.replaceChildren(
      ...apps,
      ...(minimized.length
        ? [h('span', { class: 'dock-sep' }), ...minimized]
        : []),
    );
  };
  render();
  wm.subscribe(render);
}
