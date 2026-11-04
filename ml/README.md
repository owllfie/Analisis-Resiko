# Model ML (offline / training saja)

Folder ini **tidak di-deploy ke VPS**. Tidak ada Python, scikit-learn, `.pkl`, atau
data pelatihan yang perlu ikut ke hosting. Inferensi berjalan di browser.

## Cara memperbarui model

1. Siapkan Python 3.12 (lokal/CI), lalu:
   ```bash
   cd ml
   pip install -r requirements.txt
   ```
2. (Opsional) letakkan data historis nyata di `ml/historical_tasks.csv`
   (12 kolom fitur + kolom `risk_level`). Bila tidak ada, dipakai dataset simulasi.
3. Latih dan ekspor model:
   ```bash
   python export_client_model.py
   ```
4. Commit artefak hasil ekspor:
   - `frontend/public/models/risk-model.json` — bobot model + metadata
   - `backend/src/services/modelInfo.json` — metadata untuk `GET /api/risk-model`
   - `ml/model-golden.json` — fixture kecil untuk uji parity (bukan data pelatihan)

Naikkan `MODEL_VERSION` di `export_client_model.py` setiap kali model berubah agar
cache browser tidak memakai bobot lama.

Model yang diekspor adalah MLP kecil (`StandardScaler → Dense(ReLU) → Dense(ReLU) →
Softmax`) sehingga ukurannya kecil dan bisa dijalankan dengan JavaScript biasa.
Penjelasan faktor kontribusi dihitung dengan ablasi fitur, sama seperti sebelumnya.

## Verifikasi parity Python vs JavaScript

`export_client_model.py` juga menulis `ml/model-golden.json` (contoh input + probabilitas
acuan). Dari folder `frontend/`:

```bash
bun run test:model
```

## Yang tidak boleh di-commit / di-deploy

- `ml/*.pkl`, `ml/model_meta.json`, `ml/historical_tasks.csv`
- seluruh file Python dan `__pycache__/`

`ml/model-golden.json` hanya berisi 12 contoh kecil untuk uji parity — bukan data
pelatihan — dan aman di-commit. File itu tetap tidak ikut ke image hosting karena
folder `ml/` dikecualikan dari build context.
