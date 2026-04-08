/**
 * BASF (Ludwigshafen) Hyderabad Jobs Scraper — Naukri.com
 * Direct API fetch with cookie handshake to bypass 406 rejection.
 */

const fs   = require("fs");
const path = require("path");

const DATA_PATH  = path.join(__dirname, "data", "jobs.json");
const HOME_URL   = "https://www.naukri.com/";
const SEARCH_URL = "https://www.naukri.com/ludwigshafen-jobs-in-hyderabad-secunderabad?k=ludwigshafen&l=hyderabad";
const API_URL    = "https://www.naukri.com/jobapi/v3/search";

const COMPANY_FILTER  = /basf|ludwigshafen/i;
const LOCATION_FILTER = /hyderabad|secunderabad/i;

// Rotate through a few realistic user-agents
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function getCookies() {
  // Step 1: hit homepage to get session cookies
  console.log("🍪 Fetching cookies from homepage...");
  const r1 = await fetch(HOME_URL, {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });
  const cookies1 = parseCookies(r1.headers.getSetCookie?.() ?? []);

  // Step 2: hit the search page to pick up search-session cookies
  console.log("🍪 Fetching search page for session cookies...");
  const r2 = await fetch(SEARCH_URL, {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cookie": cookieStr(cookies1),
      "Referer": HOME_URL,
    },
    redirect: "follow",
  });
  const cookies2 = parseCookies(r2.headers.getSetCookie?.() ?? []);

  return cookieStr({ ...cookies1, ...cookies2 });
}

function parseCookies(setCookieHeaders) {
  const jar = {};
  for (const header of setCookieHeaders) {
    const [pair] = header.split(";");
    const [k, v] = pair.split("=");
    if (k && v) jar[k.trim()] = v.trim();
  }
  return jar;
}

function cookieStr(jar) {
  return Object.entries(jar).map(([k,v]) => `${k}=${v}`).join("; ");
}

async function fetchJobs(cookieHeader, pageNo = 1) {
  const params = new URLSearchParams({
    noOfResults: "50",
    urlType:     "search_by_keyword",
    searchType:  "adv",
    keyword:     "ludwigshafen",
    location:    "hyderabad",
    pageNo:      String(pageNo),
    seoKey:      "ludwigshafen-jobs-in-hyderabad-secunderabad",
    src:         "jobsearchDeskGNB",
    latLong:     "",
  });

  const url = `${API_URL}?${params}`;
  console.log(`📡 API call (page ${pageNo}): ${url}`);

  const res = await fetch(url, {
    headers: {
      "Accept":           "application/json, text/plain, */*",
      "Accept-Language":  "en-US,en;q=0.9",
      "appid":            "109",
      "systemid":         "109",
      "clientid":         "d3skt0p",
      "Content-Type":     "application/json",
      "Referer":          SEARCH_URL,
      "User-Agent":       UA,
      "Cookie":           cookieHeader,
      "x-requested-with": "XMLHttpRequest",
    },
  });

  console.log(`📊 API response status: ${res.status}`);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  return res.json();
}

async function scrape() {
  console.log("🚀 Starting BASF Hyderabad Jobs Scraper...");

  const cookieHeader = await getCookies();
  console.log(`🍪 Cookies acquired: ${cookieHeader.slice(0, 80)}...`);

  const json = await fetchJobs(cookieHeader, 1);
  console.log(`📦 API keys: ${Object.keys(json).join(", ")}`);

  const totalCount = json?.noOfJobs ?? json?.totalCount ?? 0;
  console.log(`ℹ️  Total jobs on Naukri: ${totalCount}`);

  let raw = json?.jobDetails ?? json?.results ?? json?.data?.jobDetails ?? [];
  console.log(`📋 Page 1: ${raw.length} jobs`);

  // Fetch more pages if needed
  if (totalCount > 50) {
    const page2 = await fetchJobs(cookieHeader, 2);
    const raw2  = page2?.jobDetails ?? page2?.results ?? [];
    console.log(`📋 Page 2: ${raw2.length} jobs`);
    raw = [...raw, ...raw2];
  }

  const allJobs  = raw.map(normalizeJob);
  const filtered = allJobs.filter(j =>
    COMPANY_FILTER.test(j.company ?? "") &&
    (LOCATION_FILTER.test(j.location ?? "") || j.location === "N/A")
  );

  console.log(`✅ ${filtered.length} BASF Hyderabad jobs (from ${allJobs.length} raw)`);

  const output = {
    meta: {
      source:       SEARCH_URL,
      last_updated: new Date().toISOString(),
      total_jobs:   filtered.length,
      filters_applied: {
        company:  "BASF / Ludwigshafen",
        location: "Hyderabad / Secunderabad",
      },
    },
    jobs: filtered,
  };

  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(output, null, 2), "utf-8");
  console.log(`💾 Saved to ${DATA_PATH}`);
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
