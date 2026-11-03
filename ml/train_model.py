"""Pelatihan model Machine Learning untuk analisis risiko proyek (v3).

Skrip ini:
1. Menyiapkan dataset — memuat `historical_tasks.csv` bila ada (data nyata),
   atau mensimulasikan dataset sintetis yang lebih realistis jika tidak ada.
2. Membandingkan beberapa kandidat model (gradient boosting, random forest,
   extra trees, dan soft-voting ensemble) dengan cross-validation Stratified
   5-fold, lalu memilih yang terbaik berdasarkan macro-F1.
3. Menyimpan model terpilih ke `risk_model.pkl` dan metadata ke `model_meta.json`.

Catatan jujur tentang data: sampai saat ini data default masih SINTETIS
(generate_dataset) untuk keperluan demonstrasi/pelatihan. Untuk memakai data
historis nyata, letakkan file `historical_tasks.csv` di samping skrip ini
dengan kolom = 12 nama fitur di FEATURE_NAMES + kolom label `risk_level`
(nilai: low / medium / high). Bila file itu ada, file tersebut yang dipakai.

Jalankan:  python train_model.py
"""

import json
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import (
    ExtraTreesClassifier,
    HistGradientBoostingClassifier,
    RandomForestClassifier,
    VotingClassifier,
)
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.model_selection import StratifiedKFold, train_test_split

from FEATURES import FEATURE_LABELS, FEATURE_NAMES, MODEL_VERSION

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "risk_model.pkl"
META_PATH = BASE_DIR / "model_meta.json"

# Opsional: file data historis nyata (12 kolom fitur + kolom `risk_level`).
# Bila file ini ada, dataset sintetis TIDAK dipakai.
HISTORICAL_CSV = BASE_DIR / "historical_tasks.csv"

RANDOM_STATE = 42
N_SAMPLES = 30000
CLASS_LABELS = ["low", "medium", "high"]
TEST_SIZE = 0.2
N_FOLDS = 5


# ---------------------------------------------------------------------------
# 1. Sumber dataset
# ---------------------------------------------------------------------------


def load_historical_dataset() -> pd.DataFrame | None:
    """Memuat dataset historis nyata dari CSV bila tersedia.

    Syarat: kolom fitur sesuai FEATURE_NAMES (urutan tidak masalah, akan
    dirapikan) dan kolom `risk_level` berisi low/medium/high. Mengembalikan
    None bila file tidak ada atau tidak valid (lalu jatuh ke data sintetis).
    """
    if not HISTORICAL_CSV.exists():
        return None
    print(f"[train] data historis ditemukan: {HISTORICAL_CSV.name}, memuat...")
    df = pd.read_csv(HISTORICAL_CSV)
    missing = [c for c in FEATURE_NAMES + ["risk_level"] if c not in df.columns]
    if missing:
        print(f"[train] PERINGATAN: kolom hilang {missing}, fallback ke data sintetis.")
        return None
    df = df[FEATURE_NAMES + ["risk_level"]].dropna()
    df["risk_level"] = df["risk_level"].astype(str).str.lower().str.strip()
    invalid = set(df["risk_level"].unique()) - set(CLASS_LABELS)
    if invalid or len(df) < 200:
        print(
            f"[train] PERINGATAN: label tidak valid {sorted(invalid) if invalid else 'dataset terlalu kecil'},"
            " fallback ke data sintetis."
        )
        return None
    for col in FEATURE_NAMES:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=FEATURE_NAMES)
    return df.reset_index(drop=True)


