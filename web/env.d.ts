/// <reference types="vite/client" />

export {}

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    fill?: boolean
  }
}

interface ImportMetaEnv {
  readonly VITE_BASE_API: string
  readonly VITE_TARGET: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
