from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db
from ..models import User, FileMetadata
from ..schemas import FileUploadRequest, FileUploadResponse, FileCompleteRequest, FileDownloadResponse
from ..local_storage import save_chunk, load_chunk

router = APIRouter(prefix="/api/files", tags=["files"])


@router.post("/init-upload", response_model=FileUploadResponse, status_code=status.HTTP_201_CREATED)
async def init_upload(request: FileUploadRequest, db: AsyncSession = Depends(get_db)):
    """
    Initialize a file upload. Creates metadata and returns chunk upload URLs.
    Uses local backend endpoints (no MinIO required for dev).
    """
    sender_result = await db.execute(select(User).where(User.username == request.sender_username))
    sender = sender_result.scalar_one_or_none()
    if not sender:
        raise HTTPException(status_code=404, detail="Sender not found")

    recipient_result = await db.execute(select(User).where(User.username == request.recipient_username))
    recipient = recipient_result.scalar_one_or_none()
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    file_meta = FileMetadata(
        sender_id=sender.id,
        recipient_id=recipient.id,
        filename_encrypted=request.filename_encrypted,
        total_chunks=request.total_chunks,
        chunk_size=request.chunk_size,
        encrypted_aes_key=request.encrypted_aes_key,
        iv=request.iv,
        status="uploading",
    )
    db.add(file_meta)
    await db.flush()
    await db.refresh(file_meta)

    # Generate backend-hosted upload URLs (works without MinIO)
    presigned_urls = [
        f"/api/files/{file_meta.id}/chunks/{i}"
        for i in range(request.total_chunks)
    ]

    return FileUploadResponse(file_id=str(file_meta.id), presigned_urls=presigned_urls)


@router.put("/{file_id}/chunks/{chunk_index}")
async def upload_chunk(file_id: str, chunk_index: int, request: Request):
    """
    Receive an encrypted chunk and store it locally.
    The backend stores raw encrypted bytes — it cannot read the content.
    """
    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="Empty chunk data")

    await save_chunk(file_id, chunk_index, body)
    return {"status": "ok", "chunk_index": chunk_index}


@router.get("/{file_id}/chunks/{chunk_index}")
async def download_chunk(file_id: str, chunk_index: int):
    """
    Download an encrypted chunk. Returns raw encrypted bytes.
    """
    try:
        data = await load_chunk(file_id, chunk_index)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Chunk not found")

    return Response(content=data, media_type="application/octet-stream")


@router.post("/complete-upload")
async def complete_upload(request: FileCompleteRequest, db: AsyncSession = Depends(get_db)):
    """Mark a file upload as complete."""
    result = await db.execute(
        select(FileMetadata).where(FileMetadata.id == request.file_id)
    )
    file_meta = result.scalar_one_or_none()
    if not file_meta:
        raise HTTPException(status_code=404, detail="File not found")

    file_meta.status = "completed"
    await db.flush()

    return {"status": "completed", "file_id": request.file_id}


@router.get("/{file_id}/download-urls", response_model=FileDownloadResponse)
async def get_download_urls(file_id: str, db: AsyncSession = Depends(get_db)):
    """Generate download URLs for all chunks of a file."""
    result = await db.execute(
        select(FileMetadata).where(FileMetadata.id == file_id)
    )
    file_meta = result.scalar_one_or_none()
    if not file_meta:
        raise HTTPException(status_code=404, detail="File not found")

    sender_result = await db.execute(select(User).where(User.id == file_meta.sender_id))
    sender = sender_result.scalar_one_or_none()

    # Backend-hosted download URLs
    presigned_urls = [
        f"/api/files/{file_meta.id}/chunks/{i}"
        for i in range(file_meta.total_chunks)
    ]

    return FileDownloadResponse(
        file_id=str(file_meta.id),
        filename_encrypted=file_meta.filename_encrypted,
        total_chunks=file_meta.total_chunks,
        chunk_size=file_meta.chunk_size,
        encrypted_aes_key=file_meta.encrypted_aes_key,
        iv=file_meta.iv,
        presigned_urls=presigned_urls,
        sender_username=sender.username if sender else "unknown",
    )


@router.get("/received/{username}")
async def get_received_files(username: str, db: AsyncSession = Depends(get_db)):
    """Get all files sent to a specific user."""
    user_result = await db.execute(select(User).where(User.username == username))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(FileMetadata)
        .where(FileMetadata.recipient_id == user.id)
        .where(FileMetadata.status == "completed")
        .order_by(FileMetadata.created_at.desc())
    )
    files = result.scalars().all()

    file_list = []
    for f in files:
        sender_result = await db.execute(select(User).where(User.id == f.sender_id))
        sender = sender_result.scalar_one_or_none()
        file_list.append({
            "file_id": str(f.id),
            "sender_username": sender.username if sender else "unknown",
            "filename_encrypted": f.filename_encrypted,
            "total_chunks": f.total_chunks,
            "created_at": f.created_at.isoformat() if f.created_at else "",
        })

    return file_list
