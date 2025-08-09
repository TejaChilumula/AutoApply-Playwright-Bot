import fs from "node:fs";

export function pickResumeForTitle(title, rules) {
  const t = (title || "").toLowerCase();
  for (const [bucket, keywords] of Object.entries(rules)) {
    if (bucket === "_map") continue;
    for (const kw of keywords) {
      if (t.includes(kw.toLowerCase())) {
        const p = rules._map?.[bucket];
        if (p && fs.existsSync(p)) return p;
      }
    }
  }
  // default: first existing resume in map
  for (const k of Object.keys(rules._map || {})) {
    const p = rules._map[k];
    if (p && fs.existsSync(p)) return p;
  }
  // resume
  return null;
}
