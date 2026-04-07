import Parser from "rss-parser";
import { createClient } from "@supabase/supabase-js";

const parser = new Parser({
  headers: {
    "User-Agent": "Mozilla/5.0"
  },
  timeout: 20000
});

// Supabase
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

// Prevent duplicates per runtime
const seen = new Set();

async function fetchNews() {
  console.log("\n🔄 Scanning feeds...");

  for (const url of feeds) {
    try {
      const feed = await parser.parseURL(url);

      if (!feed?.items?.length) {
        console.log("⚠️ No items found:", url);
        continue;
      }

      console.log(`✅ Feed loaded: ${url} | Items: ${feed.items.length}`);

      for (const item of feed.items) {
        const title = item.title?.trim();
        const summary = item.contentSnippet?.trim() || item.content?.slice(0, 300) || "";
        const link = item.link?.trim();
        const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();

        if (!title || !link) continue;

        const key = item.guid || link;

        if (seen.has(key)) continue;
        seen.add(key);

        console.log("🟡 Processing:", title);

        const { data, error } = await supabase
          .from("news")
          .upsert(
            {
              title,
              summary,
              link,
              source: url,
              timestamp: pubDate.toISOString()
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
  } catch (err) {
    console.log("❌ Loop error:", err.message);
  } finally {
    running = false;
  }
}

// START
console.log("🚀 News worker started...");
loop();
setInterval(loop, 30000);
