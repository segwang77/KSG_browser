// macOS 느낌의 마우스 커서. 직접 그린 SVG이며 Apple의 원본 이미지를 쓰지 않습니다.
// 메인 프로세스(웹페이지에 주입)와 렌더러(직접 그리는 UI) 양쪽에서 함께 씁니다.

const svg = (body: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>${body}</svg>`,
  )}")`;

const shadow =
  "<defs><filter id='s' x='-30%' y='-30%' width='160%' height='170%'><feDropShadow dx='0' dy='1' stdDeviation='1' flood-opacity='.35'/></filter></defs>";

/** 검은 화살표 + 흰 테두리 */
export const CURSOR_ARROW = `${svg(
  `${shadow}<path filter='url(#s)' d='M6 3.2v20.2l4.9-4.5 3.3 7.7 3.1-1.3-3.3-7.6h6.7z' fill='#000' stroke='#fff' stroke-width='1.5' stroke-linejoin='round'/>`,
)} 6 3`;

/** 링크 위에 올렸을 때의 손 모양 */
export const CURSOR_HAND = `${svg(
  `${shadow}<path filter='url(#s)' d='M12.2 4.6a1.9 1.9 0 0 1 3.8 0v8.1l.5-.9a1.8 1.8 0 0 1 3.3.9v.5a1.8 1.8 0 0 1 3.4.7v.7a1.7 1.7 0 0 1 3.2.9v5.6c0 4.3-3 7.4-7.2 7.4h-1.9c-2.5 0-4.3-1.1-5.7-3.1l-4.4-6.3a1.9 1.9 0 0 1 3-2.3l2 2.2z' fill='#fff' stroke='#000' stroke-width='1.4' stroke-linejoin='round'/>`,
)} 14 3`;

/** 웹페이지 안에 주입하는 CSS */
export const GUEST_CURSOR_CSS = `
html { cursor: ${CURSOR_ARROW}, default; }
a[href], a[href] *, button, button *, summary, label[for], select,
[role="button"], [role="link"], [role="tab"], [role="menuitem"],
input[type="button"], input[type="submit"], input[type="reset"],
input[type="checkbox"], input[type="radio"] {
  cursor: ${CURSOR_HAND}, pointer;
}
`;
