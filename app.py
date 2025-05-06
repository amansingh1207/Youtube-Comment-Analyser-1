from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
import re
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
from googleapiclient.discovery import build
from wordcloud import WordCloud
import matplotlib.pyplot as plt
import pandas as pd
import os
import uuid
import datetime
import logging

# Set up logging for debugging
logging.basicConfig(level=logging.DEBUG)

app = Flask(__name__)
CORS(app)

# Get API key from environment with fallback
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "AIzaSyBMX4fEDJ0KrqT2e_LpBaYFXSgefFiPRuI")

def get_video_id(url):
    """Extract YouTube video ID from URL"""
    pattern = r"(?:v=|\/)([0-9A-Za-z_-]{11}).*"
    match = re.search(pattern, url)
    return match.group(1) if match else None

def get_video_metadata(video_id):
    """Get video title and thumbnail URL"""
    youtube = build("youtube", "v3", developerKey=YOUTUBE_API_KEY)
    response = youtube.videos().list(
        part="snippet",
        id=video_id
    ).execute()
    if response["items"]:
        snippet = response["items"][0]["snippet"]
        return snippet["title"], snippet["thumbnails"]["high"]["url"]
    return None, None

def fetch_comments_by_month(video_id, publish_date=None, max_comments_per_month=100):
    """Fetch comments from a YouTube video, organized by month for the last 12 months"""
    youtube = build("youtube", "v3", developerKey=YOUTUBE_API_KEY)
    
    # Current date - we want to show May 2025 to June 2024
    now = datetime.datetime.now()
    end_date = datetime.datetime(now.year, now.month, 1)  # First day of current month
    start_date = end_date - datetime.timedelta(days=365)  # 1 year ago
    
    # Both dates need to be naive (no timezone info) for comparison
    end_date = end_date.replace(tzinfo=None)
    
    monthly_comments = {}
    
    # Get current month and year
    current_date = end_date
    
    # Go back 12 months (May 2025 to June 2024)
    for i in range(12):
        month_name = current_date.strftime("%B %Y")
        monthly_comments[month_name] = []
        
        # Move to previous month
        current_date = (current_date.replace(day=1) - datetime.timedelta(days=1)).replace(day=1)
    
    # Fetch all comments - try to get more comments than before
    next_page_token = None
    total_comments = 0
    max_attempts = 20  # Increase number of API calls to try to get more comments
    attempt = 0
    max_comments_total = 1200  # Target number of comments
    
    # Use a more aggressive fetching strategy
    while total_comments < max_comments_total and attempt < max_attempts:
        try:
            logging.info(f"Fetching comments - attempt {attempt+1}/{max_attempts}, total so far: {total_comments}")
            response = youtube.commentThreads().list(
                part="snippet",
                videoId=video_id,
                maxResults=100,  # Maximum allowed by API
                pageToken=next_page_token,
                textFormat="plainText"
            ).execute()
            
            items_count = len(response.get("items", []))
            if items_count == 0:
                logging.info("No comments returned in this page")
                break
                
            logging.info(f"Received {items_count} comments in this page")
                
            for item in response.get("items", []):
                snippet = item["snippet"]["topLevelComment"]["snippet"]
                comment_text = snippet["textDisplay"]
                
                # Parse comment date - convert to naive datetime for comparison
                comment_date_str = snippet["publishedAt"].replace("Z", "")
                comment_date = datetime.datetime.fromisoformat(comment_date_str)
                
                # Skip comments older than start_date
                if comment_date < start_date:
                    continue
                
                # Determine which month this comment belongs to
                month_name = comment_date.strftime("%B %Y")
                
                # Add to monthly comments if this month is in our 12-month range
                if month_name in monthly_comments and len(monthly_comments[month_name]) < max_comments_per_month:
                    monthly_comments[month_name].append({
                        "text": comment_text,
                        "date": comment_date.isoformat()
                    })
                    total_comments += 1
                    
                    # If we've reached our target for all months, we can stop
                    if total_comments >= max_comments_total:
                        break
            
            next_page_token = response.get("nextPageToken")
            if not next_page_token:
                logging.info("No more comment pages available")
                break
            
            attempt += 1
                
        except Exception as e:
            logging.error(f"Error fetching comments: {str(e)}")
            break
    
    # Check which months have comments
    month_counts = {month: len(comments) for month, comments in monthly_comments.items()}
    logging.info(f"Comments per month: {month_counts}")
    
    logging.info(f"Fetched a total of {total_comments} comments across 12 months")
    return monthly_comments

