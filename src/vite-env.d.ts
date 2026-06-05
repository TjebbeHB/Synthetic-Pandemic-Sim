/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" in the slim tablet build (set via .env.tablet + --mode tablet). */
  readonly VITE_TABLET?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
