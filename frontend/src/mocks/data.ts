/**
 * SAMPLE DATA - used only when VITE_DATA_MODE=mock. Everything shown in mock mode is labelled as sample data.
 */
import type { Camera, Detection, Incident, IncidentStatus, User } from '@/types';

export const MOCK_USERS: Array<User & { password: string }> = [
  { id: 'u1', name: 'Admin Township', email: 'admin@township.local', role: 'admin', password: 'admin123' },
  { id: 'u2', name: 'Guard On Duty', email: 'operator@township.local', role: 'operator', password: 'operator123' },
  { id: 'u3', name: 'Committee Viewer', email: 'viewer@township.local', role: 'viewer', password: 'viewer123' },
];

const minutesAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();

export const mockCameras: Camera[] = [
  { id: 'cam-01', name: 'Main Gate', location: 'Jalan Utama entrance', streamUrl: '', status: 'online', lastSeen: minutesAgo(0) },
  { id: 'cam-02', name: 'Guard House', location: 'Security post A', streamUrl: '', status: 'online', lastSeen: minutesAgo(0) },
  { id: 'cam-03', name: 'Parking Block B', location: 'Basement level 1', streamUrl: '', status: 'online', lastSeen: minutesAgo(1) },
  { id: 'cam-04', name: 'Playground', location: 'Taman Permainan, Phase 2', streamUrl: '', status: 'degraded', lastSeen: minutesAgo(3) },
  { id: 'cam-05', name: 'Back Lane 7', location: 'Lorong 7, rear houses', streamUrl: '', status: 'online', lastSeen: minutesAgo(0) },
  { id: 'cam-06', name: 'Mailbox Area', location: 'Block C lobby', streamUrl: '', status: 'offline', lastSeen: minutesAgo(184) },
];

export const DETECTION_LABELS = ['person_loitering', 'motorcycle_tampering', 'bag_snatch', 'gate_climbing', 'package_taken'];

/** Deterministic pseudo-random so the sample data is the same on every reload. */
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

export function randomBox() {
  const width = 0.12 + rand() * 0.2;
  const height = 0.25 + rand() * 0.35;
  return { x: rand() * (1 - width), y: 0.15 + rand() * (0.8 - height), width, height };
}

/** A simple SVG "camera still" so the evidence viewer has something to show without real footage. */
export function sampleSnapshot(cameraName: string, label: string, box = randomBox()): string {
  const W = 640;
  const H = 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3644"/><stop offset="1" stop-color="#11161d"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <polygon points="0,${H} 260,170 380,170 ${W},${H}" fill="#1b232d"/>
  <rect x="40" y="90" width="150" height="110" fill="#222c38"/><rect x="460" y="70" width="150" height="130" fill="#222c38"/>
  <rect x="${box.x * W}" y="${box.y * H}" width="${box.width * W}" height="${box.height * H}" fill="none" stroke="#f59e0b" stroke-width="3" stroke-dasharray="8 5"/>
  <rect x="${box.x * W}" y="${box.y * H - 20}" width="${label.length * 8 + 12}" height="20" fill="#f59e0b"/>
  <text x="${box.x * W + 6}" y="${box.y * H - 6}" font-family="monospace" font-size="13" fill="#111">${label}</text>
  <text x="12" y="22" font-family="monospace" font-size="14" fill="#cbd5e1">${cameraName.toUpperCase()}</text>
  <text x="${W - 12}" y="${H - 12}" text-anchor="end" font-family="monospace" font-size="12" fill="#94a3b8">SAMPLE IMAGE - NOT REAL FOOTAGE</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function makeIncident(i: number): Incident {
  const cam = pick(mockCameras);
  const label = pick(DETECTION_LABELS);
  const timestamp = minutesAgo(Math.floor(rand() * 60 * 24 * 14) + 5);
  const confidence = 0.5 + rand() * 0.48;
  const box = randomBox();
  const age = (Date.now() - new Date(timestamp).getTime()) / 3.6e6;
  const status: IncidentStatus = age < 6 ? pick(['new', 'new', 'under_review']) : pick(['confirmed', 'dismissed', 'dismissed', 'under_review', 'new']);
  const detection: Detection = { id: `det-${i}`, cameraId: cam.id, label, confidence, bbox: box, timestamp };
  return {
    id: `INC-${String(1000 + i)}`,
    cameraId: cam.id,
    cameraName: cam.name,
    location: cam.location,
    timestamp,
    label,
    confidence,
    status,
    snapshotUrl: sampleSnapshot(cam.name, `${label} ${Math.round(confidence * 100)}%`, box),
    detections: [detection],
    ...(status === 'confirmed' || status === 'dismissed' ? { reviewedBy: 'Guard On Duty', reviewedAt: timestamp } : {}),
  };
}

export const mockIncidents: Incident[] = Array.from({ length: 64 }, (_, i) => makeIncident(i)).sort((a, b) => b.timestamp.localeCompare(a.timestamp));

export function makeLiveIncident(): Incident {
  const inc = makeIncident(mockIncidents.length + Math.floor(Math.random() * 1e6));
  const now = new Date().toISOString();
  return { ...inc, id: `INC-${Date.now().toString().slice(-6)}`, timestamp: now, status: 'new', reviewedBy: undefined, reviewedAt: undefined, detections: inc.detections.map((d) => ({ ...d, timestamp: now })) };
}
