import { useState, useEffect, useCallback } from 'react';
import { cryptoLogger } from '../crypto/logger.js';

const OP_CONFIG = {
  keygen:        { icon: '🔑', label: 'Key Generation', color: '#a78bfa' },
  encrypt:       { icon: '🔒', label: 'Encrypt Message', color: '#34d399' },
  decrypt:       { icon: '🔓', label: 'Decrypt Message', color: '#60a5fa' },
  wrap:          { icon: '📦', label: 'Key Wrap (RSA)', color: '#f59e0b' },
  unwrap:        { icon: '📤', label: 'Key Unwrap (RSA)', color: '#fb923c' },
  chunk_encrypt: { icon: '🧩', label: 'Chunk Encrypt', color: '#22d3ee' },
  chunk_decrypt: { icon: '🧬', label: 'Chunk Decrypt', color: '#818cf8' },
};

const CATEGORY_COLORS = {
  message: '#34d399',
  file: '#60a5fa',
  key: '#f59e0b',
};

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3,
  });
}

function formatBytes(bytes) {
  if (bytes == null) return '';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

function StatCard({ label, value, color }) {
  return (
    <div className="debug-stat" style={{ borderLeftColor: color }}>
      <div className="debug-stat-value">{value}</div>
      <div className="debug-stat-label">{label}</div>
    </div>
  );
}

function EventRow({ event, expanded, onClick }) {
  const cfg = OP_CONFIG[event.operation] || { icon: '⚙️', label: event.operation, color: '#888' };

  return (
    <div className={`debug-event ${expanded ? 'debug-event--expanded' : ''}`} onClick={onClick}>
      <div className="debug-event-header">
        <span className="debug-event-icon">{cfg.icon}</span>
        <span className="debug-event-op" style={{ color: cfg.color }}>{cfg.label}</span>
        <span className="debug-event-cat" style={{ background: CATEGORY_COLORS[event.category] + '22', color: CATEGORY_COLORS[event.category] }}>
          {event.category}
        </span>
        <span className="debug-event-time">{formatTime(event.timestamp)}</span>
      </div>

      {/* Quick summary line — only crypto metadata, never plaintext */}
      <div className="debug-event-summary">
        {event.ciphertextBytes != null && <span>🔐 {formatBytes(event.ciphertextBytes)}</span>}
        {event.inputBytes != null && <span>📥 {formatBytes(event.inputBytes)}</span>}
        {event.outputBytes != null && <span>📤 {formatBytes(event.outputBytes)}</span>}
        {event.decryptedBytes != null && <span>📄 {formatBytes(event.decryptedBytes)}</span>}
        {event.durationMs != null && <span>⏱️ {event.durationMs}ms</span>}
        {event.chunkIndex != null && <span>Chunk #{event.chunkIndex}</span>}
        {event.algorithm && <span>🔧 {event.algorithm}</span>}
      </div>

      {/* Expanded details — sensitive data excluded */}
      {expanded && (
        <div className="debug-event-details">
          <table>
            <tbody>
              {Object.entries(event)
                .filter(([k]) => !['id', 'timestamp', 'operation', 'category',
                  'plaintextPreview', 'plaintextLength', 'filename', 'fileName',
                ].includes(k))
                .map(([key, val]) => (
                  <tr key={key}>
                    <td className="debug-detail-key">{key}</td>
                    <td className="debug-detail-val">
                      {Array.isArray(val) ? val.join(', ') : typeof val === 'object' ? JSON.stringify(val) : String(val)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Debug() {
  const [events, setEvents] = useState(cryptoLogger.getEvents());
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    return cryptoLogger.subscribe((evts) => setEvents([...evts]));
  }, []);

  const toggleExpand = useCallback((id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const stats = cryptoLogger.getStats();

  const filtered = filter === 'all'
    ? events
    : events.filter((e) => e.category === filter || e.operation === filter);

  return (
    <div className="debug-page">
      {/* Header */}
      <div className="debug-header">
        <div className="debug-title-row">
          <h1>🛡️ Crypto Inspector</h1>
          <a href="/chat" className="debug-back-link">← Back to Chat</a>
        </div>
        <p className="debug-subtitle">Real-time view of all encryption &amp; decryption operations</p>
      </div>

      {/* Stats */}
      <div className="debug-stats-grid">
        <StatCard label="Total Operations" value={stats.total} color="#a78bfa" />
        <StatCard label="Messages" value={stats.messages} color="#34d399" />
        <StatCard label="File Chunks" value={stats.files} color="#60a5fa" />
        <StatCard label="Key Operations" value={stats.keys} color="#f59e0b" />
      </div>

      {/* Filters + Actions */}
      <div className="debug-toolbar">
        <div className="debug-filters">
          {[
            { key: 'all', label: 'All' },
            { key: 'message', label: '💬 Messages' },
            { key: 'file', label: '📁 Files' },
            { key: 'key', label: '🔑 Keys' },
            { key: 'encrypt', label: '🔒 Encrypt' },
            { key: 'decrypt', label: '🔓 Decrypt' },
          ].map(({ key, label }) => (
            <button
              key={key}
              className={`debug-filter-btn ${filter === key ? 'active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <button className="debug-clear-btn" onClick={() => cryptoLogger.clear()}>
          🗑️ Clear
        </button>
      </div>

      {/* Event Breakdown */}
      {stats.total > 0 && (
        <div className="debug-breakdown">
          {Object.entries(stats.operations).map(([op, count]) => {
            const cfg = OP_CONFIG[op] || { icon: '⚙️', label: op, color: '#888' };
            return (
              <span key={op} className="debug-breakdown-chip" style={{ borderColor: cfg.color }}>
                {cfg.icon} {cfg.label}: <strong>{count}</strong>
              </span>
            );
          })}
        </div>
      )}

      {/* Event List */}
      <div className="debug-event-list">
        {filtered.length === 0 ? (
          <div className="debug-empty">
            <div className="debug-empty-icon">🔍</div>
            <p>No crypto events yet.</p>
            <p className="debug-empty-hint">Send a message or transfer a file to see operations appear here in real time.</p>
          </div>
        ) : (
          filtered.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              expanded={expandedId === event.id}
              onClick={() => toggleExpand(event.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
