// 메뉴 막대, Dock, 단축키, 폴더 창이 함께 쓰는 동작 모음.
// 모듈끼리 서로를 직접 불러오지 않도록 renderer.ts에서 채워 넣습니다.
export interface Actions {
  newWindow(url?: string, isPrivate?: boolean): void;
  /** 가장 위에 있는 브라우저 창의 새 탭으로 엽니다 (없으면 새 창) */
  openUrl(url: string, opts?: { newWindow?: boolean }): void;
  /** location: 'root' | 'history' | 폴더 id */
  openFinder(location?: string): void;
  openSettings(): void;
  openAbout(): void;
  shortcut(name: string): void;
}

export const actions = {} as Actions;
