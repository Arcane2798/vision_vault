/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string;
  readonly VITE_DATA_MODE?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_REALTIME?: string;
  readonly VITE_REALTIME_URL?: string;
  readonly VITE_AUTH_ENABLED?: string;
  readonly VITE_REFRESH_INTERVAL_MS?: string;
  readonly VITE_MIN_CONFIDENCE?: string;
  readonly VITE_TIMEZONE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
