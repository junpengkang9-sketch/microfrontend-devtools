// Same synthetic HttpOnly-cookie auth pattern as the v1 fixture. No extension
// hooks, no window.MF_DEVTOOLS, nothing special for local-dev tooling.

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
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  return res.json();
}

export async function logout() {
  await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
}