def generate_dataset(n: int, seed: int = RANDOM_STATE) -> pd.DataFrame:
    """Membuat dataset simulasi risiko proyek yang lebih realistis.

    Beberapa prinsip agar data berguna untuk pembelajaran mesin:
    - Sebaran marginal realistis (bukan seragam): durasi miring kanan,
      progres berbentuk beta, anggaran gamma, ukuran tim terkelompok, dsb.
    - Fitur saling berkorelasi secara wajar (mis. prasyarat belum selesai
      makin banyak bila progres rendah; riwayat risiko naik bersama
      kompleksitas proyek).
    - Skor risiko laten dibentuk dari interaksi NON-LINIER antar fitur
      (efek jenuh beban kerja, kompensasi tenggat sempit + progres rendah,
      prasyarat tertunda × tugas terlambat, dsb), sehingga model harus benar-
      benar mempelajari pola, bukan sekadar menjumlahkan.
    - Derau label ringan dan terkendali: gangguan gaussian pada skor laten,
      ditambah pembalikan label kecil HANYA pada kasus yang berbatasan
      dengan ambang kelas (meniru ketidaksepakatan penilai manusia).
    """
    rng = np.random.default_rng(seed)

    # --- Sebaran marginal tiap fitur (miring/berkelompok seperti data nyata) ---
    # Durasi rencana: miring kanan (kebanyakan tugas pendek-sedang).
    duration_days = np.clip(np.round(rng.lognormal(3.4, 0.55, n)), 1, 180).astype(int)

    # Progres: berbentuk beta, sedikit condong ke bawah (banyak tugas baru).
    progress = np.clip(np.round(100 * rng.beta(2.0, 2.3, n)), 0, 100).astype(int)

    # Sisa hari: campuran — sebagian tugas sudah terlambat (negatif).
    overdue_mask = rng.random(n) < 0.22
    days_remaining = np.where(
        overdue_mask,
        -np.clip(np.round(rng.lognormal(2.0, 0.6, n)), 1, 60),
        np.clip(np.round(rng.normal(30, 32, n)), 0, 150),
    ).astype(int)

    # Kepentingan: kategorikal miring (mayoritas rendah/sedang).
    importance = rng.choice([0, 1, 2], size=n, p=[0.45, 0.35, 0.20])

    # Jumlah prasyarat: zero-inflated Poisson.
    dependency_count = np.clip(
        np.where(rng.random(n) < 0.18, 0, rng.poisson(3.2, n)), 0, 12
    )

    # Prasyarat belum selesai: bergantung pada progres & keterlambatan —
    # makin rendah progres / makin terlambat, makin banyak yang belum beres.
    p_unfinished = np.clip(0.90 - 0.007 * progress + 0.15 * overdue_mask, 0.05, 0.95)
    unfinished_dependency_count = rng.binomial(dependency_count, p_unfinished)

    # Beban kerja penanggung jawab: terkelompok (ringan vs overloaded).
    light = rng.poisson(2.5, n)
    heavy = 5 + rng.poisson(3.5, n)
    assignee_workload = np.where(rng.random(n) < 0.65, light, heavy)

    # Ukuran tim: mayoritas tim kecil-menengah.
    team_size = np.clip(np.round(rng.lognormal(1.6, 0.55, n)) + 1, 1, 20).astype(int)

    # Kompleksitas proyek: beta ter-skala 1..40.
    project_complexity = np.clip(np.round(1 + 39 * rng.beta(2.0, 2.5, n)), 1, 40).astype(int)

    # Pengalaman manajer: beta ter-skala 0..20, sedikit berkorelasi terbalik
    # dengan kompleksitas proyek yang ditanganinya.
    exp_beta = rng.beta(2.2, 2.0, n)
    manager_experience = np.clip(
        np.round(20 * (0.75 * exp_beta + 0.25 * (1 - project_complexity / 40.0))), 0, 20
    ).astype(int)

    # Riwayat skor risiko: makin kompleks proyek, riwayatnya makin jelek.
    hist_beta = rng.beta(2.0, 2.2, n)
    historical_risk_score = np.clip(
        np.round(100 * (0.60 * hist_beta + 0.40 * (project_complexity / 40.0))), 0, 100
    ).astype(int)

    # Anggaran per tugas: gamma (mayoritas kecil, ekor panjang).
    budget_per_task = np.round(np.clip(rng.gamma(2.0, 25.0, n), 0.5, 400.0), 1)

    features = pd.DataFrame(
        {
            "duration_days": duration_days,
            "progress": progress,
            "days_remaining": days_remaining,
            "importance": importance,
            "dependency_count": dependency_count,
            "unfinished_dependency_count": unfinished_dependency_count,
            "assignee_workload": assignee_workload,
            "team_size": team_size,
            "project_complexity": project_complexity,
            "manager_experience": manager_experience,
            "historical_risk_score": historical_risk_score,
            "budget_per_task": budget_per_task,
        }
    )[FEATURE_NAMES]

    # --- Skor risiko laten (ground truth simulasi) dengan efek non-linier ---
    prog_def = (100.0 - progress) / 100.0  # definisi progres (0..1)
    overdue = np.clip(-days_remaining / 20.0, 0, 1.5)  # bobot keterlambatan
    # Rasio sisa waktu terhadap durasi rencana; kecil = tenggat sempit.
    sisa_rel = days_remaining / np.maximum(duration_days, 1.0)
    tight = np.clip(1.5 - sisa_rel, 0, 2.0)
    dep_ratio = np.divide(
        unfinished_dependency_count,
        dependency_count,
        out=np.zeros(n, dtype=float),
        where=dependency_count > 0,
    )

    score = (
        6.0  # basis
        # Keterlambatan: efek super-linear (makin telat makin parah).
        + 22.0 * overdue**1.4
        # Kompensasi: tenggat sempit jauh lebih berbahaya bila progres rendah.
        + 9.0 * tight * (0.4 + 0.6 * prog_def)
        # Defisit progres dengan efek melemah pada angka kecil.
        + 11.0 * prog_def**1.5
        # Prasyarat tertunda, diperparah saat tugas sudah terlambat.
        + 6.0 * unfinished_dependency_count
        + 9.0 * overdue * dep_ratio
        # Beban kerja: linier ringan lalu jenuh-melonjak di atas kapasitas (6).
        + 3.0 * assignee_workload
        + 7.0 * np.clip(assignee_workload - 6, 0, None) ** 1.5
        # Kompleksitas: kuadratik, diredam oleh pengalaman manajer.
        + 0.30 * project_complexity
        + 0.012 * project_complexity**2 * np.clip(1.0 - manager_experience / 25.0, 0.2, 1.0)
        # Kepentingan tinggi: kontribusi kecil bila aman, besar bila bermasalah.
        + 1.5 * importance
        + 3.0 * importance * (prog_def + 0.5 * tight)
        # Pengalaman manajer: efek melemah (diminishing returns).
        + 18.0 * manager_experience / (manager_experience + 8.0)
        # Ukuran tim: manfaat melemah; tim kecil berbahaya pada proyek kompleks.
        - 4.0 * np.log1p(team_size)
        + 0.30 * project_complexity * (team_size <= 3)
        # Riwayat risiko proyek.
        + 0.16 * historical_risk_score
        # Anggaran kurang: risiko melonjak di bawah ambang tertentu.
        + 12.0 * np.clip((60.0 - budget_per_task) / 60.0, 0, 1.5) ** 2
        # Terlalu singkat untuk pekerjaan kompleks ("rushed").
        + 8.0 * np.clip((14.0 - duration_days) / 14.0, 0, 1.0) * (project_complexity / 40.0)
    )

    # Kalibrasi skor laten ke skala 0-100 dengan sebaran seragam, agar
    # proporsi tiap kelas seimbang. Tanpa kalibrasi, sebaran fitur yang
    # realistis membuat mayoritas tugas jatuh ke kelas "high" dan kelas
    # "low" jadi langka — metrik makro (macro-F1) pun anjlok karena kelas
    # yang langka sulit dipelajari.
    order = np.argsort(score)
    rank = np.empty(n, dtype=float)
    rank[order] = np.arange(n)
    score = 100.0 * rank / (n - 1)

    # Derau gaussian pada skor (meniru variasi dunia nyata yang tak teramati).
    score = np.clip(score + rng.normal(0.0, 4.0, n), 0, 100)

    labels = np.where(score < 38, "low", np.where(score < 66, "medium", "high"))

    # Derau label terkendali: balik label HANYA pada kasus yang berbatasan
    # dengan ambang kelas (penilai manusia paling sering tidak setuju di
    # sini). Kasus jauh dari ambang tidak disentuh agar struktur tetap
    # dapat dipelajari model kuat.
    near_low_thr = np.abs(score - 38.0) < 3.0    # batas low/medium
    near_high_thr = np.abs(score - 66.0) < 3.0   # batas medium/high
    flip = (near_low_thr | near_high_thr) & (rng.random(n) < 0.25)
    # Balikkan ke kelas bertetangga (low<->medium di ambang 38, medium<->high di 66).
    labels[flip & near_low_thr] = np.where(labels[flip & near_low_thr] == "low", "medium", "low")
    labels[flip & near_high_thr] = np.where(labels[flip & near_high_thr] == "high", "medium", "high")

    features["risk_level"] = labels
    return features


