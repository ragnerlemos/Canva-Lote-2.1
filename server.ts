import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response } from 'express';
import {
  buildEditableCanvaPdf,
  type EditablePdfPageSpec,
} from './src/services/pdfComposer.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const CANVA_APP_ID = process.env.CANVA_APP_ID || 'AAHOGGtX324';
const CANVA_API_BASE = 'https://api.canva.com/rest/v1';
const CANVA_AUTH_URL = 'https://www.canva.com/api/oauth/authorize';
const CANVA_TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token';

const CANVA_SCOPES = [
  'design:meta:read',
  'design:content:read',
  'design:content:write',
  'profile:read',
  'brandtemplate:meta:read',
  'brandtemplate:content:read',
].join(' ');

const SESSION_COOKIE_NAME = 'canva_lote_sid';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

interface PkceChallengeEntry {
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
}

interface CanvaUserProfile {
  userId: string;
  teamId?: string;
  displayName?: string;
}

interface CanvaSession {
  id: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope: string;
  user?: CanvaUserProfile;
  createdAt: number;
}

const pkceStore = new Map<string, PkceChallengeEntry>();
const sessionStore = new Map<string, CanvaSession>();

// Cleanup expired PKCE entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [state, entry] of pkceStore.entries()) {
    if (now - entry.createdAt > 10 * 60 * 1000) {
      pkceStore.delete(state);
    }
  }
}, 5 * 60 * 1000).unref();

function getRedirectUri(): string {
  if (process.env.CANVA_REDIRECT_URI && process.env.CANVA_REDIRECT_URI.trim()) {
    return process.env.CANVA_REDIRECT_URI.trim();
  }
  const appUrl = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
  return `${appUrl}/auth/canva/callback`;
}

function getCanvaCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = (process.env.CANVA_CLIENT_ID || '').trim();
  const clientSecret = (process.env.CANVA_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) {
    return null;
  }
  return { clientId, clientSecret };
}

