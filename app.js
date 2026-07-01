const state = {
  items: [],
  region: "全部",
  topic: "全部",
  query: "",
  visible: 9,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
})[character]);
const safeUrl = (value = "") => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "#";
  } catch { return "#"; }
};

const relativeTime = (date) => {
  const hours = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 36e5));
  if (hours < 1) return "刚刚";
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
};

const placeholder = (region = "全球") => {
  const palettes = {
    亚洲: ["#ff5c35", "#3b332c"], 欧洲: ["#b8c7c9", "#25353a"],
    非洲: ["#d8a83e", "#4b271c"], 中东: ["#b4aa8a", "#293029"],
    美洲: ["#9cb6bd", "#263b46"], 大洋洲: ["#77a7a0", "#183b43"],
    全球: ["#dfff00", "#292b24"],
  };
  const [a, b] = palettes[region] || palettes.全球;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><filter id="n"><feTurbulence baseFrequency=".55" numOctaves="4"/></filter></defs><rect width="100%" height="100%" fill="url(#g)"/><rect width="100%" height="100%" filter="url(#n)" opacity=".11"/><circle cx="720" cy="100" r="260" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="2"/><text x="55" y="540" font-family="monospace" font-size="22" fill="rgba(255,255,255,.8)">${region.toUpperCase()} / SIGNAL</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const getFiltered = () => state.items.filter((item) => {
  const regionMatch = state.region === "全部" || item.region === state.region;
  const topicMatch = state.topic === "全部" || item.topic === state.topic;
  const haystack = `${item.title} ${item.summary} ${item.source} ${item.region}`.toLowerCase();
  return regionMatch && topicMatch && (!state.query || haystack.includes(state.query.toLowerCase()));
});

function renderLead(items) {
  const lead = items[0];
  if (!lead) {
    $("#lead-story").innerHTML = `<div class="empty">当前筛选下没有信号，试试更宽的范围。</div>`;
    $("#brief-list").innerHTML = "";
    return;
  }
  $("#lead-story").innerHTML = `
    <a href="${safeUrl(lead.url)}" target="_blank" rel="noopener noreferrer">
      <div class="lead-media">
        <img src="${safeUrl(lead.image) === "#" ? placeholder(lead.region) : safeUrl(lead.image)}" alt="">
        <span class="signal-rank">重要度 ${Math.round(lead.score || 80)}</span>
      </div>
      <div class="lead-copy">
        <div class="story-kicker"><span>${escapeHtml(lead.region)}</span><span>·</span><span>${escapeHtml(lead.topic)}</span></div>
        <h2>${escapeHtml(lead.title)}</h2>
        <p>${escapeHtml(lead.summary || "来自全球新闻网络的重要动态，点击阅读原始报道。")}</p>
        <div class="story-byline"><span>${escapeHtml(lead.source)} · ${relativeTime(lead.publishedAt)}</span><span>↗</span></div>
      </div>
    </a>`;
  const leadImage = $("#lead-story img");
  leadImage.onerror = () => { leadImage.src = placeholder(lead.region); };

  $("#brief-list").innerHTML = items.slice(1, 6).map((item) => `
    <li><a href="${safeUrl(item.url)}" target="_blank" rel="noopener noreferrer">
      <div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.region)} · ${escapeHtml(item.source)} · ${relativeTime(item.publishedAt)}</p></div>
    </a></li>`).join("");
}

function renderGrid(items) {
  const grid = $("#news-grid");
  const shown = items.slice(1, state.visible + 1);
  grid.innerHTML = "";
  shown.forEach((item, index) => {
    const node = $("#card-template").content.cloneNode(true);
    const link = node.querySelector(".card-link");
    link.href = item.url;
    const image = node.querySelector("img");
    image.src = item.image || placeholder(item.region);
    image.onerror = () => { image.src = placeholder(item.region); };
    node.querySelector(".card-index").textContent = String(index + 2).padStart(2, "0");
    node.querySelector(".card-region").textContent = `${item.region} / ${item.topic}`;
    node.querySelector("time").textContent = relativeTime(item.publishedAt);
    node.querySelector("h3").textContent = item.title;
    node.querySelector(".card-summary").textContent = item.summary || "打开原始报道了解完整信息。";
    node.querySelector(".card-source").textContent = item.source;
    grid.append(node);
  });
  if (!shown.length) grid.innerHTML = `<p class="empty">没有找到匹配的全球信号。</p>`;
  $("#load-more").hidden = state.visible >= items.length - 1;
}

function render() {
  const items = getFiltered();
  $("#result-count").textContent = items.length;
  renderLead(items);
  renderGrid(items);
}

function renderTicker(items) {
  const headlines = items.slice(0, 10).map((item) => `<span>${item.region} · ${item.title}</span>`).join("");
  $("#ticker-content").innerHTML = headlines + headlines;
}

async function init() {
  try {
    const response = await fetch(`./data/news.json?v=${Date.now()}`);
    if (!response.ok) throw new Error("数据暂不可用");
    const data = await response.json();
    state.items = data.items || [];
    $("#last-updated").textContent = new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
    }).format(new Date(data.updatedAt));
    renderTicker(state.items);
    render();
  } catch (error) {
    $("#lead-story").innerHTML = `<div class="empty">信号连接失败。运行 <code>npm run update</code> 获取最新新闻。</div>`;
  }
}

$("#region-filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-region]");
  if (!button) return;
  $$("#region-filters .filter").forEach((el) => el.classList.remove("active"));
  button.classList.add("active");
  state.region = button.dataset.region;
  state.visible = 9;
  render();
});

$("#topic-filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-topic]");
  if (!button) return;
  $$("#topic-filters .topic").forEach((el) => el.classList.remove("active"));
  button.classList.add("active");
  state.topic = button.dataset.topic;
  state.visible = 9;
  render();
});

$("#load-more").addEventListener("click", () => { state.visible += 9; render(); });
$("#search-toggle").addEventListener("click", () => {
  $("#search-panel").classList.add("open");
  $("#search-panel").setAttribute("aria-hidden", "false");
  setTimeout(() => $("#search-input").focus(), 150);
});
$("#search-close").addEventListener("click", () => {
  $("#search-panel").classList.remove("open");
  $("#search-panel").setAttribute("aria-hidden", "true");
});
$("#search-input").addEventListener("input", (event) => {
  state.query = event.target.value.trim();
  $("#search-hint").textContent = state.query ? `找到 ${getFiltered().length} 个匹配信号，关闭搜索查看结果` : "按标题、摘要、国家和来源检索";
  render();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") $("#search-close").click();
  if (event.key === "/" && document.activeElement !== $("#search-input")) {
    event.preventDefault();
    $("#search-toggle").click();
  }
});

setInterval(() => {
  $("#header-time").textContent = `${new Date().toISOString().slice(11, 16)} UTC`;
}, 1000);

init();
