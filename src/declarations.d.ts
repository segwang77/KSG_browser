/// <reference types="electron" />
/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
declare module '*.css';

interface Window {
  bridge: import('./shared/types').Bridge;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.png?inline' {
  const dataUrl: string;
  export default dataUrl;
}
