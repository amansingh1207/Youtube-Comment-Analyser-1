from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
from concurrent.futures import ThreadPoolExecutor
from dotenv import load_dotenv
import re
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
from googleapiclient.discovery import build
from wordcloud import WordCloud
import pandas as pd
import os
import uuid
import datetime
import logging

load_dotenv()
logging.basicConfig(level=logging.INFO)

app = Flask(__name__)
CORS(app)

YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")
if not YOUTUBE_API_KEY:
    raise RuntimeError("YOUTUBE_API_KEY not set. Add it to your .env file.")


def get_video_id(url):
    pattern = r"(?:v=|\/)([0-9A-Za-z_-]{11}).*"
    match = re.search(pattern, url)
    return match.group(1) if match else None


def get_video_metadata(video_id):
    youtube = build("youtube", "v3", developerKey=YOUTUBE_API_KEY)
    response = youtube.videos().list(part="snippet", id=video_id).execute()
    if response["items"]:
        snippet = response["items"][0]["snippet"]
        return snippet["title"], snippet["thumbnails"]["high"]["url"]
    return None, None


def fetch_comments_by_month(video_id):
    """
    Fetch up to 100 comments per month for the last 12 months (1200 total max).

    Strategy:
    - order='time' returns comments newest-first, so we paginate backwards.
    - Each month bucket is capped at 100; once full, extra comments for that
      month are skipped (even if a month has 10,000 comments).
    - Stop as soon as we see a comment older than our 12-month window —
      with time ordering, all remaining pages are also older, so no wasted calls.
    - Hard cap of 20 pages (20 API units) — well within 10,000/day quota.
    """
    youtube = build("youtube", "v3", developerKey=YOUTUBE_API_KEY)

    now = datetime.datetime.now()
    end_date = datetime.datetime(now.year, now.month, 1)

    # First day of the oldest month in our 12-month window (11 months ago)
    oldest_month = now.month - 11
    oldest_year = now.year
    if oldest_month <= 0:
        oldest_month += 12
        oldest_year -= 1
    start_date = datetime.datetime(oldest_year, oldest_month, 1)

    # Build 12 monthly buckets, each capped at 100 comments
    monthly_comments = {}
    current_date = end_date
    for _ in range(12):
        month_name = current_date.strftime("%B %Y")
        monthly_comments[month_name] = []
        current_date = (current_date.replace(day=1) - datetime.timedelta(days=1)).replace(day=1)

    next_page_token = None
    total_comments = 0
    pages_used = 0
    MAX_COMMENTS_PER_MONTH = 100
    # 50 pages = 50 API units — well within 10,000/day quota.
    # For a video with ~200 comments/month, ~25 pages cover all 12 months.
    # For ~500 comments/month, up to 60 pages may be needed — we cap at 50
    # and show however many months were filled.
    MAX_PAGES = 50

    while pages_used < MAX_PAGES:
        try:
            logging.info(f"Fetching page {pages_used + 1}, total stored: {total_comments}")
            response = youtube.commentThreads().list(
                part="snippet",
                videoId=video_id,
                maxResults=100,
                pageToken=next_page_token,
                textFormat="plainText",
                order="time"  # newest first → paginating backwards through time
            ).execute()

            pages_used += 1
            items = response.get("items", [])
            if not items:
                break

            past_window = False
            for item in items:
                snippet = item["snippet"]["topLevelComment"]["snippet"]
                comment_text = snippet["textDisplay"]
                comment_date_str = snippet["publishedAt"].replace("Z", "")
                comment_date = datetime.datetime.fromisoformat(comment_date_str)

                # With order='time', once we hit a comment older than our window,
                # all remaining comments on this and future pages are also older.
                if comment_date < start_date:
                    past_window = True
                    break

                month_name = comment_date.strftime("%B %Y")
                if month_name in monthly_comments:
                    # Cap at 100 per month — skip extras even if month has thousands
                    if len(monthly_comments[month_name]) < MAX_COMMENTS_PER_MONTH:
                        monthly_comments[month_name].append({
                            "text": comment_text,
                            "date": comment_date.isoformat()
                        })
                        total_comments += 1

            if past_window:
                logging.info("Reached comments older than 12 months — stopping")
                break

            # All 12 buckets are full (100 each) — no need to fetch more
            if all(len(c) >= MAX_COMMENTS_PER_MONTH for c in monthly_comments.values()):
                logging.info("All monthly buckets full (100 each) — stopping")
                break

            next_page_token = response.get("nextPageToken")
            if not next_page_token:
                logging.info("No more pages available from API")
                break

        except Exception as e:
            logging.error(f"Error fetching comments: {e}")
            break

    months_with_data = sum(1 for c in monthly_comments.values() if len(c) > 0)
    logging.info(f"Fetched {total_comments} comments across {months_with_data}/12 months using {pages_used} API call(s)")
    return monthly_comments


def analyze_monthly_comments(monthly_comments):
    analyzer = SentimentIntensityAnalyzer()
    monthly_sentiment = {}
    all_analyzed_comments = []

    for month, comments in monthly_comments.items():
        if not comments:
            monthly_sentiment[month] = {"positive": 0, "negative": 0, "neutral": 0, "total": 0}
            continue

        sentiment_counts = {"positive": 0, "negative": 0, "neutral": 0}

        for comment_data in comments:
            score = analyzer.polarity_scores(comment_data["text"])
            if score["compound"] >= 0.05:
                sentiment = "positive"
            elif score["compound"] <= -0.05:
                sentiment = "negative"
            else:
                sentiment = "neutral"

            sentiment_counts[sentiment] += 1
            all_analyzed_comments.append({
                "text": comment_data["text"],
                "sentiment": sentiment,
                "score": score["compound"],
                "date": comment_data["date"],
                "month": month
            })

        total = len(comments)
        monthly_sentiment[month] = {
            "positive": round(sentiment_counts["positive"] / total * 100, 2),
            "negative": round(sentiment_counts["negative"] / total * 100, 2),
            "neutral":  round(sentiment_counts["neutral"]  / total * 100, 2),
            "total": total
        }

    return monthly_sentiment, all_analyzed_comments


