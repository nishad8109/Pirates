import os
import aiofiles

STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "chunk_storage")
os.makedirs(STORAGE_DIR, exist_ok=True)


def _chunk_path(file_id: str, chunk_index: int) -> str:
    file_dir = os.path.join(STORAGE_DIR, file_id)
    os.makedirs(file_dir, exist_ok=True)
    return os.path.join(file_dir, f"chunk_{chunk_index:06d}")


async def save_chunk(file_id: str, chunk_index: int, data: bytes):
    """Save an encrypted chunk to local filesystem."""
    path = _chunk_path(file_id, chunk_index)
    async with aiofiles.open(path, "wb") as f:
        await f.write(data)


async def load_chunk(file_id: str, chunk_index: int) -> bytes:
    """Load an encrypted chunk from local filesystem."""
    path = _chunk_path(file_id, chunk_index)
    if not os.path.exists(path):
        raise FileNotFoundError(f"Chunk {chunk_index} not found for file {file_id}")
    async with aiofiles.open(path, "rb") as f:
        return await f.read()
