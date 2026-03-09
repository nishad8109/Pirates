/**
 * IndexedDB Storage for Cryptographic Keys
 * Private keys are stored in IndexedDB and NEVER sent to the server.
 */

const DB_NAME = 'e2ee-keystore';
const DB_VERSION = 1;
const STORE_NAME = 'keys';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'username' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save a key pair for a user.
 * The CryptoKey objects are stored directly (structured clone).
 */
export async function saveKeyPair(username, publicKey, privateKey) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({ username, publicKey, privateKey });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get the private key for a user.
 */
export async function getPrivateKey(username) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(username);
    request.onsuccess = () => {
      const result = request.result;
      resolve(result ? result.privateKey : null);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get the public key for a user.
 */
export async function getPublicKey(username) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(username);
    request.onsuccess = () => {
      const result = request.result;
      resolve(result ? result.publicKey : null);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Check if a user has keys stored.
 */
export async function hasKeys(username) {
  const key = await getPrivateKey(username);
  return key !== null;
}

/**
 * Get the stored username (if any).
 */
export async function getStoredUser() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const results = request.result;
      resolve(results.length > 0 ? results[0].username : null);
    };
    request.onerror = () => reject(request.error);
  });
}
