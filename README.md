# YouTube Comments Sentiment Analyser

Live: [youtube-comment-analyser-1.onrender.com](https://youtube-comment-analyser-1.onrender.com)

A web app that analyses the sentiment of YouTube comments over the last 12 months using VADER.

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

## Tech Stack

- **Backend** — Python, Flask, VADER Sentiment, YouTube Data API v3
- **Frontend** — HTML, Bootstrap 5, Chart.js, Vanilla JS
- **Libraries** — wordcloud, pandas, python-dotenv

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
