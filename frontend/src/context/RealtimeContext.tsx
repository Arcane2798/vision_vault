import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { config } from '@/config/env';
import { realtime } from '@/services/realtime';
import type { CameraStatus, ConnectionState, Detection, Incident } from '@/types';
import { useAuth } from './AuthContext';

const DETECTION_TTL_MS = 4000;
const MAX_ALERTS = 20;

interface RealtimeContextValue {
  connection: ConnectionState;
  /** newest first; alerts the user has not dismissed from the bell */
  alerts: Incident[];
  unseen: number;
  markSeen(): void;
  clearAlerts(): void;
  /** latest detections per camera (only those above VITE_MIN_CONFIDENCE, kept for a few seconds) */
  detectionsFor(cameraId: string): Detection[];
  /** status overrides pushed by the backend since the camera list was loaded */
  cameraStatus: Record<string, CameraStatus>;
  /** a short-lived toast for the newest alert */
  toast: Incident | null;
  dismissToast(): void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [connection, setConnection] = useState<ConnectionState>(config.realtime === 'off' ? 'disabled' : 'connecting');
  const [alerts, setAlerts] = useState<Incident[]>([]);
  const [unseen, setUnseen] = useState(0);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [cameraStatus, setCameraStatus] = useState<Record<string, CameraStatus>>({});
  const [toast, setToast] = useState<Incident | null>(null);

  useEffect(() => {
    if (!user) return;
    const offState = realtime.onState(setConnection);
    const offEvent = realtime.onEvent((e) => {
      if (e.type === 'alert') {
        setAlerts((a) => [e.data, ...a.filter((x) => x.id !== e.data.id)].slice(0, MAX_ALERTS));
        setUnseen((n) => n + 1);
        setToast(e.data);
      } else if (e.type === 'detection') {
        if (e.data.confidence < config.minConfidence) return;
        setDetections((d) => [...d.filter((x) => Date.now() - new Date(x.timestamp).getTime() < DETECTION_TTL_MS), e.data]);
      } else if (e.type === 'camera_status') {
        setCameraStatus((s) => ({ ...s, [e.data.cameraId]: e.data.status }));
      }
    });
    realtime.start();
    return () => {
      offState();
      offEvent();
      realtime.stop();
    };
  }, [user]);

  // drop expired detection boxes even when no new events arrive
  useEffect(() => {
    const t = window.setInterval(() => setDetections((d) => d.filter((x) => Date.now() - new Date(x.timestamp).getTime() < DETECTION_TTL_MS)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  const detectionsFor = useCallback((cameraId: string) => detections.filter((d) => d.cameraId === cameraId), [detections]);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      connection,
      alerts,
      unseen,
      markSeen: () => setUnseen(0),
      clearAlerts: () => (setAlerts([]), setUnseen(0)),
      detectionsFor,
      cameraStatus,
      toast,
      dismissToast: () => setToast(null),
    }),
    [connection, alerts, unseen, detectionsFor, cameraStatus, toast],
  );
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be used inside <RealtimeProvider>');
  return ctx;
}
