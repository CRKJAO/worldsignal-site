import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const SOURCES = [
  { name: "BBC World", region: "全球", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "Al Jazeera", region: "全球", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { name: "The Guardian", region: "全球", url: "https://www.theguardian.com/world/rss" },
  { name: "NPR World", region: "美洲", url: "https://feeds.npr.org/1004/rss.xml" },
  { name: "CBC World", region: "美洲", url: "https://www.cbc.ca/cmlink/rss-world" },
  { name: "ABC Australia", region: "大洋洲", url: "https://www.abc.net.au/news/feed/51120/rss.xml" },
  { name: "Sky News", region: "全球", url: "https://feeds.skynews.com/feeds/rss/world.xml" },
  { name: "Africa News Network", region: "非洲", url: googleFeed("Africa breaking news") },
  { name: "Asia News Network", region: "亚洲", url: googleFeed("Asia breaking news") },
  { name: "Europe News Network", region: "欧洲", url: googleFeed("Europe breaking news") },
  { name: "Middle East News Network", region: "中东", url: googleFeed("Middle East breaking news") },
  { name: "Latin America News Network", region: "美洲", url: googleFeed("Latin America breaking news") },
  { name: "Pacific News Network", region: "大洋洲", url: googleFeed("Pacific islands Australia New Zealand breaking news") },
];

function googleFeed(query) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:2d`)}&hl=en&gl=US&ceid=US:en`;
}

const TOPICS = {
  政治: ["election", "president", "minister", "government", "parliament", "diplomatic", "sanction", "war", "military", "ceasefire", "court", "protest"],
  经济: ["economy", "market", "trade", "tariff", "inflation", "bank", "oil", "currency", "business", "jobs", "finance", "gdp"],
  科技: ["technology", "artificial intelligence", " ai ", "space", "cyber", "chip", "robot", "internet", "science", "launch"],
  气候: ["climate", "earthquake", "storm", "flood", "wildfire", "hurricane", "heatwave", "environment", "eruption", "drought"],
  社会: ["health", "culture", "education", "rights", "migration", "refugee", "crime", "sport", "people", "society"],
};

const IMPACT_TERMS = [
  "breaking", "war", "ceasefire", "attack", "earthquake", "election", "president",
  "crisis", "emergency", "killed", "agreement", "sanction", "summit", "record",
  "historic", "resigns", "launch", "outbreak", "evacuation", "protest", "collapse",
];

const REGION_TERMS = {
  亚洲: ["china", "japan", "korea", "india", "pakistan", "asia", "taiwan", "indonesia", "philippines", "thailand", "vietnam"],
  欧洲: ["europe", "eu ", "ukraine", "russia", "britain", "france", "germany", "italy", "spain", "poland"],
  非洲: ["africa", "sudan", "nigeria", "kenya", "ethiopia", "congo", "somalia", "south africa", "sahel"],
  中东: ["middle east", "israel", "gaza", "iran", "iraq", "syria", "lebanon", "yemen", "qatar", "saudi"],
  美洲: ["america", "united states", "u.s.", "canada", "mexico", "brazil", "argentina", "venezuela", "colombia", "chile"],
  大洋洲: ["australia", "new zealand", "pacific", "fiji", "papua", "solomon"],
};

const decodeXml = (value = "") => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));

const cleanText = (value = "") => decodeXml(value)
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

function field(xml, names) {
  for (const name of names) {
    const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
    if (match) return decodeXml(match[1]).trim();
  }
  return "";
}

function attr(xml, tags, attribute) {
  for (const tag of tags) {
    const match = xml.match(new RegExp(`<${tag}[^>]*\\s${attribute}=["']([^"']+)["'][^>]*>`, "i"));
    if (match) return decodeXml(match[1]);
  }
  return "";
}

function parseFeed(xml, source) {
  const blocks = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>|<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi) || [];
  return blocks.map((block) => {
    let title = cleanText(field(block, ["title"]));
    let publisher = source.name;
    if (source.url.includes("news.google.com")) {
      const split = title.lastIndexOf(" - ");
      if (split > 0) {
        publisher = title.slice(split + 3).trim();
        title = title.slice(0, split).trim();
      }
    }
    const rawDescription = field(block, ["description", "summary", "content:encoded", "content"]);
    const summary = cleanText(rawDescription).slice(0, 360);
    const url = cleanText(field(block, ["link"])) || attr(block, ["link"], "href");
    const publishedAt = field(block, ["pubDate", "published", "updated", "dc:date"]);
    const image = attr(block, ["media:content", "media:thumbnail", "enclosure"], "url")
      || (rawDescription.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || "");
    return { title, summary, url, source: publisher, feed: source.name, region: source.region, publishedAt, image };
  }).filter((item) => item.title && item.url);
}

