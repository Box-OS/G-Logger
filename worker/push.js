// Web Push for G<Logger's reminders: message encryption (RFC 8291, aes128gcm) and the
// server's signed identity (VAPID, RFC 8292), using only the Web Crypto API.

export const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

// The server's push identity, created the first time it's needed and kept in KV.
export async function vapid(env) {
  let v = await env.KV.get('cfg:vapid', 'json');
  if (!v) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    v = { jwk: await crypto.subtle.exportKey('jwk', kp.privateKey), pub: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))) };
    await env.KV.put('cfg:vapid', JSON.stringify(v));
  }
  return v;
}

export async function sendPush(env, origin, sub, payload) {
  const v = await vapid(env);
  const aud = new URL(sub.endpoint).origin;
  const enc = s => b64u(new TextEncoder().encode(JSON.stringify(s)));
  const unsigned = enc({ typ: 'JWT', alg: 'ES256' }) + '.' + enc({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: origin });
  const key = await crypto.subtle.importKey('jwk', v.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned)));
  const body = await encrypt(sub.keys, new TextEncoder().encode(JSON.stringify(payload)));
  return fetch(sub.endpoint, {
    method: 'POST', body,
    headers: {
      Authorization: `vapid t=${unsigned}.${b64u(sig)}, k=${v.pub}`,
      'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '3600', Urgency: 'high',
    },
  });
}

// Encrypts a message so only that phone can read it (aes128gcm, single record).
export async function encrypt(keys, plaintext, fixed = {}) {
  const uaPub = unb64u(keys.p256dh), auth = unb64u(keys.auth);
  const as = fixed.as || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const salt = fixed.salt || crypto.getRandomValues(new Uint8Array(16));
  const te = s => new TextEncoder().encode(s);
  const prkKey = await hmac(auth, shared);
  const ikm = await hmac(prkKey, cat(te('WebPush: info\0'), uaPub, asPub, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(te('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(te('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, cat(plaintext, new Uint8Array([2]))));
  const header = new Uint8Array(21); header.set(salt); new DataView(header.buffer).setUint32(16, 4096); header[20] = 65;
  return cat(header, asPub, ct);
}
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}
export const cat = (...a) => { const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; a.forEach(x => { out.set(x, i); i += x.length; }); return out; };

