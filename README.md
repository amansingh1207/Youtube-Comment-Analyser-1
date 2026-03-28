# YouTube Comments Sentiment Analyser

A full-stack web application that fetches up to **100 comments per month for the last 12 months** from any YouTube video and performs real-time sentiment analysis using VADER, visualised through interactive charts, a word cloud, and a downloadable CSV report.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [System Architecture & Workflow](#system-architecture--workflow)
4. [Core Logic Explained](#core-logic-explained)
5. [How VADER Works](#how-vader-works)
6. [API & Quota Management](#api--quota-management)
7. [Project Structure](#project-structure)
8. [Local Setup](#local-setup)
9. [Deployment Guide](#deployment-guide)
10. [Problems Faced & Solutions](#problems-faced--solutions)
11. [Interview Questions & Answers](#interview-questions--answers)

---

## Project Overview

| Feature | Detail |
|---|---|
| Input | Any YouTube video URL |
| Data fetched | Up to 100 comments/month × 12 months = 1200 comments max |
| Analysis | VADER sentiment (Positive / Negative / Neutral) |
| Output | Trend chart, pie chart, comment count bar chart, word cloud, CSV download |
| API used | YouTube Data API v3 |
| Backend | Python Flask |
| Frontend | HTML + Bootstrap + Chart.js |

---

## Tech Stack

### Backend
| Library | Version | Purpose |
|---|---|---|
| Flask | 3.1.0 | Web framework — serves HTML, handles API routes |
| flask-cors | 5.0.1 | Allows cross-origin requests from the frontend |
| vaderSentiment | 3.3.2 | Sentiment analysis engine |
| google-api-python-client | 2.167.0 | Calls YouTube Data API v3 |
| google-auth | 2.39.0 | Authenticates API requests |
| wordcloud | 1.9.4 | Generates word cloud image from comment text |
| pandas | 2.2.3 | Creates and exports CSV of all analysed comments |
| python-dotenv | 1.0.1 | Loads API key securely from `.env` file |

### Frontend
| Library | Purpose |
|---|---|
| Bootstrap 5 (dark theme) | UI layout, cards, buttons, badges |
| Bootstrap Icons | Icons throughout the UI |
| Chart.js | Line chart (sentiment trends), doughnut chart (pie), bar chart (comment counts) |
| Vanilla JavaScript | All interactivity — fetch, filtering, keyword search |

### External API
| API | Usage |
|---|---|
| YouTube Data API v3 — `commentThreads.list` | Fetches paginated comment threads |
| YouTube Data API v3 — `videos.list` | Fetches video title and thumbnail |

---

## System Architecture & Workflow

```
User enters YouTube URL
        │
        ▼
[Frontend] Validates URL format
        │
        ▼
POST /analyze  ──────────────────────────────────────────────┐
        │                                                     │
        ▼                                                     ▼
[ThreadPoolExecutor — runs both in parallel]
        │                                │
        ▼                                ▼
get_video_metadata()          fetch_comments_by_month()
  videos.list API               commentThreads.list API
  → title, thumbnail            → up to 1200 comments
                                  paginated, newest first
                                  capped at 100/month
        │                                │
        └────────────┬───────────────────┘
                     ▼
        analyze_monthly_comments()
          VADER scores each comment
          Buckets into positive/negative/neutral per month
                     │
                     ▼
        build_per_month_top()
          Top 3 positive + negative per month
                     │
                     ▼
        Generate Word Cloud (PNG)
        Generate CSV (pandas DataFrame)
                     │
                     ▼
        Return JSON response to frontend
                     │
                     ▼
[Frontend] Renders:
  - Video title + thumbnail
  - Sentiment trend line chart (12 months)
  - Comment count bar chart (12 months)
  - Doughnut pie chart (overall/per-month)
  - Month selector buttons (with counts)
  - Top positive / negative comments
  - Keyword search across all comments
  - Word cloud image
  - CSV download link
```

---

## Core Logic Explained

### 1. Video ID Extraction
```python
pattern = r"(?:v=|\/)([0-9A-Za-z_-]{11}).*"
```
Handles all YouTube URL formats:
- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/shorts/VIDEO_ID`

### 2. Building the 12-Month Window
```
Current month  = March 2026  → end_date   = March 1, 2026
11 months back = April 2025  → start_date = April 1, 2025
```
12 empty buckets are created: `{"March 2026": [], "February 2026": [], ..., "April 2025": []}`

Why 11 months back (not 12)? Because we include the current month as month 1, so going back 11 more gives us exactly 12 months total.

### 3. Comment Fetching Strategy
- **`order="time"`** — YouTube returns comments newest-first. This means we paginate backwards through time, from the most recent to the oldest.
- **Per-month cap of 100** — once a month's bucket has 100 comments, additional comments for that month are skipped. This is essential for popular videos where a single month may have thousands of comments.
- **Early stop** — with `order="time"`, as soon as we encounter one comment older than `start_date`, ALL remaining pages are also older. We break immediately, saving API quota.
- **All-buckets-full stop** — if all 12 months reach 100 comments each, we stop early.
- **MAX_PAGES = 50** — hard cap of 50 API calls (50 quota units). For a video with ~200 comments/month, ~25 pages covers all 12 months. For ~500 comments/month, up to 60 pages may be needed — in that case we return however many months were filled.

### 4. Parallel Fetching
```python
with ThreadPoolExecutor(max_workers=2) as executor:
    metadata_future = executor.submit(get_video_metadata, video_id)
    comments_future = executor.submit(fetch_comments_by_month, video_id)
```
Video metadata and comment fetching both make separate API calls. Running them in parallel saves approximately 1 second per analysis.

### 5. Sentiment Classification
Each comment gets a VADER compound score:
```
compound >= 0.05   → Positive
compound <= -0.05  → Negative
-0.05 < compound < 0.05 → Neutral
```
Monthly percentages are computed as:
```
positive% = (positive_count / total_comments_in_month) × 100
```

### 6. File Cleanup
Before each analysis, old `wordcloud_*.png` and `summary_*.csv` files are deleted to prevent disk bloat. New files are generated with a UUID in the filename to prevent caching issues.

---

## How VADER Works

**VADER** (Valence Aware Dictionary and sEntiment Reasoner) is a **lexicon and rule-based** sentiment analysis tool specifically designed for **social media text** — short, informal, emoji-heavy, slang-filled sentences like YouTube comments.

### What Makes VADER Different from ML Models

| Feature | VADER | ML Model (e.g. BERT) |
|---|---|---|
| Requires training data | No | Yes (large labelled dataset) |
| Speed | Extremely fast (microseconds/comment) | Slow (seconds/comment) |
| Works offline | Yes | Yes (after download) |
| Handles emojis | Yes | Depends on model |
| Handles ALL CAPS | Yes (amplifies score) | No |
| Handles slang | Yes (built-in lexicon) | Partially |
| Accuracy on social media | ~85% | ~90–95% |

### The VADER Lexicon

VADER uses a hand-curated dictionary of ~7500 words/tokens, each rated from **-4 (most negative)** to **+4 (most positive)** by human annotators. Examples:

| Token | Score |
|---|---|
| "love" | +3.0 |
| "great" | +3.1 |
| "terrible" | -3.4 |
| "awful" | -3.4 |
| "okay" | +0.9 |
| "😊" | +2.0 |
| "💔" | -2.2 |

### The 5 Heuristic Rules VADER Applies

**1. Punctuation amplification**
```
"This is great"    → score: 0.66
"This is great!!!" → score: 0.75   (exclamation marks increase intensity)
```

**2. Capitalisation amplification**
```
"This is great"  → score: 0.66
"This is GREAT"  → score: 0.74   (ALL CAPS increases intensity)
```

**3. Degree modifiers (boosters)**
```
"good"           → score: 0.44
"very good"      → score: 0.55   ("very" boosts the score)
"extremely good" → score: 0.62
"barely good"    → score: 0.18   ("barely" dampens the score)
```

**4. Negation handling (shift)**
```
"good"           → score: +0.44
"not good"       → score: -0.35   (negation flips and dampens)
"not very good"  → score: -0.44
```

**5. "But" conjunction contrastive shift**
```
"The movie was good, but the ending was terrible"
→ Sentiment before "but" is discounted
→ Sentiment after "but" is amplified
→ Overall: negative-leaning
```

### The Four Output Scores

```python
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
analyzer = SentimentIntensityAnalyzer()
scores = analyzer.polarity_scores("This video is absolutely AMAZING!!!")

# Output:
# {'neg': 0.0, 'neu': 0.295, 'pos': 0.705, 'compound': 0.8481}
```

| Score | Range | Meaning |
|---|---|---|
| `pos` | 0 to 1 | Proportion of text that is positive |
| `neg` | 0 to 1 | Proportion of text that is negative |
| `neu` | 0 to 1 | Proportion of text that is neutral |
| `compound` | -1 to +1 | Normalised overall score (the one we use) |

The **compound score** is computed by summing all word valence scores, applying the 5 rules, and normalising to [-1, +1] using the formula:
```
compound = x / sqrt(x² + α)    where α = 15 (normalisation constant)
```

### Why VADER is a Good Choice for This Project

1. **No GPU needed** — runs on any machine
2. **No training required** — works out of the box
3. **Designed for social media** — handles emojis, slang, informal language common in YouTube comments
4. **Fast** — can score 1200 comments in under 1 second
5. **Interpretable** — the compound score is easy to explain and threshold

### VADER's Limitations

- **Language** — works best on English; non-English comments will get inaccurate scores
- **Sarcasm** — cannot detect sarcasm ("Oh great, another boring video" scores as positive)
- **Context** — no understanding of context beyond single sentences
- **Domain-specific slang** — very new internet slang may not be in the lexicon

---

## API & Quota Management

### YouTube Data API v3 Quota

| Operation | Quota Cost |
|---|---|
| `commentThreads.list` (100 results) | 1 unit |
| `videos.list` (metadata) | 1 unit |
| **Per analysis (worst case)** | **51 units** |
| **Daily limit** | **10,000 units** |
| **Max analyses per day** | ~196 |

### Comment Fetching Constraints

- YouTube API allows maximum **100 comments per request**
- Comments can only be paginated sequentially (no date-range filter exists)
- `order="time"` is used to paginate from newest to oldest — enabling the early-stop optimisation when we pass the 12-month boundary

---

## Project Structure

```
Final_Youtube_Comments_Sentimental_Analyser/
│
├── app.py                  # Flask backend — all server logic
├── index.html              # Frontend HTML + CSS
├── static/
│   └── script.js           # Frontend JavaScript
├── requirements.txt        # Python dependencies
├── .env                    # API key (never commit this)
└── README.md               # This file
```

---

## Local Setup

### Prerequisites
- Python 3.10+
- A YouTube Data API v3 key ([Get one here](https://console.cloud.google.com/))

### Steps

```bash
# 1. Clone or download the project
cd Final_Youtube_Comments_Sentimental_Analyser

# 2. Install dependencies
pip install -r requirements.txt

# 3. Add your API key to .env
echo "YOUTUBE_API_KEY=your_key_here" > .env

# 4. Run the server
python app.py

# 5. Open in browser
# http://localhost:5000
```

---

## Deployment Guide

### Option 1 — Render (Recommended, Free)

1. Push your project to a GitHub repository
2. **Important:** Add `.env` to `.gitignore` so your API key is not exposed
3. Go to [render.com](https://render.com) → New → Web Service
4. Connect your GitHub repo
5. Set the following:
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn app:app`
6. Add environment variable: `YOUTUBE_API_KEY = your_key_here`
7. Deploy

Add `gunicorn` to requirements.txt for production:
```
gunicorn==21.2.0
```

Change `app.py` last lines for production:
```python
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
```

### Option 2 — Railway (Free Tier)

1. Push project to GitHub (without `.env`)
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add environment variable: `YOUTUBE_API_KEY`
4. Add `gunicorn` to requirements.txt
5. Railway auto-detects Flask and deploys

### Option 3 — Heroku

```bash
# Install Heroku CLI, then:
heroku create your-app-name
heroku config:set YOUTUBE_API_KEY=your_key_here
git push heroku main
```

Create a `Procfile` in the root:
```
web: gunicorn app:app
```

### Security Checklist Before Deploying

- [ ] `.env` is in `.gitignore` — API key never pushed to GitHub
- [ ] Set `debug=False` in production (or remove the `debug=True` line)
- [ ] API key is set as an environment variable on the platform, not hardcoded

---

## Problems Faced & Solutions

### Problem 1 — Only fetching comments from one month
**Cause:** The default `order="relevance"` returned popular/recent comments, all from the same month. Also, `max_comments_per_month` was set to 25 — once filled, the rest of the page was wasted.

**Solution:** Switched to `order="time"` so the API paginates backwards through time. Raised the per-month cap to 100.

### Problem 2 — `MAX_PAGES=20` not enough for popular videos
**Cause:** A video with 300 comments/month requires ~30 pages just to cover 12 months (pages 1–3 fill March, pages 4–6 fill February, etc.).

**Solution:** Increased `MAX_PAGES` to 50. Added the "all buckets full" early-stop to prevent unnecessary calls for videos with fewer comments.

### Problem 3 — `wordcloud` missing from requirements.txt
**Cause:** The app imported `WordCloud` and used it, but `wordcloud` was never listed as a dependency.

**Solution:** Added `wordcloud==1.9.4` to `requirements.txt`.

### Problem 4 — `start_date` misaligned with 12-month bucket window
**Cause:** `start_date = end_date - timedelta(days=365)` uses 365 days, but 12 calendar months is not always 365 days. The bucket window and the filter window were slightly different.

**Solution:** Computed `start_date` using proper calendar month arithmetic:
```python
oldest_month = now.month - 11
if oldest_month <= 0:
    oldest_month += 12
    oldest_year -= 1
start_date = datetime.datetime(oldest_year, oldest_month, 1)
```

### Problem 5 — Stale generated files accumulating on disk
**Cause:** Every analysis generated a new `wordcloud_UUID.png` and `summary_UUID.csv`. These were never deleted.

**Solution:** Added `cleanup_old_files()` that deletes all `wordcloud_*.png` and `summary_*.csv` before each new analysis.

### Problem 6 — API key hardcoded in source code
**Cause:** The key was written directly in `app.py` as a fallback, risking accidental exposure if the code was shared or pushed to GitHub.

**Solution:** Moved the key to a `.env` file loaded via `python-dotenv`. The app raises a `RuntimeError` at startup if the key is missing.

### Problem 7 — Frontend fetch URL was relative (`"analyze"`)
**Cause:** `fetch("analyze", ...)` without a leading `/` breaks when the page URL has a path (e.g. `/home/analyze`).

**Solution:** Changed to `fetch("/analyze", ...)` — absolute path always works regardless of page URL.

### Problem 8 — Unused packages in requirements.txt
**Cause:** The original requirements file included `fastapi`, `uvicorn`, `seaborn`, `nltk`, `beautifulsoup4` etc. — none of which are used.

**Solution:** Cleaned requirements.txt down to only the 10 packages actually used.

---

## Interview Questions & Answers

### Basics

**Q1. What does this project do in one sentence?**

It fetches up to 1200 YouTube comments from the last 12 months, analyses each comment's sentiment using VADER, and visualises the results as monthly trends, a word cloud, and downloadable CSV.

---

**Q2. Why did you choose VADER over other sentiment analysis tools like TextBlob or a deep learning model?**

VADER is purpose-built for social media text. YouTube comments are short, informal, emoji-heavy, and full of slang — exactly what VADER was designed for. TextBlob is less accurate on informal text. A deep learning model like BERT would be more accurate but requires a GPU, training data, and takes seconds per comment — not practical for real-time analysis of 1200 comments in a web app.

---

**Q3. What is the compound score in VADER and how do you use it?**

The compound score is a single normalised value between -1 and +1 that represents the overall sentiment of a piece of text. VADER recommends:
- `>= 0.05` → Positive
- `<= -0.05` → Negative
- Between → Neutral

We use these exact thresholds in the project.

---

**Q4. How does the YouTube Data API pagination work in your project?**

The API returns at most 100 comments per request. To get more, you use the `nextPageToken` from the response as the `pageToken` in your next request. We use `order="time"` so comments come newest-first, allowing us to paginate backwards through time and stop as soon as we hit a comment older than 12 months.

---

**Q5. What is the YouTube API quota and how did you manage it?**

The YouTube Data API v3 has a daily quota of 10,000 units. Each `commentThreads.list` call costs 1 unit. Our worst case is 51 API calls per analysis (50 pages + 1 metadata call) = 51 units. That allows ~196 analyses per day before hitting the limit.

---

**Q6. Why did you use `order="time"` instead of the default `order="relevance"`?**

With `order="relevance"`, the API returns the most popular comments — these tend to be recent and concentrated in one or two months, making 12-month analysis inaccurate. With `order="time"`, comments come newest-first and we paginate backwards through time, naturally covering all 12 months and enabling an early stop when we go past the 12-month boundary.

---

**Q7. How did you handle the case where a video has thousands of comments in a single month?**

Each monthly bucket is capped at 100 comments. Once a month's bucket is full, we skip additional comments for that month but continue paginating to reach older months. Even if March has 10,000 comments, only 100 are stored and the rest are skipped.

---

**Q8. What is a word cloud and how did you generate it?**

A word cloud is a visual representation where words that appear more frequently in the text are displayed larger. We join all comment texts into a single string and pass it to the `WordCloud` library which handles tokenisation, frequency counting, and layout. The result is saved as a PNG and served via the `/download/<filename>` route.

---

**Q9. Why did you use `ThreadPoolExecutor` in the analyze route?**

Video metadata (`videos.list`) and comment fetching (`commentThreads.list`) are two independent API calls. Without parallelism, they run sequentially — adding ~1 second of wait time. With `ThreadPoolExecutor(max_workers=2)`, both calls happen simultaneously, saving that second.

---

**Q10. How is the Flask app structured? What are the routes?**

| Route | Method | Purpose |
|---|---|---|
| `/` | GET | Serves `index.html` |
| `/static/<path>` | GET | Serves `script.js` |
| `/analyze` | POST | Main analysis endpoint — accepts URL, returns JSON |
| `/download/<filename>` | GET | Downloads wordcloud PNG or summary CSV |

---

**Q11. What security measures did you implement?**

1. API key stored in `.env`, never hardcoded — loaded via `python-dotenv`
2. The `/download/<filename>` route validates that the filename starts with `wordcloud_` or `summary_` — preventing path traversal attacks where a user could request `/download/../../etc/passwd`
3. Flask-CORS is configured to handle cross-origin requests safely

---

**Q12. What are the limitations of your project?**

1. **English only** — VADER works best on English; non-English comments get inaccurate scores
2. **No sarcasm detection** — "Oh great, another boring video" scores as positive
3. **API quota** — limited to ~196 analyses per day on a free API key
4. **Very popular videos** — a video with 1000+ comments/month may not have all 12 months covered within the 50-page cap
5. **Top-level comments only** — the YouTube API's `commentThreads.list` fetches top-level comments; replies are not included

---

**Q13. How would you improve this project if you had more time?**

1. Add language detection to filter/flag non-English comments
2. Use a fine-tuned BERT model for higher accuracy on ambiguous/sarcastic comments
3. Add user authentication so each user has their own API quota
4. Cache results in a database (SQLite/PostgreSQL) so the same video isn't re-fetched
5. Add a comparison mode — analyse two videos side by side
6. Add topic modelling (LDA) to identify what people are discussing, not just how they feel

---

**Q14. What is Flask and why did you use it instead of Django or FastAPI?**

Flask is a lightweight Python web framework. It was chosen because:
- The project is small — one page, three routes — Django would be overkill
- Flask is simpler to set up and understand for a data/analysis project
- FastAPI would be better for a pure API service, but Flask handles both serving HTML and the API endpoint cleanly in one place

---

**Q15. Walk me through what happens when a user submits a YouTube URL.**

1. JavaScript validates the URL format on the client side
2. A POST request is sent to `/analyze` with the URL as JSON
3. Flask extracts the video ID from the URL using a regex
4. Two threads start simultaneously — one fetches video metadata, one starts fetching comments
5. Comments are fetched page by page (newest first), stored in 12 monthly buckets (100 max each), stopping when we've gone past 12 months or hit the page limit
6. VADER scores each comment; monthly sentiment percentages are computed
7. A word cloud PNG and summary CSV are generated
8. The JSON response is sent back to the frontend
9. JavaScript renders the charts, comment cards, word cloud, and month selector buttons
