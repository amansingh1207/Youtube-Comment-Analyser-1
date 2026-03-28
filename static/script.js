let trendChart = null;
let pieChart = null;
let currentMonthFilter = "all";
let currentAnalysisData = null;

async function analyzeSentiment() {
  const url = document.getElementById("url").value.trim();
  const errorDiv = document.getElementById("error");
  const resultDiv = document.getElementById("result");

  if (!url || (!url.includes("youtube.com") && !url.includes("youtu.be"))) {
    errorDiv.innerText = "Please enter a valid YouTube URL";
    return;
  }

  errorDiv.innerText = "";
  resultDiv.innerHTML = `
    <div class="card shadow-lg loading-overlay">
      <div class="spinner-border text-primary" role="status"></div>
      <p class="mt-3 fw-semibold">Fetching & analyzing comments...</p>
      <p class="text-muted small">Fetching up to 100 comments/month × 12 months — please wait</p>
    </div>`;

  try {
    const response = await fetch("/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to analyze video");
    currentAnalysisData = data;
    renderResults(data);
  } catch (err) {
    errorDiv.innerText = err.message;
    resultDiv.innerHTML = "";
  }
}

function renderResults(data) {
  const {
    video_title, video_thumbnail, overall_sentiment,
    monthly_sentiment, chart_data, top_positive, top_negative,
    wordcloud_path, csv_path, total_comments
  } = data;

  const resultDiv = document.getElementById("result");

  resultDiv.innerHTML = `
    <div class="card shadow-lg p-4 mb-4">
      <div class="row align-items-center">
        <div class="col-md-5 text-center">
          <img src="${video_thumbnail}" class="thumbnail-img" alt="Thumbnail" />
        </div>
        <div class="col-md-7">
          <h3 class="mb-3">${video_title}</h3>
          <div class="badge bg-primary mb-2">
            <i class="bi bi-chat-text me-1"></i> ${total_comments} comments analyzed
          </div>
          <p class="text-muted">Last 12 months</p>
        </div>
      </div>
    </div>

    <div class="card shadow-lg p-4 mb-4">
      <h4 class="section-title">Sentiment Trends Over 12 Months</h4>
      <div class="trend-chart-container">
        <canvas id="trendChart"></canvas>
      </div>
      <h4 class="section-title mt-4">Comments Fetched Per Month</h4>
      <div style="height:180px">
        <canvas id="countChart"></canvas>
      </div>
    </div>

    <div class="card shadow-lg p-4 mb-4">
      <h4 class="section-title">Monthly Analysis</h4>
      <p class="text-muted mb-2">Select a month to view its breakdown:</p>
      <div class="month-selector mb-3">
        <button class="btn btn-sm btn-primary month-btn active" onclick="filterByMonth('all')">All Months</button>
        ${chart_data.months.map((m, i) => {
          const count = chart_data.comment_counts[i];
          const badge = count > 0
            ? `<span class="badge bg-secondary ms-1">${count}</span>`
            : `<span class="badge bg-dark ms-1 text-muted">0</span>`;
          return `<button class="btn btn-sm ${count > 0 ? 'btn-outline-secondary' : 'btn-outline-dark'} month-btn"
                          onclick="filterByMonth('${m}')">${m}${badge}</button>`;
        }).join('')}
      </div>
      <div class="row">
        <div class="col-md-6">
          <div class="pie-chart-container">
            <canvas id="sentimentPieChart"></canvas>
          </div>
        </div>
        <div class="col-md-6" id="monthStats">
          ${buildStatsCard("Overall Sentiment", overall_sentiment)}
        </div>
      </div>
    </div>

    <!-- Keyword search -->
    <div class="card shadow-lg p-4 mb-4">
      <h4 class="section-title"><i class="bi bi-search me-2"></i>Search Comments</h4>
      <div class="input-group mb-3">
        <input type="text" id="keywordInput" class="form-control bg-dark text-light border-0"
               placeholder="Search keyword in comments..." oninput="applyKeywordSearch()" />
        <button class="btn btn-outline-secondary" onclick="clearSearch()">Clear</button>
      </div>
      <div id="keywordResults"></div>
    </div>

    <div class="row mb-4">
      <div class="col-md-6 mb-4 mb-md-0">
        <div class="card shadow-lg p-4 h-100">
          <h4 class="section-title text-success">
            <i class="bi bi-hand-thumbs-up me-2"></i>Top Positive Comments
          </h4>
          <div id="positiveComments">${renderCommentsList(top_positive, 'positive')}</div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card shadow-lg p-4 h-100">
          <h4 class="section-title text-danger">
            <i class="bi bi-hand-thumbs-down me-2"></i>Top Negative Comments
          </h4>
          <div id="negativeComments">${renderCommentsList(top_negative, 'negative')}</div>
        </div>
      </div>
    </div>

    <div class="card shadow-lg p-4 mb-4">
      <h4 class="section-title"><i class="bi bi-cloud me-2"></i>Word Cloud</h4>
      <div class="text-center mb-3">
        <img src="/download/${wordcloud_path}" class="wordcloud-img" alt="Word Cloud" />
      </div>
      <div class="text-center">
        <a href="/download/${csv_path}" class="btn btn-outline-primary">
          <i class="bi bi-download me-2"></i>Download Full CSV
        </a>
      </div>
    </div>`;

  renderTrendChart(chart_data);
  renderCountChart(chart_data);
  renderPieChart(overall_sentiment);
}

