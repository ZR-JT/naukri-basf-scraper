/**
 * BASF (Ludwigshafen) Hyderabad Jobs Scraper — Naukri.com
 * 
 * Calls Naukri's internal search JSON API directly via fetch.
 * No browser / Playwright needed — avoids GitHub Actions IP blocks.
 */

const fs   = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "data", "jobs.json");

// Naukri's internal search API (same endpoint the browser calls via XHR)
const API_BASE = "https://www.naukri.com/jobapi/v3/search";

const PARAMS = new URLSearchParams({
  noOfResults:  "50",
  urlType:      "search_by_keyword",
  searchType:   "adv",
  keyword:      "ludwigshafen",
  location:     "hyderabad",
  pageNo:       "1",
  seoKey:       "ludwigshafen-jobs-in-hyderabad-secunderabad",
  src:          "jobsearchDeskGNB",
  latLong:      "",
});

// Headers that mimic a real browser XHR request to Naukri
const HEADERS = {
  "Accept":           "application/json, text/plain, */*",
  "Accept-Language":  "en-US,en;q=0.9",
  "appid":            "109",
  "systemid":         "109",
  "Content-Type":     "application/json",
  "Referer":          "https://www.naukri.com/ludwigshafen-jobs-in-hyderabad-secunderabad?k=ludwigshafen&l=hyderabad",
  "User-Agent":       "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "x-requested-with": "XMLHttpRequest",
};

const COMPANY_FILTER  = /basf|ludwigshafen/i;
const LOCATION_FILTER = /hyderabad|secunderabad/i;

async function scrape() {
  console.log("🚀 Starting BASF Hyderabad Jobs Scraper (direct API mode)...");

  const url = `${API_BASE}?${PARAMS}`;
  console.log(`📡 Fetching: ${url}`);

  const res = await fetch(url, { headers: HEADERS });

  if (!res.ok) {
    throw new Error(`API responded with HTTP ${res.status}: ${res.statusText}`);
  }

  const json = await res.json();
  console.log(`📦 Raw API keys: ${Object.keys(json).join(", ")}`);

  const raw = json?.jobDetails ?? json?.results ?? json?.data?.jobDetails ?? [];
  console.log(`📋 Raw jobs received: ${raw.length}`);

  const allJobs = raw.map(normalizeJob);

  const filtered = allJobs.filter((job) => {
    const companyOk  = COMPANY_FILTER.test(job.company ?? "");
    const locationOk = LOCATION_FILTER.test(job.location ?? "") ||
                       (job.location ?? "") === "N/A"; // URL already scopes to Hyderabad
    return companyOk && locationOk;
  });

  console.log(`✅ ${filtered.length} jobs after filtering (from ${allJobs.length} raw)`);

  // --- Page 2+ if more results exist ---
  const totalCount = json?.noOfJobs ?? json?.totalCount ?? 0;
  console.log(`ℹ️  Total available on Naukri: ${totalCount}`);

  if (totalCount > 50) {
    console.log("📄 Fetching page 2...");
    const page2 = await fetchPage(2);
    filtered.push(...page2);
  }

  const output = {
    meta: {
      source: "https://www.naukri.com/ludwigshafen-jobs-in-hyderabad-secunderabad?k=ludwigshafen&l=hyderabad",
      last_updated: new Date().toISOString(),
      total_jobs:   filtered.length,
      filters_applied: {
        company:  "BASF / Ludwigshafen (case-insensitive)",
        location: "Hyderabad / Secunderabad",
      },
    },
    jobs: filtered,
  };

  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(output, null, 2), "utf-8");
  console.log(`💾 Saved ${filtered.length} jobs to ${DATA_PATH}`);
}

async function fetchPage(pageNo) {
  const p = new URLSearchParams({ ...Object.fromEntries(PARAMS), pageNo: String(pageNo) });
  const res = await fetch(`${API_BASE}?${p}`, { headers: HEADERS });
  if (!res.ok) return [];
  const json = await res.json();
  const raw  = json?.jobDetails ?? json?.results ?? json?.data?.jobDetails ?? [];
  return raw.map(normalizeJob).filter(j =>
    COMPANY_FILTER.test(j.company ?? "") &&
    (LOCATION_FILTER.test(j.location ?? "") || j.location === "N/A")
  );
}

function normalizeJob(j) {
  const ph = j.placeholders ?? [];
  return {
    title:       j.title       ?? j.jobTitle   ?? "N/A",
    company:     j.companyName ?? j.company    ?? "N/A",
    location:    ph.find(p => p.type === "location")?.label   ?? j.location   ?? "N/A",
    experience:  ph.find(p => p.type === "experience")?.label ?? j.experience ?? "N/A",
    salary:      ph.find(p => p.type === "salary")?.label     ?? j.salary     ?? "N/A",
    skills:      j.tagsAndSkills ?? j.skills ?? "N/A",
    posted:      j.footerPlaceholderLabel ?? j.createdDate ?? "N/A",
    url:         j.jdURL ? `https://www.naukri.com${j.jdURL}` : j.jobUrl ?? "",
    job_id:      j.jobId ?? j.id ?? null,
    description_snippet: j.jobDescription ?? j.snippet ?? "",
  };
}

scrape().catch(err => {
  console.error("❌ Scraper failed:", err.message);
  process.exit(1);
});
