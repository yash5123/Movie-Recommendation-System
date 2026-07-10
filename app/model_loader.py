import os
import pickle
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity


class RecommenderEngine:

    def __init__(self, model_dir: str):
        self.model_dir = model_dir
        self._load_content_based()
        self._load_collaborative()

    def _load_content_based(self):
        with open(os.path.join(self.model_dir, "tfidf_vectorizer.pkl"), "rb") as f:
            self.tfidf = pickle.load(f)
        with open(os.path.join(self.model_dir, "movie_feature_vectors.pkl"), "rb") as f:
            self.tfidf_matrix = pickle.load(f)
        with open(os.path.join(self.model_dir, "movie_lookup.pkl"), "rb") as f:
            self.movie_lookup = pickle.load(f)
        with open(os.path.join(self.model_dir, "id_to_idx.pkl"), "rb") as f:
            self.id_to_idx = pickle.load(f)

        self.idx_to_id = {v: k for k, v in self.id_to_idx.items()}

        self.search_index = []
        for movie_id, info in self.movie_lookup.items():
            self.search_index.append({
                "movie_id": movie_id,
                "search_key": info["clean_title"].lower(),
                "title": info["title"],
                "genres": info["genres"],
                "year": info["year"],
                "imdb_id": info.get("imdb_id"),
                "avg_rating": info.get("avg_rating", 0),
                "rating_count": info.get("rating_count", 0),
            })

    def _load_collaborative(self):
        collab_path = os.path.join(self.model_dir, "collab_model.pkl")
        metrics_path = os.path.join(self.model_dir, "metrics.pkl")

        if os.path.exists(collab_path):
            with open(collab_path, "rb") as f:
                collab = pickle.load(f)
            self.item_factors = collab["item_factors"]
            self.movie_id_map = collab["movie_id_map"]
            self.ratings_per_movie = collab["ratings_per_movie"]
            self.collab_min_ratings = collab["collab_min_ratings"]
            self.has_collab = True
        else:
            self.has_collab = False

        if os.path.exists(metrics_path):
            with open(metrics_path, "rb") as f:
                self.metrics = pickle.load(f)
        else:
            self.metrics = {}

    @property
    def catalog_size(self) -> int:
        return len(self.movie_lookup)

    def search_movies(self, query: str, limit: int = 10) -> list[dict]:
        query_lower = query.lower().strip()
        if not query_lower:
            return []

        results = []
        for entry in self.search_index:
            key = entry["search_key"]
            if query_lower in key:
                if key == query_lower:
                    score = 0
                elif key.startswith(query_lower):
                    score = 1
                else:
                    score = 2
                results.append((score, entry))

        results.sort(key=lambda x: (x[0], x[1]["title"]))
        return [r[1] for r in results[:limit]]

    def get_recommendations(self, movie_id: int, top_n: int = 10) -> dict:
        if movie_id not in self.movie_lookup:
            return None

        source = self.movie_lookup[movie_id]

        use_collab = (
            self.has_collab
            and movie_id in self.movie_id_map
            and self.ratings_per_movie.get(movie_id, 0) >= self.collab_min_ratings
        )

        if use_collab:
            recommendations, method = self._collab_recommend(movie_id, top_n)
        else:
            recommendations, method = self._content_recommend(movie_id, top_n)

        return {
            "source_movie": {
                "movie_id": movie_id,
                "title": source["title"],
                "genres": source["genres"],
                "year": source["year"],
                "imdb_id": source.get("imdb_id"),
                "avg_rating": source.get("avg_rating", 0),
                "rating_count": source.get("rating_count", 0),
            },
            "recommendations": recommendations,
            "method": method,
        }

    def _content_recommend(self, movie_id: int, top_n: int) -> tuple[list[dict], str]:
        idx = self.id_to_idx[movie_id]
        query_vec = self.tfidf_matrix[idx : idx + 1]
        sim_scores = cosine_similarity(query_vec, self.tfidf_matrix).flatten()
        sim_scores[idx] = -1

        top_indices = sim_scores.argsort()[::-1][:top_n]

        results = []
        for i in top_indices:
            mid = self.idx_to_id[i]
            info = self.movie_lookup[mid]
            results.append({
                "movie_id": mid,
                "title": info["title"],
                "genres": info["genres"],
                "year": info["year"],
                "imdb_id": info.get("imdb_id"),
                "avg_rating": info.get("avg_rating", 0),
                "rating_count": info.get("rating_count", 0),
                "similarity_score": round(float(sim_scores[i]), 4),
                "method": "content-based",
            })
        return results, "content-based"

    def _collab_recommend(self, movie_id: int, top_n: int) -> tuple[list[dict], str]:
        m_idx = self.movie_id_map[movie_id]
        query_factor = self.item_factors[m_idx : m_idx + 1]

        sim_scores = cosine_similarity(query_factor, self.item_factors).flatten()
        sim_scores[m_idx] = -1

        collab_idx_to_mid = {v: k for k, v in self.movie_id_map.items()}
        top_indices = sim_scores.argsort()[::-1][:top_n]

        results = []
        for i in top_indices:
            mid = collab_idx_to_mid.get(i)
            if mid and mid in self.movie_lookup:
                info = self.movie_lookup[mid]
                results.append({
                    "movie_id": mid,
                    "title": info["title"],
                    "genres": info["genres"],
                    "year": info["year"],
                    "imdb_id": info.get("imdb_id"),
                    "avg_rating": info.get("avg_rating", 0),
                    "rating_count": info.get("rating_count", 0),
                    "similarity_score": round(float(sim_scores[i]), 4),
                    "method": "collaborative",
                })
        return results, "collaborative"
