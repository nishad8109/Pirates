from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, Base
from .routers import users, files, ws


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup (idempotent — init.sql also creates them)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(
    title="E2EE File Transfer & Messaging API",
    description="Zero-Knowledge End-to-End Encrypted File Transfer and Messaging",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow frontend origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(users.router)
app.include_router(files.router)
app.include_router(ws.router)


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "e2ee-backend"}
