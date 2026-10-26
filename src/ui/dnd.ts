import { store } from './store';
import { h, onDrag } from './util';

/**
 * 주소(책갈피)를 끌어서 다른 폴더에 놓을 수 있게 합니다.
 * data-drop-folder 속성이 있는 요소(바탕화면 폴더, 폴더 창의 사이드바 등)가 놓는 대상입니다.
 */
export function makeBookmarkDraggable(
  el: HTMLElement,
  bookmarkId: string,
  label: string,
) {
  let ghost: HTMLElement | null = null;
  let target: HTMLElement | null = null;

  const setTarget = (next: HTMLElement | null) => {
    if (target === next) return;
    target?.classList.remove('drop-hover');
    target = next;
    target?.classList.add('drop-hover');
  };

  onDrag(el, {
    threshold: 5,
    start: (e) =>
      (e.target as HTMLElement).closest('input, button') ? false : true,
    move: (e) => {
      if (!ghost) {
        ghost = h('div', { class: 'drag-ghost' }, label);
        document.body.append(ghost);
        el.classList.add('drag-source');
      }
      ghost.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 10}px)`;
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const candidate =
        under?.closest<HTMLElement>('[data-drop-folder]') ?? null;
      const from = store.findBookmark(bookmarkId)?.folder.id;
      setTarget(
        candidate && candidate.dataset.dropFolder !== from ? candidate : null,
      );
    },
    end: () => {
      const folderId = target?.dataset.dropFolder;
      setTarget(null);
      ghost?.remove();
      ghost = null;
      el.classList.remove('drag-source');
      if (folderId) store.moveBookmark(bookmarkId, folderId);
    },
  });
}
