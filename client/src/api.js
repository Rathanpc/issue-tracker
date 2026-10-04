const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';
let token = sessionStorage.getItem('token');
export const getToken = () => token;
export const setToken = t => { token = t; t ? sessionStorage.setItem('token', t) : sessionStorage.removeItem('token'); };

export async function api(path, method = 'GET', body) {
  const r = await fetch(BASE + '/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = r.status === 204 ? null : await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && token) { setToken(null); sessionStorage.removeItem('user'); location.reload(); }
    throw new Error(data?.error || 'Request failed');
  }
  return data;
}
