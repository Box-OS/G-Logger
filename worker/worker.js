// G<Logger server (Cloudflare Worker).
//
// The app itself is a static page served from ../public. This worker does the two things a
// browser can't do on its own:
//
// 1. Sign-in. Talking to Google's token endpoint needs the client secret, so it happens here.
//      /auth/login     → sends you to Google's consent screen
//      /auth/callback  → Google sends you back here; your refresh token goes in an encrypted,
//                        HttpOnly cookie (nothing about your Google account is stored here)
//      /auth/token     → trades that cookie for a short-lived access token the page uses to
//                        call the Calendar and Drive APIs directly
//      /auth/logout    → revokes access and clears the cookie
//
// 2. Long-timer reminders (Web Push). A phone can't wake itself up to check a timer, so:
//      /api/push/key          → the public key phones need to subscribe
//      /api/push/subscribe    → saves where to send this device's notifications
//      /api/push/unsubscribe  → forgets this device
//      /api/push/state        → the app reports when a timer starts or stops
//    and a scheduled run (every 10 minutes, see wrangler.toml) sends "still going?" reminders.
//    Stored in Workers KV, per Google account: push addresses, reminder hours, and the running
//    timer's start/category. Never your calendar or log.
//
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, COOKIE_SECRET. Storage binding: KV.

import { vapid, sendPush, b64u, unb64u, cat } from './push.js';

const SCOPES = [
  'openid', 'email',
  'https://www.googleapis.com/auth/calendar',        // read and write your log calendar
  'https://www.googleapis.com/auth/drive.appdata',   // a private settings file only this app can see
].join(' ');
const RT = 'glog_rt', STATE = 'glog_state', YEAR = 400 * 24 * 3600;
const MAX_REMINDERS = 3;

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
      if (url.pathname.startsWith('/api/push/')) return await push(req, url, env);
    } catch (e) {
      return text('Server error: ' + e.message, 500);
    }
    return env.ASSETS.fetch(req);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(remind(env));
  },
};

// ---------- sign-in ----------
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
  h.append('Set-Cookie', cookie(RT, await seal(env, { rt: r.refresh_token, sub: claims(r.id_token).sub }), YEAR));
  h.append('Set-Cookie', cookie(STATE, '', 0, '/auth'));
  return new Response(null, { status: 302, headers: h });
}

async function token(req, env) {
  const s = await session(req, env);
  if (!s) return json({ error: 'signed_out' }, 401);
  const r = await google(env, { grant_type: 'refresh_token', refresh_token: s.rt });
  if (r.error) {   // revoked or expired: forget it so the app shows the sign-in screen
    return json({ error: 'signed_out' }, 401, { 'Set-Cookie': cookie(RT, '', 0) });
  }
  const c = claims(r.id_token), extra = {};
  if (!s.sub && c.sub) extra['Set-Cookie'] = cookie(RT, await seal(env, { rt: s.rt, sub: c.sub }), YEAR);   // older cookies didn't carry your account id
  return json({ access_token: r.access_token, expires_in: r.expires_in, email: c.email || null }, 200, extra);
}

async function logout(req, env) {
  const s = await session(req, env);
  if (s) await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(s.rt), { method: 'POST' }).catch(() => {});
  return json({ ok: true }, 200, { 'Set-Cookie': cookie(RT, '', 0) });
}

