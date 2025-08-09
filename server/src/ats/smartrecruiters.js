import axios from "axios";
import { chromium } from "playwright";

export async function fetchJobs(org) {
  const url = `https://careers.smartrecruiters.com/${encodeURIComponent(org)}`;
  const { data } = await axios.get(url, { timeout: 20000 });
  const jobs = [];
  const text = typeof data === "string" ? data : JSON.stringify(data);
  const rx = /href="(https:\/\/jobs\.smartrecruiters\.com\/[^"]+)"/gi;
  let m;
  while ((m = rx.exec(text)) !== null) {
    const u = m[1];
    if (u.includes("/job/")) jobs.push({ url: u });
  }
  return jobs;
}

export async function applyJob(job, profile, answers, resumePath) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 45000 });

    await clickApply(page);

    await fillByLabel(page, /first name/i, profile.first_name);
    await fillByLabel(page, /last name/i, profile.last_name);
    await fillByLabel(page, /email/i, profile.email);
    await fillByLabel(page, /phone/i, profile.phone);
    await fillByPlaceholder(page, /linkedin/i, profile.linkedin);
    await fillByPlaceholder(page, /website|portfolio/i, profile.website);

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
async function fillByLabel(page, labelRegex, value) {
  if (!value) return;
  const inputs = await page.$$('input,textarea');
  for (const el of inputs) {
    const lab = await el.evaluate(el => {
      const id = el.id;
      if (!id) return "";
      const label = document.querySelector(`label[for="${id}"]`);
      return label ? label.textContent || "" : "";
    });
    if (labelRegex.test(lab || "")) {
      try { await el.fill(String(value)); } catch {}
      return;
    }
  }
}
async function fillByPlaceholder(page, phRegex, value) {
  if (!value) return;
  const inputs = await page.$$('input,textarea');
  for (const el of inputs) {
    const ph = await el.getAttribute('placeholder');
    if (ph && phRegex.test(ph)) { try { await el.fill(String(value)); } catch {} return; }
  }
}
