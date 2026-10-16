// G<Logger sign-in service (Cloudflare Worker).
//
// The app itself is a static page served from ../public. This worker only does the part a
// browser can't do safely on its own: talking to Google's token endpoint with the client secret.
//
//   /auth/login     → sends you to Google's consent screen
//   /auth/callback  → Google sends you back here; we keep your refresh token in an encrypted,
//                     HttpOnly cookie (nothing is stored on the server)
//   /auth/token     → trades that cookie for a short-lived access token the page uses to call
//                     the Calendar and Drive APIs directly
//   /auth/logout    → revokes access and clears the cookie
//
// Secrets (set in Cloudflare, or by the GitHub Action): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, COOKIE_SECRET

const SCOPES = [
  'openid', 'email',
  'https://www.googleapis.com/auth/calendar',        // read and write your log calendar
  'https://www.googleapis.com/auth/drive.appdata',   // a private settings file only this app can see
].join(' ');
const RT = 'glog_rt', STATE = 'glog_state', YEAR = 400 * 24 * 3600;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      switch (url.pathname) {
        case '/auth/login': return login(url, env);
        case '/auth/callback': return await callback(req, url, env);
        case '/auth/token': return req.method === 'POST' ? await token(req, env) : text('Method not allowed', 405);
        case '/auth/logout': return req.method === 'POST' ? await logout(req, env) : text('Method not allowed', 405);
      }
    } catch (e) {
      return text('Sign-in error: ' + e.message, 500);
    }
    return env.ASSETS.fetch(req);
  },
};

function login(url, env) {
  const state = b64u(crypto.getRandomValues(new Uint8Array(18)));
  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: url.origin + '/auth/callback', response_type: 'code',
    scope: SCOPES, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
  });
  const h = new Headers({ Location: 'https://accounts.google.com/o/oauth2/v2/auth?' + q });
  h.append('Set-Cookie', cookie(STATE, state, 600, '/auth'));
  return new Response(null, { status: 302, headers: h });
}

async function callback(req, url, env) {
  const p = url.searchParams, jar = cookies(req);
  if (p.get('error')) return home('?signin=' + encodeURIComponent(p.get('error')));
  if (!p.get('state') || p.get('state') !== jar[STATE]) return home('?signin=expired');
  const r = await google(env, { grant_type: 'authorization_code', code: p.get('code'), redirect_uri: url.origin + '/auth/callback' });
  if (!r.refresh_token) return home('?signin=failed');
  const h = new Headers({ Location: '/' });
  h.append('Set-Cookie', cookie(RT, await seal(env, r.refresh_token), YEAR));
  h.append('Set-Cookie', cookie(STATE, '', 0, '/auth'));
  return new Response(null, { status: 302, headers: h });
}

async function token(req, env) {
  const rt = await open(env, cookies(req)[RT]);
  if (!rt) return json({ error: 'signed_out' }, 401);
  const r = await google(env, { grant_type: 'refresh_token', refresh_token: rt });
  if (r.error) {   // revoked or expired: forget it so the app shows the sign-in screen
    return json({ error: 'signed_out' }, 401, { 'Set-Cookie': cookie(RT, '', 0) });
  }
  return json({ access_token: r.access_token, expires_in: r.expires_in, email: emailOf(r.id_token) });
}

async function logout(req, env) {
  const rt = await open(env, cookies(req)[RT]);
  if (rt) await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(rt), { method: 'POST' }).catch(() => {});
  return json({ ok: true }, 200, { 'Set-Cookie': cookie(RT, '', 0) });
}

// ---------- helpers ----------
async function google(env, body) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(Object.assign({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET }, body)),
  });
  return r.json();
}
const home = q => new Response(null, { status: 302, headers: { Location: '/' + q } });
const text = (s, status) => new Response(s, { status, headers: { 'Content-Type': 'text/plain' } });
const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), { status, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, extra) });
const cookie = (k, v, maxAge, path = '/') => `${k}=${v}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
function cookies(req) {
  const out = {};
  (req.headers.get('Cookie') || '').split(/;\s*/).forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i)] = p.slice(i + 1); });
  return out;
}
function emailOf(idToken) {
  try { return JSON.parse(atob(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email || null; } catch (e) { return null; }
}
const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

// The refresh token is encrypted (AES-GCM) with COOKIE_SECRET before it goes in the cookie.
async function key(env) {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.COOKIE_SECRET));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function seal(env, s) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(env), new TextEncoder().encode(s)));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return b64u(out);
}
async function open(env, v) {
  if (!v) return null;
  try {
    const b = unb64u(v);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, await key(env), b.slice(12));
    return new TextDecoder().decode(pt);
  } catch (e) { return null; }
}