// ---------- long-timer reminders ----------
async function push(req, url, env) {
  if (!env.KV) return json({ error: 'Reminders are not set up on this server.' }, 503);
  const what = url.pathname.slice('/api/push/'.length);
  if (what === 'key') return json({ publicKey: (await vapid(env)).pub });
  if (req.method !== 'POST') return text('Method not allowed', 405);
  const s = await session(req, env);
  if (!s || !s.sub) return json({ error: 'signed_out' }, 401);
  const body = await req.json().catch(() => ({}));
  const uk = 'u:' + s.sub, rk = 'run:' + s.sub;
  const user = (await env.KV.get(uk, 'json')) || { subs: [], hours: 2 };

  if (what === 'subscribe') {
    const sub = body.subscription;
    if (!sub || !/^https:\/\//.test(sub.endpoint || '') || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return json({ error: 'Bad subscription' }, 400);
    user.subs = user.subs.filter(x => x.endpoint !== sub.endpoint).concat({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }).slice(-5);
    user.hours = clampHours(body.hours);
    await env.KV.put(uk, JSON.stringify(user));
    await env.KV.put('cfg:origin', url.origin);
    if (body.running) await env.KV.put(rk, JSON.stringify(runOf(body.running)));
    return json({ ok: true, hours: user.hours });
  }
  if (what === 'unsubscribe') {
    user.subs = user.subs.filter(x => x.endpoint !== body.endpoint);
    if (user.subs.length) await env.KV.put(uk, JSON.stringify(user));
    else { await env.KV.delete(uk); await env.KV.delete(rk); }
    return json({ ok: true });
  }
  if (what === 'state') {   // a timer started or stopped on any of your devices
    if (!user.subs.length) return json({ ok: true, enabled: false });
    if (!body.running) { await env.KV.delete(rk); return json({ ok: true, enabled: true }); }
    const prev = await env.KV.get(rk, 'json'), next = runOf(body.running);
    if (prev && prev.start === next.start && prev.cat === next.cat) return json({ ok: true, enabled: true });   // nothing new
    await env.KV.put(rk, JSON.stringify(next));
    return json({ ok: true, enabled: true });
  }
  return text('Not found', 404);
}
const clampHours = h => [1, 2, 3, 4, 6].includes(Number(h)) ? Number(h) : 2;
const runOf = r => ({ start: Number(r.start), cat: String(r.cat || '').slice(0, 40), title: String(r.title || '').slice(0, 80), sent: 0 });

// Runs every 10 minutes: anyone whose timer has passed their reminder time gets a nudge
// (then again after the same amount of time, up to MAX_REMINDERS).
async function remind(env, now = Date.now()) {
  if (!env.KV) return;
  const origin = (await env.KV.get('cfg:origin')) || 'https://g-logger.workers.dev';
  let cursor;
  do {
    const page = await env.KV.list({ prefix: 'run:', cursor });
    for (const k of page.keys) {
      const sub = k.name.slice(4), run = await env.KV.get(k.name, 'json'), user = await env.KV.get('u:' + sub, 'json');
      if (!run || !user || !user.subs.length) { await env.KV.delete(k.name); continue; }
      const every = user.hours * 3600e3, due = run.start + (run.sent + 1) * every;
      if (now < due || run.sent >= MAX_REMINDERS) continue;
      const hrs = Math.floor((now - run.start) / 3600e3);
      const msg = {
        title: `${run.cat} has been running for ${hrs}h`,
        body: run.sent ? 'Still going? Open G<Logger to stop it or keep going.' : 'Forgot to stop it? Tap to stop or fix the end time.',
        tag: 'glog-long', url: '/',
      };
      const alive = [];
      for (const s of user.subs) {
        const r = await sendPush(env, origin, s, msg).catch(() => null);
        if (!r || (r.status !== 404 && r.status !== 410)) alive.push(s);   // 404/410 = that phone unsubscribed
      }
      run.sent++;
      await env.KV.put(k.name, JSON.stringify(run));
      if (alive.length !== user.subs.length) { user.subs = alive; await env.KV.put('u:' + sub, JSON.stringify(user)); }
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
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
function claims(idToken) {
  try { return JSON.parse(new TextDecoder().decode(unb64u(idToken.split('.')[1]))); } catch (e) { return {}; }
}

// The sign-in cookie holds {rt: refresh token, sub: Google account id}, encrypted (AES-GCM) with COOKIE_SECRET.
async function key(env) {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.COOKIE_SECRET));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function seal(env, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(env), new TextEncoder().encode(JSON.stringify(obj))));
  return b64u(cat(iv, ct));
}
async function session(req, env) {
  const v = cookies(req)[RT];
  if (!v) return null;
  try {
    const b = unb64u(v);
    const pt = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, await key(env), b.slice(12)));
    if (pt[0] !== '{') return { rt: pt };   // cookies from before reminders existed held just the token
    const s = JSON.parse(pt);
    return s.rt ? s : null;
  } catch (e) { return null; }
}

