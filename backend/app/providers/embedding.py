"""Embedding providers for RAG: hash (mock), sentence-transformers (open-source), OpenAI (paid)."""
from __future__ import annotations

import hashlib
import importlib.util
import math
import re

from app.config import settings
from app.providers.base import Embedder


def _module_available(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def _l2_normalize(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


class HashEmbedder(Embedder):
    """Deterministic bag-of-words hashing embedding — zero dependencies.

    Not as good as a real model, but stable and good enough for FAQ matching
    in a demo. Uses the hashing trick: each token bumps a bucket by a signed
    weight, then the vector is L2-normalised so cosine similarity is meaningful.
    """

    name = "hash"
    mode = "mock"

    def __init__(self, dim: int | None = None) -> None:
        self.dim = dim or settings.embedding_dim

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(t) for t in texts]

    def _embed_one(self, text: str) -> list[float]:
        vec = [0.0] * self.dim
        tokens = re.findall(r"[a-z0-9]+", text.lower())
        for tok in tokens:
            h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
            idx = h % self.dim
            sign = 1.0 if (h >> 8) & 1 else -1.0
            vec[idx] += sign
        return _l2_normalize(vec)

    def is_available(self) -> tuple[bool, str]:
        return True, f"dim={self.dim}, hashing trick"


class SentenceTransformerEmbedder(Embedder):
    """Local, open-source embeddings via sentence-transformers."""

    name = "sentence_transformers"
    mode = "open-source"

    def __init__(self) -> None:
        self._model = None
        self.dim = 384

    def _load(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer  # type: ignore

            self._model = SentenceTransformer("all-MiniLM-L6-v2")
            self.dim = self._model.get_sentence_embedding_dimension()
        return self._model

    async def embed(self, texts: list[str]) -> list[list[float]]:
        import asyncio

        def _run() -> list[list[float]]:
            model = self._load()
            return [v.tolist() for v in model.encode(texts, normalize_embeddings=True)]

        return await asyncio.to_thread(_run)

    def is_available(self) -> tuple[bool, str]:
        if not _module_available("sentence_transformers"):
            return False, "pip install sentence-transformers"
        return True, "all-MiniLM-L6-v2"


class OllamaEmbedder(Embedder):
    """Local, open-source embeddings served by Ollama (e.g. nomic-embed-text)."""

    name = "ollama"
    mode = "open-source"

    def __init__(self) -> None:
        self.dim = 768  # nomic-embed-text; corrected on first call

    async def embed(self, texts: list[str]) -> list[list[float]]:
        import httpx

        out: list[list[float]] = []
        async with httpx.AsyncClient(timeout=60) as client:
            for text in texts:
                resp = await client.post(
                    f"{settings.ollama_base_url}/api/embeddings",
                    json={"model": settings.ollama_embed_model, "prompt": text},
                )
                resp.raise_for_status()
                vec = resp.json()["embedding"]
                out.append(_l2_normalize(vec))
        if out:
            self.dim = len(out[0])
        return out

    def is_available(self) -> tuple[bool, str]:
        return True, f"{settings.ollama_embed_model} via Ollama"


class OpenAIEmbedder(Embedder):
    """Paid embeddings via the OpenAI API."""

    name = "openai"
    mode = "paid"
    dim = 1536

    async def embed(self, texts: list[str]) -> list[list[float]]:
        from openai import AsyncOpenAI  # type: ignore

        client = AsyncOpenAI(api_key=settings.openai_api_key)
        resp = await client.embeddings.create(
            model="text-embedding-3-small", input=texts
        )
        return [d.embedding for d in resp.data]

    def is_available(self) -> tuple[bool, str]:
        if not _module_available("openai"):
            return False, "pip install openai"
        if not settings.openai_api_key:
            return False, "set OPENAI_API_KEY"
        return True, "text-embedding-3-small"


class GeminiEmbedder(Embedder):
    """Free-tier embeddings via the Gemini API (text-embedding-004, 768-dim)."""

    name = "gemini"
    mode = "free-api"
    dim = 768

    async def embed(self, texts: list[str]) -> list[list[float]]:
        import httpx

        model = settings.gemini_embed_model
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:batchEmbedContents"
        )
        payload = {
            "requests": [
                {"model": f"models/{model}", "content": {"parts": [{"text": t}]}}
                for t in texts
            ]
        }
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                url, params={"key": settings.gemini_api_key}, json=payload
            )
            resp.raise_for_status()
            data = resp.json()
        vectors = [_l2_normalize(e["values"]) for e in data.get("embeddings", [])]
        if vectors:
            self.dim = len(vectors[0])
        return vectors

    def is_available(self) -> tuple[bool, str]:
        if not settings.gemini_api_key:
            return False, "set GEMINI_API_KEY"
        return True, f"{settings.gemini_embed_model} (free tier)"


def build_embedder(provider: str) -> Embedder:
    return {
        "hash": HashEmbedder,
        "ollama": OllamaEmbedder,
        "sentence_transformers": SentenceTransformerEmbedder,
        "openai": OpenAIEmbedder,
        "gemini": GeminiEmbedder,
    }.get(provider, HashEmbedder)()