# ---------------------------------------------------------------------------
# 2. Pelatihan & pemilihan model
# ---------------------------------------------------------------------------


def build_candidates() -> dict:
    """Kandidat model yang dibandingkan dengan cross-validation.

    Catatan: bila model dibungkus VotingClassifier, estimator di dalamnya
    memakai n_jobs=None (SerialBackend) supaya paralelisasi ditangani lapisan
    terluar. Dengan begitu joblib tidak membuat kolam proses (loky) di dalam
    `python train_model.py` yang dijalankan saat `docker build` — proses loky
    memunculkan error resource-tracker yang berisik ketika kontainer build
    keluar.
    """
    hgb = HistGradientBoostingClassifier(
        learning_rate=0.07,
        max_iter=450,
        max_leaf_nodes=63,
        min_samples_leaf=20,
        l2_regularization=1.0,
        early_stopping=True,
        random_state=RANDOM_STATE,
    )
    hgb_in_ensemble = HistGradientBoostingClassifier(
        learning_rate=0.07,
        max_iter=450,
        max_leaf_nodes=63,
        min_samples_leaf=20,
        l2_regularization=1.0,
        early_stopping=True,
        random_state=RANDOM_STATE,
    )
    rf = RandomForestClassifier(
        n_estimators=350,
        max_depth=None,
        min_samples_leaf=2,
        max_features="sqrt",
        n_jobs=-1,
        random_state=RANDOM_STATE,
    )
    et = ExtraTreesClassifier(
        n_estimators=350,
        min_samples_leaf=2,
        max_features="sqrt",
        n_jobs=-1,
        random_state=RANDOM_STATE,
    )
    et_in_ensemble = ExtraTreesClassifier(
        n_estimators=350,
        min_samples_leaf=2,
        max_features="sqrt",
        n_jobs=None,
        random_state=RANDOM_STATE,
    )
    vote = VotingClassifier(
        estimators=[("hgb", hgb_in_ensemble), ("et", et_in_ensemble)],
        voting="soft",
        n_jobs=None,
    )
    return {
        "HistGradientBoostingClassifier": hgb,
        "RandomForestClassifier": rf,
        "ExtraTreesClassifier": et,
        "SoftVoting(HGB+ET)": vote,
    }