def build_per_month_top(all_analyzed_comments, months):
    """Return top 3 positive and negative comments for each month."""
    per_month = {}
    for month in months:
        month_comments = [c for c in all_analyzed_comments if c["month"] == month]
        per_month[month] = {
            "positive": sorted(
                [c for c in month_comments if c["sentiment"] == "positive"],
                key=lambda x: -x["score"]
            )[:3],
            "negative": sorted(
                [c for c in month_comments if c["sentiment"] == "negative"],
                key=lambda x: x["score"]
            )[:3]
        }
    return per_month


def cleanup_old_files():
    for f in os.listdir("."):
        if (f.startswith("wordcloud_") and f.endswith(".png")) or \
           (f.startswith("summary_") and f.endswith(".csv")):
            try:
                os.remove(f)
            except OSError:
                pass


@app.route('/')
def home():
    return send_file('index.html')


@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)


@app.route("/analyze", methods=["POST"])
def analyze():
    cleanup_old_files()
    data = request.get_json()
    url = data.get("url", "")
    video_id = get_video_id(url)

    if not video_id:
        return jsonify({"error": "Invalid YouTube URL"}), 400

    try:
        # Fetch metadata and comments in parallel to save ~1s
        with ThreadPoolExecutor(max_workers=2) as executor:
            metadata_future  = executor.submit(get_video_metadata, video_id)
            comments_future  = executor.submit(fetch_comments_by_month, video_id)
            title, thumbnail_url = metadata_future.result()
            monthly_comments     = comments_future.result()

        if not title:
            return jsonify({"error": "Failed to retrieve video information"}), 404

        total_comments = sum(len(c) for c in monthly_comments.values())
        if total_comments == 0:
            return jsonify({"error": "No comments found in the last 12 months"}), 404

        monthly_sentiment, all_analyzed_comments = analyze_monthly_comments(monthly_comments)

        # Overall sentiment
        pos = sum(1 for c in all_analyzed_comments if c["sentiment"] == "positive")
        neg = sum(1 for c in all_analyzed_comments if c["sentiment"] == "negative")
        neu = sum(1 for c in all_analyzed_comments if c["sentiment"] == "neutral")
        total = len(all_analyzed_comments)
        overall_sentiment = {
            "positive": round(pos / total * 100, 2),
            "negative": round(neg / total * 100, 2),
            "neutral":  round(neu / total * 100, 2)
        }

        # Global top 3
        top_positive = sorted(
            [c for c in all_analyzed_comments if c["sentiment"] == "positive"],
            key=lambda x: -x["score"]
        )[:3]
        top_negative = sorted(
            [c for c in all_analyzed_comments if c["sentiment"] == "negative"],
            key=lambda x: x["score"]
        )[:3]

        # Sort months newest-first for chart
        month_objs = []
        for month in monthly_sentiment:
            try:
                month_objs.append((month, datetime.datetime.strptime(month, "%B %Y")))
            except ValueError:
                pass
        month_objs.sort(key=lambda x: x[1], reverse=True)
        sorted_months = [m[0] for m in month_objs]

        # Per-month top comments for the month selector
        per_month_top = build_per_month_top(all_analyzed_comments, sorted_months)

        # Word cloud
        all_words = " ".join(c["text"] for c in all_analyzed_comments)
        wc = WordCloud(width=800, height=400, background_color="white").generate(all_words)
        image_path = f"wordcloud_{uuid.uuid4().hex}.png"
        wc.to_file(image_path)

        # CSV export
        csv_path = f"summary_{uuid.uuid4().hex}.csv"
        pd.DataFrame(all_analyzed_comments).to_csv(csv_path, index=False)

        return jsonify({
            "video_title":      title,
            "video_thumbnail":  thumbnail_url,
            "overall_sentiment": overall_sentiment,
            "monthly_sentiment": monthly_sentiment,
            "chart_data": {
                "months":         sorted_months,
                "positive":       [monthly_sentiment[m]["positive"] for m in sorted_months],
                "negative":       [monthly_sentiment[m]["negative"] for m in sorted_months],
                "neutral":        [monthly_sentiment[m]["neutral"]  for m in sorted_months],
                "comment_counts": [monthly_sentiment[m]["total"]    for m in sorted_months]
            },
            "top_positive":    top_positive,
            "top_negative":    top_negative,
            "per_month_top":   per_month_top,
            "wordcloud_path":  image_path,
            "csv_path":        csv_path,
            "total_comments":  total_comments
        })

    except Exception as e:
        logging.error(f"Error during analysis: {e}")
        return jsonify({"error": f"An error occurred: {str(e)}"}), 500


@app.route("/download/<filename>")
def download_file(filename):
    # Only allow our own generated files
    if not (filename.startswith("wordcloud_") or filename.startswith("summary_")):
        return jsonify({"error": "Not found"}), 404
    return send_file(filename, as_attachment=True)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_ENV") != "production"
    app.run(host="0.0.0.0", port=port, debug=debug)
