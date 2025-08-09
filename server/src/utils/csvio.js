import fs from "node:fs";
import { parse } from "csv-parse/sync";

/** Expect columns: name,domain,country_code (US rows only kept) */
export function readCompaniesCsv(filePath) {
  const csv = fs.readFileSync(filePath, "utf8");
  const recs = parse(csv, { columns: true, skip_empty_lines: true });
  const norm = (s) => (s ?? "").toString().trim();
  const upper = (s) => norm(s).toUpperCase();

  return recs
    .filter(r => upper(r.country_code || r.country) === "US")
    .map(r => ({
      name: norm(r.name || r.company_name),
      domain: norm(r.domain || r.company_domain).toLowerCase(),
      country_code: "US"
    }))
    .filter(r => r.domain);
}
