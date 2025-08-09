import axios from "axios";
import cheerio from "cheerio";

const HEADERS = { "User-Agent": "Mozilla/5.0 AutoApplyBot/0.2" };

export async function discoverHandle(domain, ats) {
  const candidates = [
    `https://${domain}`,
    `https://www.${domain}`,
    `https://${domain}/careers`,
    `https://${domain}/jobs`,
    `https://${domain}/careers/`,
    `https://${domain}/about/careers`
  ];
  for (const url of candidates) {
    try {
      const { data } = await axios.get(url, { headers: HEADERS, timeout: 15000, maxRedirects: 5 });
      const h = scanHtml(data, ats);
      if (h) return { handle: h.handle, confidence: h.confidence, url };
    } catch {}
  }
  return { handle: null, confidence: 0 };
}

function scanHtml(html, ats) {
  const $ = cheerio.load(html);
  const text = $.html();

  if (ats === "greenhouse") {
    const m1 = text.match(/boards\.greenhouse\.io\/([a-z0-9\-_.]+)/i);
    if (m1) return { handle: m1[1], confidence: 0.95 };
    const m2 = text.match(/greenhouse\.io\/embed\/job_board\?for=([a-z0-9\-_.]+)/i);
    if (m2) return { handle: m2[1], confidence: 0.85 };
  }
  if (ats === "lever") {
    const m = text.match(/jobs\.lever\.co\/([a-z0-9\-_.]+)/i);
    if (m) return { handle: m[1], confidence: 0.9 };
  }
  if (ats === "ashby") {
    const m = text.match(/jobs\.ashbyhq\.com\/([a-z0-9\-_.]+)/i);
    if (m) return { handle: m[1], confidence: 0.9 };
  }
  if (ats === "smartrecruiters") {
    const m = text.match(/careers\.smartrecruiters\.com\/([a-z0-9\-_.]+)/i);
    if (m) return { handle: m[1], confidence: 0.9 };
  }
  return null;
}
