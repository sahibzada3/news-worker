import Parser from "rss-parser";
import { createClient } from "@supabase/supabase-js";

const parser = new Parser({
  headers: {
    "User-Agent": "Mozilla/5.0"
  },
  timeout: 10000
});

// 🔐 ENV VARIABLES (IMPORTANT FOR RENDER)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// RSS FEEDS
const feeds = [
  "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/MiddleEast.xml",
  "https://feeds.bbci.co.uk/news/world/rss.xml",
  "https://www.aljazeera.com/xml/rss/all.xml",
  "https://www.theguardian.com/world/rss",
  "https://rss.dw.com/xml/rss-en-all"
];

// CACHE (prevents duplicates in runtime)
const seen = new Set();

// CHECK FRESHNESS (60 min)
function isFresh(pubDate) {
  if (!pubDate) return false;
  const diff = (Date.now() - new Date(pubDate)) / 60000;
  return diff <= 60;
}

// FILTER KEYWORDS
function isRelevant(text) {
  const keywords = [
    "war","attack","airstrike","missile","drone","explosion",
    "bomb","military","invasion","battle","conflict",
    "gaza","israel","iran","syria","hamas","hezbollah"
  ];

  text = text.toLowerCase();
  return keywords.some(k => text.includes(k));
}

// SCORE SYSTEM
function getScore(text) {
  const high = ["war","missile","airstrike","explosion","invasion"];
  const mid = ["attack","drone","military","battle","strike"];

  let score = 0;
  text = text.toLowerCase();

  high.forEach(w => { if (text.includes(w)) score += 5; });
  mid.forEach(w => { if (text.includes(w)) score += 2; });

  return score;
}

// FETCH FUNCTION
async function fetchNews() {
  console.log("Scanning feeds...");

  for (const url of feeds) {
    try {
      const feed = await parser.parseURL(url);

      for (const item of feed.items) {
        const title = item.title || "";
        const summary = item.contentSnippet || "";
        const link = item.link || "";
        const pubDate = item.pubDate;

        const key = item.guid || link || title;

        if (seen.has(key)) continue;
        seen.add(key);

        if (!isFresh(pubDate)) continue;

        const text = `${title} ${summary}`;

        if (!isRelevant(text)) continue;

        const score = getScore(text);
        if (score < 1) continue;

        const { error } = await supabase
          .from("news")
          .upsert(
            {
              title,
              summary,
              link,
              source: url,
              timestamp: new Date(pubDate),
              category: score >= 6 ? "live" : "recent",
              score
            },
            { onConflict: "link" }
          );

        if (!error) {
          console.log("📰 Saved:", title);
        }
      }
    } catch (e) {
      console.log("Feed failed:", url);
    }
  }
}

// LOOP CONTROL (safe)
let running = false;

async function loop() {
  if (running) return;
  running = true;

  try {
    await fetchNews();
  } finally {
    running = false;
  }
}

// START
loop();
setInterval(loop, 30000);