function detectRegion(item) {
  const text = ` ${item.title} ${item.summary} `.toLowerCase();
  let best = [item.region, 0];
  for (const [region, terms] of Object.entries(REGION_TERMS)) {
    const hits = terms.filter((term) => text.includes(term)).length;
    if (hits > best[1]) best = [region, hits];
  }
  return best[0];
}

function detectTopic(item) {
  const text = ` ${item.title} ${item.summary} `.toLowerCase();
  let best = ["社会", 0];
  for (const [topic, terms] of Object.entries(TOPICS)) {
    const hits = terms.filter((term) => text.includes(term)).length;
    if (hits > best[1]) best = [topic, hits];
  }
  return best[0];
}

const STOP = new Set(["the", "and", "for", "from", "with", "that", "this", "after", "into", "over", "says", "amid", "have", "has", "are", "was", "will", "news"]);
function tokens(title) {
  return new Set(title.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((word) => word.length > 2 && !STOP.has(word)));
}

function similarity(a, b) {
  const one = tokens(a);
  const two = tokens(b);
  const shared = [...one].filter((token) => two.has(token)).length;
  return shared / Math.max(1, Math.min(one.size, two.size));
}

function scoreItem(item, corroboration) {
  const ageHours = Math.max(0, (Date.now() - new Date(item.publishedAt).getTime()) / 36e5);
  const recency = Math.max(0, 36 - ageHours * 1.25);
  const text = `${item.title} ${item.summary}`.toLowerCase();
  const impact = Math.min(22, IMPACT_TERMS.filter((term) => text.includes(term)).length * 4.4);
  const sourceQuality = item.feed.includes("Network") ? 6 : 10;
  return Math.round(Math.min(100, 30 + recency + impact + sourceQuality + Math.min(16, corroboration * 4)));
}

async function fetchSource(source) {
  const response = await fetch(source.url, {
    headers: { "User-Agent": "Worldsignal/1.0 (+https://github.com/)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return parseFeed(await response.text(), source);
}

async function main() {
  const results = await Promise.allSettled(SOURCES.map(fetchSource));
  const failed = results.map((result, index) => result.status === "rejected" ? `${SOURCES[index].name}: ${result.reason.message}` : null).filter(Boolean);
  let items = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const cutoff = Date.now() - 72 * 36e5;
  items = items.filter((item) => {
    const timestamp = new Date(item.publishedAt).getTime();
    return Number.isFinite(timestamp) && timestamp > cutoff;
  });

  items.forEach((item) => {
    item.region = detectRegion(item);
    item.topic = detectTopic(item);
    const corroboration = items.filter((other) => other.source !== item.source && similarity(item.title, other.title) >= 0.55).length;
    item.score = scoreItem(item, corroboration);
    item.id = createHash("sha1").update(`${item.title}|${item.source}`).digest("hex").slice(0, 12);
    item.publishedAt = new Date(item.publishedAt).toISOString();
  });

  const unique = [];
  for (const item of items.sort((a, b) => b.score - a.score || new Date(b.publishedAt) - new Date(a.publishedAt))) {
    if (!unique.some((existing) => similarity(item.title, existing.title) > 0.82)) unique.push(item);
  }

  const regionCounts = {};
  const balanced = unique.filter((item) => {
    regionCounts[item.region] = (regionCounts[item.region] || 0) + 1;
    return regionCounts[item.region] <= 16;
  }).slice(0, 72);

  const previous = await readFile(new URL("../data/news.json", import.meta.url), "utf8").then(JSON.parse).catch(() => null);
  if (balanced.length < 12 && previous?.items?.length >= 12) {
    throw new Error(`Only ${balanced.length} fresh items found; keeping previous healthy dataset.`);
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    sourceCount: results.filter((result) => result.status === "fulfilled").length,
    failedSources: failed,
    methodology: "Recency + impact signals + cross-source corroboration + geographic diversity",
    items: balanced,
  };
  await mkdir(new URL("../data", import.meta.url), { recursive: true });
  await writeFile(new URL("../data/news.json", import.meta.url), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Updated ${balanced.length} signals from ${payload.sourceCount}/${SOURCES.length} sources.`);
  if (failed.length) console.warn(`Unavailable sources:\n- ${failed.join("\n- ")}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
