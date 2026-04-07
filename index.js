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

// MAIN FETCH FUNCTION
async function fetchNews() {
  console.log("\n🔄 Scanning feeds...");

  for (const url of feeds) {
    try {
      const feed = await parser.parseURL(url);

      console.log(`✅ Feed loaded: ${url} | Items: ${feed.items?.length || 0}`);

      const items = feed.items || [];

      for (const item of items) {
        try {
          const title = item.title || "";
          const summary = item.contentSnippet || "";
          const link = item.link || "";
          const pubDate = item.pubDate || new Date().toISOString();

          if (!link) continue;

          console.log("🟡 Processing:", title);

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

        } catch (itemErr) {
          console.log("❌ Item error:", itemErr.message);
        }
      }

    } catch (feedErr) {
      console.log("❌ Feed failed:", url);
      console.log("Reason:", feedErr.message);
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

// START WORKER
console.log("🚀 News worker started...");
loop();
setInterval(loop, 30000);
