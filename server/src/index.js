import express from "express";
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";

import db from "./db.js";
import { RateLimiter } from "./rateLimiter.js";
import { readCompaniesCsv } from "./utils/csvio.js";
import { discoverHandle } from "./utils/discover.js";
import { pickResumeForTitle } from "./utils/resumePicker.js";

import * as GH from "./ats/greenhouse.js";
import * as LV from "./ats/lever.js";
import * as AS from "./ats/ashby.js";
import * as SR from "./ats/smartrecruiters.js";

dotenv.config();
const app = express();
app.use(express.json({ limit: "2mb" }));
app.use("/", express.static(path.join(process.cwd(), "public")));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

const PORT = parseInt(process.env.PORT || "4000", 10);
const RATE = parseInt(process.env.RATE_LIMIT_PER_HOUR || "120", 10);

let RUNNING = false;
let CURRENT_ATS = "greenhouse";

const limiter = new RateLimiter({ capacity: RATE });

// load config
const resumeRules = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/config/resumeRules.json"), "utf8"));
const profile = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/config/profile.json"), "utf8"));
const answers = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/config/answers.json"), "utf8"));

const ATS = {
  greenhouse: { fetch: GH.fetchJobs, apply: GH.applyJob },
  lever: { fetch: LV.fetchJobs, apply: LV.applyJob },
  ashby: { fetch: AS.fetchJobs, apply: AS.applyJob },
  smartrecruiters: { fetch: SR.fetchJobs, apply: SR.applyJob }
};

function upsertCompany({ name, domain, country_code, ats }) {
  const stmt = db.prepare(`INSERT OR IGNORE INTO companies (name, domain, country_code, ats) VALUES (?, ?, ?, ?)`);
  stmt.run(name || domain, domain, country_code || "US", ats);
}

function saveJobs(companyId, ats, jobs) {
  const insert = db.prepare(`INSERT OR IGNORE INTO jobs (ext_id, title, location, remote, url, apply_url, posted_at, company_id, ats, raw)
                             VALUES (@ext_id, @title, @location, @remote, @url, @apply_url, @posted_at, @company_id, @ats, @raw)`);
  const tx = db.transaction(arr => arr.forEach(r => insert.run(r)));
  const rows = jobs.map(j => ({
    ext_id: j.id || j.job_id || null,
    title: j.title || j.text || j.job_title || null,
    location: j.location?.name || j.categories?.location || j.location || null,
    remote: j.workplaceType || j.remote || null,
    url: j.absolute_url || j.hostedUrl || j.url || null,
    apply_url: j.applyUrl || j.absolute_url || j.url || null,
    posted_at: j.updated_at || j.postedAt || j.createdAt || j.posted_at || null,
    company_id: companyId,
    ats,
    raw: JSON.stringify(j)
  }));
  tx(rows);
  return rows.length;
}

async function ensureHandles(ats) {
  const list = db.prepare("SELECT * FROM companies WHERE ats = ? AND (handle IS NULL OR handle = '')").all(ats);
  for (const c of list) {
    if (!limiter.tryRemove(1)) await new Promise(r => setTimeout(r, 1200));
    const { handle, confidence } = await discoverHandle(c.domain, ats);
    if (handle) {
      db.prepare("UPDATE companies SET handle = ?, handle_confidence = ? WHERE id = ?").run(handle, confidence, c.id);
    }
  }
}

async function fetchJobsForATS(ats) {
  const f = ATS[ats]?.fetch;
  if (!f) return;
  const companies = db.prepare("SELECT * FROM companies WHERE ats = ? AND handle IS NOT NULL AND handle != ''").all(ats);
  for (const c of companies) {
    try {
      if (!limiter.tryRemove(1)) await new Promise(r => setTimeout(r, 1200));
      const jobs = await f(c.handle);
      saveJobs(c.id, ats, jobs);
    } catch (e) {
      console.error("fetchJobs error", c.domain, e.message);
    }
  }
}

