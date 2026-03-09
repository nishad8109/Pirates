/**
 * Crypto Event Logger — captures all encryption/decryption operations
 * for display on the debug inspector page.
 *
 * Uses localStorage + BroadcastChannel to sync events across tabs,
 * so the Debug page sees events from Chat tabs.
 */

const STORAGE_KEY = 'vaultdrop_crypto_events';
const CHANNEL_NAME = 'vaultdrop_crypto';

class CryptoLogger {
  constructor() {
    this.listeners = new Set();
    this.maxEvents = 500;

    // Load persisted events from localStorage
    this.events = this._load();

    // Cross-tab sync via BroadcastChannel
    try {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (e) => {
        if (e.data.type === 'new_event') {
          // Another tab logged an event — add it locally
          this.events.unshift(e.data.event);
          if (this.events.length > this.maxEvents) {
            this.events = this.events.slice(0, this.maxEvents);
          }
          this.notify();
        } else if (e.data.type === 'clear') {
          this.events = [];
          this.notify();
        }
      };
    } catch {
      // BroadcastChannel not supported — fall back to storage events
      this.channel = null;
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY) {
          this.events = this._load();
          this.notify();
        }
      });
    }
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.events));
    } catch {
      // Storage full — silently ignore
    }
  }

  /**
   * Log a crypto event.
   */
  log(operation, category, details = {}) {
    const event = {
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      operation,
      category,
      ...details,
    };

    this.events.unshift(event);

    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(0, this.maxEvents);
    }

    this._save();
    this.notify();

    // Broadcast to other tabs
    try {
      this.channel?.postMessage({ type: 'new_event', event });
    } catch { /* ignore */ }

    return event;
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify() {
    this.listeners.forEach((cb) => cb([...this.events]));
  }

  clear() {
    this.events = [];
    this._save();
    this.notify();
    try {
      this.channel?.postMessage({ type: 'clear' });
    } catch { /* ignore */ }
  }

  getEvents() {
    return this.events;
  }

  getStats() {
    const ops = {};
    this.events.forEach((e) => {
      ops[e.operation] = (ops[e.operation] || 0) + 1;
    });

    return {
      total: this.events.length,
      operations: ops,
      messages: this.events.filter((e) => e.category === 'message').length,
      files: this.events.filter((e) => e.category === 'file').length,
      keys: this.events.filter((e) => e.category === 'key').length,
    };
  }
}

export const cryptoLogger = new CryptoLogger();
