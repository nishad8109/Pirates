/**
 * REST API Client for backend communication.
 */

const API_BASE = '/api';

/**
 * Safely parse a JSON response, handling non-JSON errors gracefully.
 */
async function safeJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      res.ok ? 'Invalid server response' : `Server error (${res.status}): Backend may not be running`
    );
  }
}

/**
 * Register a new user with their public key.
 */
export async function registerUser(username, publicKeyJWK) {
  const res = await fetch(`${API_BASE}/users/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      public_key: JSON.stringify(publicKeyJWK),
    }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.detail || 'Registration failed');
  return data;
}

/**
 * Fetch a user's public key.
 */
export async function getPublicKey(username) {
  const res = await fetch(`${API_BASE}/users/${username}/public-key`);
  const data = await safeJson(res);
  if (!res.ok) throw new Error('User not found');
  return JSON.parse(data.public_key);
}

/**
 * List all registered users.
 */
export async function listUsers() {
  const res = await fetch(`${API_BASE}/users/`);
  if (!res.ok) throw new Error('Failed to list users');
  return safeJson(res);
}

/**
 * Initialize a file upload — returns file_id and presigned PUT URLs.
 */
export async function initUpload({
  senderUsername,
  recipientUsername,
  filenameEncrypted,
  totalChunks,
  chunkSize,
  encryptedAesKey,
  iv,
}) {
  const res = await fetch(`${API_BASE}/files/init-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender_username: senderUsername,
      recipient_username: recipientUsername,
      filename_encrypted: filenameEncrypted,
      total_chunks: totalChunks,
      chunk_size: chunkSize,
      encrypted_aes_key: encryptedAesKey,
      iv,
    }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.detail || 'Upload init failed');
  return data;
}

/**
 * Mark a file upload as complete.
 */
export async function completeUpload(fileId) {
  const res = await fetch(`${API_BASE}/files/complete-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId }),
  });
  if (!res.ok) throw new Error('Complete upload failed');
  return safeJson(res);
}

/**
 * Get presigned download URLs and metadata for a file.
 */
export async function getDownloadUrls(fileId) {
  const res = await fetch(`${API_BASE}/files/${fileId}/download-urls`);
  if (!res.ok) throw new Error('Failed to get download URLs');
  return safeJson(res);
}

/**
 * Get files received by a user.
 */
export async function getReceivedFiles(username) {
  const res = await fetch(`${API_BASE}/files/received/${username}`);
  if (!res.ok) throw new Error('Failed to get received files');
  return safeJson(res);
}
