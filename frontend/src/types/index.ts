/** Domain types shared by services, pages and components. They mirror the backend API contract (see README). */

export type Role = 'admin' | 'operator' | 'viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface AuthSession {
  token: string;
  user: User;
}

export type CameraStatus = 'online' | 'offline' | 'degraded';

export interface Camera {
  id: string;
  name: string;
  location: string;
  /** HTML5-playable URL (mp4 / webm, or HLS where the browser supports it). Empty = no stream configured. */
  streamUrl: string;
  status: CameraStatus;
  lastSeen: string; // ISO 8601
}

export type CameraInput = Pick<Camera, 'name' | 'location' | 'streamUrl'>;

/** Normalised box: all values 0-1 relative to the frame size. */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A raw AI prediction. It is NOT proof of an intrusion. */
export interface Detection {
  id: string;
  cameraId: string;
  label: string;
  confidence: number; // 0-1
  bbox: BoundingBox;
  timestamp: string;
}

/**
 * new           - AI flagged it, nobody has looked yet (potential incident)
 * under_review  - a person is checking it
 * confirmed     - a person confirmed a real intrusion
 * dismissed     - false alarm
 */
export type IncidentStatus = 'new' | 'under_review' | 'confirmed' | 'dismissed';

export interface Incident {
  id: string;
  cameraId: string;
  cameraName: string;
  location: string;
  timestamp: string;
  label: string;
  confidence: number;
  status: IncidentStatus;
  snapshotUrl?: string;
  clipUrl?: string;
  detections: Detection[];
  reviewedBy?: string;
  reviewedAt?: string;
  notes?: string;
}

export interface IncidentQuery {
  search?: string;
  cameraId?: string;
  status?: IncidentStatus | '';
  from?: string; // yyyy-mm-dd
  to?: string;
  sort?: 'newest' | 'oldest';
}

export interface DashboardSummary {
  activeCameras: number;
  totalCameras: number;
  incidentsToday: number;
  totalIncidents: number;
  unresolvedAlerts: number;
}

export interface TrendPoint {
  date: string; // yyyy-mm-dd
  potential: number;
  confirmed: number;
}

export type RealtimeEvent =
  | { type: 'alert'; data: Incident }
  | { type: 'detection'; data: Detection }
  | { type: 'camera_status'; data: { cameraId: string; status: CameraStatus } };

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'disabled';
