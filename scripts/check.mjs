import { access, readFile } from "node:fs/promises";

const required = ["index.html", "styles.css", "app.js", "data/news.json", ".github/workflows/update-news.yml", ".github/workflows/pages.yml"];
await Promise.all(required.map((file) => access(new URL(`../${file}`, import.meta.url))));
const data = JSON.parse(await readFile(new URL("../data/news.json", import.meta.url), "utf8"));
if (!Array.isArray(data.items) || data.items.length === 0) throw new Error("news.json has no items");
for (const item of data.items) {
  for (const key of ["title", "url", "source", "region", "topic", "publishedAt"]) {
    if (!item[key]) throw new Error(`News item missing ${key}`);
  }
}
console.log(`Checks passed: ${required.length} files, ${data.items.length} news items.`);
