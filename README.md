# YouTube Comments Sentiment Analyser

Paste any YouTube video URL → see how audience sentiment changed month-by-month over the last 12 months.

**Live:** https://youtube-comment-analyser-1.onrender.com *(free-tier Render — first load can take ~a minute)*

## ✨ What it does

- Fetches up to **1,200 comments** (100 per month × 12 months, newest first) via the YouTube Data API v3
- Classifies each comment **Positive / Negative / Neutral** with VADER (rule-based engine tuned for social-media text; thresholds `≥ +0.05` / `≤ −0.05`)
- Interactive dashboard: monthly sentiment **trend line**, comment **volume bars**, overall + per-month **doughnut charts**
- **Top 3 positive & negative comments** per month, keyword search, **word cloud**, full **CSV export**

## 🏗️ How it works

```
URL → video ID (regex: watch / youtu.be / embed)
    → metadata + comments fetched in parallel (ThreadPoolExecutor)
    → month buckets (100 max each, paged newest-first)
    → VADER compound score per comment
    → JSON → Chart.js dashboard + wordcloud PNG + summary CSV
```

- **Backend** — `app.py` (Flask 3.1): `POST /analyze` (main API), `GET /download/<file>` (allow-listed wordcloud/CSV only), `GET /` serves the UI. Old generated files are cleaned on every analysis.
- **Frontend** — `index.html` + `static/script.js`: Bootstrap dark theme, Chart.js line/bar/doughnut charts, month filter buttons, keyword search.
- **Deploy** — `Procfile` (`gunicorn app:app`), `runtime.txt` (Python 3.10).

## 🚀 Run it locally

Prerequisites: Python 3.10+, a [YouTube Data API v3 key](https://console.cloud.google.com/) (free quota).

```bash
git clone https://github.com/amansingh1207/Youtube-Comment-Analyser-1.git
cd Youtube-Comment-Analyser-1
pip install -r requirements.txt
echo YOUTUBE_API_KEY=your_key_here > .env
python app.py
# open http://localhost:5000
```

On production set `YOUTUBE_API_KEY` as an environment variable and `FLASK_ENV=production`.

## 📁 Structure

```
app.py            Flask API: fetch → score → charts data → downloads
index.html        Single-page UI shell (Bootstrap dark)
static/script.js  Rendering: charts, filters, search, CSV link
requirements.txt  Pinned deps (Flask, VADER, pandas, wordcloud, google-api-client)
Procfile / runtime.txt   Render deploy config
```

## 🔭 Limitations / ideas

- VADER is English-centric; sampling caps at 100/month so huge comment sections are a sample, not a census.
- Videos with disabled comments (or invalid/private URLs) return a clean 404 — no crash.
- Ideas: transformer-based multilingual model, channel-wide comparison, caching repeat analyses.

## 🛠️ Tech stack

Python 3.10 · Flask 3.1 · VADER 3.3.2 · YouTube Data API v3 · pandas · wordcloud · Chart.js · Bootstrap 5 · Gunicorn · Render

## 👤 Author

[Aman Singh](https://github.com/amansingh1207) — B.Tech CSE, Sitare University.
