#!/usr/bin/env node
/**
 * Configure the frontend in one command. Writes .env.local.
 *
 *   npm run configure                         interactive questions (press Enter to keep the value in [brackets])
 *   npm run configure -- --mock               sample-data demo, no backend needed
 *   npm run configure -- --live --api http://192.168.1.10:8000/api --realtime websocket --ws ws://192.168.1.10:8000/ws/events
 *   npm run configure -- --show               print the current configuration
 *
 * Flags: --name --api --realtime (websocket|sse|mock|off) --ws --auth (true|false)
 *        --refresh (ms) --confidence (0-1) --timezone --port --mock --live --yes (no questions)
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(ROOT, '.env.local');

const FIELDS = [
  { key: 'VITE_APP_NAME', flag: 'name', label: 'App name', def: 'Township CCTV' },
  { key: 'VITE_DATA_MODE', flag: 'mode', label: 'Data mode (mock = sample data, live = real backend)', def: 'mock', options: ['mock', 'live'] },
  { key: 'VITE_API_BASE_URL', flag: 'api', label: 'Backend API base URL', def: 'http://localhost:8000/api', liveOnly: true, validate: isUrl },
  { key: 'VITE_REALTIME', flag: 'realtime', label: 'Real-time alerts', def: 'mock', options: ['websocket', 'sse', 'mock', 'off'] },
  { key: 'VITE_REALTIME_URL', flag: 'ws', label: 'Real-time URL (ws://... or http://... for SSE)', def: 'ws://localhost:8000/ws/events', when: (c) => ['websocket', 'sse'].includes(c.VITE_REALTIME), validate: isUrl },
  { key: 'VITE_AUTH_ENABLED', flag: 'auth', label: 'Require login', def: 'true', options: ['true', 'false'] },
  { key: 'VITE_REFRESH_INTERVAL_MS', flag: 'refresh', label: 'Refresh interval (ms)', def: '15000', validate: (v) => Number(v) >= 2000 || 'must be a number >= 2000' },
  { key: 'VITE_MIN_CONFIDENCE', flag: 'confidence', label: 'Minimum AI confidence to display (0-1)', def: '0.5', validate: (v) => (Number(v) >= 0 && Number(v) <= 1) || 'must be between 0 and 1' },
  { key: 'VITE_TIMEZONE', flag: 'timezone', label: 'Time zone', def: 'Asia/Kuala_Lumpur', validate: isTimezone },
  { key: 'PORT', flag: 'port', label: 'Dev server port', def: '5173', validate: (v) => (Number(v) > 0 && Number(v) < 65536) || 'invalid port' },
];

function isUrl(v) {
  try {
    new URL(v);
    return true;
  } catch {
    return 'must be a full URL, e.g. http://localhost:8000/api';
  }
}

function isTimezone(v) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: v });
    return true;
  } catch {
    return 'unknown time zone, e.g. Asia/Kuala_Lumpur';
  }
}

function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const [k, inline] = a.slice(2).split('=');
    const next = argv[i + 1];
    if (inline !== undefined) args[k] = inline;
    else if (next && !next.startsWith('--')) args[k] = argv[++i];
    else args[k] = true;
  }
  return args;
}

function printConfig(cfg) {
  console.log('\n  Current configuration (.env.local)\n');
  for (const f of FIELDS) console.log(`  ${f.key.padEnd(26)} ${cfg[f.key] ?? '(default) ' + f.def}`);
  console.log('');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const current = { ...Object.fromEntries(FIELDS.map((f) => [f.key, f.def])), ...readEnv(ENV_FILE) };

  if (args.show) return printConfig(readEnv(ENV_FILE));

  // presets
  if (args.mock) Object.assign(current, { VITE_DATA_MODE: 'mock', VITE_REALTIME: 'mock' });
  if (args.live) {
    current.VITE_DATA_MODE = 'live';
    if (current.VITE_REALTIME === 'mock') current.VITE_REALTIME = 'websocket';
  }
  for (const f of FIELDS) if (typeof args[f.flag] === 'string') current[f.key] = args[f.flag];

  const nonInteractive = args.yes || args.mock || args.live || FIELDS.some((f) => typeof args[f.flag] === 'string');
  const cfg = { ...current };

  if (!nonInteractive) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('\n  Township CCTV frontend - configuration');
    console.log('  Press Enter to keep the value in [brackets].\n');
    for (const f of FIELDS) {
      if (f.liveOnly && cfg.VITE_DATA_MODE !== 'live') continue;
      if (f.when && !f.when(cfg)) continue;
      for (;;) {
        const opts = f.options ? ` (${f.options.join(' / ')})` : '';
        const ans = (await rl.question(`  ${f.label}${opts} [${cfg[f.key]}]: `)).trim() || cfg[f.key];
        const err = f.options && !f.options.includes(ans) ? `choose one of: ${f.options.join(', ')}` : f.validate ? f.validate(ans) : true;
        if (err === true) {
          cfg[f.key] = ans;
          break;
        }
        console.log(`    ! ${err}`);
      }
      if (f.key === 'VITE_DATA_MODE' && cfg.VITE_DATA_MODE === 'mock' && cfg.VITE_REALTIME !== 'off') cfg.VITE_REALTIME = 'mock';
    }
    rl.close();
  } else {
    for (const f of FIELDS) {
      const v = cfg[f.key];
      const err = f.options && !f.options.includes(v) ? `choose one of: ${f.options.join(', ')}` : f.validate ? f.validate(v) : true;
      if (err !== true) {
        console.error(`  x ${f.key}=${v}: ${err}`);
        process.exit(1);
      }
    }
  }

  if (cfg.VITE_DATA_MODE === 'live' && cfg.VITE_REALTIME === 'mock') {
    console.log('  ! Live mode with mock real-time events: alerts will be fake. Use --realtime websocket|sse|off.');
  }

  const body = [
    '# Generated by `npm run configure` - edit by running it again, or by hand.',
    `# ${new Date().toISOString()}`,
    ...FIELDS.map((f) => `${f.key}=${cfg[f.key]}`),
    '',
  ].join('\n');
  fs.writeFileSync(ENV_FILE, body);

  printConfig(cfg);
  console.log(`  Saved to ${path.relative(process.cwd(), ENV_FILE) || ENV_FILE}`);
  console.log('  Next: npm run dev   (restart it if it is already running)\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
