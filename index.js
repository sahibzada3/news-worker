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

// Prevent duplicates
const seen = new Set();

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
        const pubDate = item.pubDate || new Date().toISOString();

        const key = item.guid || link || title;

        // prevent duplicates only
        if (seen.has(key)) continue;
        seen.add(key);

        const { error } = await supabase
          .from("news")
          .upsert(
            {
              title,
              summary,
              link,
              source: url,
              timestamp: new Date(pubDate)
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
