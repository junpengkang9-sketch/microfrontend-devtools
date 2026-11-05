import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.FIXTURE_API_PORT || 18090);
const HOST = '127.0.0.1';
const COOKIE_NAME = 'mf_session';

// Synthetic, in-memory only. No real credentials, no persistence.
const SYNTHETIC_USERS = {
  'demo-user': 'demo-pass',
};

const sessions = new Map();

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(value);
  });
  return out;
}

function send(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    // credentials: 'same-origin' is used by every client in this demo (the
    // browser always talks to this API via the nginx-proxied same-origin
    // /api/ path), so this server intentionally does not need a wildcard +
    // credentials CORS setup for cross-origin cookie use.
    ...headers,
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  return sessions.get(token) || null;
}

// HttpOnly so page JS (host or either micro-app) cannot read the session
// token from document.cookie. No "Secure" attribute because this demo runs
// over plain HTTP on loopback to simulate "online" without needing a TLS
// cert for 127.0.0.1 — see README "Cookie security notes" for the gap
// versus a real HTTPS deployment.
function sessionCookieHeader(token, maxAgeSeconds) {
  const attrs = [`${COOKIE_NAME}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
  return attrs.join('; ');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/login' && req.method === 'POST') {
    const body = await readBody(req).catch(() => ({}));
    const { username, password } = body;
    if (SYNTHETIC_USERS[username] !== password) {
      send(res, 401, { error: 'invalid synthetic credentials' });
      return;
    }
    const token = crypto.randomBytes(16).toString('hex');
    sessions.set(token, { username, createdAt: Date.now() });
    send(res, 200, { username }, { 'Set-Cookie': sessionCookieHeader(token, 3600) });
    return;
  }

  if (url.pathname === '/api/logout' && req.method === 'POST') {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[COOKIE_NAME];
    if (token) sessions.delete(token);
    send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookieHeader('', 0) });
    return;
  }

  if (url.pathname === '/api/whoami' && req.method === 'GET') {
    const session = sessionFromRequest(req);
    if (!session) {
      send(res, 401, { error: 'not authenticated' });
      return;
    }
    send(res, 200, { username: session.username });
    return;
  }

  if (url.pathname === '/api/alpha/data' && req.method === 'GET') {
    const session = sessionFromRequest(req);
    if (!session) {
      send(res, 401, { error: 'not authenticated' });
      return;
    }
    send(res, 200, { app: 'alpha', value: 'synthetic-alpha-fixture', authenticatedAs: session.username, ts: Date.now() });
    return;
  }

  if (url.pathname === '/api/beta/data' && req.method === 'GET') {
    const session = sessionFromRequest(req);
    if (!session) {
      send(res, 401, { error: 'not authenticated' });
      return;
    }
    send(res, 200, { app: 'beta', value: 'synthetic-beta-fixture', authenticatedAs: session.username, ts: Date.now() });
    return;
  }

  if (url.pathname === '/api/session' && req.method === 'GET') {
    send(res, 200, { activeSessions: sessions.size });
    return;
  }

  send(res, 404, { error: 'not found' });
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`[fixture-api] listening on http://${HOST}:${PORT}`);
});
