from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
import uuid

from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    public_key = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class FileMetadata(Base):
    __tablename__ = "file_metadata"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    recipient_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    filename_encrypted = Column(Text, nullable=False)
    total_chunks = Column(Integer, nullable=False)
    chunk_size = Column(Integer, nullable=False, default=5242880)
    encrypted_aes_key = Column(Text, nullable=False)
    iv = Column(Text, nullable=False)
    status = Column(String(50), default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
