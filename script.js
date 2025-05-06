/**
 * YouTube Sentiment Analysis Tool
 * Handles analyzing YouTube comments over 12 months and visualizing the results
 */

// Charts references for updating
let trendChart = null;
let pieChart = null;

// Current state for month filtering
let currentMonthFilter = "all";
let currentAnalysisData = null;

/**
 * Main function to analyze YouTube video comments
 */
async function analyzeSentiment() {
  const url = document.getElementById("url").value;
  const errorDiv = document.getElementById("error");
  const resultDiv = document.getElementById("result");
  
  // Validate input
  if (!url || !url.includes("youtube.com") && !url.includes("youtu.be")) {
    errorDiv.innerText = "Please enter a valid YouTube URL";
    return;
  }
  
  // Clear previous errors and show loading state
  errorDiv.innerText = "";
  resultDiv.innerHTML = `
    <div class="card shadow-lg loading-overlay">
      <div class="spinner-border text-primary" role="status"></div>
      <p class="mt-3">Analyzing comments from the last 12 months...</p>
      <p class="text-muted small">This may take a minute</p>
    </div>
  `;

  try {
    // Call API to analyze sentiment
    const response = await fetch("https://a2zforall.pythonanywhere.com/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || "Failed to analyze video");
    }
    
    // Store data for filtering
    currentAnalysisData = data;
    
    // Render results
    renderResults(data);
    
  } catch (err) {
    errorDiv.innerText = err.message;
    resultDiv.innerHTML = "";
  }
}

/**
 * Renders analysis results to the page
 * @param {Object} data - The analysis data from the API
 */
function renderResults(data) {
  const {
    video_title,
    video_thumbnail,
    overall_sentiment,
    monthly_sentiment,
    chart_data,
    top_positive,
    top_negative,
    wordcloud_path,
    csv_path,
    total_comments
  } = data;

  const resultDiv = document.getElementById("result");
  
  // Sort months for buttons - newest first (May 2025 to June 2024)
  const sortedMonthsForButtons = [...chart_data.months];
  
  // Create header with video info
  resultDiv.innerHTML = `
    <div class="card shadow-lg p-4 mb-4">
      <div class="row align-items-center">
        <div class="col-md-5 text-center">
          <img src="${video_thumbnail}" class="thumbnail-img" alt="Video Thumbnail" />
        </div>
        <div class="col-md-7">
          <h3 class="mb-3">${video_title}</h3>
          <div class="badge bg-primary mb-2">
            <i class="bi bi-chat-text me-1"></i> ${total_comments} comments analyzed
          </div>
          <p class="text-muted">Analysis of comments from the last 12 months</p>
        </div>
      </div>
    </div>
    
    <!-- Trend Analysis Section -->
    <div class="card shadow-lg p-4 mb-4">
      <h4 class="section-title">Sentiment Trends Over 12 Months</h4>
      <div class="trend-chart-container">
        <canvas id="trendChart"></canvas>
      </div>
    </div>
    
    <!-- Month Selector Section -->
    <div class="card shadow-lg p-4 mb-4">
      <h4 class="section-title">Monthly Analysis</h4>
      <p>Select a month to view specific sentiment breakdowns:</p>
      <div class="month-selector mb-3">
        <button class="btn btn-sm btn-primary month-btn active" 
                onclick="filterByMonth('all')">All Months</button>
        ${sortedMonthsForButtons.map(month => 
          `<button class="btn btn-sm btn-outline-secondary month-btn" 
                  onclick="filterByMonth('${month}')">${month}</button>`
        ).join('')}
      </div>
      
      <div class="row">
        <div class="col-md-6">
          <div class="pie-chart-container">
            <canvas id="sentimentPieChart"></canvas>
          </div>
        </div>
        <div class="col-md-6" id="monthStats">
          <div class="card bg-dark mb-3">
            <div class="card-body">
              <h5 class="card-title">Overall Sentiment</h5>
              <div class="d-flex justify-content-between">
                <div class="text-center">
                  <h3 class="text-success">${overall_sentiment.positive}%</h3>
                  <p>Positive</p>
                </div>
                <div class="text-center">
                  <h3 class="text-warning">${overall_sentiment.neutral}%</h3>
                  <p>Neutral</p>
                </div>
                <div class="text-center">
                  <h3 class="text-danger">${overall_sentiment.negative}%</h3>
                  <p>Negative</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Top Comments Section -->
    <div class="row mb-4">
      <div class="col-md-6 mb-4 mb-md-0">
        <div class="card shadow-lg p-4 h-100">
          <h4 class="section-title text-success">
            <i class="bi bi-hand-thumbs-up me-2"></i>Top Positive Comments
          </h4>
          <div id="positiveComments">
            ${renderCommentsList(top_positive, 'positive')}
          </div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card shadow-lg p-4 h-100">
          <h4 class="section-title text-danger">
            <i class="bi bi-hand-thumbs-down me-2"></i>Top Negative Comments
          </h4>
          <div id="negativeComments">
            ${renderCommentsList(top_negative, 'negative')}
          </div>
        </div>
      </div>
    </div>
    
    <!-- Word Cloud Section -->
    <div class="card shadow-lg p-4 mb-4">
      <h4 class="section-title">
        <i class="bi bi-cloud me-2"></i>Word Cloud
      </h4>
      <div class="text-center mb-3">
        <img src="/download/${wordcloud_path}" class="wordcloud-img" alt="Word Cloud" />
      </div>
      <div class="text-center">
        <a href="/download/${csv_path}" class="btn btn-outline-primary">
          <i class="bi bi-download me-2"></i>Download CSV Summary
        </a>
      </div>
    </div>
  `;

  // Initialize charts
  renderTrendChart(chart_data);
  renderPieChart(overall_sentiment);
}

