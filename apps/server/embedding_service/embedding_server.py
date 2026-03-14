from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
import os

app = FastAPI()

MODEL_NAME = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
model = SentenceTransformer(MODEL_NAME)


class EmbedRequest(BaseModel):
    texts: list[str]


@app.post("/embed")
def embed(req: EmbedRequest):
    embeddings = model.encode(
        req.texts,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    return {"embeddings": embeddings.tolist()}


@app.get("/info")
def info():
    return {
        "model": MODEL_NAME,
        "dimension": model.get_sentence_embedding_dimension(),
    }
