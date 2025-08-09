import axios from "axios";
import { chromium } from "playwright";

export async function fetchJobs(handle) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(handle)}/jobs?content=true`;
  const { data } = await axios.get(url, { timeout: 20000 });
  return data?.jobs || [];
}

export async function applyJob(job, profile, answers, resumePath) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    const applyUrl = job.absolute_url || job.hostedUrl || job.applyUrl || job.url;
    await page.goto(applyUrl, { waitUntil: "domcontentloaded", timeout: 45000 });

    await clickApply(page);

    await fillText(page, ['input[name="first_name"]', '#first_name'], profile.first_name);
    await fillText(page, ['input[name="last_name"]', '#last_name'], profile.last_name);
    await fillText(page, ['input[name="email"]', '#email'], profile.email);
    await fillText(page, ['input[name="phone"]', '#phone'], profile.phone);

    if (resumePath) {
      const fileInput = await any(page, [
        'input[type="file"][name*="resume"]',
        'input[type="file"][id*="resume"]',
        'input[type="file"]'
      ]);
      if (fileInput) await fileInput.setInputFiles(resumePath);
    }

    await fillText(page, ['input[name*="linkedin"]'], profile.linkedin);
    await fillText(page, ['input[name*="website"]', 'input[name*="portfolio"]'], profile.website);

    await selectByLabel(page, /gender/i, "I do not wish to answer");
    await selectByLabel(page, /veteran/i, "I do not wish to answer");
    await selectByLabel(page, /(race|ethnicity)/i, "I do not wish to answer");

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

async function any(page, selectors) {
  for (const s of selectors) {
    const el = await page.$(s);
    if (el) return el;
  }
  return null;
}
async function fillText(page, selectors, value) {
  if (!value) return;
  for (const s of selectors) {
    const el = await page.$(s);
    if (el) { await el.fill(String(value)); return; }
  }
}
async function selectByLabel(page, labelRegex, optionLabel) {
  const selects = await page.$$('select');
  for (const sel of selects) {
    const lab = await sel.evaluate(el => {
      const id = el.id;
      if (!id) return "";
      const label = document.querySelector(`label[for="${id}"]`);
      return label ? label.textContent || "" : "";
    });
    if (labelRegex.test(lab)) {
      try { await sel.selectOption({ label: optionLabel }); } catch {}
      return;
    }
  }
}
