from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json

router = APIRouter()


class ConnectionManager:
    """Manages active WebSocket connections by username."""

    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, username: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[username] = websocket

    def disconnect(self, username: str):
        self.active_connections.pop(username, None)

    async def send_to_user(self, username: str, data: dict) -> bool:
        """Send data to a specific user. Returns True if delivered."""
        ws = self.active_connections.get(username)
        if ws:
            try:
                await ws.send_json(data)
                return True
            except Exception:
                self.disconnect(username)
                return False
        return False

    def get_online_users(self) -> list[str]:
        return list(self.active_connections.keys())


manager = ConnectionManager()


@router.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str):
    await manager.connect(username, websocket)

    # Broadcast online status
    online_users = manager.get_online_users()
    for user in online_users:
        await manager.send_to_user(user, {
            "type": "online_users",
            "users": online_users,
        })

    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)
            msg_type = data.get("type")

            if msg_type == "message":
                # Relay encrypted message to recipient
                # Backend NEVER sees plaintext — only encrypted ciphertext
                recipient = data.get("to")
                delivered = await manager.send_to_user(recipient, {
                    "type": "message",
                    "from": username,
                    "ciphertext": data.get("ciphertext"),
                    "encrypted_aes_key": data.get("encrypted_aes_key"),
                    "iv": data.get("iv"),
                    "timestamp": data.get("timestamp"),
                })
                # Acknowledge to sender
                await manager.send_to_user(username, {
                    "type": "message_ack",
                    "to": recipient,
                    "delivered": delivered,
                    "timestamp": data.get("timestamp"),
                })

            elif msg_type == "file_notification":
                # Notify recipient about an available encrypted file
                recipient = data.get("to")
                await manager.send_to_user(recipient, {
                    "type": "file_notification",
                    "from": username,
                    "file_id": data.get("file_id"),
                    "filename_encrypted": data.get("filename_encrypted"),
                    "timestamp": data.get("timestamp"),
                })

    except WebSocketDisconnect:
        manager.disconnect(username)
        # Broadcast updated online status
        online_users = manager.get_online_users()
        for user in online_users:
            await manager.send_to_user(user, {
                "type": "online_users",
                "users": online_users,
            })
    except Exception:
        manager.disconnect(username)
