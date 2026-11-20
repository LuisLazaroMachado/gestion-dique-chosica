// Cliente de la API. El token se guarda en localStorage; el backend valida permisos en cada solicitud.
export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:3000';
const TOKEN_KEY = 'priori.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: Array<{ campo: string; mensaje: string }> | unknown) {
    super(message);
  }
  /** Mensaje legible con el detalle de validación, si existe. */
  get full(): string {
    if (Array.isArray(this.details) && this.details.length) {
      return `${this.message}: ${this.details.map((d: { campo?: string; mensaje?: string }) => `${d.campo ? d.campo + ': ' : ''}${d.mensaje}`).join('; ')}`;
    }
    return this.message;
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1${path}`, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor. Si es la primera carga del día, espere unos segundos e intente de nuevo.');
  }
  if (res.status === 401 && path !== '/auth/login') {
    setToken(null);
    window.dispatchEvent(new Event('priori:logout'));
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Error ${res.status}`, data?.details);
  return data as T;
}

/** Descarga privada de una evidencia (requiere token) y la convierte en URL local. */
export async function evidenceObjectUrl(id: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/v1/evidence/${id}/content`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError(res.status, 'No se pudo cargar la evidencia');
  return URL.createObjectURL(await res.blob());
}

export async function uploadEvidence(file: File, meta: Record<string, unknown>) {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  const checksumSha256 = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const up = await api<{ uploadUrl: string; evidenceId: string }>('/evidence/upload-url', {
    body: { ...meta, contentType: file.type, sizeBytes: file.size, checksumSha256, capturedAt: new Date().toISOString() },
  });
  const res = await fetch(`${API_URL}${up.uploadUrl}`, { method: 'PUT', headers: { 'Content-Type': file.type }, body: buf });
  if (!res.ok) throw new ApiError(res.status, 'Falló la carga del archivo');
  return up.evidenceId;
}

// ───── Tipos principales ─────
export interface Location {
  lat: number; lon: number; confidence: string; label: string; method: string | null; source: string | null;
  date: string | null; precisionM: number | null; crsOriginal: string | null; responsible: string | null;
}
export interface Structure {
  id: string; code: string; name: string; aliases: string[]; structureType: string; material: string; watershed: string;
  originInventory: 'linea_base_2024' | 'ampliacion'; sourceReference: string | null; sourceNumber: number | null;
  workingId: string | null; reconciliationStatus: string; physicalStatus: string; interventionStatus: string;
  location: Location | null; elevationM: number | null; notes: string | null; active: boolean; createdAt: string;
  lastInspectionAt?: string | null; nextInspectionDue?: string | null;
}
export interface User {
  id: string; staffCode?: string; email: string; displayName: string; role: 'inspector' | 'planner' | 'admin'; canInspect: boolean; canViewAll: boolean; active?: boolean;
}
export interface PriorityItem {
  structureId: string; code: string; name: string; watershed: string; originInventory: string; physicalStatus: string;
  interventionStatus: string; location: { lat: number; lon: number; label: string } | null;
  d: number; c: number; a: number; n: number; nMax: number; e: number; x: number; p: number; warnings: string[];
  formulaVersion: string; calculatedAt: string; inspectedAt: string; inspectionLabel: string; exposureLabel: string;
  exposureConfidence: string; urgency: { level: string; justification: string } | null; accessStatus: string | null; tie: boolean;
}
