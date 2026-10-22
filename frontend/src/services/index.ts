/**
 * Service layer - the ONLY place pages get data from.
 * In mock mode every call goes to the in-memory sample backend; in live mode to the REST API.
 * Endpoint list (backend contract) is documented in README.md.
 */
import { isMock } from '@/config/env';
import { mockApi } from '@/mocks/mockApi';
import type { AuthSession, Camera, CameraInput, ChatRequest, ChatResponse, DashboardSummary, FamilyMember, GuardAckRequest, HouseMap, MapState, MapStatus, GuardAlert, Incident, IncidentQuery, IncidentStatus, LiveStatus, Movement, Person, PersonInput, PersonUpdate, SecuritySettings, SecurityUpdate, TestVideo, TrendPoint, User, VideoSource, VideoSourceUpdate } from '@/types';
import { api, backendUrl } from './apiClient';

export const authService = {
  login: (email: string, password: string): Promise<AuthSession> =>
    isMock ? mockApi.login(email, password) : api<AuthSession>('/auth/login', { method: 'POST', body: { email, password } }),
  me: (token: string): Promise<User> => (isMock ? mockApi.me(token) : api<User>('/auth/me')),
  logout: (): Promise<void> => (isMock ? Promise.resolve() : api<void>('/auth/logout', { method: 'POST' }).catch(() => undefined)),
};

export const dashboardService = {
  summary: (): Promise<DashboardSummary> => (isMock ? mockApi.getSummary() : api('/dashboard/summary')),
  trend: (days = 14): Promise<TrendPoint[]> => (isMock ? mockApi.getTrend(days) : api('/dashboard/trend', { query: { days: String(days) } })),
};

export const cameraService = {
  list: (): Promise<Camera[]> => (isMock ? mockApi.listCameras() : api('/cameras')),
  create: (input: CameraInput): Promise<Camera> => (isMock ? mockApi.addCamera(input) : api('/cameras', { method: 'POST', body: input })),
  update: (id: string, input: CameraInput): Promise<Camera> => (isMock ? mockApi.updateCamera(id, input) : api(`/cameras/${id}`, { method: 'PUT', body: input })),
  remove: (id: string): Promise<void> => (isMock ? mockApi.deleteCamera(id) : api(`/cameras/${id}`, { method: 'DELETE' })),
};

/** Live mode only (mock mode is not maintained for new endpoints). */
export const statusService = {
  get: (): Promise<LiveStatus> => api('/status', { timeoutMs: 5000 }),
};

/** Security on / off with an optional off-until time (live mode only). */
export const securityService = {
  get: (): Promise<SecuritySettings> => api('/security'),
  update: (patch: SecurityUpdate): Promise<SecuritySettings> => api('/security', { method: 'PUT', body: patch }),
};

const UPLOAD_TIMEOUT_MS = 60000; // the backend computes face embeddings for new photos

function photoForm(photos: File[], fields: Record<string, string | undefined> = {}) {
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => v !== undefined && form.append(k, v));
  photos.forEach((p) => form.append('photos', p, p.name));
  return form;
}

/** Residents & visitors (live mode only). */
export const peopleService = {
  list: (): Promise<Person[]> => api('/people'),
  /** re-read faces/ (photos copied in by hand) and re-embed changed folders; returns the list */
  reloadFaces: (): Promise<Person[]> => api('/people/reload', { method: 'POST', timeoutMs: UPLOAD_TIMEOUT_MS }),
  create: ({ photos, ...fields }: PersonInput): Promise<Person> =>
    api('/people', { method: 'POST', body: photoForm(photos, { ...fields }), timeoutMs: UPLOAD_TIMEOUT_MS }),
  update: (id: number, patch: PersonUpdate): Promise<Person> => api(`/people/${id}`, { method: 'PATCH', body: patch }),
  remove: (id: number): Promise<void> => api(`/people/${id}`, { method: 'DELETE' }),
  addPhotos: (id: number, photos: File[]): Promise<Person> =>
    api(`/people/${id}/photos`, { method: 'POST', body: photoForm(photos), timeoutMs: UPLOAD_TIMEOUT_MS }),
  /** thumbnail URL on the backend host; photoCount busts the browser cache after uploads */
  photoSrc: (p: Person): string => {
    const url = new URL(backendUrl(p.photoUrl));
    url.searchParams.set('v', String(p.photoCount));
    return url.href;
  },
};

