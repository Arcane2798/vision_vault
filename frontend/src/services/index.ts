/**
 * Service layer - the ONLY place pages get data from.
 * In mock mode every call goes to the in-memory sample backend; in live mode to the REST API.
 * Endpoint list (backend contract) is documented in README.md.
 */
import { isMock } from '@/config/env';
import { mockApi } from '@/mocks/mockApi';
import type { AuthSession, Camera, CameraInput, DashboardSummary, Incident, IncidentQuery, IncidentStatus, TrendPoint, User } from '@/types';
import { api } from './apiClient';

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

export const incidentService = {
  list: (q: IncidentQuery = {}): Promise<Incident[]> =>
    isMock ? mockApi.listIncidents(q) : api('/incidents', { query: { search: q.search, cameraId: q.cameraId, status: q.status || undefined, from: q.from, to: q.to, sort: q.sort } }),
  get: (id: string): Promise<Incident> => (isMock ? mockApi.getIncident(id) : api(`/incidents/${id}`)),
  setStatus: (id: string, status: IncidentStatus, notes?: string): Promise<Incident> =>
    isMock ? mockApi.updateIncidentStatus(id, status, notes) : api(`/incidents/${id}`, { method: 'PATCH', body: { status, notes } }),
};
