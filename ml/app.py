"""Layanan prediksi risiko berbasis Machine Learning (v3).

Memuat model scikit-learn (`risk_model.pkl`) dan menyediakan API HTTP:
- GET  /health          -> status layanan
- GET  /model-info      -> metadata model (akurasi, feature importance)
- POST /predict         -> prediksi satu item
- POST /predict/batch   -> prediksi banyak item sekaligus

Dijalankan dengan: uvicorn app:app --host 0.0.0.0 --port 8000
"""

from pathlib import Path
from typing import Optional

import joblib
import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel

from FEATURES import FEATURE_LABELS, FEATURE_NAMES, MODEL_VERSION

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "risk_model.pkl"

# Bobot keparahan tiap kelas untuk membentuk skor risiko kontinu (0-100).
SEVERITY = {"low": 12.0, "medium": 50.0, "high": 90.0}
MAX_CONTRIBUTIONS = 6


def load_artifacts():
    if not MODEL_PATH.exists():
        # Latih otomatis bila artefak belum ada (mis. pengembangan lokal).
        print("[ml] model tidak ditemukan, melatih sekarang...")
        import train_model

        train_model.main()
    bundle = joblib.load(MODEL_PATH)
    return bundle["model"], bundle["meta"]


model, META = load_artifacts()

CLASSES = list(META["classes"])
FEATURE_IMPORTANCES = np.array(META["feature_importances"], dtype=float)
TRAIN_MEAN = np.array(META["train_mean"], dtype=float)
TRAIN_STD = np.array(META["train_std"], dtype=float)


class TaskFeatures(BaseModel):
    duration_days: float = 0
    progress: float = 0
    days_remaining: float = 0
    importance: float = 0
    dependency_count: float = 0
    unfinished_dependency_count: float = 0
    assignee_workload: float = 0
    team_size: float = 1
    project_complexity: float = 1
    manager_experience: float = 0
    historical_risk_score: float = 0
    budget_per_task: float = 0
    task_id: Optional[int] = None


class BatchRequest(BaseModel):
    items: list[TaskFeatures]


def to_vector(item: TaskFeatures) -> np.ndarray:
    data = item.model_dump()
    return np.array([float(data[name]) for name in FEATURE_NAMES], dtype=float)


def severity_of(proba_map: dict) -> float:
    return float(sum(proba_map[c] * SEVERITY[c] for c in CLASSES))


def predict_one(item: TaskFeatures) -> dict:
    x = to_vector(item)
    proba = model.predict_proba(x.reshape(1, -1))[0]
    proba_map = {cls: float(p) for cls, p in zip(CLASSES, proba)}

    risk_level = max(proba_map, key=proba_map.get)
    confidence = proba_map[risk_level]
    risk_score = round(severity_of(proba_map), 2)

    # Penjelasan kontribusi per fitur dengan metode ablasi (occlusion):
    # tiap fitur dikembalikan ke nilai rata-rata pelatihan, lalu diukur perubahan
    # skor risiko. Nilai positif berarti fitur MENAIKKAN risiko (dan sebaliknya).
    baseline = np.tile(x, (len(FEATURE_NAMES), 1))
    for j in range(len(FEATURE_NAMES)):
        baseline[j, j] = TRAIN_MEAN[j]
    abl_proba = model.predict_proba(baseline)
    abl_scores = [severity_of({c: float(p) for c, p in zip(CLASSES, row)}) for row in abl_proba]
    contributions = np.array([risk_score - s for s in abl_scores], dtype=float)

    order = np.argsort(np.abs(contributions))[::-1][:MAX_CONTRIBUTIONS]
    drivers = []
    for idx in order:
        name = FEATURE_NAMES[idx]
        value = float(x[idx])
        contrib = float(contributions[idx])
        drivers.append(
            {
                "feature": name,
                "label": FEATURE_LABELS.get(name, name),
                "value": round(value, 2),
                "contribution": round(contrib, 2),
                "direction": "up" if contrib > 0 else "down",
            }
        )

    return {
        "task_id": item.task_id,
        "risk_level": risk_level,
        "risk_score": risk_score,
        "confidence": round(confidence, 4),
        "probabilities": {c: round(proba_map[c], 4) for c in CLASSES},
        "drivers": drivers,
        "feature_importances": {
            name: round(float(imp), 6)
            for name, imp in zip(FEATURE_NAMES, FEATURE_IMPORTANCES)
        },
        "model_version": MODEL_VERSION,
    }


app = FastAPI(title="SIMProyek Risk ML Service", version=MODEL_VERSION)


@app.get("/health")
def health():
    return {"status": "ok", "model_version": MODEL_VERSION, "model_loaded": model is not None}


@app.get("/model-info")
def model_info():
    return {
        "model_version": MODEL_VERSION,
        "algorithm": META["algorithm"],
        "classes": CLASSES,
        "feature_names": FEATURE_NAMES,
        "feature_labels": FEATURE_LABELS,
        "feature_importances": META["feature_importances"],
        "metrics": {"accuracy": META["metrics"]["accuracy"]},
        "dataset": META.get("dataset", {}),
    }


@app.post("/predict")
def predict(item: TaskFeatures):
    return predict_one(item)


@app.post("/predict/batch")
def predict_batch(payload: BatchRequest):
    return {"results": [predict_one(item) for item in payload.items]}
