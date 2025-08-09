import Database from "better-sqlite3";
import path from "node:path";

const DB_PATH = path.join(process.cwd(), "data.sqlite");
const db = new Database(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  domain TEXT,
  country_code TEXT,
  ats TEXT NOT NULL,
  handle TEXT,
  handle_confidence REAL DEFAULT 0,
  UNIQUE(domain, ats)
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ext_id TEXT,
  title TEXT,
  location TEXT,
  remote TEXT,
  url TEXT,
  apply_url TEXT,
  posted_at TEXT,
  company_id INTEGER,
  ats TEXT,
  raw JSON,
  UNIQUE(url),
  FOREIGN KEY(company_id) REFERENCES companies(id)
);

CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  linkedin TEXT,
  website TEXT,
  resume_path TEXT,
  cover_letter_template TEXT,
  extra JSON
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER,
  profile_id INTEGER,
  status TEXT,
  reason TEXT,
  result JSON,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(job_id) REFERENCES jobs(id),
  FOREIGN KEY(profile_id) REFERENCES profiles(id)
);
`);

const cnt = db.prepare("SELECT COUNT(*) c FROM profiles").get().c;
if (cnt === 0) {
  db.prepare(`INSERT INTO profiles (label, first_name, last_name, email, phone, city, state, country, linkedin, website, resume_path, cover_letter_template)
              VALUES (@label, @first_name, @last_name, @email, @phone, @city, @state, @country, @linkedin, @website, @resume_path, @cover_letter_template)`)
    .run({
      label: "Default",
      first_name: "Alex",
      last_name: "Candidate",
      email: "alex@example.com",
      phone: "+1-555-123-4567",
      city: "San Jose",
      state: "CA",
      country: "USA",
      linkedin: "https://www.linkedin.com/in/alex",
      website: "https://alex.dev",
      resume_path: null,
      cover_letter_template: "I admire {{company}}'s work in {{domain}}. With experience in {{skills}}, I'm excited about the {{role}} role."
    });
}

export default db;
