# VaultDrop — Zero-Knowledge E2EE File Transfer & Messaging

VaultDrop is a high-performance, strictly zero-knowledge End-to-End Encrypted (E2EE) messaging and large file transfer web application. It is designed so that the server **never** sees plaintext messages, unencrypted files, or user private keys.

## 🚀 Technology Stack

### Frontend (Client-Side)
- **Framework:** React + Vite
- **Encryption:** Native Browser Web Crypto API
- **Local Storage:** IndexedDB (for secure Private Key storage)
- **Styling:** Vanilla CSS (Premium Dark Theme with Glassmorphism)

### Backend (Server-Side)
- **Framework:** Python FastAPI (Asynchronous)
- **Real-time Communication:** FastAPI WebSockets
- **Database:** SQLite (local dev) / PostgreSQL (production-ready via SQLAlchemy)
- **Storage:** Local Filesystem Chunks (fallback) / MinIO S3 (production-ready)
- **Server:** Uvicorn ASGI

---

## 🔐 Zero-Knowledge Security Model

The core philosophy of VaultDrop is that the server is treated as completely untrusted.

1. **Client-Side Key Generation:**
   - When a user registers, their browser generates an **RSA-OAEP 4096-bit** key pair using the Web Crypto API.
   - The Public Key is sent to the backend database.
   - The Private Key is **never** transmitted. It is marked as `extractable: false` (where supported) and stored locally in the browser's IndexedDB.

2. **No Passwords on Server:**
   - Registration handles only the username and public key. Authentication relies on possession of the private key in the local browser.
]
## 💬 Hybrid Encryption Workflows

VaultDrop uses **Hybrid Encryption** for both messages and files, combining the speed of AES with the asymmetric key distribution of RSA.

### 1. Sending an Encrypted Message
- **Alice** wants to send a message to **Bob**
1. Alice's browser fetches Bob's RSA Public Key from the server.
2. Alice's browser generates a random, single-use **AES-256-GCM** session key.
3. The message text is encrypted with the AES key.
4. The AES key is then **wrapped (encrypted)** using Bob's RSA Public Key.
5. Alice sends the encrypted payload `(ciphertext, wrapped_aes_key, iv)` through the WebSocket server.
6. The server forwards the opaque blob to Bob.
7. Bob's browser uses his RSA Private Key from IndexedDB to unwrap the AES key, then decrypts the message.

### 2. Large File Transfer (2GB+)
Handling gigabyte-scale files in the browser without crashing the RAM requires chunking and streaming encryption.

**Upload phase:**
1. Alice selects a 2GB file.
2. An AES-256-GCM file key is generated and wrapped with Bob's RSA Public Key.
3. The file is sliced into **5MB chunks**.
4. Each chunk is encrypted individually using the AES key and a **unique IV** (derived from a base IV + chunk index).
5. Encrypted chunks are uploaded via HTTP PUT to backend endpoints (or direct MinIO presigned URLs) in parallel batches.

**Download phase:**
1. Bob clicks download. His browser fetches the file metadata and unwraps the AES file key.
2. Bob's browser asks where to save the file using the **File System Access API** (`showSaveFilePicker`).
3. The browser streams down encrypted chunks, decrypts them in memory, and writes the decrypted bytes directly to the local disk file handle.
4. This ensures RAM usage stays flat (~5MB) regardless of file size (2GB+).

---

## 🛠️ Project Structure

- `/frontend` - React application
  - `src/crypto/` - Web Crypto API implementations (keys, file/message encryption)
  - `src/services/` - WebSocket and REST API API clients
  - `src/components/` - File upload/download split logic
  - `src/pages/` - Chat UI, Registration, and the Crypto Inspector Debug Page
- `/backend` - FastAPI application
  - `app/routers/` - REST endpoints and WebSocket manager
  - `app/local_storage.py` - Local chunk storage system
  - `app/s3.py` - MinIO integration for scalable storage
- `docker-compose.yml` - Production infrastructure (Postgres, MinIO, FastAPI, Frontend)

## 🛡️ Crypto Inspector Debugging

The app includes a dedicated `/debug` page (accessible from the Chat sidebar) that acts as a real-time crypto event logger. Since the server sees nothing, the Debug page hooks directly into the Web Crypto API calls in the browser to visualize:
- Key Generation speeds
- RSA Wrapping/Unwrapping operations
- Per-chunk AES encryption tracking with IVs and byte sizes
- (Plaintext contents are strictly scrubbed from the debug view for safety).
