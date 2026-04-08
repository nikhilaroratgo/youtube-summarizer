const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const qs = require("querystring");

const OUTPUT_DIR = path.join(__dirname, "output");
const PORT = 3000;

// ─── Parse a summary .txt file ───────────────────────────────────────────────
function parseFile(filename) {
  const filepath = path.join(OUTPUT_DIR, filename);
  const content = fs.readFileSync(filepath, "utf-8");
  const lines = content.split("\n");

  const videoUrl = lines[0].trim();
  const tokens = lines[1].trim();

  // Backwards-compatible: new files have a "Hashtags:" line at index 2
  let hashtags = [];
  let markdownStart = 2;
  if (lines[2] && lines[2].trim().startsWith("Hashtags:")) {
    const tagPart = lines[2].trim().replace(/^Hashtags:\s*/, "");
    hashtags = tagPart.split(/\s+/).filter((t) => t.startsWith("#"));
    markdownStart = 3;
  }
  const markdown = lines.slice(markdownStart).join("\n").trim();

  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1] : filename.replace("_summary.txt", "");

  const videoIdMatch = videoUrl.match(/[?&]v=([^&]+)/) || videoUrl.match(/youtu\.be\/([^?]+)/);
  const videoId = videoIdMatch ? videoIdMatch[1] : filename.replace("_summary.txt", "");

  const tokenMatch = tokens.match(/input=(\d+),\s*output=(\d+),\s*total=(\d+)/);
  const modelMatch = tokens.match(/Model:\s*(\S+)/);

  return {
    filename,
    videoUrl,
    tokens,
    markdown,
    title,
    videoId,
    hashtags,
    inputTokens: tokenMatch ? tokenMatch[1] : "—",
    outputTokens: tokenMatch ? tokenMatch[2] : "—",
    totalTokens: tokenMatch ? tokenMatch[3] : "—",
    model: modelMatch ? modelMatch[1] : "claude-sonnet-4-6",
  };
}

function getFiles() {
  if (!fs.existsSync(OUTPUT_DIR)) return [];
  return fs
    .readdirSync(OUTPUT_DIR)
    .filter((f) => f.endsWith("_summary.txt"))
    .sort((a, b) => {
      return (
        fs.statSync(path.join(OUTPUT_DIR, b)).mtime -
        fs.statSync(path.join(OUTPUT_DIR, a)).mtime
      );
    })
    .map(parseFile);
}

