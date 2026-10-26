import { actions } from './actions';
import { store } from './store';
import {
  clamp,
  confirmBox,
  folderIcon,
  h,
  inlineEdit,
  onDrag,
  showMenu,
  type MenuItem,
} from './util';
import { wm } from './wm';

let root: HTMLElement;
let selected: string | null = null;
let renaming = false;

const WALLPAPER_COUNT = 5;

export function folderMenu(folderId: string, rename?: () => void): MenuItem[] {
  const folder = store.folder(folderId);
  if (!folder) return [];
  return [
    { label: '열기', action: () => actions.openFinder(folderId) },
    {
      label: '모든 주소를 탭으로 열기',
      disabled: folder.items.length === 0,
      action: () => folder.items.forEach((b) => actions.openUrl(b.url)),
    },
    { separator: true },
    { label: '이름 변경', disabled: !rename, action: rename },
    { label: '삭제', action: () => deleteFolder(folderId) },
  ];
}

export async function deleteFolder(folderId: string) {
  const folder = store.folder(folderId);
  if (!folder) return;
  if (folder.items.length > 0) {
    const ok = await confirmBox(
      `'${folder.name}' 폴더를 삭제하시겠습니까?`,
      `안에 있는 주소 ${folder.items.length}개도 함께 삭제됩니다.`,
    );
    if (!ok) return;
  }
  if (selected === folderId) selected = null;
  store.removeFolder(folderId);
}

function startRename(folderId: string) {
  const label = root.querySelector<HTMLElement>(
    `[data-folder="${folderId}"] .desk-label`,
  );
  const folder = store.folder(folderId);
  if (!label || !folder) return;
  renaming = true;
  inlineEdit(
    label,
    folder.name,
    (name) => store.renameFolder(folderId, name),
    () => {
      renaming = false;
      render();
    },
  );
}

function render() {
  if (renaming) return;
  root.replaceChildren();
  for (const folder of store.state.folders) {
    const el = h(
      'div',
      {
        class: `desk-icon${selected === folder.id ? ' selected' : ''}`,
        'data-folder': folder.id,
        'data-drop-folder': folder.id,
        style: `left:${folder.x}px;top:${folder.y}px`,
        tabindex: '0',
        title: `${folder.name} · 주소 ${folder.items.length}개`,
      },
      h('div', { class: 'desk-art' }, folderIcon(64)),
      h('span', { class: 'desk-label' }, folder.name),
    );

    el.addEventListener('dblclick', () => actions.openFinder(folder.id));
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      select(folder.id);
      showMenu(
        folderMenu(folder.id, () => startRename(folder.id)),
        e.clientX,
        e.clientY,
      );
    });

    // 폴더를 끌어서 바탕화면 어디로든 옮길 수 있습니다
    onDrag(el, {
      start: (e) => {
        if ((e.target as HTMLElement).closest('input')) return false;
        select(folder.id);
        wm.blur();
        return { x: folder.x, y: folder.y, node: el };
      },
      move: (_e, dx, dy, origin) => {
        const area = root.getBoundingClientRect();
        const x = clamp(origin.x + dx, 0, area.width - 96);
        const y = clamp(origin.y + dy, 0, area.height - wm.dockHeight() - 96);
        origin.node.style.left = `${x}px`;
        origin.node.style.top = `${y}px`;
        origin.node.classList.add('moving');
      },
      end: (_e, origin, moved) => {
        if (!moved) return;
        store.moveFolder(
          folder.id,
          parseFloat(origin.node.style.left),
          parseFloat(origin.node.style.top),
        );
      },
    });
    root.append(el);
  }
}

function select(id: string | null) {
  if (selected === id) return;
  selected = id;
  for (const el of root.querySelectorAll<HTMLElement>('.desk-icon')) {
    el.classList.toggle('selected', el.dataset.folder === id);
  }
}

function applyWallpaper() {
  document.body.dataset.wallpaper = String(
    store.state.settings.wallpaper % WALLPAPER_COUNT,
  );
}

export function initDesktop(el: HTMLElement) {
  root = el;
  render();
  applyWallpaper();
  store.subscribe(() => {
    render();
    applyWallpaper();
  });

  root.addEventListener('pointerdown', (e) => {
    if (e.target === root) {
      select(null);
      wm.blur();
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
  });

  root.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (e.target !== root) return;
    const area = root.getBoundingClientRect();
    showMenu(
      [
        {
          label: '새로운 폴더',
          action: () => {
            const folder = store.addFolder(
              '새 폴더',
              e.clientX - area.left - 46,
              e.clientY - area.top - 40,
            );
            select(folder.id);
            startRename(folder.id);
          },
        },
        { separator: true },
        { label: '폴더 정렬', action: () => store.arrangeFolders() },
        {
          label: '배경화면 바꾸기',
          action: () =>
            store.setSetting(
              'wallpaper',
              (store.state.settings.wallpaper + 1) % WALLPAPER_COUNT,
            ),
        },
        { separator: true },
        { label: '새 KSG 창', action: () => actions.newWindow() },
        { label: '설정…', action: () => actions.openSettings() },
      ],
      e.clientX,
      e.clientY,
    );
  });

  // 바탕화면 폴더가 선택된 상태에서의 키보드 조작 (macOS와 같이 Enter는 이름 변경)
  window.addEventListener('keydown', (e) => {
    if (!selected || wm.active || renaming) return;
    if ((e.target as HTMLElement).closest?.('input, textarea, select')) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      startRename(selected);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      void deleteFolder(selected);
    } else if (e.key === 'o' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      actions.openFinder(selected);
    }
  });
}

export const WALLPAPERS = WALLPAPER_COUNT;
