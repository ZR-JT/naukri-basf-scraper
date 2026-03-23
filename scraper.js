/**
 * BASF India Jobs Scraper — Naukri.com
 * Runs via GitHub Actions every 4 hours.
 * Uses Playwright to handle JS-rendered content + intercepts Naukri's internal XHR API.
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const TARGET_URL =
  "https://www.naukri.com/basf-jobs-in-india?k=basf&l=india&nignbevent_src=jobsearchDeskGNB";

const DATA_PATH = path.join(__dirname, "data", "jobs.json");

// --- Filters ---
const COMPANY_FILTER = /basf/i;          // must contain "BASF"
const LOCATION_FILTER = /india/i;         // must be in India (belt-and-suspenders)

async function scrape() {
  console.log("🚀 Starting BASF India Jobs Scraper...");

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  const page = await context.newPage();

  let capturedJobs = [];

  // ── Intercept Naukri's internal XHR/JSON API calls ──────────────────────────
  page.on("response", async (response) => {
    const url = response.url();
    if (
      url.includes("naukri.com/jobapi") ||
      url.includes("naukri.com/v3/search") ||
      url.includes("naukri.com/joblistingapi")
    ) {
      try {
        const json = await response.json();
        const jobs = extractJobsFromApiResponse(json);
        if (jobs.length > 0) {
          console.log(`📡 XHR captured ${jobs.length} jobs from API`);
          capturedJobs.push(...jobs);
        }
      } catch {
        // not JSON or empty — skip
      }
    }
  });

  // ── Navigate & scroll to trigger all XHR calls ──────────────────────────────
  try {
    await page.goto(TARGET_URL, { waitUntil: "networkidle", timeout: 60000 });
  } catch (err) {
    console.warn("⚠️  networkidle timeout (continuing):", err.message);
  }

  // Scroll to load lazy-loaded results
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(800);
  }

  // ── Fallback: DOM scraping if XHR yielded nothing ───────────────────────────
  if (capturedJobs.length === 0) {
    console.log("🔍 Falling back to DOM scraping...");
    capturedJobs = await page.evaluate(() => {
      const cards = Array.from(
        document.querySelectorAll(
          'article.jobTuple, div.jobTupleHeader, [class*="jobTuple"]'
        )
      );
      return cards.map((card) => ({
        title:
          card.querySelector('[class*="title"], h2, h3')?.innerText?.trim() ??
          "N/A",
        company:
          card.querySelector('[class*="company"], [class*="companyInfo"]')
            ?.innerText?.trim() ?? "N/A",
        location:
          card.querySelector('[class*="location"], [class*="ellipsis"]')
            ?.innerText?.trim() ?? "N/A",
        experience:
          card.querySelector('[class*="experience"]')?.innerText?.trim() ??
          "N/A",
        salary:
          card.querySelector('[class*="salary"]')?.innerText?.trim() ?? "N/A",
        skills:
          card.querySelector('[class*="skill"], [class*="tag"]')?.innerText
            ?.trim() ?? "N/A",
        posted:
          card.querySelector('[class*="date"], time')?.innerText?.trim() ??
          "N/A",
        url:
          card.querySelector("a[href*='naukri.com']")?.href ??
          card.querySelector("a")?.href ??
          "",
      }));
    });
  }

  await browser.close();

  // ── Filter: only BASF + India ────────────────────────────────────────────────
  const filtered = capturedJobs.filter((job) => {
    const companyMatch = COMPANY_FILTER.test(job.company ?? "");
    const locationMatch =
      LOCATION_FILTER.test(job.location ?? "") ||
      (job.location ?? "") === "N/A"; // keep if location unknown (already filtered by URL)
    return companyMatch && locationMatch;
  });

  console.log(
    `✅ ${filtered.length} BASF India jobs after filtering (from ${capturedJobs.length} raw)`
  );

  // ── Write output ─────────────────────────────────────────────────────────────
  const output = {
    meta: {
      source: TARGET_URL,
      last_updated: new Date().toISOString(),
      total_jobs: filtered.length,
      filters_applied: {
        company: "BASF (case-insensitive)",
        location: "India",
      },
    },
    jobs: filtered,
  };

  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(output, null, 2), "utf-8");
  console.log(`💾 Saved to ${DATA_PATH}`);
}

/**
 * Normalize jobs from Naukri's internal API response.
 * Naukri wraps jobs in jobDetails[] or results[].
 */
function extractJobsFromApiResponse(json) {
  const raw =
    json?.jobDetails ?? json?.results ?? json?.data?.jobDetails ?? [];
  return raw.map((j) => ({
    title: j.title ?? j.jobTitle ?? "N/A",
    company: j.companyName ?? j.company ?? "N/A",
    location: (j.placeholders ?? [])
      .find((p) => p.type === "location")
      ?.label ?? j.location ?? "N/A",
    experience: (j.placeholders ?? [])
      .find((p) => p.type === "experience")
      ?.label ?? j.experience ?? "N/A",
    salary: (j.placeholders ?? [])
      .find((p) => p.type === "salary")
      ?.label ?? j.salary ?? "N/A",
    skills: (j.tagsAndSkills ?? j.skills ?? "N/A"),
    posted: j.footerPlaceholderLabel ?? j.createdDate ?? "N/A",
    url: j.jdURL
      ? `https://www.naukri.com${j.jdURL}`
      : j.jobUrl ?? "",
    job_id: j.jobId ?? j.id ?? null,
    description_snippet: j.jobDescription ?? j.snippet ?? "",
  }));
}

scrape().catch((err) => {
  console.error("❌ Scraper failed:", err);
  process.exit(1);
});
