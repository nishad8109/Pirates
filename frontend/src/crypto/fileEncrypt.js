/**
 * File Chunk Encryption/Decryption
 * Each chunk is encrypted individually with AES-256-GCM using a unique IV.
 * This enables streaming encryption without loading the entire file into memory.
 */

import { arrayBufferToBase64, base64ToArrayBuffer } from './encrypt.js';
import { cryptoLogger } from './logger.js';

/**
 * Generate a random AES-256-GCM key for file encryption.
 */
export async function generateFileKey() {
  return await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Export AES key as raw bytes for wrapping.
 */
export async function exportAESKey(key) {
  return await crypto.subtle.exportKey('raw', key);
}

/**
 * Import AES key from raw bytes.
 */
export async function importAESKey(rawKeyBuffer) {
  return await crypto.subtle.importKey(
    'raw',
    rawKeyBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Wrap (encrypt) the AES file key with recipient's RSA public key.
 */
export async function wrapFileKey(aesKey, recipientPublicKey) {
  const wrapped = await crypto.subtle.wrapKey(
    'raw',
    aesKey,
    recipientPublicKey,
    { name: 'RSA-OAEP' }
  );
  cryptoLogger.log('wrap', 'key', {
    algorithm: 'RSA-OAEP',
    wrappedKeyPreview: arrayBufferToBase64(wrapped).substring(0, 40) + '…',
    wrappedKeyBytes: wrapped.byteLength,
  });
  return arrayBufferToBase64(wrapped);
}

/**
 * Unwrap (decrypt) the AES file key with own RSA private key.
 */
export async function unwrapFileKey(wrappedKeyB64, privateKey) {
  const wrappedKey = base64ToArrayBuffer(wrappedKeyB64);
  cryptoLogger.log('unwrap', 'key', {
    algorithm: 'RSA-OAEP',
    wrappedKeyPreview: wrappedKeyB64.substring(0, 40) + '…',
  });
  return await crypto.subtle.unwrapKey(
    'raw',
    wrappedKey,
    privateKey,
    { name: 'RSA-OAEP' },
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
}

/**
 * Generate a unique IV for a chunk based on a base IV and chunk index.
 * Uses a counter-based approach: baseIV XOR chunkIndex.
 */
export function generateChunkIV(baseIV, chunkIndex) {
  const iv = new Uint8Array(12);
  iv.set(baseIV);
  // XOR the last 4 bytes with the chunk index
  const indexBytes = new Uint8Array(4);
  new DataView(indexBytes.buffer).setUint32(0, chunkIndex, false);
  for (let i = 0; i < 4; i++) {
    iv[8 + i] ^= indexBytes[i];
  }
  return iv;
}

/**
 * Encrypt a single file chunk with AES-256-GCM.
 * Returns encrypted ArrayBuffer (ciphertext + 16-byte auth tag).
 */
export async function encryptChunk(chunkData, aesKey, baseIV, chunkIndex) {
  const iv = generateChunkIV(baseIV, chunkIndex);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    aesKey,
    chunkData
  );
  cryptoLogger.log('chunk_encrypt', 'file', {
    chunkIndex,
    inputBytes: chunkData.byteLength,
    outputBytes: encrypted.byteLength,
    algorithm: 'AES-256-GCM',
    ivHex: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''),
  });
  return encrypted;
}

/**
 * Decrypt a single file chunk with AES-256-GCM.
 */
export async function decryptChunk(encryptedData, aesKey, baseIV, chunkIndex) {
  const iv = generateChunkIV(baseIV, chunkIndex);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    aesKey,
    encryptedData
  );
  cryptoLogger.log('chunk_decrypt', 'file', {
    chunkIndex,
    inputBytes: encryptedData.byteLength,
    outputBytes: decrypted.byteLength,
    algorithm: 'AES-256-GCM',
    ivHex: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''),
  });
  return decrypted;
}

/**
 * Slice a File into chunks of the specified size.
 * Returns an array of { index, blob } objects.
 */
export function sliceFile(file, chunkSize = 5 * 1024 * 1024) {
  const chunks = [];
  let offset = 0;
  let index = 0;

  while (offset < file.size) {
    const end = Math.min(offset + chunkSize, file.size);
    chunks.push({
      index,
      blob: file.slice(offset, end),
    });
    offset = end;
    index++;
  }

  return chunks;
}