function buildStatsCard(title, sentiment, commentCount) {
  const countLine = commentCount != null
    ? `<p class="text-muted">${commentCount} comment${commentCount !== 1 ? 's' : ''} analyzed</p>` : '';

  if (commentCount === 0) {
    return `
      <div class="card bg-dark mb-3">
        <div class="card-body">
          <h5 class="card-title">${title}</h5>
          <p class="text-muted">0 comments fetched for this month</p>
          <p class="small text-secondary">This month may be outside the video's publish date or had no comments.</p>
        </div>
      </div>`;
  }

  return `
    <div class="card bg-dark mb-3">
      <div class="card-body">
        <h5 class="card-title">${title}</h5>
        ${countLine}
        <div class="d-flex justify-content-between">
          <div class="text-center">
            <h3 class="text-success">${sentiment.positive}%</h3><p>Positive</p>
          </div>
          <div class="text-center">
            <h3 class="text-warning">${sentiment.neutral}%</h3><p>Neutral</p>
          </div>
          <div class="text-center">
            <h3 class="text-danger">${sentiment.negative}%</h3><p>Negative</p>
          </div>
        </div>
      </div>
    </div>`;
}

function renderTrendChart(chartData) {
  if (trendChart) trendChart.destroy();
  const months   = [...chartData.months].reverse();
  const positive = [...chartData.positive].reverse();
  const negative = [...chartData.negative].reverse();
  const neutral  = [...chartData.neutral].reverse();
  const counts   = [...chartData.comment_counts].reverse();

  trendChart = new Chart(document.getElementById('trendChart').getContext('2d'), {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        { label: 'Positive', data: positive, borderColor: '#4caf50', backgroundColor: 'rgba(76,175,80,0.1)', tension: 0.3, fill: true },
        { label: 'Negative', data: negative, borderColor: '#f44336', backgroundColor: 'rgba(244,67,54,0.1)', tension: 0.3, fill: true },
        { label: 'Neutral',  data: neutral,  borderColor: '#ffc107', backgroundColor: 'rgba(255,193,7,0.1)', tension: 0.3, fill: true }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true, color: '#eaeaea' } },
        tooltip: { callbacks: { footer: items => `Total Comments: ${counts[items[0].dataIndex]}` } }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#eaeaea' } },
        y: { beginAtZero: true, max: 100, grid: { color: 'rgba(255,255,255,0.05)' },
             ticks: { color: '#eaeaea', callback: v => v + '%' } }
      }
    }
  });
}

let countChart = null;

function renderCountChart(chartData) {
  if (countChart) countChart.destroy();
  const months = [...chartData.months].reverse();
  const counts = [...chartData.comment_counts].reverse();
  const colors = counts.map(c => c === 0 ? 'rgba(100,100,100,0.4)' : 'rgba(37,117,252,0.7)');

  countChart = new Chart(document.getElementById('countChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: months,
      datasets: [{
        label: 'Comments Fetched',
        data: counts,
        backgroundColor: colors,
        borderColor: colors.map(c => c.replace('0.7', '1').replace('0.4', '0.6')),
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ctx.raw === 0
              ? 'No comments (video may not exist yet this month)'
              : `${ctx.raw} comments fetched`
          }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#eaeaea' } },
        y: {
          beginAtZero: true,
          max: 100,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#eaeaea', stepSize: 25 }
        }
      }
    }
  });
}

