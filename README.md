# YouTube Comments Sentiment Analyser

Live: [youtube-comment-analyser-1.onrender.com](https://youtube-comment-analyser-1.onrender.com)

A web app that analyses the sentiment of YouTube comments over the last 12 months using VADER.

## About

This project fetches comments from any YouTube video and performs sentiment analysis to understand how audience perception has changed over time. It uses the YouTube Data API v3 to collect up to 1,200 comments (100 per month across 12 months) and classifies each comment as Positive, Negative, or Neutral using the VADER sentiment analysis engine — a rule-based model specifically designed for social media text. Results are displayed as interactive charts, and the full dataset can be exported as a CSV.

## Workflow

1. User pastes a YouTube video URL into the web interface
2. The backend extracts the video ID and fetches video metadata and comments in parallel
3. Comments are collected month by month (newest first), capped at 100 per month, going back 12 months
4. Each comment is scored using VADER — compound score ≥ 0.05 = Positive, ≤ -0.05 = Negative, else Neutral
5. Results are sent to the frontend as JSON
6. The frontend renders:
   - A line chart showing monthly sentiment trends
   - A bar chart showing comment volume per month
   - A doughnut chart for overall and per-month sentiment breakdown
   - Top 3 positive and top 3 negative comments per month
   - A word cloud of all fetched comments
7. User can search comments by keyword and download a full CSV report

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.10, Flask 3.1 |
| Sentiment Analysis | VADER (vaderSentiment 3.3.2) |
| YouTube Data | YouTube Data API v3 (google-api-python-client) |
| Data Export | pandas |
| Word Cloud | wordcloud |
| Frontend | HTML, CSS, Bootstrap 5 (dark theme) |
| Charts | Chart.js |
| Scripting | Vanilla JavaScript |
| Production Server | Gunicorn |
| Config | python-dotenv |

## Features

- Fetches up to 100 comments/month × 12 months (1200 comments max)
- Sentiment analysis — Positive, Negative, Neutral
- Monthly sentiment trend chart
- Comment count bar chart per month
- Doughnut pie chart (overall + per month)
- Top 3 positive and negative comments per month
- Keyword search across all fetched comments
- Word cloud of all comments
- Download full CSV report

## Setup

```bash
pip install -r requirements.txt
```

Add your YouTube API key to a `.env` file:
```
YOUTUBE_API_KEY=your_key_here
```

Run locally:
```bash
python app.py
```

Open `http://localhost:5000`

## Deployment

Deployed on Render using `gunicorn app:app` (see `Procfile`). Set the `YOUTUBE_API_KEY` environment variable in the platform's dashboard.
