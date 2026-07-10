from pydantic import BaseModel, Field


class MovieResult(BaseModel):
    movie_id: int = Field(..., description="MovieLens movie ID")
    title: str = Field(..., description="Movie title with year")
    genres: str = Field(..., description="Pipe-separated genre list")
    year: int | None = Field(None, description="Release year")
    imdb_id: str | None = Field(None, description="IMDB Movie ID")


class SearchResponse(BaseModel):
    query: str = Field(..., description="Original search query")
    count: int = Field(..., description="Number of results returned")
    results: list[MovieResult]


class Recommendation(BaseModel):
    movie_id: int = Field(..., description="MovieLens movie ID")
    title: str = Field(..., description="Movie title with year")
    genres: str = Field(..., description="Pipe-separated genre list")
    year: int | None = Field(None, description="Release year")
    imdb_id: str | None = Field(None, description="IMDB Movie ID")
    similarity_score: float = Field(..., description="Cosine similarity (0-1)")
    method: str = Field(..., description="'content-based' or 'collaborative'")


class RecommendResponse(BaseModel):
    source_movie: MovieResult
    recommendations: list[Recommendation]
    method: str = Field(..., description="Primary method used for recommendations")


class HealthResponse(BaseModel):
    status: str = "healthy"
    model_type: str = "hybrid (content-based + collaborative)"
    catalog_size: int = 0
    version: str = "1.0.0"


class ErrorResponse(BaseModel):
    detail: str
