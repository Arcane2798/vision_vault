/**
 * Service layer - the ONLY place pages get data from.
 * In mock mode every call goes to the in-memory sample backend; in live mode to the REST API.
 * Endpoint list (backend contract) is documented in README.md.
 */
import { isMock } from '@/config/env';
import { mockApi } from '@/mocks/mockApi';
import type { AuthSession, Camera, CameraInput, DashboardSummary, Incident, IncidentQuery, IncidentStatus, LiveStatus, Person, PersonInput, PersonUpdate, TrendPoint, User } from '@/types';
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

export const incidentService = {
  list: (q: IncidentQuery = {}): Promise<Incident[]> =>
    isMock ? mockApi.listIncidents(q) : api('/incidents', { query: { search: q.search, cameraId: q.cameraId, status: q.status || undefined, from: q.from, to: q.to, sort: q.sort } }),
  get: (id: string): Promise<Incident> => (isMock ? mockApi.getIncident(id) : api(`/incidents/${id}`)),
  setStatus: (id: string, status: IncidentStatus, notes?: string): Promise<Incident> =>
    isMock ? mockApi.updateIncidentStatus(id, status, notes) : api(`/incidents/${id}`, { method: 'PATCH', body: { status, notes } }),
};