def select_best_model(X: np.ndarray, y: np.ndarray) -> tuple[str, object, list[dict]]:
    """Memilih model terbaik via StratifiedKFold 5-fold (macro-F1)."""
    cv = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=RANDOM_STATE)
    results: list[dict] = []
    best_name, best_model, best_score = None, None, -1.0
    # Backend threading: pekerjaan paralel (RF/ET/Voting) memakai thread,
    # bukan proses — terutama agar bersih saat training dijalankan di dalam
    # `docker build` (proses loky sering memunculkan error resource-tracker
    # saat keluar dari kontainer build).
    with joblib.parallel_backend("threading"):
        for name, est in build_candidates().items():
            t0 = time.time()
            scores = []
            for tr, va in cv.split(X, y):
                est.fit(X[tr], y[tr])
                pred = est.predict(X[va])
                scores.append(f1_score(y[va], pred, average="macro"))
            mean_f1 = float(np.mean(scores))
            std_f1 = float(np.std(scores))
            elapsed = time.time() - t0
            print(
                f"[train] CV {name}: macro-F1 = {mean_f1:.4f} ± {std_f1:.4f} "
                f"({N_FOLDS} fold, {elapsed:.1f} dtk)"
            )
            results.append(
                {
                    "model": name,
                    "cv_macro_f1_mean": round(mean_f1, 4),
                    "cv_macro_f1_std": round(std_f1, 4),
                    "cv_macro_f1_per_fold": [round(s, 4) for s in scores],
                }
            )
            if mean_f1 > best_score:
                best_name, best_model, best_score = name, est, mean_f1
    print(f"[train] model terpilih (CV): {best_name} (macro-F1={best_score:.4f})")
    return best_name, best_model, results


