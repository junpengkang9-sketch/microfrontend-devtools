// Session state lives server-side, tied to an HttpOnly cookie the browser
// manages automatically. This module intentionally never reads or stores a
// session token in JS-accessible storage (no localStorage, no
// document.cookie) — that's the point of using an HttpOnly cookie.

export async function getSession() {
  const res = await fetch('/api/whoami', { credentials: 'same-origin' });
  if (!res.ok) return null;
  return res.json();
}

export async function login(username, password) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    credentials: 'same-origin',
  });
  if (!res.ok) {
    throw new Error(`login failed: ${res.status}`);
  }
  return res.json();
}

export async function logout() {
  await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
}

export async function authedFetch(path, init = {}) {
  return fetch(path, { ...init, credentials: 'same-origin' });
}
