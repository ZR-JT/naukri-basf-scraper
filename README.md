# 🏭 BASF India Jobs — Auto-Scraper + AI Database

Automatically scrapes **BASF job listings in India** from [Naukri.com](https://www.naukri.com/basf-jobs-in-india?k=basf&l=india) every **4 hours** via GitHub Actions.  
The data is hosted as a public JSON file on GitHub Pages — usable as a **single source of truth for AI agents**.

---

## 📁 Repo Structure

```
├── .github/
│   └── workflows/
│       └── scrape.yml        ← GitHub Actions (runs every 4h)
├── data/
│   └── jobs.json             ← Live job data (auto-updated)
├── index.html                ← Hosted dashboard (GitHub Pages)
├── scraper.js                ← Playwright scraper
├── package.json
├── AGENT_PROMPT.md           ← AI Agent system prompt
└── README.md
```

---

## 🚀 Setup (5 minutes)

### 1. Create the GitHub Repo

```bash
# Clone or fork this repo, then:
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR-USERNAME/basf-india-jobs.git
git push -u origin main
```

### 2. Enable GitHub Pages

1. Go to **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` / folder: `/ (root)`
4. Save → your site will be at `https://YOUR-USERNAME.github.io/basf-india-jobs/`

### 3. Enable GitHub Actions

1. Go to **Actions** tab → Enable workflows
2. The scraper runs automatically every 4 hours
3. To run it now: **Actions → Scrape BASF India Jobs → Run workflow**

### 4. Configure the AI Agent

Open `AGENT_PROMPT.md` — replace `<YOUR-GITHUB-USERNAME>` and `<YOUR-REPO-NAME>` with your actual values.  
The JSON endpoint will be:
```
https://YOUR-USERNAME.github.io/basf-india-jobs/data/jobs.json
```

---

## 🔍 How Scraping Works

| Layer | Mechanism |
|-------|-----------|
| Browser | Playwright + Chromium (headless) |
| Content | XHR interception of Naukri's internal JSON API |
| Fallback | DOM scraping if XHR yields nothing |
| Filter | Company: `/basf/i` · Location: `/india/i` |
| Anti-bot | Real user-agent, scrolling, human-like timing |

### URL Filters (already baked in)
```
https://www.naukri.com/basf-jobs-in-india?k=basf&l=india
```
- `k=basf` → keyword filter
- `l=india` → location filter
- Secondary JS filter on `company` field ensures no false positives

---

## 🤖 AI Agent JSON Endpoint

```
GET https://YOUR-USERNAME.github.io/basf-india-jobs/data/jobs.json
```

Returns:
```json
{
  "meta": {
    "source": "...",
    "last_updated": "2024-01-15T08:00:00.000Z",
    "total_jobs": 35,
    "filters_applied": { "company": "BASF", "location": "India" }
  },
  "jobs": [
    {
      "title": "...",
      "company": "BASF India Limited",
      "location": "Mumbai",
      "experience": "5-8 Yrs",
      "salary": "...",
      "skills": "...",
      "posted": "2 days ago",
      "url": "https://naukri.com/...",
      "job_id": "...",
      "description_snippet": "..."
    }
  ]
}
```

See `AGENT_PROMPT.md` for the ready-to-use AI agent system prompt.

---

## ⚠️ Legal Note

This scraper is for **personal/internal use only**. Naukri's Terms of Service restrict automated scraping for commercial redistribution. Only use this for private recruitment monitoring within your organization.
