import axios from "axios";
import { chromium } from "playwright";

export async function fetchJobs(site) {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`;
  const { data } = await axios.get(url, { timeout: 20000 });
  return Array.isArray(data) ? data : [];
}

export async function applyJob(job, profile, answers, resumePath) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    const applyUrl = job.applyUrl || job.hostedUrl || job.url;
    const openUrl = applyUrl || `https://jobs.lever.co/${job.company || site}`;
    await page.goto(openUrl, { waitUntil: "domcontentloaded", timeout: 45000 });

    await clickApply(page);

    await fillAny(page, ['input[name="name"]','input[name="firstName"]','input[name="first_name"]'], `${profile.first_name} ${profile.last_name}`);
    await fillAny(page, ['input[name="email"]'], profile.email);
    await fillAny(page, ['input[name="phone"]'], profile.phone);
    await fillAny(page, ['input[name*="linkedin"]'], profile.linkedin);
    await fillAny(page, ['input[name*="website"]','input[name*="portfolio"]'], profile.website);

    if (resumePath) {
      const fileInput = await page.$('input[type="file"]');
      if (fileInput) await fileInput.setInputFiles(resumePath);
    }

    await clickSubmit(page);

    await browser.close();
    return { ok: true };
  } catch (e) {
    await browser.close();
    return { ok: false, error: e.message };
  }
}

async function clickApply(page) {
  const locators = [
    page.getByRole('button', { name: /apply/i }).first(),
    page.getByRole('link', { name: /apply/i }).first(),
    page.locator('text=/^Apply( for this job)?$/i').first()
  ];
  for (const l of locators) { try { if (await l.isVisible()) { await l.click(); return true; } } catch {} }
  return false;
}
async function clickSubmit(page) {
  const locators = [
    page.getByRole('button', { name: /submit/i }).first(),
    page.locator('input[type="submit"]').first()
  ];
  for (const l of locators) { try { if (await l.isVisible()) { await l.click(); await page.waitForLoadState("networkidle", { timeout: 30000 }); return true; } } catch {} }
  return false;
}
async function fillAny(page, selectors, value) {
  if (!value) return;
  for (const s of selectors) {
    const el = await page.$(s);
    if (el) { await el.fill(String(value)); return; }
  }
}