// ─── Shared HTML shell ────────────────────────────────────────────────────────
function shell(title, body, extraStyles = "", extraScripts = "") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Merriweather:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet" />
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0f1117;
      --surface: #1a1d27;
      --surface2: #222536;
      --border: #2e3250;
      --accent: #6c63ff;
      --accent-light: #8b85ff;
      --accent-glow: rgba(108, 99, 255, 0.15);
      --text: #e8eaf6;
      --text-muted: #8b90b0;
      --text-dim: #555a7a;
      --green: #4caf82;
      --yellow: #f0b429;
      --red: #f06060;
      --radius: 12px;
    }

    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      line-height: 1.6;
    }

    /* ── NAV ── */
    nav {
      position: sticky;
      top: 0;
      z-index: 100;
      background: rgba(15, 17, 23, 0.85);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      padding: 0 2rem;
      height: 60px;
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    nav .logo {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      font-weight: 700;
      font-size: 1.05rem;
      color: var(--text);
      text-decoration: none;
    }
    nav .logo .icon {
      width: 28px;
      height: 28px;
      background: var(--accent);
      border-radius: 8px;
      display: grid;
      place-items: center;
      font-size: 0.85rem;
    }
    nav .back-btn {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      color: var(--text-muted);
      text-decoration: none;
      font-size: 0.875rem;
      padding: 0.4rem 0.8rem;
      border-radius: 6px;
      transition: all 0.15s;
    }
    nav .back-btn:hover { background: var(--surface2); color: var(--text); }

    /* ── SUBMIT FORM ── */
    .submit-box {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.5rem;
      margin-bottom: 2.5rem;
    }
    .submit-box h2 {
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 1rem;
      color: var(--text);
    }
    .submit-row {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .submit-row input[type="url"] {
      flex: 1;
      min-width: 220px;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.6rem 1rem;
      color: var(--text);
      font-family: inherit;
      font-size: 0.9rem;
      outline: none;
      transition: border-color 0.15s;
    }
    .submit-row input[type="url"]:focus { border-color: var(--accent); }
    .submit-row input[type="url"]::placeholder { color: var(--text-dim); }
    .submit-row select {
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.6rem 0.9rem;
      color: var(--text);
      font-family: inherit;
      font-size: 0.875rem;
      outline: none;
      cursor: pointer;
    }
    .submit-row select:focus { border-color: var(--accent); }
    .submit-btn {
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 0.6rem 1.4rem;
      font-family: inherit;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s, opacity 0.15s;
      white-space: nowrap;
    }
    .submit-btn:hover { background: var(--accent-light); }
    .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    /* ── INDEX PAGE ── */
    .page-index {
      max-width: 1100px;
      margin: 0 auto;
      padding: 3rem 2rem;
    }
    .page-header { margin-bottom: 2rem; }
    .page-header h1 {
      font-size: 2rem;
      font-weight: 700;
      background: linear-gradient(135deg, #fff 0%, var(--accent-light) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .page-header p { color: var(--text-muted); margin-top: 0.5rem; }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 1.25rem;
    }

    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.5rem;
      text-decoration: none;
      color: inherit;
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      transition: all 0.2s;
      position: relative;
      overflow: hidden;
    }
    .card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--accent), var(--accent-light));
      opacity: 0;
      transition: opacity 0.2s;
    }
    .card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 8px 32px var(--accent-glow); }
    .card:hover::before { opacity: 1; }

    .card-thumb {
      width: 100%;
      aspect-ratio: 16/9;
      border-radius: 8px;
      object-fit: cover;
      background: var(--surface2);
    }
    .card-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text);
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .card-url {
      font-size: 0.75rem;
      color: var(--accent-light);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .card-meta { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .badge {
      font-size: 0.7rem;
      font-weight: 500;
      padding: 0.2rem 0.55rem;
      border-radius: 999px;
      background: var(--surface2);
      color: var(--text-muted);
      border: 1px solid var(--border);
    }
    .badge.green { background: rgba(76,175,130,0.1); color: var(--green); border-color: rgba(76,175,130,0.25); }
    .badge.purple { background: rgba(108,99,255,0.1); color: var(--accent-light); border-color: rgba(108,99,255,0.25); }

    /* ── EMPTY STATE ── */
    .empty { text-align: center; padding: 4rem 2rem; color: var(--text-muted); }
    .empty .icon { font-size: 3rem; margin-bottom: 1rem; }
    .empty h2 { font-size: 1.25rem; margin-bottom: 0.5rem; color: var(--text); }

    /* ── DETAIL PAGE ── */
    .page-detail {
      max-width: 820px;
      margin: 0 auto;
      padding: 2.5rem 2rem 5rem;
    }
    .video-hero {
      width: 100%;
      aspect-ratio: 16/9;
      border-radius: var(--radius);
      object-fit: cover;
      margin-bottom: 2rem;
      background: var(--surface2);
      border: 1px solid var(--border);
    }
    .meta-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 2rem;
      padding: 1rem 1.25rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }
    .meta-bar a { color: var(--accent-light); text-decoration: none; font-size: 0.875rem; font-weight: 500; }
    .meta-bar a:hover { text-decoration: underline; }
    .meta-bar .sep { color: var(--text-dim); }
    .meta-bar .token-info { margin-left: auto; display: flex; gap: 0.5rem; }

    /* ── PROGRESS PAGE ── */
    .page-progress {
      max-width: 720px;
      margin: 0 auto;
      padding: 3rem 2rem;
    }
    .progress-header { margin-bottom: 1.5rem; }
    .progress-header h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.4rem; }
    .progress-header p { color: var(--text-muted); font-size: 0.9rem; }
    .progress-url {
      font-size: 0.8rem;
      color: var(--accent-light);
      word-break: break-all;
      margin-top: 0.25rem;
    }

    .log-box {
      background: #0a0c12;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.25rem 1.5rem;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 0.8rem;
      line-height: 1.7;
      color: #a8b0d0;
      min-height: 240px;
      max-height: 480px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .log-box .log-info  { color: #8b90b0; }
    .log-box .log-ok    { color: var(--green); }
    .log-box .log-warn  { color: var(--yellow); }
    .log-box .log-err   { color: var(--red); }
    .log-box .cursor {
      display: inline-block;
      width: 8px; height: 14px;
      background: var(--accent);
      vertical-align: text-bottom;
      animation: blink 1s step-end infinite;
    }
    @keyframes blink { 50% { opacity: 0; } }

    .status-bar {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-top: 1rem;
      padding: 0.75rem 1rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    .spinner {
      width: 16px; height: 16px;
      border: 2px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      flex-shrink: 0;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .status-bar.done { border-color: var(--green); color: var(--green); }
    .status-bar.error { border-color: var(--red); color: var(--red); }

    /* ── MARKDOWN STYLES ── */
    .markdown-body { font-family: 'Merriweather', Georgia, serif; font-size: 1rem; line-height: 1.85; color: var(--text); }
    .markdown-body h1 {
      font-family: 'Inter', sans-serif; font-size: 1.75rem; font-weight: 700;
      margin: 0 0 1.5rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border);
      background: linear-gradient(135deg, #fff 0%, var(--accent-light) 100%);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    }
    .markdown-body h2 {
      font-family: 'Inter', sans-serif; font-size: 1.25rem; font-weight: 600;
      color: var(--text); margin: 2.5rem 0 1rem; padding-left: 0.75rem; border-left: 3px solid var(--accent);
    }
    .markdown-body h3 {
      font-family: 'Inter', sans-serif; font-size: 1rem; font-weight: 600;
      color: var(--accent-light); margin: 1.5rem 0 0.6rem;
    }
    .markdown-body p { margin-bottom: 1rem; }
    .markdown-body ul, .markdown-body ol { margin: 0.5rem 0 1rem 1.5rem; }
    .markdown-body li { margin-bottom: 0.4rem; }
    .markdown-body li::marker { color: var(--accent); }
    .markdown-body strong { color: #fff; font-weight: 600; }
    .markdown-body em { color: var(--text-muted); }
    .markdown-body hr { border: none; border-top: 1px solid var(--border); margin: 2rem 0; }
    .markdown-body code {
      font-family: 'JetBrains Mono', monospace; background: var(--surface2);
      border: 1px solid var(--border); padding: 0.15em 0.4em; border-radius: 4px;
      font-size: 0.875em; color: var(--accent-light);
    }
    .markdown-body blockquote {
      border-left: 3px solid var(--accent); margin: 1rem 0; padding: 0.75rem 1rem;
      background: var(--accent-glow); border-radius: 0 8px 8px 0; color: var(--text-muted);
    }
    .markdown-body table {
      width: 100%; border-collapse: collapse; margin: 1.5rem 0;
      font-family: 'Inter', sans-serif; font-size: 0.875rem;
      border-radius: var(--radius); overflow: hidden; border: 1px solid var(--border);
    }
    .markdown-body th {
      background: var(--surface2); color: var(--accent-light); font-weight: 600;
      padding: 0.65rem 1rem; text-align: left; border-bottom: 1px solid var(--border);
    }
    .markdown-body td { padding: 0.6rem 1rem; border-bottom: 1px solid var(--border); color: var(--text); }
    .markdown-body tr:last-child td { border-bottom: none; }
    .markdown-body tr:hover td { background: var(--surface2); }

    /* ── TAG FILTER ── */
    .tag-filter {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
      align-items: center;
    }
    .tag-pill {
      font-size: 0.75rem;
      font-weight: 500;
      padding: 0.3rem 0.75rem;
      border-radius: 999px;
      background: var(--surface2);
      border: 1px solid var(--border);
      color: var(--text-muted);
      cursor: pointer;
      font-family: inherit;
      transition: all 0.15s;
    }
    .tag-pill:hover { background: var(--surface); color: var(--text); }
    .tag-pill.active { background: var(--accent); border-color: var(--accent); color: #fff; }

    .card-tags { display: flex; gap: 0.4rem; flex-wrap: wrap; }
    .badge.hashtag {
      background: rgba(108,99,255,0.08);
      color: var(--accent-light);
      border-color: rgba(108,99,255,0.2);
    }

    .card-delete {
      font-size: 0.7rem;
      font-weight: 500;
      padding: 0.2rem 0.55rem;
      border-radius: 999px;
      background: var(--surface2);
      border: 1px solid var(--border);
      color: var(--text-muted);
      cursor: pointer;
      font-family: inherit;
      opacity: 0;
      transition: all 0.15s;
    }
    .card:hover .card-delete { opacity: 1; }
    .card-delete:hover {
      background: rgba(240, 96, 96, 0.15);
      border-color: var(--red);
      color: var(--red);
    }

    @media (max-width: 640px) {
      nav { padding: 0 1rem; }
      .page-index, .page-detail, .page-progress { padding: 1.5rem 1rem; }
      .grid { grid-template-columns: 1fr; }
      .submit-row { flex-direction: column; }
      .card-delete { opacity: 1; }
    }
    ${extraStyles}
  </style>
</head>
<body>
${body}
<script>
  document.querySelectorAll('[data-markdown]').forEach(el => {
    el.innerHTML = marked.parse(el.getAttribute('data-markdown'));
  });
  ${extraScripts}
</script>
</body>
</html>`;
}

// ─── Index page ───────────────────────────────────────────────────────────────
function renderIndex(files) {
  const allHashtags = [...new Set([].concat(...files.map((f) => f.hashtags)))].sort();
  const tagFilterBar = allHashtags.length > 0
    ? `<div class="tag-filter" id="tag-filter">
        <button class="tag-pill active" data-tag="__all__">All</button>
        ${allHashtags.map((t) => `<button class="tag-pill" data-tag="${escHtml(t)}">${escHtml(t)}</button>`).join("")}
      </div>`
    : "";

  const cards =
    files.length === 0
      ? `<div class="empty">
          <div class="icon">📭</div>
          <h2>No summaries yet</h2>
          <p>Paste a YouTube URL above to generate your first summary.</p>
        </div>`
      : `${tagFilterBar}<div class="grid" id="card-grid">${files.map(renderCard).join("")}</div>`;

  return shell(
    "YouTube Summarizer",
    `<nav>
      <a href="/" class="logo">
        <span class="icon">▶</span>
        YouTube Summarizer
      </a>
    </nav>
    <div class="page-index">
      <div class="page-header">
        <h1>YouTube Summarizer</h1>
        <p>Paste a link, get a summary.</p>
      </div>

      <div class="submit-box">
        <h2>Summarize a video</h2>
        <form class="submit-row" id="summarize-form" action="/run" method="GET">
          <input
            type="url"
            name="url"
            placeholder="https://youtube.com/watch?v=..."
            required
            autocomplete="off"
          />
          <select name="style">
            <option value="detailed">Detailed</option>
            <option value="brief">Brief</option>
            <option value="bullets">Bullets</option>
          </select>
          <select name="model">
            <option value="claude-sonnet-4-6">Sonnet 4.6</option>
            <option value="claude-opus-4-6">Opus 4.6</option>
            <option value="claude-haiku-4-5-20251001">Haiku 4.5</option>
          </select>
          <button type="submit" class="submit-btn" id="submit-btn">Summarize →</button>
        </form>
      </div>

      ${files.length > 0 ? `<div class="page-header" style="margin-bottom:1.5rem"><p>${files.length} video${files.length !== 1 ? "s" : ""} summarized</p></div>` : ""}
      ${cards}
    </div>`,
    "",
    `document.getElementById('summarize-form').addEventListener('submit', () => {
      document.getElementById('submit-btn').disabled = true;
      document.getElementById('submit-btn').textContent = 'Starting…';
    });

    const tagFilter = document.getElementById('tag-filter');
    if (tagFilter) {
      tagFilter.addEventListener('click', (e) => {
        const pill = e.target.closest('.tag-pill');
        if (!pill) return;
        tagFilter.querySelectorAll('.tag-pill').forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        const tag = pill.dataset.tag;
        document.querySelectorAll('#card-grid .card').forEach((card) => {
          if (tag === '__all__') {
            card.style.display = '';
          } else {
            const cardTags = JSON.parse(card.dataset.hashtags || '[]');
            card.style.display = cardTags.includes(tag) ? '' : 'none';
          }
        });
      });
    }

    async function deleteCard(filename, cardEl, e) {
      e.preventDefault();
      e.stopPropagation();
      if (!confirm('Are you sure you want to delete this Summary?')) return;
      const res = await fetch('/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'file=' + encodeURIComponent(filename),
      });
      if (res.ok) {
        cardEl.remove();
      } else {
        alert('Failed to delete summary.');
      }
    }`
  );
}

function renderCard(file) {
  const thumb = `https://img.youtube.com/vi/${file.videoId}/mqdefault.jpg`;
  const hashtagsAttr = escHtml(JSON.stringify(file.hashtags));
  const tagBadges = file.hashtags.length > 0
    ? `<div class="card-tags">${file.hashtags.map((t) => `<span class="badge hashtag">${escHtml(t)}</span>`).join("")}</div>`
    : "";
  return `<a class="card" href="/summary/${encodeURIComponent(file.filename)}" data-hashtags="${hashtagsAttr}">
    <img class="card-thumb" src="${thumb}" alt="Thumbnail" onerror="this.style.display='none'" />
    <div class="card-title">${escHtml(file.title)}</div>
    <div class="card-url">${escHtml(file.videoUrl)}</div>
    ${tagBadges}
    <div class="card-meta">
      <span class="badge green">✓ Summary</span>
      <span class="badge purple">⚡ ${file.totalTokens} tokens</span>
      <button class="card-delete"
        onclick="deleteCard('${escHtml(file.filename)}', this.closest('.card'), event)">🗑 Delete</button>
    </div>
  </a>`;
}

// ─── Progress page ────────────────────────────────────────────────────────────
function renderProgress(videoUrl, style, model) {
  const params = "url=" + encodeURIComponent(videoUrl) + "&style=" + encodeURIComponent(style) + "&model=" + encodeURIComponent(model);
  return shell(
    "Summarizing…",
    `<nav>
      <a href="/" class="logo">
        <span class="icon">▶</span>
        YouTube Summarizer
      </a>
      <a href="/" class="back-btn">← Cancel</a>
    </nav>
    <div class="page-progress">
      <div class="progress-header">
        <h1>Summarizing video…</h1>
        <p>This usually takes 20–60 seconds. Please wait.</p>
        <div class="progress-url">${escHtml(videoUrl)}</div>
      </div>
      <div class="log-box" id="log"><span class="cursor"></span></div>
      <div class="status-bar" id="status-bar">
        <div class="spinner" id="spinner"></div>
        <span id="status-text">Connecting…</span>
      </div>
    </div>`,
    "",
    `
    const log   = document.getElementById('log');
    const bar   = document.getElementById('status-bar');
    const spin  = document.getElementById('spinner');
    const stTxt = document.getElementById('status-text');

    function appendLog(text, cls) {
      const cursor = log.querySelector('.cursor');
      if (cursor) cursor.remove();
      const span = document.createElement('span');
      if (cls) span.className = cls;
      span.textContent = text + '\\n';
      log.appendChild(span);
      const cur = document.createElement('span');
      cur.className = 'cursor';
      log.appendChild(cur);
      log.scrollTop = log.scrollHeight;
    }

    const es = new EventSource('/stream?${params}');

    es.addEventListener('log', e => {
      const line = e.data;
      let cls = 'log-info';
      if (/error|failed|exception/i.test(line)) cls = 'log-err';
      else if (/warn/i.test(line)) cls = 'log-warn';
      else if (/success|complete|done|saved/i.test(line)) cls = 'log-ok';
      appendLog(line, cls);
      stTxt.textContent = line.slice(0, 80);
    });

    es.addEventListener('done', e => {
      es.close();
      spin.style.display = 'none';
      bar.className = 'status-bar done';
      stTxt.textContent = 'Done! Redirecting to summary…';
      const cursor = log.querySelector('.cursor');
      if (cursor) cursor.remove();
      setTimeout(() => { window.location.href = '/summary/' + encodeURIComponent(e.data); }, 800);
    });

    es.addEventListener('error_msg', e => {
      es.close();
      spin.style.display = 'none';
      bar.className = 'status-bar error';
      stTxt.textContent = 'Error: ' + e.data;
      const cursor = log.querySelector('.cursor');
      if (cursor) cursor.remove();
    });

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) return;
      es.close();
      bar.className = 'status-bar error';
      stTxt.textContent = 'Connection lost.';
    };
    `
  );
}

// ─── Detail page ──────────────────────────────────────────────────────────────
function renderDetail(file) {
  const thumb = `https://img.youtube.com/vi/${file.videoId}/maxresdefault.jpg`;
  const mdEscaped = file.markdown.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

  return shell(
    file.title,
    `<nav>
      <a href="/" class="logo">
        <span class="icon">▶</span>
        YouTube Summarizer
      </a>
      <a href="/" class="back-btn">← All Summaries</a>
    </nav>
    <div class="page-detail">
      <img class="video-hero" src="${thumb}" alt="Video thumbnail"
           onerror="this.src='https://img.youtube.com/vi/${file.videoId}/mqdefault.jpg'" />
      <div class="meta-bar">
        <a href="${escHtml(file.videoUrl)}" target="_blank" rel="noopener">▶ Watch on YouTube</a>
        <span class="sep">·</span>
        <div class="token-info">
          <span class="badge">In: ${file.inputTokens}</span>
          <span class="badge">Out: ${file.outputTokens}</span>
          <span class="badge purple">Total: ${file.totalTokens}</span>
          <span class="badge" title="Model used for summarization">🤖 ${escHtml(file.model)}</span>
        </div>
      </div>
      ${file.hashtags.length > 0 ? `<div class="card-tags" style="margin-bottom:1.5rem">${file.hashtags.map((t) => `<span class="badge hashtag">${escHtml(t)}</span>`).join("")}</div>` : ""}
      <div class="markdown-body" data-markdown="${mdEscaped}"></div>
    </div>`
  );
}

// ─── SSE stream: run main.py and pipe output ──────────────────────────────────
function handleStream(req, res) {
  const rawQuery = req.url.split("?")[1] || "";
  const parsed = qs.parse(rawQuery);
  const videoUrl = parsed.url || "";
  const style = parsed.style || "detailed";
  const model = parsed.model || "claude-sonnet-4-6";

  // Basic validation — no shell involved, args passed as array to spawn
  if (!videoUrl.match(/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//)) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Invalid YouTube URL");
    return;
  }
  const allowedStyles = ["detailed", "brief", "bullets"];
  const safeStyle = allowedStyles.includes(style) ? style : "detailed";
  const allowedModels = ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5-20251001"];
  const safeModel = allowedModels.includes(model) ? model : "claude-sonnet-4-6";

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });

  function send(event, data) {
    res.write(`event: ${event}\ndata: ${data}\n\n`);
  }

  send("log", `Starting summarizer for: ${videoUrl}`);
  send("log", `Style: ${safeStyle}`);

  const proc = spawn(
    "uv",
    ["run", "main.py", videoUrl, "--style", safeStyle, "--model", safeModel],
    { cwd: __dirname }
  );

  function onLine(line) {
    // Strip ANSI color codes for cleaner log display
    const clean = line.replace(/\x1B\[[0-9;]*m/g, "").trim();
    if (clean) send("log", clean);
  }

  // Keepalive: send a comment every 20s so the browser doesn't drop the SSE connection
  // during long operations like Whisper transcription
  const keepalive = setInterval(() => {
    try { res.write(": keepalive\n\n"); } catch (_) {}
  }, 20000);

  function splitLines(buf) {
    // Split on both \n and \r (yt-dlp uses \r for progress lines)
    return buf.split(/[\r\n]/);
  }

  let stdoutBuf = "";
  proc.stdout.on("data", (chunk) => {
    stdoutBuf += chunk.toString();
    const parts = splitLines(stdoutBuf);
    stdoutBuf = parts.pop();
    parts.forEach(onLine);
  });

  let stderrBuf = "";
  proc.stderr.on("data", (chunk) => {
    stderrBuf += chunk.toString();
    const parts = splitLines(stderrBuf);
    stderrBuf = parts.pop();
    parts.forEach(onLine);
  });

  proc.on("close", (code) => {
    clearInterval(keepalive);
    if (stdoutBuf.trim()) onLine(stdoutBuf);
    if (stderrBuf.trim()) onLine(stderrBuf);

    if (code === 0) {
      // Find the newest summary file matching this video
      const files = getFiles();
      const videoIdMatch = videoUrl.match(/[?&]v=([^&]+)/) || videoUrl.match(/youtu\.be\/([^?]+)/);
      const videoId = videoIdMatch ? videoIdMatch[1] : null;
      const match = files.find((f) => f.videoId === videoId);
      if (match) {
        send("done", match.filename);
      } else {
        send("error_msg", "Summary saved but could not locate the output file.");
      }
    } else {
      send("error_msg", `Process exited with code ${code}. Check the log above.`);
    }
    res.end();
  });

  req.on("close", () => proc.kill());
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function send404(res) {
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
}

function parseQuery(rawUrl) {
  const rawQuery = rawUrl.split("?")[1] || "";
  return qs.parse(rawQuery);
}

// ─── Router ───────────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);

  if (urlPath === "/") {
    const files = getFiles();
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderIndex(files));
    return;
  }

  if (urlPath === "/run") {
    const q = parseQuery(req.url);
    if (!q.url) {
      res.writeHead(302, { Location: "/" });
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderProgress(q.url, q.style || "detailed", q.model || "claude-sonnet-4-6"));
    return;
  }

  if (urlPath === "/stream") {
    handleStream(req, res);
    return;
  }

  if (urlPath === "/delete" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk.toString(); });
    req.on("end", () => {
      const params = qs.parse(body);
      const filename = params.file || "";

      if (!filename.endsWith("_summary.txt") || filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Invalid filename");
        return;
      }

      const filepath = path.join(OUTPUT_DIR, filename);
      if (path.resolve(filepath) !== path.join(path.resolve(OUTPUT_DIR), filename)) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Invalid path");
        return;
      }

      if (!fs.existsSync(filepath)) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("File not found");
        return;
      }

      fs.unlinkSync(filepath);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  const summaryMatch = urlPath.match(/^\/summary\/(.+)$/);
  if (summaryMatch) {
    const filename = summaryMatch[1];
    const filepath = path.join(OUTPUT_DIR, filename);
    if (!fs.existsSync(filepath) || !filename.endsWith("_summary.txt")) {
      return send404(res);
    }
    const file = parseFile(filename);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderDetail(file));
    return;
  }

  send404(res);
});

server.listen(PORT, () => {
  console.log(`\n  ▶  YouTube Summarizer running at http://localhost:${PORT}\n`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n  ✖  Port ${PORT} is already in use.\n`);
    console.error(`  To find and stop the process holding it:\n`);
    console.error(`    lsof -i :${PORT} -sTCP:LISTEN`);
    console.error(`    kill <PID>\n`);
    console.error(`  Or kill it in one step:\n`);
    console.error(`    kill $(lsof -ti :${PORT})\n`);
    process.exit(1);
  } else {
    throw err;
  }
});