def analyze_monthly_comments(monthly_comments):
    """Analyze sentiment for each month's comments"""
    analyzer = SentimentIntensityAnalyzer()
    monthly_sentiment = {}
    all_analyzed_comments = []
    
    for month, comments in monthly_comments.items():
        if not comments:
            monthly_sentiment[month] = {
                "positive": 0,
                "negative": 0,
                "neutral": 0,
                "total": 0
            }
            continue
            
        sentiment_counts = {"positive": 0, "negative": 0, "neutral": 0}
        analyzed_month_comments = []
        
        for comment_data in comments:
            comment = comment_data["text"]
            score = analyzer.polarity_scores(comment)
            
            if score["compound"] >= 0.05:
                sentiment = "positive"
            elif score["compound"] <= -0.05:
                sentiment = "negative"
            else:
                sentiment = "neutral"
                
            sentiment_counts[sentiment] += 1
            
            analyzed_comment = {
                "text": comment,
                "sentiment": sentiment,
                "score": score["compound"],
                "date": comment_data["date"],
                "month": month
            }
            
            analyzed_month_comments.append(analyzed_comment)
            all_analyzed_comments.append(analyzed_comment)
        
        total = len(comments)
        monthly_sentiment[month] = {
            "positive": round((sentiment_counts["positive"] / total) * 100, 2) if total > 0 else 0,
            "negative": round((sentiment_counts["negative"] / total) * 100, 2) if total > 0 else 0,
            "neutral": round((sentiment_counts["neutral"] / total) * 100, 2) if total > 0 else 0,
            "total": total
        }
    
    return monthly_sentiment, all_analyzed_comments

@app.route('/')
def home():
    return send_file('index.html')

@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

@app.route("/analyze", methods=["POST"])
def analyze():
    """Main route to analyze YouTube video comments"""
    data = request.get_json()
    url = data.get("url")
    video_id = get_video_id(url)
    
    if not video_id:
        return jsonify({"error": "Invalid YouTube URL"}), 400
    
    try:
        # Get video metadata
        title, thumbnail_url = get_video_metadata(video_id)
        if not title:
            return jsonify({"error": "Failed to retrieve video information"}), 404
        
        # Fetch comments by month
        monthly_comments = fetch_comments_by_month(video_id)
        
        # Check if we have any comments
        total_comments = sum(len(comments) for comments in monthly_comments.values())
        if total_comments == 0:
            return jsonify({"error": "No comments found in the last 12 months"}), 404
        
        # Analyze sentiment for all months
        monthly_sentiment, all_analyzed_comments = analyze_monthly_comments(monthly_comments)
        
        # Calculate overall sentiment
        positive_count = sum(1 for comment in all_analyzed_comments if comment["sentiment"] == "positive")
        negative_count = sum(1 for comment in all_analyzed_comments if comment["sentiment"] == "negative")
        neutral_count = sum(1 for comment in all_analyzed_comments if comment["sentiment"] == "neutral")
        
        total = len(all_analyzed_comments)
        overall_sentiment = {
            "positive": round((positive_count / total) * 100, 2) if total > 0 else 0,
            "negative": round((negative_count / total) * 100, 2) if total > 0 else 0,
            "neutral": round((neutral_count / total) * 100, 2) if total > 0 else 0
        }
        
        # Get top positive and negative comments
        top_positive = sorted(
            [c for c in all_analyzed_comments if c["sentiment"] == "positive"],
            key=lambda x: -x["score"]
        )[:3]
        
        top_negative = sorted(
            [c for c in all_analyzed_comments if c["sentiment"] == "negative"],
            key=lambda x: x["score"]
        )[:3]
        
        # Generate wordcloud
        all_words = " ".join([comment["text"] for comment in all_analyzed_comments])
        wordcloud = WordCloud(width=800, height=400, background_color="white").generate(all_words)
        image_path = f"wordcloud_{uuid.uuid4().hex}.png"
        wordcloud.to_file(image_path)
        
        # Save all comments to CSV
        df = pd.DataFrame(all_analyzed_comments)
        csv_path = f"summary_{uuid.uuid4().hex}.csv"
        df.to_csv(csv_path, index=False)
        
        # Extract chart data in the correct format for Chart.js
        # Sort months chronologically from June 2024 to May 2025
        months = list(monthly_sentiment.keys())
        
        # Convert month names to datetime objects for proper sorting
        month_objs = []
        for month in months:
            try:
                month_obj = datetime.datetime.strptime(month, "%B %Y")
                month_objs.append((month, month_obj))
            except ValueError:
                continue
        
        # Sort months in reverse chronological order (newest first)
        month_objs.sort(key=lambda x: x[1], reverse=True)
        sorted_months = [m[0] for m in month_objs]
        
        # Get data in the correct order
        positive_data = [monthly_sentiment[month]["positive"] for month in sorted_months]
        negative_data = [monthly_sentiment[month]["negative"] for month in sorted_months]
        neutral_data = [monthly_sentiment[month]["neutral"] for month in sorted_months]
        comment_counts = [monthly_sentiment[month]["total"] for month in sorted_months]
        
        return jsonify({
            "video_title": title,
            "video_thumbnail": thumbnail_url,
            "overall_sentiment": overall_sentiment,
            "monthly_sentiment": monthly_sentiment,
            "chart_data": {
                "months": sorted_months,
                "positive": positive_data,
                "negative": negative_data,
                "neutral": neutral_data,
                "comment_counts": comment_counts
            },
            "top_positive": top_positive,
            "top_negative": top_negative,
            "wordcloud_path": image_path,
            "csv_path": csv_path,
            "total_comments": total_comments
        })
        
    except Exception as e:
        logging.error(f"Error during analysis: {str(e)}")
        return jsonify({"error": f"An error occurred during analysis: {str(e)}"}), 500

@app.route("/download/<filename>")
def download_file(filename):
    """Route to download generated files"""
    return send_file(filename, as_attachment=True)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)