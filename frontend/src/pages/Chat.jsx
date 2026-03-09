import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getPrivateKey } from '../storage/indexedDB.js';
import { importPublicKeyJWK } from '../crypto/keys.js';
import { encryptMessage, decryptMessage } from '../crypto/encrypt.js';
import { getPublicKey, listUsers } from '../services/api.js';
import { wsService } from '../services/websocket.js';
import FileUpload from '../components/FileUpload.jsx';
import FileDownload from '../components/FileDownload.jsx';

export default function Chat() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const currentUser = searchParams.get('user');

  const [privateKey, setPrivateKey] = useState(null);
  const [users, setUsers] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState({});
  const [inputText, setInputText] = useState('');
  const [connected, setConnected] = useState(false);
  const [fileNotifications, setFileNotifications] = useState([]);
  const [showUpload, setShowUpload] = useState(false);
  const [showDownload, setShowDownload] = useState(null);
  const messagesEndRef = useRef(null);
  const recipientKeyCache = useRef({});

  // Initialize: load private key and connect WebSocket
  useEffect(() => {
    if (!currentUser) {
      navigate('/');
      return;
    }

    const init = async () => {
      const pk = await getPrivateKey(currentUser);
      if (!pk) {
        navigate('/');
        return;
      }
      setPrivateKey(pk);

      // Load user list
      const userList = await listUsers();
      setUsers(userList.filter((u) => u.username !== currentUser));

      // Connect WebSocket
      wsService.connect(currentUser);
    };

    init();

    return () => wsService.disconnect();
  }, [currentUser, navigate]);

  // WebSocket event handlers
  useEffect(() => {
    if (!privateKey) return;

    const unsubs = [];

    unsubs.push(
      wsService.on('connected', () => setConnected(true)),
      wsService.on('disconnected', () => setConnected(false)),
      wsService.on('online_users', (data) => {
        setOnlineUsers(data.users.filter((u) => u !== currentUser));
      })
    );

    unsubs.push(
      wsService.on('message', async (data) => {
        try {
          const plaintext = await decryptMessage(
            data.ciphertext,
            data.encrypted_aes_key,
            data.iv,
            privateKey
          );
          addMessage(data.from, {
            from: data.from,
            text: plaintext,
            timestamp: data.timestamp,
            incoming: true,
          });
        } catch (err) {
          console.error('Failed to decrypt message:', err);
        }
      })
    );

    unsubs.push(
      wsService.on('message_ack', (data) => {
        // Message delivered acknowledgment — could update UI if needed
      })
    );

    unsubs.push(
      wsService.on('file_notification', (data) => {
        setFileNotifications((prev) => [
          ...prev,
          {
            from: data.from,
            file_id: data.file_id,
            filename_encrypted: data.filename_encrypted,
            timestamp: data.timestamp,
          },
        ]);
        addMessage(data.from, {
          from: data.from,
          text: `📎 Sent you an encrypted file`,
          timestamp: data.timestamp,
          incoming: true,
          isFile: true,
          fileId: data.file_id,
        });
      })
    );

    return () => unsubs.forEach((unsub) => unsub && unsub());
  }, [privateKey, currentUser]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedUser]);

  const addMessage = useCallback((peer, msg) => {
    setMessages((prev) => ({
      ...prev,
      [peer]: [...(prev[peer] || []), msg],
    }));
  }, []);

  const getRecipientPublicKey = async (username) => {
    if (recipientKeyCache.current[username]) {
      return recipientKeyCache.current[username];
    }
    const jwk = await getPublicKey(username);
    const key = await importPublicKeyJWK(jwk);
    recipientKeyCache.current[username] = key;
    return key;
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedUser) return;

    try {
      const recipientPubKey = await getRecipientPublicKey(selectedUser);
      const { ciphertext, encryptedAesKey, iv } = await encryptMessage(inputText, recipientPubKey);

      wsService.sendEncryptedMessage(selectedUser, ciphertext, encryptedAesKey, iv);

      addMessage(selectedUser, {
        from: currentUser,
        text: inputText,
        timestamp: new Date().toISOString(),
        incoming: false,
      });

      setInputText('');
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const handleFileUploadComplete = (fileId) => {
    setShowUpload(false);
    addMessage(selectedUser, {
      from: currentUser,
      text: `📎 Sent an encrypted file`,
      timestamp: new Date().toISOString(),
      incoming: false,
      isFile: true,
      fileId,
    });
  };

  const currentMessages = selectedUser ? messages[selectedUser] || [] : [];

  return (
    <div id="page-chat" className="page chat-page active">
      <div className="login-bg">
        <div className="login-bg-grid"></div>
        <div className="login-bg-glow"></div>
      </div>
      
      <div className="chat-layout" style={{ position: 'relative', zIndex: 1, background: 'rgba(15, 15, 20, 0.4)', backdropFilter: 'blur(10px)' }}>
        {/* Sidebar */}
        <aside className="chat-sidebar" style={{ background: 'rgba(20, 20, 26, 0.5)' }}>
          <div className="sidebar-header">
            <div className="sidebar-top">
              <h2 className="sidebar-title">Chats</h2>
              <span className="sidebar-badge">{users.length}</span>
            </div>
            <div className="sidebar-search">
              <svg viewBox="0 0 24 24">
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </svg>
              <input type="text" placeholder="Search conversations..." />
            </div>
          </div>

          <div className="user-list">
            {users.map((user) => {
              const unread = (messages[user.username] || []).filter((m) => m.incoming && !m.read).length;
              return (
                <div
                  key={user.username}
                  className={`user-item ${selectedUser === user.username ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedUser(user.username);
                    setShowUpload(false);
                    setShowDownload(null);
                  }}
                >
                  <div className="user-avatar" style={{ background: 'var(--bg-dark)', color: 'var(--text-light)' }}>
                    {user.username[0].toUpperCase()}
                    {onlineUsers.includes(user.username) && <span className="online-dot"></span>}
                  </div>
                  <div className="user-info">
                    <div className="user-name">{user.username}</div>
                    <div className="user-last-msg">
                      {messages[user.username]?.length
                        ? messages[user.username][messages[user.username].length - 1].text
                        : 'No messages yet'}
                    </div>
                  </div>
                  <div className="user-meta">
                    <div className="user-time"></div>
                    {unread > 0 && <div className="user-unread">{unread}</div>}
                  </div>
                </div>
              );
            })}
            {users.length === 0 && (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No other users registered yet
              </div>
            )}
          </div>

          <div className="sidebar-footer">
            <div className="user-avatar" style={{ background: 'var(--bg-dark)', color: 'var(--accent)' }}>
              {currentUser?.[0]?.toUpperCase()}
            </div>
            <div>
              <div className="my-name">You ({currentUser})</div>
              <div className="my-status" style={{ color: connected ? 'var(--accent)' : 'var(--text-muted)' }}>
                {connected ? 'Online' : 'Reconnecting...'}
              </div>
            </div>
            <a href="/debug" title="Crypto Inspector" style={{ marginLeft: 'auto', display: 'flex' }}>
              <button className="sidebar-settings">
                🛡️
              </button>
            </a>
          </div>
        </aside>

        {/* Main Chat Area */}
        <main className="chat-main">
          {selectedUser ? (
            <>
              <div className="chat-header">
                <div className="user-avatar" style={{ background: 'var(--bg-dark)', color: 'var(--text-light)' }}>
                  {selectedUser[0].toUpperCase()}
                </div>
                <div className="chat-header-info">
                  <div className="chat-header-name">{selectedUser}</div>
                  <div className="chat-header-status" style={{ color: onlineUsers.includes(selectedUser) ? '#66BB6A' : 'var(--text-muted)' }}>
                    {onlineUsers.includes(selectedUser) ? 'Online' : 'Offline'}
                  </div>
                </div>
                <div className="chat-header-actions">
                  <div className="encryption-badge">
                    <svg viewBox="0 0 24 24" className="lock-glow">
                      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z" />
                    </svg>
                    Encrypted
                  </div>
                </div>
              </div>

              <div className="chat-messages">
                {currentMessages.map((msg, i) => (
                  <div key={i} className={`message ${msg.incoming ? 'received' : 'sent'}`}>
                    <div>
                      <div className="message-bubble">
                        {msg.text && <p>{msg.text}</p>}
                        {msg.isFile && msg.incoming && (
                          <div style={{ marginTop: '8px' }}>
                            <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setShowDownload(msg.fileId)}>
                              📥 Download & Decrypt File
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="message-time">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {showUpload && (
                <FileUpload
                  currentUser={currentUser}
                  recipientUser={selectedUser}
                  onComplete={handleFileUploadComplete}
                  onClose={() => setShowUpload(false)}
                />
              )}

              {showDownload && (
                <FileDownload
                  fileId={showDownload}
                  currentUser={currentUser}
                  privateKey={privateKey}
                  onClose={() => setShowDownload(null)}
                />
              )}

              <div className="chat-input-area">
                <form className="chat-input-wrapper" onSubmit={handleSend}>
                  <button
                    type="button"
                    className="chat-input-btn file-btn"
                    onClick={() => setShowUpload(!showUpload)}
                    title="Share encrypted file"
                  >
                    <svg viewBox="0 0 24 24">
                      <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" />
                    </svg>
                  </button>
                  <input
                    type="text"
                    id="chat-input"
                    placeholder="Type an encrypted message..."
                    autoComplete="off"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    autoFocus
                  />
                  <button type="submit" className="chat-input-btn send-btn" disabled={!inputText.trim()} title="Send message">
                    <svg viewBox="0 0 24 24">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
              <svg viewBox="0 0 24 24" style={{ width: '64px', height: '64px', fill: 'var(--border)', marginBottom: '16px' }}>
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12zM7 9h2v2H7V9zm4 0h2v2h-2V9zm4 0h2v2h-2V9z" />
              </svg>
              <h2>Select a contact</h2>
              <p>Choose a user from the sidebar to start an encrypted conversation.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