function renderPieChart(sentimentData) {
  if (pieChart) pieChart.destroy();
  pieChart = new Chart(document.getElementById('sentimentPieChart').getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['Positive', 'Negative', 'Neutral'],
      datasets: [{ data: [sentimentData.positive, sentimentData.negative, sentimentData.neutral],
                   backgroundColor: ['#4caf50', '#f44336', '#ffc107'], borderWidth: 0 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20, color: '#eaeaea' } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.raw}%` } }
      }
    }
  });
}

function filterByMonth(month) {
  if (!currentAnalysisData) return;

  document.querySelectorAll('.month-btn').forEach(btn => {
    const isActive = btn.textContent.trim() === month ||
                     (btn.textContent.trim() === 'All Months' && month === 'all');
    btn.classList.toggle('btn-primary', isActive);
    btn.classList.toggle('btn-outline-secondary', !isActive);
  });

  currentMonthFilter = month;

  let sentiment, statsHtml, pos, neg;

  if (month === 'all') {
    sentiment = currentAnalysisData.overall_sentiment;
    statsHtml = buildStatsCard("Overall Sentiment", sentiment);
    pos = currentAnalysisData.top_positive;
    neg = currentAnalysisData.top_negative;
  } else {
    sentiment = currentAnalysisData.monthly_sentiment[month];
    statsHtml = buildStatsCard(`${month}`, sentiment, sentiment.total);
    const monthTop = currentAnalysisData.per_month_top[month] || {};
    pos = monthTop.positive || [];
    neg = monthTop.negative || [];
  }

  renderPieChart(sentiment);
  document.getElementById('monthStats').innerHTML = statsHtml;

  document.getElementById('positiveComments').innerHTML =
    pos.length ? renderCommentsList(pos, 'positive') : '<p class="text-muted">No positive comments this month</p>';
  document.getElementById('negativeComments').innerHTML =
    neg.length ? renderCommentsList(neg, 'negative') : '<p class="text-muted">No negative comments this month</p>';

  // Clear keyword search when switching months
  const kw = document.getElementById('keywordInput');
  if (kw) { kw.value = ''; document.getElementById('keywordResults').innerHTML = ''; }
}

function applyKeywordSearch() {
  const keyword = document.getElementById('keywordInput').value.trim().toLowerCase();
  const container = document.getElementById('keywordResults');
  if (!keyword || !currentAnalysisData) { container.innerHTML = ''; return; }

  // Search across all analyzed comments (flattened from monthly data)
  const allComments = Object.values(currentAnalysisData.per_month_top)
    .flatMap(m => [...(m.positive || []), ...(m.negative || [])]);

  // Also search global top lists which contain all scored comments
  const pool = [
    ...currentAnalysisData.top_positive,
    ...currentAnalysisData.top_negative,
    ...allComments
  ];

  // Deduplicate by text
  const seen = new Set();
  const matches = pool.filter(c => {
    if (seen.has(c.text)) return false;
    seen.add(c.text);
    return c.text.toLowerCase().includes(keyword);
  });

  if (matches.length === 0) {
    container.innerHTML = '<p class="text-muted">No comments match your search.</p>';
    return;
  }

  container.innerHTML = `
    <p class="text-muted mb-2">${matches.length} result(s) for "<strong>${keyword}</strong>"</p>
    ${matches.map(c => renderCommentCard(c, c.sentiment)).join('')}`;
}

function clearSearch() {
  const kw = document.getElementById('keywordInput');
  if (kw) kw.value = '';
  document.getElementById('keywordResults').innerHTML = '';
}

function renderCommentsList(comments, type) {
  if (!comments || comments.length === 0)
    return `<p class="text-muted">No ${type} comments found</p>`;
  return comments.map(c => renderCommentCard(c, type)).join('');
}

function renderCommentCard(comment, type) {
  const displayText = comment.text.length > 150
    ? comment.text.substring(0, 150) + '...' : comment.text;
  const dateStr = comment.date
    ? `<small class="text-muted"><i class="bi bi-calendar me-1"></i>${new Date(comment.date).toLocaleDateString()}</small>` : '';
  const colorClass = type === 'positive' ? 'success' : type === 'negative' ? 'danger' : 'warning';
  return `
    <div class="card comment-card ${type}-card mb-3 p-3">
      <p>${displayText}</p>
      <div class="d-flex justify-content-between align-items-center">
        ${dateStr}
        <span class="badge bg-${colorClass}">Score: ${Math.abs(comment.score).toFixed(2)}</span>
      </div>
    </div>`;
}