function selectResume(title) {
  try { return pickResumeForTitle(title, resumeRules); } catch { return null; }
}

async function processApplications(ats) {
  const apply = ATS[ats]?.apply;
  if (!apply) return;
  db.prepare(`INSERT INTO applications (job_id, profile_id, status, reason, result)
              SELECT j.id, 1, 'queued', '', '{}' FROM jobs j
              LEFT JOIN applications a ON a.job_id = j.id
              WHERE a.id IS NULL AND j.ats = ?`).run(ats);

  const queue = db.prepare(`SELECT * FROM applications WHERE status = 'queued' LIMIT 8`).all();
  for (const appRow of queue) {
    const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(appRow.job_id);
    const resumePath = selectResume(job.title);
    try {
      if (!limiter.tryRemove(1)) await new Promise(r => setTimeout(r, 1200));
      const res = await apply(JSON.parse(job.raw), profile, answers, resumePath);
      if (res.ok) {
        db.prepare("UPDATE applications SET status = 'submitted', updated_at = datetime('now'), result = json(?) WHERE id = ?")
          .run(JSON.stringify(res), appRow.id);
      } else if (/captcha|challenge|bot/i.test(res.error || "")) {
        db.prepare("UPDATE applications SET status = 'blocked', reason = ?, updated_at = datetime('now'), result = json(?) WHERE id = ?")
          .run("captcha_or_bot_detected", JSON.stringify(res), appRow.id);
      } else {
        db.prepare("UPDATE applications SET status = 'failed', reason = ?, updated_at = datetime('now'), result = json(?) WHERE id = ?")
          .run(res.error || "unknown", JSON.stringify(res), appRow.id);
      }
    } catch (e) {
      db.prepare("UPDATE applications SET status = 'failed', reason = ?, updated_at = datetime('now') WHERE id = ?")
        .run(String(e), appRow.id);
    }
  }
}

// API
app.get("/api/status", (req, res) => {
  const queue = db.prepare("SELECT status, COUNT(*) c FROM applications GROUP BY status").all();
  const companies = db.prepare("SELECT ats, COUNT(*) c FROM companies GROUP BY ats").all();
  const missingHandles = db.prepare("SELECT COUNT(*) c FROM companies WHERE handle IS NULL OR handle = ''").get().c;
  res.json({ running: RUNNING, ats: CURRENT_ATS, rate: limiter.getStatus(), companies, missingHandles, applications: queue });
});

app.post("/api/start", async (req, res) => {
  const { ats } = req.body || {};
  if (ats) CURRENT_ATS = ats;
  RUNNING = true;
  res.json({ ok: true, running: RUNNING, ats: CURRENT_ATS });
  loop().catch(console.error);
});

app.post("/api/stop", (req, res) => {
  RUNNING = false;
  res.json({ ok: true, running: RUNNING });
});

app.post("/api/seed-csv", async (req, res) => {
  const map = {
    greenhouse: path.join(process.cwd(), "data/companies/greenhouse.csv"),
    lever: path.join(process.cwd(), "data/companies/lever.csv"),
    ashby: path.join(process.cwd(), "data/companies/ashby.csv"),
    smartrecruiters: path.join(process.cwd(), "data/companies/smartrecruiters.csv")
  };
  const { ats } = req.body || {};
  const file = map[ats];
  if (!file || !fs.existsSync(file)) return res.status(400).json({ ok: false, error: `CSV missing for ${ats}` });
  const rows = readCompaniesCsv(file);
  for (const r of rows) upsertCompany({ ...r, ats });
  res.json({ ok: true, inserted: rows.length });
});

async function loop() {
  while (RUNNING) {
    try {
      await ensureHandles(CURRENT_ATS);
      await fetchJobsForATS(CURRENT_ATS);
      await processApplications(CURRENT_ATS);
    } catch (e) {
      console.error("Loop error", e);
    }
    await new Promise(r => setTimeout(r, 4000));
  }
}

app.listen(PORT, () => console.log(`AutoApply v0.2 at http://localhost:${PORT}`));
