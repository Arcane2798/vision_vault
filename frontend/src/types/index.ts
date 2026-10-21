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
  /** true once the H.264 clip is playable; false while recording/converting and when there is no clip. Missing (older backends) = ready. */
  clipReady?: boolean;
  /** the alert was shown to the township guard house (intrusion only; /guard screen, plus Telegram when configured). Missing on older backends. */
  guardNotified?: boolean;
  /** when the guard house acknowledged the alert on the /guard screen (ISO), null until then. Missing on older backends. */
  guardAcknowledgedAt?: string | null;
  /** the guard's note, e.g. "Guard dispatched" */
  guardAckNote?: string | null;
  /** items seen near the unknown person, e.g. ["knife"] (AI prototype). Missing on older backends. */
  items?: string[];
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
export type SecurityLevel = 'normal' | 'high';

/** Daily sleep time: auto High between start and end (local "HH:MM", may cross midnight). API name: night. */
export interface NightSchedule {
  enabled: boolean;
  start: string;
  end: string;
}

/** Away from home (e.g. a vacation): auto High between from and to (ISO; null = open-ended). */
export interface AwaySchedule {
  enabled: boolean;
  from: string | null;
  to: string | null;
}

/** Why a schedule forces High right now. */
export type HighReason = 'sleep' | 'away';

/** GET /api/security */
export interface SecuritySettings {
  /** level chosen by the homeowner */
  level: SecurityLevel;
  /** level the engine actually uses now (high while the sleep time or away dates apply) */
  effectiveLevel: SecurityLevel;
  /** set while a schedule forces High (also when High is chosen by hand) */
  highReason: HighReason | null;
  night: NightSchedule;
  away: AwaySchedule;
  updatedAt: string | null;
}

/** PUT /api/security */
export interface SecurityUpdate {
  level?: SecurityLevel;
  night?: Partial<NightSchedule>;
  away?: Partial<AwaySchedule>;
}

/** A recorded video in the backend's test_videos/ folder. */
export interface TestVideo {
  name: string;
  sizeBytes: number;
  modifiedAt: string;
}

/** GET /api/source - what the engine is watching: the live camera or a test video (played once). */
export interface VideoSource {
  kind: 'camera' | 'file';
  /** test video file name when kind is 'file' */
  name: string | null;
  /** the test video reached its end (engine holds the last frame) */
  finished: boolean;
  /** 0..1 position in the test video, null for the camera */
  progress: number | null;
  videos: TestVideo[];
}

/** PUT /api/source */
export type VideoSourceUpdate = { kind: 'camera' } | { kind: 'file'; name: string };

/** GET /api/status - live engine state, polled every few seconds. */
export interface LiveStatus {
  running: boolean;
  fps: number;
  /** unknown people currently in view */
  unknownCount: number;
  cameraName: string;
  /** effective level (night schedule applied) */
  securityLevel?: SecurityLevel;
  /** who is in view right now (missing on older backends) */
  peopleInView?: PersonInView[];
}

/** family = resident (green), guest_allowed = visitor in window (cyan), guest_outside = visitor outside window (orange), unknown (red). */
export type InViewKind = 'family' | 'guest_allowed' | 'guest_outside' | 'unknown';

export interface PersonInView {
  name: string;
  kind: InViewKind;
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

/** One turn of the assistant chat (plain text, newest last). */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** POST /api/chat */
export interface ChatRequest {
  messages: ChatMessage[];
}

/** Values the assistant suggests for a visitor who is not enrolled yet (dates ISO, or null). */
export interface PersonPrefill {
  name?: string | null;
  role?: PersonRole | null;
  validFrom?: string | null;
  validTo?: string | null;
}

/**
 * A change the assistant proposes. It is never executed by the backend: the homeowner confirms it and the
 * frontend runs it through the normal services ('request'), or opens the prefilled Add-person form ('add_person').
 */
export type PendingAction =
  | { summary: string; kind: 'request'; method: 'PATCH' | 'PUT'; path: string; body: Record<string, unknown> }
  | { summary: string; kind: 'add_person'; prefill: PersonPrefill };

/** POST /api/chat response. 503 when the backend has no AI key configured (detail says which .env key to add). */
export interface ChatResponse {
  reply: string;
  pendingAction: PendingAction | null;
}

/**
 * GET /api/guard/alerts item - what the township guard house sees.
 * Deliberately has no identity, people or face data: only the address and the stranger's snapshot/clip.
 */
export interface GuardAlert {
  id: string;
  timestamp: string;
  /** HOUSE_UNIT on the backend, e.g. "No. 12, Jalan Elmina 3/1" (fallback "This home") */
  houseUnit: string;
  cameraName: string;
  snapshotUrl: string | null;
  clipUrl: string | null;
  /** play clipUrl only when true */
  clipReady: boolean;
  /** first acknowledgement time (ISO), null while unacknowledged */
  acknowledgedAt: string | null;
  ackNote: string | null;
  /** items seen near the unknown person, e.g. ["knife"] */
  items?: string[];
}

/** POST /api/guard/alerts/{id}/ack */
export interface GuardAckRequest {
  /** at most 200 characters */
  note?: string;
}

export type RealtimeEvent =
  | { type: 'alert'; data: Incident }
  | { type: 'detection'; data: Detection }
  | { type: 'camera_status'; data: { cameraId: string; status: CameraStatus } };

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'disabled';
