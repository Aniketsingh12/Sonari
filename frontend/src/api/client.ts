// Tiny typed fetch client. All calls are same-origin in production and proxied
// to the backend in dev (see vite.config.ts). The active tenant is carried in
// the X-Business-Id header once known.

let businessId: string | null = localStorage.getItem("vd-business-id");

export function setBusinessId(id: string | null) {
  businessId = id;
  if (id) localStorage.setItem("vd-business-id", id);
  else localStorage.removeItem("vd-business-id");
}

export function getBusinessId() {
  return businessId;
}

// Dashboard session token (see backend app/api/auth.py). Owner-only endpoints
// 401 without it; the public voice-agent surface never needs it.
let adminToken: string | null = localStorage.getItem("vd-admin-token");

export function setAdminToken(token: string | null) {
  adminToken = token;
  if (token) localStorage.setItem("vd-admin-token", token);
  else localStorage.removeItem("vd-admin-token");
}

export function getAdminToken() {
  return adminToken;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (businessId) headers["X-Business-Id"] = businessId;
  if (adminToken) headers["X-Admin-Token"] = adminToken;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = (data && (data.detail || data.message)) || detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const api = {
  get: <T>(p: string) => request<T>("GET", p),
  post: <T>(p: string, body?: unknown) => request<T>("POST", p, body ?? {}),
  patch: <T>(p: string, body?: unknown) => request<T>("PATCH", p, body ?? {}),
  put: <T>(p: string, body?: unknown) => request<T>("PUT", p, body ?? {}),
  del: <T>(p: string) => request<T>("DELETE", p),
};
