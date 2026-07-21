// JWS verification for App Store Server Notifications V2.
//
// Apple signs the notification (and the transaction/renewal payloads nested
// inside it) as compact JWS whose protected header carries an `x5c` certificate
// chain: [leaf, intermediate, Apple Root CA - G3]. Verifying only the JWS
// signature is NOT enough — anyone can sign a payload and attach their own
// self-made chain. The chain must terminate at Apple's real root, and that root
// must be one we pinned, not one the message told us to trust.
//
// So this module does, in order:
//   1. read x5c out of the protected header (reject if absent/short)
//   2. pin: the last cert in the chain must byte-match the trusted Apple root
//   3. walk the chain: each cert must be signed by the next one up, and each
//      must be inside its validity window right now
//   4. only then verify the JWS signature with the leaf certificate's key
//
// TRUST ROOT (founder configuration — see README launch checklist):
//   Preferred: set the APPLE_ROOT_CA_G3_B64 secret to the base64 DER of
//   "Apple Root CA - G3" (download: https://www.apple.com/certificateauthority/AppleRootCA-G3.cer,
//   then `base64 -i AppleRootCA-G3.cer`).
//   Fallback: if that secret is unset, this module fetches the same file from
//   apple.com over TLS once per cold start and caches it in memory. That is a
//   working default, but the pinned secret is strictly stronger — it does not
//   depend on apple.com being reachable or on DNS at verification time.
//
// @ts-nocheck - Deno runtime imports (not Node.js)

// @ts-ignore - Deno runtime import
import * as x509 from 'https://esm.sh/@peculiar/x509@1.11.0';
// @ts-ignore - Deno runtime import
import { compactVerify, importX509 } from 'https://esm.sh/jose@5.9.6';

const APPLE_ROOT_CA_G3_URL = 'https://www.apple.com/certificateauthority/AppleRootCA-G3.cer';

let cachedRootDer: Uint8Array | null = null;

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64.replace(/\s+/g, ''));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function toPem(derB64: string): string {
  const body = derB64.replace(/\s+/g, '').match(/.{1,64}/g)?.join('\n') ?? '';
  return `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----`;
}

/** The pinned Apple root, from the secret if set, otherwise fetched once. */
export async function getTrustedAppleRootDer(): Promise<Uint8Array> {
  if (cachedRootDer) return cachedRootDer;

  const pinned = Deno.env.get('APPLE_ROOT_CA_G3_B64') ?? '';
  if (pinned.trim()) {
    cachedRootDer = base64ToBytes(pinned);
    return cachedRootDer;
  }

  console.warn(
    '[apple-notifications] APPLE_ROOT_CA_G3_B64 not set — fetching Apple Root CA G3 over TLS. Set the secret to pin it.'
  );
  const res = await fetch(APPLE_ROOT_CA_G3_URL);
  if (!res.ok) {
    throw new Error(`Could not fetch Apple root CA: ${res.status} ${res.statusText}`);
  }
  cachedRootDer = new Uint8Array(await res.arrayBuffer());
  return cachedRootDer;
}

function decodeProtectedHeader(jws: string): Record<string, unknown> {
  const [headerB64] = jws.split('.');
  if (!headerB64) throw new Error('Malformed JWS: no protected header');
  const json = new TextDecoder().decode(
    base64ToBytes(headerB64.replace(/-/g, '+').replace(/_/g, '/'))
  );
  return JSON.parse(json);
}

/**
 * Verify an Apple-signed compact JWS and return its decoded payload.
 * Throws on any verification failure — callers must NOT fall back to trusting
 * an unverified payload.
 */
export async function verifyAppleSignedPayload<T = unknown>(jws: string): Promise<T> {
  if (typeof jws !== 'string' || jws.split('.').length !== 3) {
    throw new Error('Malformed JWS');
  }

  const header = decodeProtectedHeader(jws);
  const x5c = header.x5c;
  if (!Array.isArray(x5c) || x5c.length < 2) {
    throw new Error('JWS header is missing an x5c certificate chain');
  }

  // 2) Pin the root: the chain must END at the Apple root WE trust.
  const trustedRoot = await getTrustedAppleRootDer();
  const chain = x5c.map((c: string) => new x509.X509Certificate(base64ToBytes(c)));
  const presentedRoot = new Uint8Array(chain[chain.length - 1].rawData);
  if (!bytesEqual(presentedRoot, trustedRoot)) {
    throw new Error('x5c chain does not terminate at the trusted Apple root CA');
  }

  // 3) Walk the chain: cert[i] must be signed by cert[i+1], all within validity.
  const now = new Date();
  for (let i = 0; i < chain.length - 1; i++) {
    const issuerKey = await chain[i + 1].publicKey.export();
    const ok = await chain[i].verify({ publicKey: issuerKey, date: now });
    if (!ok) {
      throw new Error(`x5c chain broken at position ${i}`);
    }
  }
  // The root is self-signed; confirm it is currently valid too.
  const root = chain[chain.length - 1];
  if (now < root.notBefore || now > root.notAfter) {
    throw new Error('Apple root CA is outside its validity window');
  }

  // Advisory: Apple's notification signing leaf carries this OID. Absence is
  // logged rather than fatal — the pinned chain above is the real gate, and a
  // hard failure here would silently drop live notifications if Apple rotates
  // to a different marker.
  try {
    if (!chain[0].getExtension('1.2.840.113635.100.6.11.1')) {
      console.warn('[apple-notifications] leaf cert missing Apple notification OID marker');
    }
  } catch {
    // getExtension is best-effort only.
  }

  // 4) Signature, against the leaf's key.
  const leafKey = await importX509(toPem(x5c[0]), 'ES256');
  const { payload } = await compactVerify(jws, leafKey);
  return JSON.parse(new TextDecoder().decode(payload)) as T;
}
