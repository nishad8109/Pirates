from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class UserCreate(BaseModel):
    username: str
    password: str
    public_key: str


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    created_at: datetime

    class Config:
        from_attributes = True


class PublicKeyResponse(BaseModel):
    username: str
    public_key: str


class FileUploadRequest(BaseModel):
    sender_username: str
    recipient_username: str
    filename_encrypted: str
    total_chunks: int
    chunk_size: int = 5242880
    encrypted_aes_key: str
    iv: str


class FileUploadResponse(BaseModel):
    file_id: str
    presigned_urls: list[str]


class FileCompleteRequest(BaseModel):
    file_id: str


class FileDownloadResponse(BaseModel):
    file_id: str
    filename_encrypted: str
    total_chunks: int
    chunk_size: int
    encrypted_aes_key: str
    iv: str
    presigned_urls: list[str]
    sender_username: str