/** Family tracker (side feature 2): residents home / out. */
export const familyService = {
  list: (): Promise<FamilyMember[]> => api('/family'),
  /** correct the tracker by hand */
  setStatus: (id: number, status: 'home' | 'out'): Promise<FamilyMember> => api(`/family/${id}/status`, { method: 'PUT', body: { status } }),
  movements: (limit = 20): Promise<Movement[]> => api('/family/movements', { query: { limit: String(limit) } }),
  photoSrc: (m: FamilyMember): string => backendUrl(m.photoUrl),
};

const VIDEO_UPLOAD_TIMEOUT_MS = 10 * 60000; // test videos can be hundreds of MB

/** House map + safe path (side features 3 & 4). */
export const mapService = {
  get: (): Promise<HouseMap> => api('/map'),
  /** t = replay time in seconds (recorded cameras); live = add the live camera */
  state: (t: number | undefined, live: boolean): Promise<MapState> =>
    api('/map/state', { query: { t: t === undefined ? undefined : t.toFixed(2), live: live ? 'true' : undefined } }),
  process: (): Promise<MapStatus> => api('/map/process', { method: 'POST' }),
  /** the recorded video for one room camera (saved under the file name in house_map.json) */
  uploadVideo: (cameraId: string, video: File): Promise<HouseMap> => {
    const form = new FormData();
    form.append('video', video, video.name);
    return api(`/map/cameras/${encodeURIComponent(cameraId)}/video`, { method: 'POST', body: form, timeoutMs: VIDEO_UPLOAD_TIMEOUT_MS });
  },
  /** seconds into the replay at which this camera's video starts (no re-processing needed) */
  setOffset: (cameraId: string, offset: number): Promise<HouseMap> =>
    api(`/map/cameras/${encodeURIComponent(cameraId)}`, { method: 'PATCH', body: { offset } }),
  status: (): Promise<MapStatus> => api('/map/status'),
};


/** Video source: live camera or a recorded test video (live mode only). */
export const sourceService = {
  get: (): Promise<VideoSource> => api('/source', { timeoutMs: 5000 }),
  set: (source: VideoSourceUpdate): Promise<VideoSource> => api('/source', { method: 'PUT', body: source }),
  upload: (video: File): Promise<TestVideo> => {
    const form = new FormData();
    form.append('video', video, video.name);
    return api('/source/videos', { method: 'POST', body: form, timeoutMs: VIDEO_UPLOAD_TIMEOUT_MS });
  },
};

const CHAT_TIMEOUT_MS = 90000; // the assistant may call several tools before it answers

/** AI assistant (live mode only). Proposed changes come back as pendingAction and are never applied by the backend. */
export const chatService = {
  send: (body: ChatRequest): Promise<ChatResponse> => api('/chat', { method: 'POST', body, timeoutMs: CHAT_TIMEOUT_MS }),
};

/** Guard-house screen (/guard, live mode only). Alerts carry no identity or people data. */
export const guardService = {
  list: (limit = 50): Promise<GuardAlert[]> => api('/guard/alerts', { query: { limit: String(limit) }, timeoutMs: 5000 }),
  acknowledge: (id: string, body: GuardAckRequest = {}): Promise<GuardAlert> => api(`/guard/alerts/${id}/ack`, { method: 'POST', body }),
};

export const incidentService = {
  list: (q: IncidentQuery = {}): Promise<Incident[]> =>
    isMock ? mockApi.listIncidents(q) : api('/incidents', { query: { search: q.search, cameraId: q.cameraId, status: q.status || undefined, from: q.from, to: q.to, sort: q.sort } }),
  get: (id: string): Promise<Incident> => (isMock ? mockApi.getIncident(id) : api(`/incidents/${id}`)),
  setStatus: (id: string, status: IncidentStatus, notes?: string): Promise<Incident> =>
    isMock ? mockApi.updateIncidentStatus(id, status, notes) : api(`/incidents/${id}`, { method: 'PATCH', body: { status, notes } }),
};
