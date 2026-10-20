/**
 * Typed access to the runtime configuration.
 * Values come from .env.local (written by `npm run configure`) - never read import.meta.env elsewhere.
 */
export type DataMode = 'mock' | 'live';
export type RealtimeMode = 'websocket' | 'sse' | 'mock' | 'off';

const env = import.meta.env;

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  appName: env.VITE_APP_NAME || 'Township CCTV',
  dataMode: oneOf<DataMode>(env.VITE_DATA_MODE, ['mock', 'live'], 'mock'),
  apiBaseUrl: (env.VITE_API_BASE_URL || 'http://localhost:8000/api').replace(/\/$/, ''),
  realtime: oneOf<RealtimeMode>(env.VITE_REALTIME, ['websocket', 'sse', 'mock', 'off'], 'mock'),
  realtimeUrl: env.VITE_REALTIME_URL || 'ws://localhost:8000/ws/events',
  authEnabled: env.VITE_AUTH_ENABLED !== 'false',
  refreshIntervalMs: Math.max(2000, num(env.VITE_REFRESH_INTERVAL_MS, 15000)),
  minConfidence: Math.min(1, Math.max(0, num(env.VITE_MIN_CONFIDENCE, 0.5))),
  timezone: env.VITE_TIMEZONE || 'Asia/Kuala_Lumpur',
} as const;

export const isMock = config.dataMode === 'mock';
