import type { CanvaAuthStatus } from '../../types/canva';

const SESSION_STORAGE_KEY = 'canva_lote_session_token';

export function getBackendBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  const injected = (window as unknown as { __CANVA_LOTE_BACKEND_URL__?: string })
    .__CANVA_LOTE_BACKEND_URL__;
  if (injected && window.location.origin !== injected) {
    return injected.replace(/\/$/, '');
  }
  return '';
}

export function apiUrl(path: string): string {
  const base = getBackendBaseUrl();
  return `${base}${path}`;
}

export function getStoredSessionToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredSessionToken(token: string | null): void {
  try {
    if (token) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restrictions
  }
}

export function buildAuthHeaders(): HeadersInit {
  const token = getStoredSessionToken();
  return token ? { 'x-canva-session': token } : {};
}

export async function fetchCanvaAuthStatus(): Promise<CanvaAuthStatus> {
  const res = await fetch(apiUrl('/api/canva/auth/status'), {
    credentials: 'include',
    headers: buildAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error('Não foi possível verificar o status da conexão Canva.');
  }
  return (await res.json()) as CanvaAuthStatus;
}

export async function fetchCanvaAuthUrl(): Promise<{ url: string; redirectUri: string }> {
  const res = await fetch(apiUrl('/api/canva/auth/url'), {
    credentials: 'include',
  });
  const data = (await res.json()) as {
    url?: string;
    redirectUri?: string;
    message?: string;
  };
  if (!res.ok || !data.url) {
    throw new Error(data.message || 'Falha ao gerar URL de autorização OAuth do Canva.');
  }
  return { url: data.url, redirectUri: data.redirectUri || '' };
}

export async function disconnectCanvaSession(): Promise<void> {
  await fetch(apiUrl('/api/canva/auth/logout'), {
    method: 'POST',
    credentials: 'include',
    headers: buildAuthHeaders(),
  });
  setStoredSessionToken(null);
}