function generateCodeVerifier(): string {
  return crypto.randomBytes(64).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function signSessionId(sessionId: string): string {
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(sessionId)
    .digest('base64url');
  return `${sessionId}.${signature}`;
}

function verifySignedSessionId(token: string | undefined): string | null {
  if (!token || !token.includes('.')) return null;
  const [sessionId, signature] = token.split('.');
  if (!sessionId || !signature) return null;
  const expected = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(sessionId)
    .digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  return sessionId;
}

function getSessionFromRequest(req: Request): CanvaSession | null {
  const headerToken = req.header('x-canva-session');
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  const sessionId =
    verifySignedSessionId(headerToken) || verifySignedSessionId(cookieToken);
  if (!sessionId) return null;
  return sessionStore.get(sessionId) || null;
}

function setSessionCookie(res: Response, signedToken: string) {
  const isHttps =
    (process.env.APP_URL || '').startsWith('https://') ||
    process.env.NODE_ENV === 'production';

  res.cookie(SESSION_COOKIE_NAME, signedToken, {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

async function refreshCanvaTokenIfNeeded(session: CanvaSession): Promise<CanvaSession> {
  if (Date.now() < session.expiresAt - 60_000) {
    return session;
  }
  if (!session.refreshToken) {
    return session;
  }

  const creds = getCanvaCredentials();
  if (!creds) {
    throw new Error('Credenciais OAuth do Canva não configuradas no servidor.');
  }

  const basicAuth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: session.refreshToken,
  });

  const tokenRes = await fetch(CANVA_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!tokenRes.ok) {
    sessionStore.delete(session.id);
    throw new Error('Sessão Canva expirada. Reconecte sua conta.');
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };

  session.accessToken = tokenData.access_token;
  if (tokenData.refresh_token) {
    session.refreshToken = tokenData.refresh_token;
  }
  session.expiresAt = Date.now() + (tokenData.expires_in || 14400) * 1000;
  if (tokenData.scope) {
    session.scope = tokenData.scope;
  }
  sessionStore.set(session.id, session);
  return session;
}

async function fetchCanvaUserProfile(accessToken: string): Promise<CanvaUserProfile | undefined> {
  try {
    const meRes = await fetch(`${CANVA_API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!meRes.ok) return undefined;
    const meJson = (await meRes.json()) as {
      team_user?: { user_id?: string; team_id?: string };
    };
    const userId = meJson.team_user?.user_id || 'canva-user';
    const teamId = meJson.team_user?.team_id;

    let displayName: string | undefined;
    try {
      const profileRes = await fetch(`${CANVA_API_BASE}/users/me/profile`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (profileRes.ok) {
        const profileJson = (await profileRes.json()) as {
          profile?: { display_name?: string };
        };
        displayName = profileJson.profile?.display_name;
      }
    } catch {
      // Optional profile display name
    }

    return { userId, teamId, displayName };
  } catch {
    return undefined;
  }
}

async function proxyCanvaApi(
  req: Request,
  res: Response,
  endpointPath: string,
  init: RequestInit = {}
) {
  const session = getSessionFromRequest(req);
  if (!session) {
    res.status(401).json({
      error: 'not_connected',
      message: 'Conecte sua conta Canva para acessar seus designs.',
    });
    return;
  }

  try {
    const activeSession = await refreshCanvaTokenIfNeeded(session);
    const upstream = await fetch(`${CANVA_API_BASE}${endpointPath}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${activeSession.accessToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    });

    const text = await upstream.text();
    let payload: unknown = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }

    if (!upstream.ok) {
      res.status(upstream.status).json(payload);
      return;
    }

    res.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao comunicar com a API do Canva.';
    res.status(502).json({ error: 'canva_api_error', message });
  }
}

function renderPopupCallbackHtml(payload: Record<string, unknown>): string {
  const serialized = JSON.stringify(payload).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Autenticação Canva — Canva Lote 2.0</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; color: #0f172a; }
      .box { max-width: 360px; padding: 24px; text-align: center; }
      p { font-size: 14px; color: #475569; margin-top: 8px; }
    </style>
  </head>
  <body>
    <div class="box">
      <strong>Canva Lote 2.0</strong>
      <p>${payload.type === 'CANVA_OAUTH_SUCCESS' ? 'Conta conectada! Esta janela será fechada automaticamente.' : 'Autenticação finalizada. Retornando ao aplicativo...'}</p>
    </div>
    <script>
      (function () {
        var data = ${serialized};
        if (window.opener) {
          window.opener.postMessage(data, '*');
          setTimeout(function () { window.close(); }, 350);
        } else {
          window.location.href = '/';
        }
      })();
    </script>
  </body>
</html>`;
}

async function startServer() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json({ limit: '15mb' }));

  app.use((req: Request, res: Response, next) => {
    const origin = req.headers.origin;
    if (origin) {
      const allowed =
        (origin.startsWith('https://') && origin.includes('canva')) ||
        origin.endsWith('.run.app') ||
        origin.includes('localhost');
      if (allowed) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization, X-Canva-Session, Range'
        );
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      }
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // 1. OAuth Status & Configuration Check
  app.get('/api/canva/auth/status', async (req: Request, res: Response) => {
    const creds = getCanvaCredentials();
    const redirectUri = getRedirectUri();
    const session = getSessionFromRequest(req);

    if (!session) {
      res.json({
        appId: CANVA_APP_ID,
        configured: Boolean(creds),
        connected: false,
        redirectUri,
        scopes: CANVA_SCOPES.split(' '),
      });
      return;
    }

    try {
      const activeSession = await refreshCanvaTokenIfNeeded(session);
      if (!activeSession.user) {
        activeSession.user = await fetchCanvaUserProfile(activeSession.accessToken);
      }
      res.json({
        appId: CANVA_APP_ID,
        configured: Boolean(creds),
        connected: true,
        redirectUri,
        user: activeSession.user || { userId: 'canva-user', displayName: 'Conta Canva' },
        scopes: activeSession.scope.split(' '),
        expiresAt: activeSession.expiresAt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sessão expirada';
      res.json({
        appId: CANVA_APP_ID,
        configured: Boolean(creds),
        connected: false,
        redirectUri,
        scopes: CANVA_SCOPES.split(' '),
        error: message,
      });
    }
  });

  // 2. Generate OAuth 2.0 PKCE Authorization URL
  app.get('/api/canva/auth/url', (_req: Request, res: Response) => {
    const creds = getCanvaCredentials();
    const redirectUri = getRedirectUri();

    if (!creds) {
      res.status(400).json({
        error: 'oauth_not_configured',
        message:
          'Configure CANVA_CLIENT_ID e CANVA_CLIENT_SECRET nas variáveis de ambiente para habilitar o OAuth 2.0 do Canva.',
        redirectUri,
        appId: CANVA_APP_ID,
      });
      return;
    }

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = crypto.randomBytes(24).toString('hex');

    pkceStore.set(state, {
      codeVerifier,
      redirectUri,
      createdAt: Date.now(),
    });

    const params = new URLSearchParams({
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      client_id: creds.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: CANVA_SCOPES,
      state,
    });

    res.json({
      url: `${CANVA_AUTH_URL}?${params.toString()}`,
      redirectUri,
    });
  });

  // 3. OAuth Callback Handler (supports trailing slash variations)
  const callbackHandler = async (req: Request, res: Response) => {
    const { code, state, error, error_description } = req.query as Record<
      string,
      string | undefined
    >;

    if (error) {
      const errMessage =
        error === 'access_denied'
          ? 'Autorização cancelada pelo usuário no Canva.'
          : error_description || error;
      res
        .status(200)
        .send(renderPopupCallbackHtml({ type: 'CANVA_OAUTH_ERROR', error: errMessage }));
      return;
    }

    if (!code || !state) {
      res.status(400).send(
        renderPopupCallbackHtml({
          type: 'CANVA_OAUTH_ERROR',
          error: 'Parâmetros OAuth inválidos (code ou state ausente).',
        })
      );
      return;
    }

    const pkceEntry = pkceStore.get(state);
    pkceStore.delete(state);

    if (!pkceEntry) {
      res.status(400).send(
        renderPopupCallbackHtml({
          type: 'CANVA_OAUTH_ERROR',
          error: 'Sessão de autenticação expirada ou inválida. Tente conectar novamente.',
        })
      );
      return;
    }

    const creds = getCanvaCredentials();
    if (!creds) {
      res.status(500).send(
        renderPopupCallbackHtml({
          type: 'CANVA_OAUTH_ERROR',
          error: 'Credenciais OAuth do Canva ausentes no servidor.',
        })
      );
      return;
    }

    try {
      const basicAuth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
      const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: pkceEntry.codeVerifier,
        redirect_uri: pkceEntry.redirectUri,
      });

      const tokenRes = await fetch(CANVA_TOKEN_URL, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: tokenBody.toString(),
      });

      const tokenData = (await tokenRes.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        scope?: string;
        error?: string;
        error_description?: string;
      };

      if (!tokenRes.ok || !tokenData.access_token) {
        res.status(400).send(
          renderPopupCallbackHtml({
            type: 'CANVA_OAUTH_ERROR',
            error:
              tokenData.error_description ||
              tokenData.error ||
              'Falha ao trocar código de autorização pelo token Canva.',
          })
        );
        return;
      }

      const userProfile = await fetchCanvaUserProfile(tokenData.access_token);
      const sessionId = crypto.randomBytes(32).toString('hex');
      const session: CanvaSession = {
        id: sessionId,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + (tokenData.expires_in || 14400) * 1000,
        scope: tokenData.scope || CANVA_SCOPES,
        user: userProfile,
        createdAt: Date.now(),
      };
      sessionStore.set(sessionId, session);

      const signedToken = signSessionId(sessionId);
      setSessionCookie(res, signedToken);

      res.status(200).send(
        renderPopupCallbackHtml({
          type: 'CANVA_OAUTH_SUCCESS',
          sessionToken: signedToken,
          user: userProfile,
        })
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro interno no callback OAuth.';
      res
        .status(500)
        .send(renderPopupCallbackHtml({ type: 'CANVA_OAUTH_ERROR', error: message }));
    }
  };

  app.get(['/auth/canva/callback', '/auth/canva/callback/'], callbackHandler);

  // 4. Logout / Disconnect
  app.post('/api/canva/auth/logout', (req: Request, res: Response) => {
    const session = getSessionFromRequest(req);
    if (session) {
      sessionStore.delete(session.id);
    }
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    res.json({ success: true });
  });

  // 5. Canva REST API Proxy Routes
  app.get('/api/canva/designs', async (req: Request, res: Response) => {
    const params = new URLSearchParams();
    if (typeof req.query.query === 'string' && req.query.query.trim()) {
      params.set('query', req.query.query.trim());
    }
    if (typeof req.query.ownership === 'string') {
      params.set('ownership', req.query.ownership);
    }
    if (typeof req.query.sort_by === 'string') {
      params.set('sort_by', req.query.sort_by);
    }
    if (typeof req.query.continuation === 'string') {
      params.set('continuation', req.query.continuation);
    }
    const qs = params.toString();
    await proxyCanvaApi(req, res, `/designs${qs ? `?${qs}` : ''}`);
  });

  app.get('/api/canva/designs/:designId', async (req: Request, res: Response) => {
    const { designId } = req.params;
    await proxyCanvaApi(req, res, `/designs/${encodeURIComponent(designId)}`);
  });

  app.get('/api/canva/designs/:designId/pages', async (req: Request, res: Response) => {
    const { designId } = req.params;
    const params = new URLSearchParams();
    if (typeof req.query.offset === 'string') params.set('offset', req.query.offset);
    if (typeof req.query.limit === 'string') params.set('limit', req.query.limit);
    const qs = params.toString();
    await proxyCanvaApi(
      req,
      res,
      `/designs/${encodeURIComponent(designId)}/pages${qs ? `?${qs}` : ''}`
    );
  });

  app.post('/api/canva/designs', async (req: Request, res: Response) => {
    await proxyCanvaApi(req, res, '/designs', {
      method: 'POST',
      body: JSON.stringify(req.body),
    });
  });

  app.get('/api/canva/brand-templates', async (req: Request, res: Response) => {
    const params = new URLSearchParams();
    if (typeof req.query.query === 'string' && req.query.query.trim()) {
      params.set('query', req.query.query.trim());
    }
    if (typeof req.query.continuation === 'string') {
      params.set('continuation', req.query.continuation);
    }
    const qs = params.toString();
    await proxyCanvaApi(req, res, `/brand-templates${qs ? `?${qs}` : ''}`);
  });

  app.get('/api/canva/brand-templates/:brandTemplateId/dataset', async (req: Request, res: Response) => {
    const { brandTemplateId } = req.params;
    await proxyCanvaApi(
      req,
      res,
      `/brand-templates/${encodeURIComponent(brandTemplateId)}/dataset`
    );
  });

  app.post('/api/canva/autofills', async (req: Request, res: Response) => {
    await proxyCanvaApi(req, res, '/autofills', {
      method: 'POST',
      body: JSON.stringify(req.body),
    });
  });

  app.get('/api/canva/autofills/:jobId', async (req: Request, res: Response) => {
    const { jobId } = req.params;
    await proxyCanvaApi(req, res, `/autofills/${encodeURIComponent(jobId)}`);
  });

  // 6. Export Design Page (PNG) & Import PDF Version back into Canva
  app.post('/api/canva/exports', async (req: Request, res: Response) => {
    await proxyCanvaApi(req, res, '/exports', {
      method: 'POST',
      body: JSON.stringify(req.body),
    });
  });

  app.get('/api/canva/exports/:exportId', async (req: Request, res: Response) => {
    const { exportId } = req.params;
    await proxyCanvaApi(req, res, `/exports/${encodeURIComponent(exportId)}`);
  });

  app.post('/api/canva/import-design', async (req: Request, res: Response) => {
    const session = getSessionFromRequest(req);
    if (!session) {
      res.status(401).json({
        error: 'not_connected',
        message: 'Conecte sua conta Canva para salvar designs gerados.',
      });
      return;
    }

    const {
      title,
      backgroundJpegBase64,
      jpegBase64,
      width,
      height,
      pages,
    } = (req.body || {}) as {
      title?: string;
      backgroundJpegBase64?: string;
      jpegBase64?: string;
      width?: number;
      height?: number;
      pages?: EditablePdfPageSpec[];
    };

    const resolvedJpegBase64 = backgroundJpegBase64 || jpegBase64;
    if (!resolvedJpegBase64 || !width || !height) {
      res.status(400).json({
        error: 'invalid_payload',
        message: 'Dados do fundo e dimensões ausentes para importação editável no Canva.',
      });
      return;
    }

    const pdfPages: EditablePdfPageSpec[] =
      Array.isArray(pages) && pages.length > 0
        ? pages
        : [
            {
              lines: [],
              fontSizePx: 32,
              colorHex: '#facc15',
              bold: true,
              italic: false,
              textAlign: 'center',
              anchorXRatio: 0.5,
              anchorYRatio: 0.2,
            },
          ];

    try {
      const activeSession = await refreshCanvaTokenIfNeeded(session);
      const jpegBytes = Buffer.from(resolvedJpegBase64, 'base64');
      const pdfBuffer = buildEditableCanvaPdf({
        backgroundJpegBytes: new Uint8Array(jpegBytes),
        pixelWidth: Math.round(width),
        pixelHeight: Math.round(height),
        pages: pdfPages,
      });

      const safeTitle = (title || 'Canva Lote 2.0').trim().slice(0, 48) || 'Canva Lote 2.0';
      const metadataHeader = JSON.stringify({
        title_base64: Buffer.from(safeTitle, 'utf8').toString('base64'),
        mime_type: 'application/pdf',
      });

      const upstream = await fetch(`${CANVA_API_BASE}/imports`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${activeSession.accessToken}`,
          'Content-Type': 'application/octet-stream',
          'Import-Metadata': metadataHeader,
        },
        body: new Uint8Array(pdfBuffer),
      });

      const text = await upstream.text();
      let payload: unknown = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = { raw: text };
      }

      if (!upstream.ok) {
        res.status(upstream.status).json(payload);
        return;
      }

      res.json(payload);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao importar versão para o Canva.';
      res.status(502).json({ error: 'canva_import_error', message });
    }
  });

  // 6B. Import Editable PPTX directly into Canva via POST /v1/imports
  app.post(
    '/api/canva/import-pptx',
    express.raw({ type: 'application/octet-stream', limit: '80mb' }),
    async (req: Request, res: Response) => {
      const session = getSessionFromRequest(req);
      if (!session) {
        res.status(401).json({
          error: 'not_connected',
          message: 'Conecte sua conta Canva para salvar designs editáveis.',
        });
        return;
      }

      const rawBody = req.body as Buffer | undefined;
      if (!rawBody || !Buffer.isBuffer(rawBody) || rawBody.length === 0) {
        res.status(400).json({
          error: 'invalid_pptx',
          message: 'Arquivo PPTX vazio ou inválido.',
        });
        return;
      }

      const rawTitle =
        typeof req.query.title === 'string' ? req.query.title : 'Canva Lote 2.0';
      const safeTitle = rawTitle.trim().slice(0, 48) || 'Canva Lote 2.0';

      try {
        const activeSession = await refreshCanvaTokenIfNeeded(session);
        const metadataHeader = JSON.stringify({
          title_base64: Buffer.from(safeTitle, 'utf8').toString('base64'),
          mime_type:
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        });

        const upstream = await fetch(`${CANVA_API_BASE}/imports`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${activeSession.accessToken}`,
            'Content-Type': 'application/octet-stream',
            'Import-Metadata': metadataHeader,
          },
          body: new Uint8Array(rawBody),
        });

        const text = await upstream.text();
        let payload: unknown = {};
        try {
          payload = text ? JSON.parse(text) : {};
        } catch {
          payload = { raw: text };
        }

        if (!upstream.ok) {
          res.status(upstream.status).json(payload);
          return;
        }

        res.json(payload);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Erro ao importar PPTX para o Canva.';
        res.status(502).json({ error: 'canva_import_pptx_error', message });
      }
    }
  );

  app.get('/api/canva/imports/:jobId', async (req: Request, res: Response) => {
    const { jobId } = req.params;
    await proxyCanvaApi(req, res, `/imports/${encodeURIComponent(jobId)}`);
  });

  // 7. Safe Image & Video Media Proxy for Canvas / <video> playback & PPTX embedding
  const handleProxyMedia = async (req: Request, res: Response, defaultType: string) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    if (!rawUrl || !rawUrl.startsWith('https://')) {
      res.status(400).json({ error: 'invalid_url', message: 'URL de mídia inválida.' });
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      res.status(400).json({ error: 'invalid_url', message: 'URL malformada.' });
      return;
    }

    const host = parsed.hostname.toLowerCase();
    const isAllowedHost =
      host.endsWith('.canva.com') ||
      host === 'canva.com' ||
      host.endsWith('.canvastatic.com') ||
      host.endsWith('.canva-static.com') ||
      host.endsWith('.cloudfront.net') ||
      host.endsWith('.amazonaws.com');

    if (!isAllowedHost) {
      res.status(403).json({
        error: 'forbidden_host',
        message: 'Domínio de mídia não autorizado para proxy.',
      });
      return;
    }

    try {
      const upstreamHeaders: Record<string, string> = {};
      if (typeof req.headers.range === 'string') {
        upstreamHeaders.Range = req.headers.range;
      }

      const upstream = await fetch(rawUrl, { headers: upstreamHeaders });
      if (!upstream.ok && upstream.status !== 206) {
        res.status(upstream.status).send('Falha ao baixar mídia do Canva.');
        return;
      }

      const contentType = upstream.headers.get('content-type') || defaultType;
      const contentRange = upstream.headers.get('content-range');
      const acceptRanges = upstream.headers.get('accept-ranges') || 'bytes';
      const arrayBuf = await upstream.arrayBuffer();

      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Accept-Ranges', acceptRanges);
      if (contentRange) res.setHeader('Content-Range', contentRange);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.status(upstream.status === 206 ? 206 : 200).send(Buffer.from(arrayBuf));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro no proxy de mídia.';
      res.status(502).json({ error: 'proxy_error', message: msg });
    }
  };

  app.get('/api/canva/proxy-image', async (req: Request, res: Response) => {
    await handleProxyMedia(req, res, 'image/png');
  });

  app.get('/api/canva/proxy-media', async (req: Request, res: Response) => {
    await handleProxyMedia(req, res, 'video/mp4');
  });

  // 7B. Ephemeral Binary Media Relay for @canva/asset HTTPS uploads (10-min TTL)
  const tempMediaStore = new Map<
    string,
    { buffer: Buffer; mimeType: string; createdAt: number }
  >();
  const ALLOWED_TEMP_MIME = new Set([
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/mpeg',
    'video/x-m4v',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
  ]);

  setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of tempMediaStore.entries()) {
      if (now - entry.createdAt > 10 * 60 * 1000) {
        tempMediaStore.delete(id);
      }
    }
  }, 60 * 1000).unref();

  app.post(
    '/api/temp-media',
    express.raw({ type: 'application/octet-stream', limit: '95mb' }),
    (req: Request, res: Response) => {
      const rawBody = req.body as Buffer | undefined;
      if (!rawBody || !Buffer.isBuffer(rawBody) || rawBody.length === 0) {
        res.status(400).json({ error: 'empty_media', message: 'Arquivo de mídia vazio.' });
        return;
      }

      const rawMime = typeof req.query.mime === 'string' ? req.query.mime.trim().toLowerCase() : 'video/mp4';
      const mimeType = ALLOWED_TEMP_MIME.has(rawMime) ? rawMime : 'video/mp4';

      // Evict oldest entries if total buffer exceeds 250MB
      let totalBytes = 0;
      for (const item of tempMediaStore.values()) {
        totalBytes += item.buffer.length;
      }
      for (const [oldId, oldItem] of tempMediaStore.entries()) {
        if (totalBytes + rawBody.length <= 250 * 1024 * 1024) break;
        tempMediaStore.delete(oldId);
        totalBytes -= oldItem.buffer.length;
      }

      const id = crypto.randomBytes(16).toString('hex');
      tempMediaStore.set(id, { buffer: rawBody, mimeType, createdAt: Date.now() });

      const envAppUrl = (process.env.APP_URL || '').trim().replace(/\/$/, '');
      const protoHeader = req.header('x-forwarded-proto');
      const proto = (protoHeader ? protoHeader.split(',')[0] : req.protocol || 'https').trim();
      const host = req.get('host');
      const baseUrl = envAppUrl || (host ? `${proto}://${host}` : `http://localhost:${PORT}`);

      res.json({
        id,
        url: `${baseUrl}/api/temp-media/${id}`,
        mimeType,
      });
    }
  );

  app.get('/api/temp-media/:id', (req: Request, res: Response) => {
    const entry = tempMediaStore.get(req.params.id);
    if (!entry) {
      res.status(404).send('Mídia temporária expirada ou não encontrada.');
      return;
    }
    res.setHeader('Content-Type', entry.mimeType);
    res.setHeader('Content-Length', String(entry.buffer.length));
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.status(200).send(entry.buffer);
  });

  // 7C. External Web App <-> Internal Canva Editor App Bridge Store (30-min TTL)
  interface BridgeBatchRecord {
    batchId: string;
    transferCode: string;
    designId?: string;
    designTitle: string;
    editUrl?: string;
    userId?: string;
    status: 'pending_sync' | 'syncing' | 'synced' | 'failed';
    pages: Array<{
      pageNumber: number;
      basePageNumber: number;
      phrase: string;
      style: Record<string, unknown>;
    }>;
    createdAt: number;
    expiresAt: number;
    syncedAt?: number;
    inspection?: unknown;
    pageReports?: unknown[];
    outlineSdkNote?: string;
    errorMessage?: string;
  }

  const bridgeBatchStore = new Map<string, BridgeBatchRecord>();
  const TRANSFER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function generateTransferCode(): string {
    let code = '';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) {
      code += TRANSFER_CODE_ALPHABET[bytes[i] % TRANSFER_CODE_ALPHABET.length];
    }
    return code;
  }

  function cleanupExpiredBridgeBatches() {
    const now = Date.now();
    for (const [id, item] of bridgeBatchStore.entries()) {
      if (item.expiresAt <= now) {
        bridgeBatchStore.delete(id);
      }
    }
  }

  setInterval(cleanupExpiredBridgeBatches, 60 * 1000).unref();

  app.post('/api/canva/bridge/batches', (req: Request, res: Response) => {
    cleanupExpiredBridgeBatches();
    const session = getSessionFromRequest(req);
    const body = (req.body || {}) as {
      designId?: string;
      designTitle?: string;
      editUrl?: string;
      pages?: BridgeBatchRecord['pages'];
    };

    const pagesList = Array.isArray(body.pages) ? body.pages : [];
    const hasPhrase = pagesList.some(
      (p) => typeof p?.phrase === 'string' && p.phrase.trim().length > 0
    );
    if (pagesList.length === 0 || !hasPhrase) {
      res.status(400).json({
        error: 'invalid_batch',
        message: 'Preencha ao menos uma frase para enviar ao Editor do Canva.',
      });
      return;
    }

    let transferCode = generateTransferCode();
    const existingCodes = new Set(
      Array.from(bridgeBatchStore.values()).map((b) => b.transferCode)
    );
    while (existingCodes.has(transferCode)) {
      transferCode = generateTransferCode();
    }

    const batchId = crypto.randomBytes(12).toString('hex');
    const now = Date.now();
    const record: BridgeBatchRecord = {
      batchId,
      transferCode,
      designId: typeof body.designId === 'string' && body.designId.trim() ? body.designId.trim() : undefined,
      designTitle:
        typeof body.designTitle === 'string' && body.designTitle.trim()
          ? body.designTitle.trim()
          : 'Design do Canva',
      editUrl: typeof body.editUrl === 'string' && body.editUrl.trim() ? body.editUrl.trim() : undefined,
      userId: session?.user?.userId,
      status: 'pending_sync',
      pages: pagesList,
      createdAt: now,
      expiresAt: now + 30 * 60 * 1000,
    };

    bridgeBatchStore.set(batchId, record);
    res.status(201).json({ batch: record });
  });

  // Lookup route MUST appear before /api/canva/bridge/batches/:batchId
  app.get('/api/canva/bridge/batches/lookup', (req: Request, res: Response) => {
    cleanupExpiredBridgeBatches();
    const rawCode = typeof req.query.code === 'string' ? req.query.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
    const designId = typeof req.query.designId === 'string' ? req.query.designId.trim() : '';
    const title = typeof req.query.title === 'string' ? req.query.title.trim().toLowerCase() : '';
    const includeRecent = req.query.includeRecent === '1';

    const all = Array.from(bridgeBatchStore.values()).sort(
      (a, b) => b.createdAt - a.createdAt
    );

    let matched: BridgeBatchRecord | null = null;
    if (rawCode) {
      matched = all.find((b) => b.transferCode === rawCode) || null;
    }
    if (!matched && designId) {
      matched =
        all.find((b) => b.designId === designId && b.status === 'pending_sync') ||
        all.find((b) => b.designId === designId) ||
        null;
    }
    if (!matched && title) {
      matched =
        all.find(
          (b) =>
            b.designTitle.trim().toLowerCase() === title &&
            b.status === 'pending_sync'
        ) ||
        all.find((b) => b.designTitle.trim().toLowerCase() === title) ||
        null;
    }
    if (!matched && includeRecent) {
      matched = all.find((b) => b.status === 'pending_sync') || null;
    }

    const candidates = all.slice(0, 6).map((b) => ({
      batchId: b.batchId,
      transferCode: b.transferCode,
      designId: b.designId,
      designTitle: b.designTitle,
      status: b.status,
      pageCount: b.pages.length,
      createdAt: b.createdAt,
    }));

    res.json({ batch: matched, candidates });
  });

  app.get('/api/canva/bridge/batches/:batchId', (req: Request, res: Response) => {
    cleanupExpiredBridgeBatches();
    const record = bridgeBatchStore.get(req.params.batchId);
    if (!record) {
      res.status(404).json({
        error: 'batch_not_found',
        message: 'Lote de transferência expirado ou não encontrado.',
      });
      return;
    }
    res.json({ batch: record });
  });

  app.post('/api/canva/bridge/batches/:batchId/inspect', (req: Request, res: Response) => {
    cleanupExpiredBridgeBatches();
    const record = bridgeBatchStore.get(req.params.batchId);
    if (!record) {
      res.status(404).json({
        error: 'batch_not_found',
        message: 'Lote de transferência expirado ou não encontrado.',
      });
      return;
    }
    record.inspection = req.body?.inspection;
    bridgeBatchStore.set(record.batchId, record);
    res.json({ batch: record });
  });

  app.post('/api/canva/bridge/batches/:batchId/status', (req: Request, res: Response) => {
    cleanupExpiredBridgeBatches();
    const record = bridgeBatchStore.get(req.params.batchId);
    if (!record) {
      res.status(404).json({
        error: 'batch_not_found',
        message: 'Lote de transferência expirado ou não encontrado.',
      });
      return;
    }

    const body = (req.body || {}) as {
      status?: BridgeBatchRecord['status'];
      inspection?: unknown;
      pageReports?: unknown[];
      outlineSdkNote?: string;
      errorMessage?: string;
    };

    if (
      body.status === 'pending_sync' ||
      body.status === 'syncing' ||
      body.status === 'synced' ||
      body.status === 'failed'
    ) {
      record.status = body.status;
    }
    if (body.inspection !== undefined) record.inspection = body.inspection;
    if (Array.isArray(body.pageReports)) record.pageReports = body.pageReports;
    if (typeof body.outlineSdkNote === 'string') record.outlineSdkNote = body.outlineSdkNote;
    if (typeof body.errorMessage === 'string') record.errorMessage = body.errorMessage;
    if (record.status === 'synced') {
      record.syncedAt = Date.now();
    }

    bridgeBatchStore.set(record.batchId, record);
    res.json({ batch: record });
  });

  // 8. Standalone IIFE Bundle for Canva Design Editor Host (/canva-app.js & /app.js)
  let cachedCanvaBundle: { js: string; css: string } | null = null;
  let pendingBundlePromise: Promise<{ js: string; css: string }> | null = null;

  const getCanvaEditorBundle = async (): Promise<{ js: string; css: string }> => {
    if (cachedCanvaBundle && process.env.NODE_ENV === 'production') {
      return cachedCanvaBundle;
    }
    if (cachedCanvaBundle) {
      return cachedCanvaBundle;
    }
    if (!pendingBundlePromise) {
      pendingBundlePromise = (async () => {
        const { build } = await import('vite');
        const { default: react } = await import('@vitejs/plugin-react');
        const { default: tailwindcss } = await import('@tailwindcss/vite');

        const buildResult = await build({
          configFile: false,
          logLevel: 'silent',
          plugins: [react(), tailwindcss()],
          resolve: {
            alias: {
              '@': path.resolve(__dirname, '.'),
            },
          },
          define: {
            'process.env.NODE_ENV': '"production"',
          },
          build: {
            write: false,
            emptyOutDir: false,
            minify: 'esbuild',
            cssCodeSplit: false,
            lib: {
              entry: path.resolve(__dirname, 'src/intents/design_editor/canvaEntry.tsx'),
              formats: ['iife'],
              name: 'CanvaLoteDesignApp',
              fileName: () => 'canva-app.js',
            },
            rollupOptions: {
              output: {
                inlineDynamicImports: true,
              },
            },
          },
        });

        const outputs = Array.isArray(buildResult) ? buildResult : [buildResult];
        let js = '';
        let css = '';

        for (const item of outputs) {
          if ('output' in item && Array.isArray(item.output)) {
            for (const file of item.output) {
              if (file.type === 'chunk') {
                js += file.code;
              } else if (file.type === 'asset' && file.fileName.endsWith('.css')) {
                css += typeof file.source === 'string' ? file.source : Buffer.from(file.source).toString('utf8');
              }
            }
          }
        }

        if (!js) {
          throw new Error('Falha ao compilar bundle JS para o Editor do Canva.');
        }

        cachedCanvaBundle = { js, css };
        return cachedCanvaBundle;
      })().finally(() => {
        pendingBundlePromise = null;
      });
    }
    return pendingBundlePromise;
  };

  app.get(['/canva-app.js', '/app.js'], async (req: Request, res: Response) => {
    try {
      const bundle = await getCanvaEditorBundle();
      const envAppUrl = (process.env.APP_URL || '').trim().replace(/\/$/, '');
      const protoHeader = req.header('x-forwarded-proto');
      const proto = (protoHeader ? protoHeader.split(',')[0] : req.protocol || 'https').trim();
      const host = req.get('host');
      const reqBaseUrl = host ? `${proto}://${host}` : '';
      const backendUrl = envAppUrl || reqBaseUrl || `http://localhost:${PORT}`;

      const preamble =
        `window.__CANVA_LOTE_BACKEND_URL__=${JSON.stringify(backendUrl)};` +
        `window.__CANVA_LOTE_CSS__=${JSON.stringify(bundle.css)};\n`;

      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache');
      res.status(200).send(preamble + bundle.js);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao gerar bundle Canva Editor.';
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(500).type('application/javascript').send(`console.error(${JSON.stringify(message)});`);
    }
  });

  // Vite middleware in dev, static build in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Canva Lote 2.0] Servidor ativo na porta ${PORT} (App ID: ${CANVA_APP_ID})`);
  });
}

startServer().catch((err) => {
  console.error('[Canva Lote 2.0] Falha ao iniciar servidor:', err);
  process.exit(1);
});
