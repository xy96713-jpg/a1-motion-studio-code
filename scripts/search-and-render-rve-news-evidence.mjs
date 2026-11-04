import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const argValue = (name, fallback = "") => {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};

const clean = (value = "", max = 500) => String(value || "")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, max);

const decodeEntities = (value = "") => String(value || "")
  .replace(/&amp;/gu, "&")
  .replace(/&lt;/gu, "<")
  .replace(/&gt;/gu, ">")
  .replace(/&quot;/gu, "\"")
  .replace(/&#39;/gu, "'");

const safeUrl = (value = "") => {
  const raw = decodeEntities(clean(value, 1200));
  if (!raw) return "";
  try {
    const url = new URL(/^www\./iu.test(raw) ? `https://${raw}` : raw);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.href;
  } catch {
    return "";
  }
};

const fetchText = async (url, timeoutMs = 15000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 A1MotionStudioEvidenceBot/1.0",
        accept: "application/rss+xml, application/xml, text/xml, text/html;q=0.9,*/*;q=0.8",
      },
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } finally {
    clearTimeout(timer);
  }
};

const wordsFromArticle = (text = "") => {
  const stop = new Set([
    "the", "and", "for", "with", "from", "that", "this", "into", "about", "after", "before", "their", "there", "over", "under", "will", "can", "are", "was", "were",
    "一个", "这个", "那个", "我们", "他们", "以及", "因为", "所以", "但是", "可以", "已经", "不是", "没有", "通过", "需要", "文章", "系统", "生成", "视频",
  ]);
  const ascii = [...String(text).matchAll(/[A-Za-z][A-Za-z0-9-]{2,}/gu)].map((match) => match[0]);
  const cjk = [...String(text).matchAll(/[\p{Script=Han}]{2,8}/gu)].map((match) => match[0]);
  const counts = new Map();
  for (const token of [...ascii, ...cjk]) {
    const key = token.toLowerCase();
    if (stop.has(key) || stop.has(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 8)
    .map(([token]) => token);
};

const queryFromInput = async () => {
  const explicit = clean(argValue("query", ""), 220);
  if (explicit) return explicit;
  const articleFile = clean(argValue("article-file", ""), 900);
  const article = articleFile ? await fs.readFile(path.resolve(articleFile), "utf8") : argValue("article", "");
  const urls = [...String(article).matchAll(/https?:\/\/[^\s"'<>）)]+/giu)].map((match) => match[0]);
  const quoted = [...String(article).matchAll(/[“"]([^”"]{4,80})[”"]/gu)].map((match) => match[1]);
  const keywords = wordsFromArticle(article);
  return clean([
    quoted[0],
    ...keywords,
    urls[0] ? new URL(urls[0]).hostname.replace(/^www\./u, "") : "",
  ].filter(Boolean).slice(0, 7).join(" "), 220);
};

const extractRssItems = (xml = "", source = "") => {
  const items = [];
  for (const itemMatch of String(xml).matchAll(/<item\b[^>]*>[\s\S]*?<\/item>/giu)) {
    const item = itemMatch[0];
    const title = decodeEntities(item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/iu)?.[1]
      || item.match(/<title>([\s\S]*?)<\/title>/iu)?.[1]
      || "");
    const description = decodeEntities(item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/iu)?.[1]
      || item.match(/<description>([\s\S]*?)<\/description>/iu)?.[1]
      || "");
    const rawLink = decodeEntities(item.match(/<link>([\s\S]*?)<\/link>/iu)?.[1] || "");
    let url = safeUrl(rawLink);
    if (/bing\.com\/news\/apiclick/iu.test(url)) {
      try {
        const parsed = new URL(url);
        url = safeUrl(parsed.searchParams.get("url") || "");
      } catch {
        url = "";
      }
    }
    if (!url) continue;
    items.push({
      source,
      title: clean(title, 220),
      description: clean(description.replace(/<[^>]+>/gu, " "), 300),
      url,
      rawLink,
    });
  }
  return items;
};

const searchNews = async (query) => {
  const encoded = encodeURIComponent(query);
  const feeds = [
    {
      source: "bing-news-rss",
      url: `https://www.bing.com/news/search?q=${encoded}&format=rss`,
    },
    {
      source: "google-news-rss",
      url: `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en`,
    },
  ];
  const results = [];
  const errors = [];
  for (const feed of feeds) {
    try {
      const response = await fetchText(feed.url);
      if (!response.ok) {
        errors.push({ source: feed.source, status: response.status });
        continue;
      }
      results.push(...extractRssItems(response.text, feed.source));
    } catch (error) {
      errors.push({ source: feed.source, error: error.message });
    }
  }
  const seen = new Set();
  const candidates = results.filter((item) => {
    const key = item.url.replace(/#.*$/u, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return !/news\.google\.com\/rss\/articles/iu.test(key);
  });
  return { candidates, errors };
};

const runCapture = (candidate) => new Promise((resolve) => {
  const child = spawn("node", [
    "scripts/capture-and-render-rve-evidence.mjs",
    `--url=${candidate.url}`,
    `--title=${candidate.title || "新闻证据进入模板"}`,
  ], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  child.on("close", (code) => {
    const jsonMatch = stdout.match(/\{\s*"contract":\s*"A1LiveArticleMediaToRveTemplateRender\/v1"[\s\S]*\}\s*$/u);
    let artifact = null;
    if (jsonMatch) {
      try {
        artifact = JSON.parse(jsonMatch[0]);
      } catch {
        artifact = null;
      }
    }
    resolve({
      ok: code === 0 && Boolean(artifact),
      code,
      artifact,
      error: clean(stderr.split("\n").filter(Boolean).slice(-8).join(" | "), 1000),
    });
  });
});

const query = await queryFromInput();
if (!query) {
  throw new Error("Missing --query=... or --article=...");
}

const maxCandidates = Math.max(1, Math.min(10, Number(argValue("max", "6")) || 6));
const search = await searchNews(query);
const attempts = [];
let selected = null;
for (const candidate of search.candidates.slice(0, maxCandidates)) {
  const attempt = {
    candidate,
    result: await runCapture(candidate),
  };
  attempts.push(attempt);
  if (attempt.result.ok) {
    selected = attempt;
    break;
  }
}

const report = {
  contract: "A1NewsEvidenceSearchToRveTemplateRender/v1",
  generatedAt: new Date().toISOString(),
  query,
  providerErrors: search.errors,
  candidateCount: search.candidates.length,
  attemptedCount: attempts.length,
  selected: selected ? {
    title: selected.candidate.title,
    url: selected.candidate.url,
    source: selected.candidate.source,
    artifact: selected.result.artifact,
  } : null,
  attempts: attempts.map((attempt) => ({
    title: attempt.candidate.title,
    url: attempt.candidate.url,
    source: attempt.candidate.source,
    ok: attempt.result.ok,
    error: attempt.result.ok ? "" : attempt.result.error,
  })),
};

const reportPath = path.join(root, "public", "template-confirmations", "rve-news-evidence-search.json");
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!selected) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ...report,
  reportPath,
}, null, 2));
