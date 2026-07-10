import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.schema import (
    HealthResponse,
    SearchResponse,
    MovieResult,
    RecommendResponse,
    Recommendation,
)
from app.model_loader import RecommenderEngine

engine: RecommenderEngine | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine
    model_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "model")
    engine = RecommenderEngine(model_dir)
    print(f"Loaded {engine.catalog_size} movies | Collab: {'on' if engine.has_collab else 'off'}")
    yield


app = FastAPI(
    title="Movie Recommendation API",
    description="Hybrid movie recommender - content-based (TF-IDF) + collaborative filtering (SVD)",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/frontend", StaticFiles(directory=frontend_dir), name="frontend")


@app.get("/", include_in_schema=False)
async def root():
    index_path = os.path.join(frontend_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Movie Recommendation API", "docs": "/docs"}


@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    return HealthResponse(
        status="healthy",
        catalog_size=engine.catalog_size if engine else 0,
    )


@app.get("/search", response_model=SearchResponse, tags=["Movies"])
async def search_movies(
    query: str = Query(..., min_length=1, description="Partial movie title to search"),
    limit: int = Query(10, ge=1, le=50, description="Max results to return"),
):
    if engine is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet")

    results = engine.search_movies(query, limit=limit)
    return SearchResponse(
        query=query,
        count=len(results),
        results=[
            MovieResult(
                movie_id=r["movie_id"],
                title=r["title"],
                genres=r["genres"],
                year=r["year"],
                imdb_id=r.get("imdb_id"),
            )
            for r in results
        ],
    )


@app.get(
    "/recommend/{movie_id}",
    response_model=RecommendResponse,
    responses={404: {"description": "Movie not found"}},
    tags=["Recommendations"],
)
async def get_recommendations(
    movie_id: int,
    n: int = Query(10, ge=1, le=30, description="Number of recommendations"),
):
    if engine is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet")

    result = engine.get_recommendations(movie_id, top_n=n)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"Movie with ID {movie_id} not found in the catalog",
        )

    return RecommendResponse(
        source_movie=MovieResult(**result["source_movie"]),
        recommendations=[Recommendation(**r) for r in result["recommendations"]],
        method=result["method"],
    )
