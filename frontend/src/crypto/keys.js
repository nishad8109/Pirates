/**
 * RSA-OAEP 4096-bit Key Pair Generation and Management
 * Uses the browser's native Web Crypto API — private keys never leave the client.
 */

import { cryptoLogger } from './logger.js';

const RSA_ALGORITHM = {
  name: 'RSA-OAEP',
  modulusLength: 4096,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
};

/**
 * Generate a new RSA-OAEP 4096-bit key pair.
 */
export async function generateKeyPair() {
  const t0 = performance.now();
  const keyPair = await crypto.subtle.generateKey(
    RSA_ALGORITHM,
    true,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );
  const elapsed = Math.round(performance.now() - t0);

  cryptoLogger.log('keygen', 'key', {
    algorithm: 'RSA-OAEP',
    modulusLength: 4096,
    hash: 'SHA-256',
    usages: ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'],
    durationMs: elapsed,
  });

  return keyPair;
}

/**
 * Export a public key as JWK for server storage.
 */
export async function exportPublicKeyJWK(publicKey) {
  return await crypto.subtle.exportKey('jwk', publicKey);
}

/**
 * Import a public key from JWK (received from server).
 * The imported key's usages must be a subset of the original key_ops in the JWK.
 */
export async function importPublicKeyJWK(jwk) {
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    RSA_ALGORITHM,
    true,
    ['encrypt', 'wrapKey']
  );
}

