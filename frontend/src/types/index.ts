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
  /** backend event_type: 'intrusion' | 'guest_outside_window' (display text via eventTypeLabel) */
  label: string;
  /** fixed 1.0 for rule-based events - hidden in the UI for those */
  confidence: number;
  /** matched person's name, or "unknown" (events.identity) */
  identity?: string | null;
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

/** Security level (feature 5.1): how strict the intrusion rules are. */
export type SecurityLevel = 'home' | 'normal' | 'away';

/** Night schedule: auto Away between start and end (local "HH:MM", may cross midnight). */
export interface NightSchedule {
  enabled: boolean;
  start: string;
  end: string;
}

/** GET /api/security */
export interface SecuritySettings {
  /** level chosen by the homeowner */
  level: SecurityLevel;
  /** level the engine actually uses now (away while the night schedule applies) */
  effectiveLevel: SecurityLevel;
  night: NightSchedule;
  updatedAt: string | null;
}

/** PUT /api/security */
export interface SecurityUpdate {
  level?: SecurityLevel;
  night?: Partial<NightSchedule>;
}

/** GET /api/status - live engine state, polled every few seconds. */
export interface LiveStatus {
  running: boolean;
  fps: number;
  /** unknown people currently in view */
  unknownCount: number;
  cameraName: string;
  /** effective level (night schedule applied) */
  securityLevel?: SecurityLevel;
}

/** Backend role values. Display text: family -> "Resident", guest -> "Visitor" (see utils/format.ts). */
export type PersonRole = 'family' | 'guest';

/** GET /api/people item. Names double as the faces/<name>/ folder. */
export interface Person {
  id: number;
  name: string;
  role: PersonRole;
  validFrom: string | null; // ISO, visitors only
  validTo: string | null;
  /** family, or a visitor whose window contains now */
  active: boolean;
  photoCount: number;
  /** backend path, e.g. "/api/people/3/photo" - resolve with backendUrl() */
  photoUrl: string;
  /** last time the camera recognised this person (ISO) */
  lastSeen: string | null;
  createdAt: string;
}

/** POST /api/people (multipart) */
export interface PersonInput {
  name: string;
  role: PersonRole;
  validFrom?: string;
  validTo?: string;
  photos: File[];
}

/** PATCH /api/people/{id} (JSON) */
export interface PersonUpdate {
  role?: PersonRole;
  validFrom?: string | null;
  validTo?: string | null;
}

export type RealtimeEvent =
  | { type: 'alert'; data: Incident }
  | { type: 'detection'; data: Detection }
  | { type: 'camera_status'; data: { cameraId: string; status: CameraStatus } };

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'disabled';
