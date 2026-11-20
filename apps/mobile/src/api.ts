import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { kvGet, kvSet } from './db';

const DEFAULT_URL: string = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? 'http://10.0.2.2:3000';

export async function getServerUrl() {
  return ((await kvGet('server_url')) ?? DEFAULT_URL).replace(/\/$/, '');
}
export async function setServerUrl(url: string) {
  await kvSet('server_url', url.trim().replace(/\/$/, ''));
}

// El token se guarda cifrado en el almacenamiento seguro del teléfono.
export const getToken = () => SecureStore.getItemAsync('token');
export const setToken = (t: string | null) => (t ? SecureStore.setItemAsync('token', t) : SecureStore.deleteItemAsync('token'));

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
  get full() {
    if (Array.isArray(this.details) && this.details.length) {
      return `${this.message}: ${this.details.map((d: any) => `${d.campo ? d.campo + ': ' : ''}${d.mensaje}`).join('; ')}`;
    }
    return this.message;
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const base = await getServerUrl();
  const token = await getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60000);
  let res: Response;
  try {
    res = await fetch(`${base}/api/v1${path}`, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'), headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, signal: ctrl.signal,
    });
  } catch {
    throw new ApiError(0, 'Sin conexión con el servidor');
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* respuesta no JSON */ }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Error ${res.status}`, data?.details);
  return data as T;
}
