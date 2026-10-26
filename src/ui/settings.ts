import appIcon from '../../assets/icon.png';
import { WALLPAPERS } from './desktop';
import { store } from './store';
import { h, SEARCH_NAME } from './util';
import { wm, type Win } from './wm';
import type { SearchEngine, ThemeMode } from '../shared/types';

let settingsWin: Win | null = null;
let aboutWin: Win | null = null;

const show = (win: Win) => (win.minimized ? win.restore() : win.focus());

export function openSettings() {
  if (settingsWin && !settingsWin.closed) {
    show(settingsWin);
    return;
  }
  const win = wm.open({
    kind: 'settings',
    appName: '설정',
    title: '설정',
    width: 520,
    height: 500,
    resizable: false,
  });
  settingsWin = win;
  win.toolbar.append(h('div', { class: 'win-title' }, '설정'));
  win.body.classList.add('st-body');

  const render = () => {
    const s = store.state.settings;
    const themes: [ThemeMode, string][] = [
      ['auto', '자동'],
      ['light', '라이트'],
      ['dark', '다크'],
    ];
    const row = (label: string, control: HTMLElement, hint?: string) =>
      h(
        'div',
        { class: 'st-row' },
        h(
          'div',
          null,
          h('div', { class: 'st-label' }, label),
          hint ? h('div', { class: 'st-hint' }, hint) : null,
        ),
        control,
      );
    const engine = h(
      'select',
      {
        class: 'field',
        onchange: (e: Event) =>
          store.setSetting(
            'searchEngine',
            (e.target as HTMLSelectElement).value as SearchEngine,
          ),
      },
      ...(Object.keys(SEARCH_NAME) as SearchEngine[]).map((key) => {
        const option = h('option', { value: key }, SEARCH_NAME[key]);
        option.selected = key === s.searchEngine;
        return option;
      }),
    );
    const cursor = h('input', {
      type: 'checkbox',
      class: 'switch',
      checked: s.macCursor,
      onchange: (e: Event) =>
        store.setSetting('macCursor', (e.target as HTMLInputElement).checked),
    });
    win.body.replaceChildren(
      h(
        'div',
        { class: 'st-group' },
        row(
          '화면 모드',
          h(
            'div',
            { class: 'seg' },
            ...themes.map(([mode, label]) =>
              h(
                'button',
                {
                  class: `seg-btn seg-text${s.theme === mode ? ' on' : ''}`,
                  onclick: () => store.setSetting('theme', mode),
                },
                label,
              ),
            ),
          ),
        ),
        row(
          '배경화면',
          h(
            'div',
            { class: 'st-walls' },
            ...Array.from({ length: WALLPAPERS }, (_, i) =>
              h('button', {
                class: `st-wall${s.wallpaper === i ? ' on' : ''}`,
                'data-wallpaper': String(i),
                'aria-label': `배경화면 ${i + 1}`,
                onclick: () => store.setSetting('wallpaper', i),
              }),
            ),
          ),
        ),
        row(
          'macOS 스타일 커서',
          cursor,
          '끄면 Windows 기본 커서를 씁니다. 웹페이지에는 새로 열 때부터 적용됩니다.',
        ),
      ),
      h(
        'div',
        { class: 'st-group' },
        row(
          '검색 엔진',
          engine,
          '주소창에 주소가 아닌 글을 입력하면 이 검색 엔진으로 검색합니다.',
        ),
      ),
      h(
        'div',
        { class: 'st-group' },
        row(
          '방문 기록',
          h(
            'button',
            {
              class: 'btn',
              disabled: store.state.history.length === 0,
              onclick: () => store.clearHistory(),
            },
            '기록 지우기',
          ),
          `저장된 기록 ${store.state.history.length}개`,
        ),
      ),
    );
  };
  render();
  const unsubscribe = store.subscribe(render);
  win.onClose = () => {
    unsubscribe();
    settingsWin = null;
  };
}

export function openAbout() {
  if (aboutWin && !aboutWin.closed) {
    show(aboutWin);
    return;
  }
  const win = wm.open({
    kind: 'about',
    appName: 'KSG',
    title: 'KSG에 관하여',
    width: 300,
    height: 300,
    resizable: false,
  });
  aboutWin = win;
  win.body.classList.add('about-body');
  win.body.append(
    h('img', {
      class: 'about-logo',
      src: appIcon,
      alt: '',
      draggable: 'false',
    }),
    h('h2', null, 'KSG'),
    h('p', null, '버전 1.0.0'),
    h(
      'p',
      { class: 'about-note' },
      'Electron(Chromium) 기반의 macOS 스타일 브라우저',
    ),
  );
  win.onClose = () => {
    aboutWin = null;
  };
}
