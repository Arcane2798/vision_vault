import { config } from '@/config/env';

const TOKEN_KEY = 'visionvault.token';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Token lives in sessionStorage: cleared when the tab closes (evidence access should not linger). */
export const tokenStore = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (t: string) => sessionStorage.setItem(TOKEN_KEY, t),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
};

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | undefined>;
  timeoutMs?: number;
}

export async function api<T>(path: string, { method = 'GET', body, query, timeoutMs = 10000 }: RequestOptions = {}): Promise<T> {
  const url = new URL(config.apiBaseUrl + path);
  Object.entries(query ?? {}).forEach(([k, v]) => v && url.searchParams.set(k, v));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const token = tokenStore.get();
  // FormData (file uploads) is sent as multipart; the browser sets the boundary header itself
  const isForm = body instanceof FormData;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && !isForm && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch (e) {
    const reason = (e as Error).name === 'AbortError' ? 'timed out' : 'is unreachable';
    throw new ApiError(`The server ${reason}. Check that the backend is running at ${config.apiBaseUrl}.`, 0);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401) {
    tokenStore.clear();
    onUnauthorized();
    throw new ApiError('Your session has expired. Please sign in again.', 401);
  }
  if (res.status === 403) throw new ApiError('You do not have permission for this action.', 403);
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new ApiError(errorMessage(detail) || `Request failed (${res.status}).`, res.status);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

/** FastAPI sends {detail: "text"} for HTTPException and {detail: [{msg, loc}]} for validation errors. */
function errorMessage(body: { message?: string; detail?: unknown } | null): string | undefined {
  if (!body) return undefined;
  if (body.message) return body.message;
  if (typeof body.detail === 'string') return body.detail;
  if (Array.isArray(body.detail)) {
    return body.detail.map((d: { msg?: string; loc?: unknown[] }) => [d.loc?.slice(-1)[0], d.msg].filter(Boolean).join(': ')).join('; ');
  }
  return undefined;
}

/** Turns a backend path such as "/api/people/3/photo" into a full URL on the backend's host. */
export const backendUrl = (path: string) => new URL(path, config.apiBaseUrl).href;
