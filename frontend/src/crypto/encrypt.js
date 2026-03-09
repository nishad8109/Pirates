/**
 * Hybrid Encryption for Messages: AES-256-GCM (data) + RSA-OAEP (key wrapping)
 * The backend NEVER sees plaintext — only encrypted ciphertext passes through the wire.
 */

import { cryptoLogger } from './logger.js';

/**
 * Generate a random AES-256-GCM key.
 */
export async function generateAESKey() {
  return await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable for wrapping
    ['encrypt', 'decrypt']
  );
}

/**
 * Generate a random IV (12 bytes for AES-GCM).
 */
export function generateIV() {
  return crypto.getRandomValues(new Uint8Array(12));
}

/**
 * Encrypt a message using hybrid encryption.
 * 1. Generate random AES-256-GCM key
 * 2. Encrypt message with AES key
 * 3. Wrap AES key with recipient's RSA-OAEP public key
 *
 * @returns {{ ciphertext: string, encryptedAesKey: string, iv: string }}
 */
export async function encryptMessage(plaintext, recipientPublicKey) {
  const aesKey = await generateAESKey();
  const iv = generateIV();

  // Encrypt message with AES-GCM
  const encoder = new TextEncoder();
  const encoded = encoder.encode(plaintext);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoded
  );

  // Wrap AES key with recipient's RSA public key
  const wrappedKey = await crypto.subtle.wrapKey(
    'raw',
    aesKey,
    recipientPublicKey,
    { name: 'RSA-OAEP' }
  );

  const result = {
    ciphertext: arrayBufferToBase64(ciphertextBuffer),
    encryptedAesKey: arrayBufferToBase64(wrappedKey),
    iv: arrayBufferToBase64(iv),
  };

  cryptoLogger.log('encrypt', 'message', {
    ciphertextB64: result.ciphertext.substring(0, 40) + '…',
    wrappedKeyB64: result.encryptedAesKey.substring(0, 40) + '…',
    ivB64: result.iv,
    ciphertextBytes: ciphertextBuffer.byteLength,
    algorithm: 'AES-256-GCM + RSA-OAEP',
  });

  return result;
}

/**
 * Decrypt a message using hybrid decryption.
 * 1. Unwrap AES key with own RSA-OAEP private key
 * 2. Decrypt ciphertext with AES key
 */
export async function decryptMessage(ciphertextB64, encryptedAesKeyB64, ivB64, privateKey) {
  const ciphertext = base64ToArrayBuffer(ciphertextB64);
  const encryptedAesKey = base64ToArrayBuffer(encryptedAesKeyB64);
  const iv = base64ToArrayBuffer(ivB64);

  // Unwrap AES key
  const aesKey = await crypto.subtle.unwrapKey(
    'raw',
    encryptedAesKey,
    privateKey,
    { name: 'RSA-OAEP' },
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  // Decrypt message
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    aesKey,
    ciphertext
  );

  const decoder = new TextDecoder();
  const plaintext = decoder.decode(decryptedBuffer);

  cryptoLogger.log('decrypt', 'message', {
    ciphertextB64: ciphertextB64.substring(0, 40) + '…',
    wrappedKeyB64: encryptedAesKeyB64.substring(0, 40) + '…',
    ivB64: ivB64,
    decryptedBytes: decryptedBuffer.byteLength,
    algorithm: 'AES-256-GCM + RSA-OAEP',
  });

  return plaintext;
}

// ─── Utility Functions ───

export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
