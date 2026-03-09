import boto3
from botocore.config import Config
import os

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin123")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "e2ee-files")
MINIO_EXTERNAL_ENDPOINT = os.getenv("MINIO_EXTERNAL_ENDPOINT", "localhost:9000")

s3_client = boto3.client(
    "s3",
    endpoint_url=f"http://{MINIO_ENDPOINT}",
    aws_access_key_id=MINIO_ACCESS_KEY,
    aws_secret_access_key=MINIO_SECRET_KEY,
    config=Config(signature_version="s3v4"),
    region_name="us-east-1",
)

# Separate client for generating presigned URLs that the browser can reach
s3_external_client = boto3.client(
    "s3",
    endpoint_url=f"http://{MINIO_EXTERNAL_ENDPOINT}",
    aws_access_key_id=MINIO_ACCESS_KEY,
    aws_secret_access_key=MINIO_SECRET_KEY,
    config=Config(signature_version="s3v4"),
    region_name="us-east-1",
)


def generate_presigned_put(file_id: str, chunk_index: int, expires_in: int = 3600) -> str:
    """Generate a presigned PUT URL for uploading a chunk directly to MinIO."""
    key = f"{file_id}/chunk_{chunk_index:06d}"
    url = s3_external_client.generate_presigned_url(
        "put_object",
        Params={"Bucket": MINIO_BUCKET, "Key": key},
        ExpiresIn=expires_in,
    )
    return url


def generate_presigned_get(file_id: str, chunk_index: int, expires_in: int = 3600) -> str:
    """Generate a presigned GET URL for downloading a chunk from MinIO."""
    key = f"{file_id}/chunk_{chunk_index:06d}"
    url = s3_external_client.generate_presigned_url(
        "get_object",
        Params={"Bucket": MINIO_BUCKET, "Key": key},
        ExpiresIn=expires_in,
    )
    return url
