from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
import os

DATABASE_URL = os.getenv("DATABASE_URL", "")

# Auto-detect: use PostgreSQL if DATABASE_URL is set, otherwise fall back to SQLite
if DATABASE_URL and DATABASE_URL.startswith("postgresql"):
    engine = create_async_engine(DATABASE_URL, echo=False, pool_size=20, max_overflow=10)
else:
    # SQLite fallback for local development without Docker
    SQLITE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "e2ee_dev.db")
    DATABASE_URL = f"sqlite+aiosqlite:///{SQLITE_PATH}"
    engine = create_async_engine(DATABASE_URL, echo=False)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
