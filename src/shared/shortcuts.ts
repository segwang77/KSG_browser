export interface KeyInput {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

/**
 * 키 입력을 브라우저 동작 이름으로 바꿉니다.
 * 웹페이지에 포커스가 있을 때는 메인 프로세스가, 직접 그린 UI에 있을 때는 렌더러가 이 함수를 씁니다.
 */
export function shortcutName(input: KeyInput): string | null {
  const key = input.key.toLowerCase();
  if (key === 'f11') return 'fullscreen';
  if (key === 'f5') return 'reload';
  if (input.alt && !input.ctrl) {
    if (key === 'arrowleft') return 'back';
    if (key === 'arrowright') return 'forward';
    return null;
  }
  if (!input.ctrl || input.alt) return null;
  if (input.shift) {
    if (key === 'n') return 'new-private-window';
    if (key === 'tab') return 'prev-tab';
    if (key === 't') return 'reopen-tab';
    return null;
  }
  switch (key) {
    case 't':
      return 'new-tab';
    case 'w':
      return 'close-tab';
    case 'l':
      return 'focus-address';
    case 'r':
      return 'reload';
    case 'n':
      return 'new-window';
    case 'f':
      return 'find';
    case 'd':
      return 'bookmark';
    case 'tab':
      return 'next-tab';
    case '=':
    case '+':
      return 'zoom-in';
    case '-':
      return 'zoom-out';
    case '0':
      return 'zoom-reset';
    case 'q':
      return 'quit';
    default:
      return null;
  }
}
