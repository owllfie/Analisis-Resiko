"""Latih model risiko ringan dan ekspor ke JSON untuk inferensi di browser.

Skrip ini HANYA dijalankan saat pengembangan / pembaruan model. Hasilnya berupa
artefak kecil yang disajikan sebagai file statis oleh frontend:

    frontend/public/models/risk-model.json   (bobot model + metadata)
    backend/src/services/modelInfo.json     (metadata untuk endpoint /api/risk-model)

Tidak ada Python, scikit-learn, atau data pelatihan yang perlu ikut ke VPS.

Jalankan (butuh Python 3.12 + requirements.txt):

    python export_client_model.py

Opsi:
    python export_client_model.py \
        --model-out ../frontend/public/models/risk-model.json \
        --meta-out ../backend/src/services/modelInfo.json \
        --golden-out model-golden.json

Model yang dipakai adalah MLP kecil (StandardScaler + MLPClassifier) agar:
- artefak JSON sangat kecil (puluhan-ratusan KB),
- inferensi di JavaScript cukup perkalian matriks + ReLU/softmax,
- penjelasan faktor kontribusi (ablasi) tetap bisa dihitung di browser.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
from scipy.optimize import minimize_scalar
from sklearn.inspection import permutation_importance
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from FEATURES import FEATURE_LABELS, FEATURE_NAMES
from train_model import (
    CLASS_LABELS,
    RANDOM_STATE,
    TEST_SIZE,
    generate_dataset,
    load_historical_dataset,
)

BASE_DIR = Path(__file__).resolve().parent
REPO_DIR = BASE_DIR.parent

DEFAULT_MODEL_OUT = REPO_DIR / "frontend" / "public" / "models" / "risk-model.json"
DEFAULT_META_OUT = REPO_DIR / "backend" / "src" / "services" / "modelInfo.json"
DEFAULT_GOLDEN_OUT = BASE_DIR / "model-golden.json"

MODEL_VERSION = "ml-mlp-v4"
N_SAMPLES = 30000
N_GOLDEN = 12

# Bobot keparahan tiap kelas untuk skor risiko kontinu (0-100).
# Nilai ini HARUS sama dengan frontend/src/ml/riskModel.js.
SEVERITY = {"low": 12.0, "medium": 50.0, "high": 90.0}


def to_plain(value):
    """Ubah tipe numpy/pandas menjadi tipe Python yang aman untuk json."""
    if isinstance(value, dict):
        return {str(k): to_plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_plain(v) for v in value]
    if isinstance(value, np.generic):
        return value.item()
    return value


def softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - np.max(logits, axis=1, keepdims=True)
    exps = np.exp(shifted)
    return exps / np.sum(exps, axis=1, keepdims=True)


def calibrated_probabilities(model: Pipeline, X: np.ndarray, temperature: float) -> np.ndarray:
    """Terapkan temperature scaling pada probabilitas model.

    Log probabilitas sama dengan logit dikurangi konstanta per sampel, sehingga
    pembagian dengan suhu lalu softmax menghasilkan hasil yang setara dengan
    membagi logit asli dengan suhu.
    """
    proba = np.clip(model.predict_proba(X), 1e-12, 1.0)
    logits = np.log(proba)
    return softmax(logits / temperature)


def fit_temperature(model: Pipeline, X_calib: np.ndarray, y_calib: np.ndarray) -> float:
    """Cari suhu T yang meminimalkan negative log-likelihood pada data kalibrasi."""
    classes = list(model.named_steps["mlp"].classes_)
    class_to_index = {label: index for index, label in enumerate(classes)}
    y_index = np.array([class_to_index[label] for label in y_calib])
    logits = np.log(np.clip(model.predict_proba(X_calib), 1e-12, 1.0))

    def nll(log_temperature: float) -> float:
        scaled = logits / np.exp(log_temperature)
        scaled = scaled - np.max(scaled, axis=1, keepdims=True)
        log_sum_exp = np.log(np.sum(np.exp(scaled), axis=1, keepdims=True))
        log_proba = scaled - log_sum_exp
        return float(-np.mean(log_proba[np.arange(len(y_index)), y_index]))

    # Rentang suhu 0.5 - 20 (dalam ruang log).
    result = minimize_scalar(nll, bounds=(np.log(0.5), np.log(20.0)), method="bounded")
    return float(np.clip(np.exp(result.x), 0.5, 20.0))


def build_model() -> Pipeline:
    """Model ringan yang ramah inferensi JavaScript."""
    return Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            (
                "mlp",
                MLPClassifier(
                    hidden_layer_sizes=(96, 48),
                    activation="relu",
                    solver="adam",
                    alpha=1e-4,
                    batch_size=256,
                    learning_rate_init=1e-3,
                    max_iter=300,
                    early_stopping=True,
                    validation_fraction=0.12,
                    n_iter_no_change=25,
                    random_state=RANDOM_STATE,
                ),
            ),
        ],
    )


def load_dataset() -> tuple[object, dict]:
    data = load_historical_dataset()
    if data is not None:
        meta = {
            "type": "historical",
            "n_samples": int(len(data)),
            "source": "historical_tasks.csv",
        }
        return data, meta
    print(f"[export] data historis tidak ada, memakai dataset simulasi ({N_SAMPLES} baris)...")
    data = generate_dataset(N_SAMPLES)
    return data, {"type": "synthetic", "n_samples": int(N_SAMPLES)}


def export_model_json(model: Pipeline, meta: dict, path: Path) -> None:
    scaler: StandardScaler = model.named_steps["scaler"]
    mlp: MLPClassifier = model.named_steps["mlp"]

    layers = []
    for weights, biases in zip(mlp.coefs_, mlp.intercepts_):
        layers.append(
            {
                "weights": [[round(float(v), 8) for v in row] for row in weights.tolist()],
                "biases": [round(float(v), 8) for v in biases.tolist()],
            }
        )

    payload = {
        "model_version": meta["model_version"],
        "algorithm": meta["algorithm"],
        "classes": meta["classes"],
        "feature_names": meta["feature_names"],
        "feature_labels": meta["feature_labels"],
        "scaler": {
            "mean": [round(float(v), 8) for v in scaler.mean_.tolist()],
            "scale": [round(float(v), 8) for v in scaler.scale_.tolist()],
        },
        "train_mean": meta["train_mean"],
        "activation": "relu",
        "output_activation": "softmax",
        "temperature": meta["temperature"],
        "layers": layers,
        "metrics": {
            "accuracy": meta["metrics"]["accuracy"],
            "macro_f1": meta["metrics"]["macro_f1"],
        },
        "feature_importances": meta["feature_importances"],
        "dataset": meta["dataset"],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"[export] model ditulis ke {path} ({path.stat().st_size / 1024:.1f} KB)")


def export_meta_json(meta: dict, path: Path) -> None:
    payload = {
        "model_version": meta["model_version"],
        "algorithm": meta["algorithm"],
        "engine": "client",
        "available": True,
        "temperature": meta["temperature"],
        "classes": meta["classes"],
        "feature_names": meta["feature_names"],
        "feature_labels": meta["feature_labels"],
        "feature_importances": meta["feature_importances"],
        "metrics": {
            "accuracy": meta["metrics"]["accuracy"],
            "macro_f1": meta["metrics"]["macro_f1"],
        },
        "dataset": meta["dataset"],
        "note": "Model berjalan langsung di browser (client-side); backend hanya menyimpan hasil.",
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    print(f"[export] metadata ditulis ke {path}")


def export_golden(model: Pipeline, X_test: np.ndarray, temperature: float, path: Path) -> None:
    """Simpan beberapa contoh untuk menguji parity Python vs JavaScript."""
    rng = np.random.default_rng(RANDOM_STATE)
    indices = rng.choice(len(X_test), size=min(N_GOLDEN, len(X_test)), replace=False)
    classes = list(model.named_steps["mlp"].classes_)
    proba_all = calibrated_probabilities(model, X_test, temperature)
    samples = []
    for idx in indices:
        x = np.asarray(X_test[idx], dtype=float)
        proba = proba_all[idx]
        proba_map = {cls: float(p) for cls, p in zip(classes, proba)}
        risk_level = max(proba_map, key=proba_map.get)
        risk_score = float(sum(proba_map[c] * SEVERITY[c] for c in classes))
        samples.append(
            {
                "features": {name: float(v) for name, v in zip(FEATURE_NAMES, x)},
                "probabilities": {c: round(proba_map[c], 8) for c in classes},
                "risk_level": risk_level,
                "risk_score": round(risk_score, 4),
            }
        )
    payload = {
        "model_version": MODEL_VERSION,
        "feature_names": FEATURE_NAMES,
        "classes": classes,
        "samples": samples,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    print(f"[export] golden test vectors ditulis ke {path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Latih & ekspor model risiko client-side")
    parser.add_argument("--model-out", type=Path, default=DEFAULT_MODEL_OUT)
    parser.add_argument("--meta-out", type=Path, default=DEFAULT_META_OUT)
    parser.add_argument("--golden-out", type=Path, default=DEFAULT_GOLDEN_OUT)
    args = parser.parse_args()

    t_start = time.time()
    data, dataset_meta = load_dataset()

    X = data[FEATURE_NAMES].to_numpy(dtype=float)
    y = data["risk_level"].to_numpy()

    X_train_full, X_test, y_train_full, y_test = train_test_split(
        X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE, stratify=y
    )
    # Pisahkan sebagian data latih untuk kalibrasi probabilitas (temperature scaling),
    # supaya model tidak terlalu percaya diri dan faktor kontribusi tetap informatif.
    X_train, X_calib, y_train, y_calib = train_test_split(
        X_train_full, y_train_full, test_size=0.1, random_state=RANDOM_STATE, stratify=y_train_full
    )

    print(f"[export] melatih MLP pada {len(X_train)} sampel latih...")
    model = build_model()
    model.fit(X_train, y_train)

    temperature = fit_temperature(model, X_calib, y_calib)
    calibrated_test = calibrated_probabilities(model, X_test, temperature)
    classes = list(model.named_steps["mlp"].classes_)
    y_pred = np.array(classes)[np.argmax(calibrated_test, axis=1)]
    acc = float(accuracy_score(y_test, y_pred))
    macro_f1 = float(f1_score(y_test, y_pred, average="macro"))
    report = classification_report(y_test, y_pred, output_dict=True, digits=4)
    cm = confusion_matrix(y_test, y_pred, labels=CLASS_LABELS)
    print(f"[export] suhu kalibrasi: {temperature:.4f}")
    print(f"[export] akurasi uji: {acc:.4f} | macro-F1 uji: {macro_f1:.4f}")
    print(classification_report(y_test, y_pred, digits=4))

    # Feature importance: permutation importance (lebih bermakna daripada bobot mentah).
    print("[export] menghitung permutation importance...")
    sample_n = min(2000, len(X_test))
    imp = permutation_importance(
        model,
        X_test[:sample_n],
        y_test[:sample_n],
        n_repeats=3,
        random_state=RANDOM_STATE,
        scoring="f1_macro",
        n_jobs=1,
    )
    importances = np.clip(imp.importances_mean, 0, None)
    total = float(importances.sum())
    if total <= 0:
        importances = np.full(len(FEATURE_NAMES), 1.0 / len(FEATURE_NAMES))
    else:
        importances = importances / total

    mlp: MLPClassifier = model.named_steps["mlp"]
    meta = {
        "model_version": MODEL_VERSION,
        "algorithm": f"MLPClassifier({','.join(map(str, mlp.hidden_layer_sizes))})",
        "classes": list(mlp.classes_),
        "feature_names": FEATURE_NAMES,
        "feature_labels": FEATURE_LABELS,
        "feature_importances": [round(float(v), 8) for v in importances.tolist()],
        "train_mean": [round(float(v), 8) for v in X_train.mean(axis=0).tolist()],
        "temperature": round(float(temperature), 8),
        "metrics": {
            "accuracy": round(acc, 6),
            "macro_f1": round(macro_f1, 6),
            "classification_report": to_plain(report),
            "confusion_matrix": {
                "labels": CLASS_LABELS,
                "matrix": cm.tolist(),
            },
            "n_train": int(len(X_train)),
            "n_calibration": int(len(X_calib)),
            "n_test": int(len(X_test)),
        },
        "dataset": dataset_meta,
    }

    export_model_json(model, meta, args.model_out)
    export_meta_json(meta, args.meta_out)
    export_golden(model, X_test, temperature, args.golden_out)

    print(f"[export] selesai dalam {time.time() - t_start:.1f} detik")


if __name__ == "__main__":
    main()
