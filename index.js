import Parser from "rss-parser";
import { createClient } from "@supabase/supabase-js";

const parser = new Parser({
  headers: {
    "User-Agent": "Mozilla/5.0"
  },
  timeout: 20000
});

// Supabase (Railway ENV)
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

// Prevent duplicates in runtime
const seen = new Set();

// OPTIONAL: freshness filter (can adjust or disable)
function isFresh(pubDate) {
  if (!pubDate) return true;
  const diff = (Date.now() - new Date(pubDate)) / 60000;
  return diff <= 180; // 3 hours (less strict = more news)
}

// Keyword filter
function isRelevant(text) {
  const keywords = [
    "war","attack","airstrike","missile","drone","explosion",
    "bomb","military","invasion","battle","conflict",
    "gaza","israel","iran","syria","hamas","hezbollah"
  ];

  text = text.toLowerCase();
  return keywords.some(k => text.includes(k));
}

// Score system
function getScore(text) {
  const high = ["war","missile","airstrike","explosion","invasion"];
  const mid = ["attack","drone","military","battle","strike"];

  let score = 0;
  text = text.toLowerCase();

  high.forEach(w => { if (text.includes(w)) score += 5; });
  mid.forEach(w => { if (text.includes(w)) score += 2; });

  return score;
}

// FETCH NEWS
async function fetchNews() {
  console.log("\n🔄 Scanning feeds...");

  for (const url of feeds) {
    try {
      const feed = await parser.parseURL(url);

      console.log("✅ Feed loaded:", url);

      for (const item of feed.items) {
        const title = item.title || "";
        const summary = item.contentSnippet || "";
        const link = item.link || "";
        const pubDate = item.pubDate;

        const key = item.guid || link || title;

        if (seen.has(key)) continue;
        seen.add(key);

        const text = `${title} ${summary}`;

        // (TEMP SAFER MODE - NOT TOO STRICT)
        if (!isFresh(pubDate)) continue;
        if (!isRelevant(text)) continue;

        const score = getScore(text);

        const { error } = await supabase
          .from("news")
          .upsert(
            {
              title,
              summary,
              link,
              source: url,
              timestamp: pubDate ? new Date(pubDate) : new Date(),
              category: score >= 6 ? "live" : "recent",
              score
            },
            { onConflict: "link" }
          );

        if (error) {
          console.log("❌ Supabase error:", error.message);
        } else {
          console.log("📰 Saved:", title);
        }
      }
    } catch (e) {
      console.log("❌ Feed failed:", url);
      console.log("Reason:", e.message);
    }
  }
}

// LOOP CONTROL
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
console.log("🚀 News worker started...");
loop();
setInterval(loop, 30000);