def extract_feature_importances(model) -> np.ndarray:
    """Mengambil importance fitur dari model apa pun (untuk metadata/penjelasan).

    Mendukung estimator scikit-learn biasa (feature_importances_) maupun
    VotingClassifier (dirata-rata dari anggota yang mendukung).
    """
    if hasattr(model, "feature_importances_"):
        imp = np.asarray(model.feature_importances_, dtype=float)
    elif hasattr(model, "estimators_"):
        imps = [
            np.asarray(m.feature_importances_, dtype=float)
            for m in model.estimators_
            if hasattr(m, "feature_importances_")
        ]
        imp = np.mean(imps, axis=0) if imps else np.ones(len(FEATURE_NAMES))
    else:
        imp = np.ones(len(FEATURE_NAMES))
    total = imp.sum()
    return imp / total if total > 0 else np.full(len(FEATURE_NAMES), 1.0 / len(FEATURE_NAMES))


def main() -> None:
    t_start = time.time()

    data = load_historical_dataset()
    dataset_meta: dict
    if data is not None:
        dataset_meta = {"type": "historical", "n_samples": int(len(data)), "source": HISTORICAL_CSV.name}
    else:
        print(f"[train] data historis tidak ada, menghasilkan dataset simulasi ({N_SAMPLES} baris)...")
        data = generate_dataset(N_SAMPLES)
        dataset_meta = {"type": "synthetic", "n_samples": int(N_SAMPLES)}

    X = data[FEATURE_NAMES].to_numpy(dtype=float)
    y = data["risk_level"].to_numpy()

    dist = pd.Series(y).value_counts().reindex(CLASS_LABELS).fillna(0).astype(int)
    print("[train] distribusi kelas:", dist.to_dict())

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE, stratify=y
    )

    print(f"[train] membandingkan kandidat model (CV StratifiedKFold {N_FOLDS}-fold)...")
    best_name, model, cv_results = select_best_model(X_train, y_train)

    # Latih ulang model terpilih pada seluruh data latih, lalu evaluasi ONCE
    # pada set uji yang sebelumnya belum pernah dilihat.
    print(f"[train] melatih ulang {best_name} pada seluruh data latih...")
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    acc = float(accuracy_score(y_test, y_pred))
    macro_f1 = float(f1_score(y_test, y_pred, average="macro"))
    report = classification_report(y_test, y_pred, output_dict=True, digits=4)
    print(f"[train] akurasi uji: {acc:.4f} | macro-F1 uji: {macro_f1:.4f}")
    print(classification_report(y_test, y_pred, digits=4))
    print("confusion matrix:", confusion_matrix(y_test, y_pred, labels=CLASS_LABELS).tolist())

    # Statistik normalisasi untuk menjelaskan kontribusi fitur per prediksi
    # (dipakai app.py pada metode ablasi).
    mean = X_train.mean(axis=0)
    std = X_train.std(axis=0)
    std[std == 0] = 1.0

    cv_best = max(r["cv_macro_f1_mean"] for r in cv_results)
    meta = {
        "model_version": MODEL_VERSION,
        "algorithm": best_name,
        "feature_names": FEATURE_NAMES,
        "feature_labels": FEATURE_LABELS,
        "classes": list(model.classes_),
        "feature_importances": [float(v) for v in extract_feature_importances(model)],
        "train_mean": [float(v) for v in mean],
        "train_std": [float(v) for v in std],
        "metrics": {
            "accuracy": acc,
            "macro_f1": macro_f1,
            "cv_macro_f1_mean": round(float(cv_best), 4),
            "cv_results": cv_results,
            "n_train": int(len(X_train)),
            "n_test": int(len(X_test)),
            "classification_report": report,
            "confusion_matrix": {
                "labels": CLASS_LABELS,
                "matrix": confusion_matrix(y_test, y_pred, labels=CLASS_LABELS).tolist(),
            },
        },
        "dataset": dataset_meta,
    }

    joblib.dump({"model": model, "meta": meta}, MODEL_PATH)
    with META_PATH.open("w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=2)

    print(f"[train] selesai dalam {time.time() - t_start:.1f} detik")
    print(f"[train] model disimpan ke {MODEL_PATH.name} dan {META_PATH.name}")


if __name__ == "__main__":
    main()
