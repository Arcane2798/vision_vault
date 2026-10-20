/** In-memory fake backend for VITE_DATA_MODE=mock. Same function signatures as the real services. */
import type { AuthSession, Camera, CameraInput, DashboardSummary, Incident, IncidentQuery, IncidentStatus, TrendPoint, User } from '@/types';
import { ApiError } from '@/services/apiClient';
import { MOCK_USERS, mockCameras, mockIncidents } from './data';

const cameras = [...mockCameras];
const incidents = [...mockIncidents];

const delay = <T,>(value: T, ms = 250 + Math.random() * 350) => new Promise<T>((r) => setTimeout(() => r(structuredClone(value)), ms));
const dayKey = (iso: string) => iso.slice(0, 10);
const publicUser = (u: User): User => ({ id: u.id, name: u.name, email: u.email, role: u.role });

export const mockApi = {
  async login(email: string, password: string): Promise<AuthSession> {
    const u = MOCK_USERS.find((x) => x.email === email.trim().toLowerCase() && x.password === password);
    await delay(null, 500);
    if (!u) throw new ApiError('Incorrect email or password.', 401);
    return { token: `mock-token-${u.id}`, user: publicUser(u) };
  },

  async me(token: string) {
    const u = MOCK_USERS.find((x) => token === `mock-token-${x.id}`);
    if (!u) throw new ApiError('Session expired.', 401);
    return delay(publicUser(u), 100);
  },

  getSummary(): Promise<DashboardSummary> {
    const today = dayKey(new Date().toISOString());
    return delay({
      activeCameras: cameras.filter((c) => c.status !== 'offline').length,
      totalCameras: cameras.length,
      incidentsToday: incidents.filter((i) => dayKey(i.timestamp) === today).length,
      totalIncidents: incidents.length,
      unresolvedAlerts: incidents.filter((i) => i.status === 'new' || i.status === 'under_review').length,
    });
  },

  getTrend(days = 14): Promise<TrendPoint[]> {
    const points: TrendPoint[] = [];
    for (let d = days - 1; d >= 0; d--) {
      const date = dayKey(new Date(Date.now() - d * 864e5).toISOString());
      const sameDay = incidents.filter((i) => dayKey(i.timestamp) === date);
      points.push({ date, potential: sameDay.filter((i) => i.status !== 'confirmed').length, confirmed: sameDay.filter((i) => i.status === 'confirmed').length });
    }
    return delay(points);
  },

  listCameras: () => delay(cameras),

  addCamera(input: CameraInput): Promise<Camera> {
    const cam: Camera = { ...input, id: `cam-${Date.now().toString().slice(-5)}`, status: input.streamUrl ? 'online' : 'offline', lastSeen: new Date().toISOString() };
    cameras.push(cam);
    return delay(cam);
  },

  updateCamera(id: string, input: CameraInput): Promise<Camera> {
    const cam = cameras.find((c) => c.id === id);
    if (!cam) throw new ApiError('Camera not found.', 404);
    Object.assign(cam, input);
    return delay(cam);
  },

  async deleteCamera(id: string) {
    const i = cameras.findIndex((c) => c.id === id);
    if (i >= 0) cameras.splice(i, 1);
    await delay(null);
  },

  listIncidents(q: IncidentQuery = {}): Promise<Incident[]> {
    const s = q.search?.trim().toLowerCase();
    let out = incidents.filter(
      (i) =>
        (!s || [i.id, i.cameraName, i.location, i.label].some((f) => f.toLowerCase().includes(s))) &&
        (!q.cameraId || i.cameraId === q.cameraId) &&
        (!q.status || i.status === q.status) &&
        (!q.from || dayKey(i.timestamp) >= q.from) &&
        (!q.to || dayKey(i.timestamp) <= q.to),
    );
    out = out.sort((a, b) => (q.sort === 'oldest' ? a.timestamp.localeCompare(b.timestamp) : b.timestamp.localeCompare(a.timestamp)));
    return delay(out);
  },

  getIncident(id: string): Promise<Incident> {
    const inc = incidents.find((i) => i.id === id);
    if (!inc) return Promise.reject(new ApiError(`Incident ${id} was not found.`, 404));
    return delay(inc);
  },

  updateIncidentStatus(id: string, status: IncidentStatus, notes?: string): Promise<Incident> {
    const inc = incidents.find((i) => i.id === id);
    if (!inc) return Promise.reject(new ApiError('Incident not found.', 404));
    Object.assign(inc, { status, notes, reviewedBy: 'You (sample)', reviewedAt: new Date().toISOString() });
    return delay(inc);
  },

  /** used by the mock real-time stream so new alerts show up in lists */
  pushIncident(inc: Incident) {
    incidents.unshift(inc);
  },

  setCameraStatus(id: string, status: Camera['status']) {
    const cam = cameras.find((c) => c.id === id);
    if (cam) Object.assign(cam, { status, lastSeen: new Date().toISOString() });
  },

  get cameras() {
    return cameras;
  },
};
