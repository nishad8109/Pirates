import { useState, useRef } from 'react';
import { sliceFile, generateFileKey, wrapFileKey, encryptChunk } from '../crypto/fileEncrypt.js';
import { encryptMessage } from '../crypto/encrypt.js';
import { importPublicKeyJWK } from '../crypto/keys.js';
import { arrayBufferToBase64 } from '../crypto/encrypt.js';
import { getPublicKey, initUpload, completeUpload } from '../services/api.js';
import { wsService } from '../services/websocket.js';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_PARALLEL_UPLOADS = 3;

export default function FileUpload({ currentUser, recipientUser, onComplete, onClose }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0 });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setError('');
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError('');

    try {
      // Step 1: Get recipient's public key
      setStatus('Fetching recipient public key...');
      const recipientJWK = await getPublicKey(recipientUser);
      const recipientPubKey = await importPublicKeyJWK(recipientJWK);

      // Step 2: Generate AES key for file encryption
      setStatus('Generating file encryption key...');
      const aesKey = await generateFileKey();

      // Step 3: Wrap AES key with recipient's RSA public key
      const wrappedKey = await wrapFileKey(aesKey, recipientPubKey);

      // Step 4: Generate base IV
      const baseIV = crypto.getRandomValues(new Uint8Array(12));
      const baseIVB64 = arrayBufferToBase64(baseIV);

      // Step 5: Encrypt filename (store all parts so recipient can decrypt it)
      const encryptedName = await encryptMessage(file.name, recipientPubKey);
      const filenameEncrypted = JSON.stringify(encryptedName);

      // Step 6: Slice file into chunks
      const chunks = sliceFile(file, CHUNK_SIZE);
      const totalChunks = chunks.length;

      setProgress({ current: 0, total: totalChunks, percent: 0 });
      setStatus(`Initializing upload (${totalChunks} chunks)...`);

      // Step 7: Init upload on backend — get presigned URLs
      const { file_id, presigned_urls } = await initUpload({
        senderUsername: currentUser,
        recipientUsername: recipientUser,
        filenameEncrypted,
        totalChunks,
        chunkSize: CHUNK_SIZE,
        encryptedAesKey: wrappedKey,
        iv: baseIVB64,
      });

      // Step 8: Encrypt and upload chunks in parallel batches
      setStatus('Encrypting and uploading chunks...');
      let completedChunks = 0;

      for (let i = 0; i < totalChunks; i += MAX_PARALLEL_UPLOADS) {
        const batch = chunks.slice(i, i + MAX_PARALLEL_UPLOADS);
        const uploadPromises = batch.map(async (chunk) => {
          // Read chunk data
          const chunkData = await chunk.blob.arrayBuffer();

          // Encrypt chunk
          const encryptedData = await encryptChunk(chunkData, aesKey, baseIV, chunk.index);

          // Upload encrypted chunk to presigned URL
          const response = await fetch(presigned_urls[chunk.index], {
            method: 'PUT',
            body: encryptedData,
            headers: { 'Content-Type': 'application/octet-stream' },
          });

          if (!response.ok) {
            throw new Error(`Failed to upload chunk ${chunk.index}`);
          }

          completedChunks++;
          setProgress({
            current: completedChunks,
            total: totalChunks,
            percent: Math.round((completedChunks / totalChunks) * 100),
          });
        });

        await Promise.all(uploadPromises);
      }

      // Step 9: Mark upload as complete
      setStatus('Finalizing upload...');
      await completeUpload(file_id);

      // Step 10: Notify recipient via WebSocket
      wsService.sendFileNotification(recipientUser, file_id, filenameEncrypted);

      setStatus('Upload complete!');
      setTimeout(() => onComplete(file_id), 500);
    } catch (err) {
      setError(err.message);
      setStatus('');
    } finally {
      setUploading(false);
    }
  };

  const formatSize = (bytes) => {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return bytes + ' B';
  };

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Share Encrypted File</h3>
          <button className="modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        {!uploading ? (
          <>
            {!file ? (
              <div
                className="upload-zone"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add('drag-over');
                }}
                onDragLeave={(e) => {
                  e.currentTarget.classList.remove('drag-over');
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('drag-over');
                  if (e.dataTransfer.files?.[0]) {
                    setFile(e.dataTransfer.files[0]);
                    setError('');
                  }
                }}
              >
                <svg viewBox="0 0 24 24">
                  <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
                </svg>
                <h4>Drop files here</h4>
                <p>
                  or <span className="browse-link">browse</span> to select
                </p>
                <input type="file" ref={fileInputRef} onChange={handleFileSelect} style={{ display: 'none' }} />
              </div>
            ) : (
              <div className="selected-file active">
                <div className="selected-file-icon">
                  <svg viewBox="0 0 24 24">
                    <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z" />
                  </svg>
                </div>
                <div className="selected-file-info">
                  <div className="selected-file-name">{file.name}</div>
                  <div className="selected-file-size">{formatSize(file.size)}</div>
                </div>
                <button
                  className="selected-file-remove"
                  onClick={() => {
                    setFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>
              </div>
            )}

            <div className="upload-encryption-note">
              <svg viewBox="0 0 24 24">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
              </svg>
              <p>
                Your file will be <strong>encrypted with AES-256</strong> before being sent. Only {recipientUser} can decrypt it.
              </p>
            </div>

            <div className="modal-actions">
              <button className="btn-cancel" onClick={onClose}>
                Cancel
              </button>
              <button className="btn-send-file" onClick={handleUpload} disabled={!file}>
                Encrypt & Send
              </button>
            </div>
            
            {error && <div style={{ color: '#ef4444', fontSize: '13px', marginTop: '16px', textAlign: 'center' }}>{error}</div>}
          </>
        ) : (
          <div style={{ padding: '32px 0', textAlign: 'center' }}>
            <div style={{ marginBottom: '16px', fontWeight: 600, color: 'var(--text-light)' }}>
              {status || `Encrypting & Uploading...`}
            </div>
            <div style={{ width: '100%', height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${progress.percent}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.2s' }} />
            </div>
            <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
              {progress.current} / {progress.total} chunks ({progress.percent}%)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
