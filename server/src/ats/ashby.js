import axios from "axios";
import { chromium } from "playwright";

/** Very simple HTML parse to get job links */
export async function fetchJobs(org) {
  const url = `https://jobs.ashbyhq.com/${encodeURIComponent(org)}`;
  const { data } = await axios.get(url, { timeout: 20000 });
  const jobs = [];
  const text = typeof data === "string" ? data : JSON.stringify(data);
  const rx = /href="\/([^"]+)"[^>]*data-ashby-job-listing/gi;
  let m;
  while ((m = rx.exec(text)) !== null) {
    jobs.push({ url: `https://jobs.ashbyhq.com/${m[1]}` });
  }
  return jobs;
}

export async function applyJob(job, profile, answers, resumePath) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 45000 });

    await clickApply(page);

    await fillByLabel(page, "First Name", profile.first_name);
    await fillByLabel(page, "Last Name", profile.last_name);
    await fillByLabel(page, "Email", profile.email);
    await fillByLabel(page, "Phone", profile.phone);
    await fillByLabel(page, "LinkedIn", profile.linkedin);
    await fillByLabel(page, "Website", profile.website);

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
    page.locator('text=/^Submit application$/i').first(),
    page.locator('input[type="submit"]').first()
  ];
  for (const l of locators) { try { if (await l.isVisible()) { await l.click(); await page.waitForLoadState("networkidle", { timeout: 30000 }); return true; } } catch {} }
  return false;
}
async function fillByLabel(page, label, value) {
  if (!value) return;
  try { const el = await page.getByLabel(label).first(); if (el) await el.fill(String(value)); } catch {}
}
