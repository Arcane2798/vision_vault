/**
 * Real-time events (alerts, live detections, camera status) over WebSocket, SSE, or a mock generator.
 * Reconnects automatically with back-off and reports its state so the UI can show "disconnected".
 */
import { config } from '@/config/env';
import { DETECTION_LABELS, makeLiveIncident, randomBox } from '@/mocks/data';
import { mockApi } from '@/mocks/mockApi';
import type { ConnectionState, RealtimeEvent } from '@/types';
import { tokenStore } from './apiClient';

type Listener = (e: RealtimeEvent) => void;
type StateListener = (s: ConnectionState) => void;

export interface RealtimeClient {
  start(): void;
  stop(): void;
  onEvent(fn: Listener): () => void;
  onState(fn: StateListener): () => void;
}

function createClient(open: (emit: Listener, setState: StateListener) => () => void): RealtimeClient {
  const listeners = new Set<Listener>();
  const stateListeners = new Set<StateListener>();
  let close: (() => void) | null = null;
  const emit: Listener = (e) => listeners.forEach((fn) => fn(e));
  const setState: StateListener = (s) => stateListeners.forEach((fn) => fn(s));
  return {
    start() {
      if (!close) close = open(emit, setState);
    },
    stop() {
      close?.();
      close = null;
    },
    onEvent(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    onState(fn) {
      stateListeners.add(fn);
      return () => stateListeners.delete(fn);
    },
  };
}

function parse(raw: string): RealtimeEvent | null {
  try {
    const e = JSON.parse(raw);
    return e && typeof e.type === 'string' && e.data ? (e as RealtimeEvent) : null;
  } catch {
    return null;
  }
}

function withToken(url: string) {
  const t = tokenStore.get();
  if (!t) return url;
  const u = new URL(url);
  u.searchParams.set('token', t);
  return u.toString();
}

const websocketClient = () =>
  createClient((emit, setState) => {
    let ws: WebSocket | null = null;
    let retry = 0;
    let timer: number | undefined;
    let stopped = false;
    const connect = () => {
      setState('connecting');
      ws = new WebSocket(withToken(config.realtimeUrl));
      ws.onopen = () => {
        retry = 0;
        setState('connected');
      };
      ws.onmessage = (m) => {
        const e = parse(String(m.data));
        if (e) emit(e);
      };
      ws.onclose = () => {
        setState('disconnected');
        if (!stopped) timer = window.setTimeout(connect, Math.min(30000, 1000 * 2 ** retry++));
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      ws?.close();
    };
  });

const sseClient = () =>
  createClient((emit, setState) => {
    setState('connecting');
    const es = new EventSource(withToken(config.realtimeUrl));
    es.onopen = () => setState('connected');
    es.onerror = () => setState(es.readyState === EventSource.CLOSED ? 'disconnected' : 'connecting');
    es.onmessage = (m) => {
      const e = parse(m.data);
      if (e) emit(e);
    };
    return () => es.close();
  });

/** Sample stream: a detection every ~2.5 s on a random online camera, a new potential incident every ~45 s. */
const mockClient = () =>
  createClient((emit, setState) => {
    setState('connecting');
    const ready = window.setTimeout(() => setState('connected'), 600);
    const det = window.setInterval(() => {
      const online = mockApi.cameras.filter((c) => c.status !== 'offline');
      const cam = online[Math.floor(Math.random() * online.length)];
      if (!cam) return;
      emit({
        type: 'detection',
        data: {
          id: crypto.randomUUID(),
          cameraId: cam.id,
          label: DETECTION_LABELS[Math.floor(Math.random() * DETECTION_LABELS.length)],
          confidence: 0.35 + Math.random() * 0.6,
          bbox: randomBox(),
          timestamp: new Date().toISOString(),
        },
      });
    }, 2500);
    const alert = window.setInterval(() => {
      const inc = makeLiveIncident();
      mockApi.pushIncident(inc);
      emit({ type: 'alert', data: inc });
    }, 45000);
    return () => [ready, det, alert].forEach((t) => (clearTimeout(t), clearInterval(t)));
  });

const disabledClient = () =>
  createClient((_emit, setState) => {
    setState('disabled');
    return () => {};
  });

export const realtime: RealtimeClient = { websocket: websocketClient, sse: sseClient, mock: mockClient, off: disabledClient }[config.realtime]();
