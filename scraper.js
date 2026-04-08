/**
 * BASF (Ludwigshafen) Hyderabad Jobs Scraper — Naukri.com
 * Uses playwright-extra + stealth plugin to bypass bot detection.
 */

const { chromium } = require("playwright-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");

chromium.use(StealthPlugin());

const TARGET_URL =
  "https://www.naukri.com/ludwigshafen-jobs-in-hyderabad-secunderabad?k=ludwigshafen&l=hyderabad";

const DATA_PATH = path.join(__dirname, "data", "jobs.json");

const COMPANY_FILTER  = /basf|ludwigshafen/i;
const LOCATION_FILTER = /hyderabad|secunderabad/i;

async function scrape() {
  console.log("🚀 Starting BASF Hyderabad Jobs Scraper (stealth mode)...");

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
    ],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1366, height: 768 },
    locale: "en-US",
    timezoneId: "Asia/Kolkata",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    },
  });

  // Block images/fonts to speed up loading
  await context.route("**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf}", route => route.abort());

  const page = await context.newPage();
  let capturedJobs = [];

  // ── Intercept Naukri's internal XHR/JSON API ────────────────────────────────
  page.on("response", async (response) => {
    const url = response.url();
    if (
      url.includes("naukri.com/jobapi") ||
      url.includes("naukri.com/v3/search") ||
      url.includes("naukri.com/joblistingapi") ||
      (url.includes("naukri.com") && url.includes("search") && url.includes("json"))
    ) {
      try {
        const json = await response.json();
        const jobs = extractJobsFromApiResponse(json);
        if (jobs.length > 0) {
          console.log(`📡 XHR captured ${jobs.length} jobs from: ${url}`);
          capturedJobs.push(...jobs);
        }
      } catch {
        // not JSON — skip
      }
    }
  });

  // ── Navigate ─────────────────────────────────────────────────────────────────
  console.log("🌐 Navigating to Naukri...");
  try {
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  } catch (err) {
    console.warn("⚠️  Navigation timeout (continuing):", err.message);
  }

  // Wait for job cards to appear
  try {
    await page.waitForSelector(
      '[class*="jobTuple"], [class*="job-card"], article, [class*="srp-jobtuple"]',
      { timeout: 20000 }
    );
    console.log("✅ Job cards detected in DOM");
  } catch {
    console.warn("⚠️  Job card selector timed out, trying scroll anyway...");
  }

  // Human-like scroll
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
    await page.waitForTimeout(600 + Math.random() * 400);
  }

  // ── DOM scraping fallback ─────────────────────────────────────────────────────
  if (capturedJobs.length === 0) {
    console.log("🔍 XHR empty — trying DOM scraping...");

    const title = await page.title();
    const bodySnippet = await page.evaluate(() => document.body?.innerText?.slice(0, 300) ?? "");
    console.log(`📄 Page title: "${title}"`);
    console.log(`📄 Body snippet: ${bodySnippet.replace(/\n/g, " ")}`);

    capturedJobs = await page.evaluate(() => {
      const selectors = [
        '[class*="jobTuple"]',
        '[class*="job-card"]',
        '[class*="srp-jobtuple"]',
        'article[class*="list"]',
        'li[class*="result"]',
        '[data-job-id]',
      ];

      let cards = [];
      for (const sel of selectors) {
        cards = Array.from(document.querySelectorAll(sel));
        if (cards.length > 0) break;
      }

      return cards.map((card) => {
        const link = card.querySelector("a[title], a[href*='naukri.com']") ?? card.querySelector("a");
        return {
          title:
            card.querySelector('[class*="title"], h2, h3, [class*="jobTitle"]')
              ?.innerText?.trim() ?? link?.getAttribute("title") ?? "N/A",
          company:
            card.querySelector('[class*="company"], [class*="companyInfo"], [class*="comp-name"]')
              ?.innerText?.trim() ?? "N/A",
          location:
            card.querySelector('[class*="location"], [class*="loc"], [class*="ellipsis"]')
              ?.innerText?.trim() ?? "N/A",
          experience:
            card.querySelector('[class*="experience"], [class*="exp"]')
              ?.innerText?.trim() ?? "N/A",
          salary:
            card.querySelector('[class*="salary"], [class*="sal"]')
              ?.innerText?.trim() ?? "N/A",
          skills:
            card.querySelector('[class*="skill"], [class*="tag"], [class*="techStack"]')
              ?.innerText?.trim() ?? "N/A",
          posted:
            card.querySelector('[class*="date"], time, [class*="freshness"]')
              ?.innerText?.trim() ?? "N/A",
          url: link?.href ?? "",
        };
      });
    });

    console.log(`🔍 DOM scraping found ${capturedJobs.length} raw cards`);
  }

  await browser.close();

  const filtered = capturedJobs.filter((job) => {
    const companyMatch  = COMPANY_FILTER.test(job.company ?? "");
    const locationMatch = LOCATION_FILTER.test(job.location ?? "") || (job.location ?? "") === "N/A";
    return companyMatch && locationMatch;
  });

  console.log(`✅ ${filtered.length} jobs after filtering (from ${capturedJobs.length} raw)`);

  const output = {
    meta: {
      source: TARGET_URL,
      last_updated: new Date().toISOString(),
      total_jobs: filtered.length,
      filters_applied: {
        company: "BASF / Ludwigshafen (case-insensitive)",
        location: "Hyderabad / Secunderabad",
      },
    },
    jobs: filtered,
  };

  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(output, null, 2), "utf-8");
  console.log(`💾 Saved to ${DATA_PATH}`);
}

function extractJobsFromApiResponse(json) {
  const raw = json?.jobDetails ?? json?.results ?? json?.data?.jobDetails ?? [];
  return raw.map((j) => ({
    title:      j.title       ?? j.jobTitle   ?? "N/A",
    company:    j.companyName ?? j.company    ?? "N/A",
    location:   (j.placeholders ?? []).find((p) => p.type === "location")?.label   ?? j.location   ?? "N/A",
    experience: (j.placeholders ?? []).find((p) => p.type === "experience")?.label ?? j.experience ?? "N/A",
    salary:     (j.placeholders ?? []).find((p) => p.type === "salary")?.label     ?? j.salary     ?? "N/A",
    skills:     j.tagsAndSkills ?? j.skills ?? "N/A",
    posted:     j.footerPlaceholderLabel ?? j.createdDate ?? "N/A",
    url:        j.jdURL ? `https://www.naukri.com${j.jdURL}` : j.jobUrl ?? "",
    job_id:     j.jobId ?? j.id ?? null,
    description_snippet: j.jobDescription ?? j.snippet ?? "",
  }));
}

scrape().catch((err) => {
  console.error("❌ Scraper failed:", err);
  process.exit(1);
});