/**
 * Creates the sentiment trend chart showing monthly changes
 * @param {Object} chartData - The chart data from the API
 */
function renderTrendChart(chartData) {
  const ctx = document.getElementById('trendChart').getContext('2d');
  
  // Destroy existing chart if it exists
  if (trendChart) {
    trendChart.destroy();
  }
  
  // Reverse the order of months to show from June 2024 to May 2025 (left to right)
  const months = [...chartData.months].reverse();
  const positive = [...chartData.positive].reverse();
  const negative = [...chartData.negative].reverse();
  const neutral = [...chartData.neutral].reverse();
  const commentCounts = [...chartData.comment_counts].reverse();
  
  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        {
          label: 'Positive',
          data: positive,
          borderColor: '#4caf50',
          backgroundColor: 'rgba(76, 175, 80, 0.1)',
          tension: 0.3,
          fill: true
        },
        {
          label: 'Negative',
          data: negative,
          borderColor: '#f44336',
          backgroundColor: 'rgba(244, 67, 54, 0.1)',
          tension: 0.3,
          fill: true
        },
        {
          label: 'Neutral',
          data: neutral,
          borderColor: '#ffc107',
          backgroundColor: 'rgba(255, 193, 7, 0.1)',
          tension: 0.3,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            usePointStyle: true,
            color: '#eaeaea'
          }
        },
        tooltip: {
          callbacks: {
            footer: function(tooltipItems) {
              const index = tooltipItems[0].dataIndex;
              return `Total Comments: ${commentCounts[index]}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          },
          ticks: {
            color: '#eaeaea'
          }
        },
        y: {
          beginAtZero: true,
          max: 100,
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          },
          ticks: {
            color: '#eaeaea',
            callback: function(value) {
              return value + '%';
            }
          }
        }
      }
    }
  });
}

/**
 * Creates the sentiment pie chart
 * @param {Object} sentimentData - The sentiment data (positive, negative, neutral percentages)
 */
function renderPieChart(sentimentData) {
  const ctx = document.getElementById('sentimentPieChart').getContext('2d');
  
  // Destroy existing chart if it exists
  if (pieChart) {
    pieChart.destroy();
  }
  
  pieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Positive', 'Negative', 'Neutral'],
      datasets: [{
        data: [
          sentimentData.positive,
          sentimentData.negative,
          sentimentData.neutral
        ],
        backgroundColor: ['#4caf50', '#f44336', '#ffc107'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            padding: 20,
            color: '#eaeaea'
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.raw || 0;
              return `${label}: ${value}%`;
            }
          }
        }
      }
    }
  });
}

/**
 * Filter data by selected month
 * @param {string} month - Month to filter by or 'all' for all months
 */
function filterByMonth(month) {
  if (!currentAnalysisData) return;
  
  // Update active button state
  document.querySelectorAll('.month-btn').forEach(btn => {
    if (btn.textContent.trim() === month || (btn.textContent.trim() === 'All Months' && month === 'all')) {
      btn.classList.add('btn-primary');
      btn.classList.remove('btn-outline-secondary');
    } else {
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-outline-secondary');
    }
  });
  
  currentMonthFilter = month;
  
  // Update pie chart with selected month's data
  let sentimentData;
  let monthlyStats;
  
  if (month === 'all') {
    sentimentData = currentAnalysisData.overall_sentiment;
    monthlyStats = `
      <div class="card bg-dark mb-3">
        <div class="card-body">
          <h5 class="card-title">Overall Sentiment</h5>
          <div class="d-flex justify-content-between">
            <div class="text-center">
              <h3 class="text-success">${sentimentData.positive}%</h3>
              <p>Positive</p>
            </div>
            <div class="text-center">
              <h3 class="text-warning">${sentimentData.neutral}%</h3>
              <p>Neutral</p>
            </div>
            <div class="text-center">
              <h3 class="text-danger">${sentimentData.negative}%</h3>
              <p>Negative</p>
            </div>
          </div>
        </div>
      </div>
    `;
  } else {
    sentimentData = currentAnalysisData.monthly_sentiment[month];
    const commentCount = sentimentData.total;
    
    monthlyStats = `
      <div class="card bg-dark mb-3">
        <div class="card-body">
          <h5 class="card-title">${month} Stats</h5>
          <p class="text-muted">${commentCount} comments analyzed</p>
          <div class="d-flex justify-content-between">
            <div class="text-center">
              <h3 class="text-success">${sentimentData.positive}%</h3>
              <p>Positive</p>
            </div>
            <div class="text-center">
              <h3 class="text-warning">${sentimentData.neutral}%</h3>
              <p>Neutral</p>
            </div>
            <div class="text-center">
              <h3 class="text-danger">${sentimentData.negative}%</h3>
              <p>Negative</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  // Update pie chart
  renderPieChart({
    positive: sentimentData.positive,
    negative: sentimentData.negative,
    neutral: sentimentData.neutral
  });
  
  // Update stats display
  document.getElementById('monthStats').innerHTML = monthlyStats;
  
  // Filter comments for the selected month
  const { top_positive, top_negative } = currentAnalysisData;
  
  if (month === 'all') {
    // Show all top comments
    document.getElementById('positiveComments').innerHTML = renderCommentsList(top_positive, 'positive');
    document.getElementById('negativeComments').innerHTML = renderCommentsList(top_negative, 'negative');
  } else {
    // Filter comments for selected month
    const filteredPositive = top_positive.filter(comment => comment.month === month);
    const filteredNegative = top_negative.filter(comment => comment.month === month);
    
    document.getElementById('positiveComments').innerHTML = 
      filteredPositive.length > 0 
        ? renderCommentsList(filteredPositive, 'positive') 
        : '<p class="text-muted">No positive comments found for this month</p>';
        
    document.getElementById('negativeComments').innerHTML = 
      filteredNegative.length > 0 
        ? renderCommentsList(filteredNegative, 'negative') 
        : '<p class="text-muted">No negative comments found for this month</p>';
  }
}

/**
 * Renders a list of comments
 * @param {Array} comments - List of comment objects
 * @param {string} type - Comment type ('positive' or 'negative')
 * @returns {string} HTML for the comments list
 */
function renderCommentsList(comments, type) {
  if (!comments || comments.length === 0) {
    return `<p class="text-muted">No ${type} comments found</p>`;
  }
  
  return comments.map(comment => {
    // Truncate long comments
    const displayText = comment.text.length > 150 
      ? comment.text.substring(0, 150) + '...' 
      : comment.text;
      
    // Format date if available
    const dateStr = comment.date 
      ? `<small class="text-muted"><i class="bi bi-calendar me-1"></i>${new Date(comment.date).toLocaleDateString()}</small>` 
      : '';
      
    return `
      <div class="card comment-card ${type}-card mb-3 p-3">
        <p>${displayText}</p>
        <div class="d-flex justify-content-between align-items-center">
          ${dateStr}
          <span class="badge bg-${type === 'positive' ? 'success' : 'danger'}">
            Score: ${Math.abs(comment.score).toFixed(2)}
          </span>
        </div>
      </div>
    `;
  }).join('');
}