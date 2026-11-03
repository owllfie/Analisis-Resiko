"""Definisi fitur bersama antara pelatihan dan inferensi.

Urutan fitur di sini WAJIB sama antara train_model.py dan app.py agar vektor
fitur konsisten.
"""

FEATURE_NAMES = [
    "duration_days",
    "progress",
    "days_remaining",
    "importance",
    "dependency_count",
    "unfinished_dependency_count",
    "assignee_workload",
    "team_size",
    "project_complexity",
    "manager_experience",
    "historical_risk_score",
    "budget_per_task",
]

# Label fitur dalam Bahasa Indonesia untuk penjelasan ke pengguna.
FEATURE_LABELS = {
    "duration_days": "Durasi rencana tugas",
    "progress": "Progres tugas",
    "days_remaining": "Sisa hari menuju tenggat",
    "importance": "Tingkat kepentingan",
    "dependency_count": "Jumlah tugas prasyarat",
    "unfinished_dependency_count": "Prasyarat belum selesai",
    "assignee_workload": "Beban kerja penanggung jawab",
    "team_size": "Ukuran tim",
    "project_complexity": "Kompleksitas proyek",
    "manager_experience": "Pengalaman manajer",
    "historical_risk_score": "Riwayat skor risiko",
    "budget_per_task": "Anggaran per tugas",
}

MODEL_VERSION = "ml-ens-v3"
