from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import meetings
from app.auth import current_user


def create_app() -> FastAPI:
    app = FastAPI(
        title="Spry API",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health", tags=["health"], summary="Liveness probe")
    @app.get("/api/health", tags=["health"], summary="API health")
    async def health() -> dict[str, str]:
        return {"status": "healthy"}

    # Mount endpoints under /api/meetings and /meetings for flexible client access.
    # Both need a signed-in user: declared on the include, so a route added to
    # the router later cannot end up unprotected. /health stays public.
    signed_in = [Depends(current_user)]
    app.include_router(meetings.router, prefix="/api", dependencies=signed_in)
    app.include_router(meetings.router, dependencies=signed_in)
    return app


app = create_app()
