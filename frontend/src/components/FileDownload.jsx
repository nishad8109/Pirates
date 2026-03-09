import { useState } from 'react';
import { getDownloadUrls } from '../services/api.js';
import { unwrapFileKey, decryptChunk } from '../crypto/fileEncrypt.js';
import { decryptMessage } from '../crypto/encrypt.js';
import { base64ToArrayBuffer } from '../crypto/encrypt.js';

export default function FileDownload({ fileId, currentUser, privateKey, onClose }) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0 });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const handleDownload = async () => {
    setDownloading(true);
    setError('');

    try {
      // Step 1: Get file metadata and presigned download URLs
      setStatus('Fetching file metadata...');
      const fileData = await getDownloadUrls(fileId);

      const {
        presigned_urls,
        total_chunks,
        encrypted_aes_key,
        iv,
        filename_encrypted,
      } = fileData;

      // Step 2: Unwrap AES key with private key
      setStatus('Unwrapping encryption key...');
      const aesKey = await unwrapFileKey(encrypted_aes_key, privateKey);
      const baseIV = new Uint8Array(base64ToArrayBuffer(iv));

      // Step 3: Decrypt the original filename (including extension)
      let filename = `file_${fileId.substring(0, 8)}`;
      try {
        const nameEnvelope = JSON.parse(filename_encrypted);
        filename = await decryptMessage(
          nameEnvelope.ciphertext,
          nameEnvelope.encryptedAesKey,
          nameEnvelope.iv,
          privateKey
        );
      } catch (e) {
        console.warn('Could not decrypt filename, using default:', e);
      }

      // Step 4: Try File System Access API (Chromium only)
      const useFileSystemAPI = 'showSaveFilePicker' in window;

      if (useFileSystemAPI) {
        await downloadWithFileSystemAPI(
          presigned_urls, total_chunks, aesKey, baseIV, filename
        );
      } else {
        await downloadWithBlobFallback(
          presigned_urls, total_chunks, aesKey, baseIV, filename
        );
      }

      setStatus('Download complete!');
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err.message);
      setStatus('');
    } finally {
      setDownloading(false);
    }
  };

  /**
   * Memory-efficient download using File System Access API.
   * Writes decrypted chunks directly to disk — supports 2GB+ files.
   */
  const downloadWithFileSystemAPI = async (urls, totalChunks, aesKey, baseIV, filename) => {
    setStatus('Choose save location...');

    const handle = await window.showSaveFilePicker({
      suggestedName: filename,
    });
    const writable = await handle.createWritable();

    setProgress({ current: 0, total: totalChunks, percent: 0 });

    for (let i = 0; i < totalChunks; i++) {
      setStatus(`Downloading & decrypting chunk ${i + 1}/${totalChunks}...`);

      // Download encrypted chunk
      const response = await fetch(urls[i]);
      if (!response.ok) throw new Error(`Failed to download chunk ${i}`);
      const encryptedData = await response.arrayBuffer();

      // Decrypt chunk
      const decryptedData = await decryptChunk(encryptedData, aesKey, baseIV, i);

      // Write directly to disk (no memory accumulation)
      await writable.write(new Uint8Array(decryptedData));

      setProgress({
        current: i + 1,
        total: totalChunks,
        percent: Math.round(((i + 1) / totalChunks) * 100),
      });
    }

    await writable.close();
  };

  /**
   * Fallback: collect decrypted chunks in memory and trigger download.
   * Works in all browsers but may struggle with very large files.
   */
  const downloadWithBlobFallback = async (urls, totalChunks, aesKey, baseIV, filename) => {
    setProgress({ current: 0, total: totalChunks, percent: 0 });

    const parts = [];

    for (let i = 0; i < totalChunks; i++) {
      setStatus(`Downloading & decrypting chunk ${i + 1}/${totalChunks}...`);

      const response = await fetch(urls[i]);
      if (!response.ok) throw new Error(`Failed to download chunk ${i}`);
      const encryptedData = await response.arrayBuffer();

      const decryptedData = await decryptChunk(encryptedData, aesKey, baseIV, i);
      parts.push(new Uint8Array(decryptedData));

      setProgress({
        current: i + 1,
        total: totalChunks,
        percent: Math.round(((i + 1) / totalChunks) * 100),
      });
    }

    // Assemble Blob and trigger download
    const blob = new Blob(parts);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Download Encrypted File</h3>
          <button className="modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        {!downloading ? (
          <>
            <div className="download-area" style={{ textAlign: 'center', margin: '24px 0' }}>
              <div style={{
                background: 'rgba(99, 102, 241, 0.1)',
                width: '64px', height: '64px',
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
                color: 'var(--accent)'
              }}>
                <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                  <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                </svg>
              </div>
              
              <h4 style={{ marginBottom: '8px', fontSize: '18px' }}>Decrypt and Download File</h4>
              <p className="download-info" style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '16px' }}>
                ID: <code>{fileId.substring(0, 8)}...</code>
              </p>
              
              <div className="upload-encryption-note" style={{ textAlign: 'left', marginBottom: '24px' }}>
                <svg viewBox="0 0 24 24">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                </svg>
                <p>
                  This file will be securely decrypted locally using your private key.
                  <br />
                  <span style={{ fontSize: '12px', opacity: 0.8 }}>
                    {'showSaveFilePicker' in window
                      ? 'Memory-efficient streaming is supported in your browser.'
                      : 'Fallback blob storage active.'}
                  </span>
                </p>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-cancel" onClick={onClose}>
                Cancel
              </button>
              <button className="btn-send-file" onClick={handleDownload} style={{ width: 'auto', padding: '12px 24px' }}>
                🔓 Decrypt & Download
              </button>
            </div>
            
            {error && <div style={{ color: '#ef4444', fontSize: '13px', marginTop: '16px', textAlign: 'center' }}>{error}</div>}
          </>
        ) : (
          <div style={{ padding: '32px 0', textAlign: 'center' }}>
            <div style={{ marginBottom: '16px', fontWeight: 600, color: 'var(--text-light)' }}>
              {status || `Downloading & Decrypting...`}
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
