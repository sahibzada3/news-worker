import Parser from "rss-parser";
import { createClient } from "@supabase/supabase-js";

const parser = new Parser({
  headers: {
    "User-Agent": "Mozilla/5.0"
  },
  timeout: 20000
});

// Supabase client
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
  "https://www.aljazeera.com/xml/rss/middleeast.xml",
  "https://www.telegraph.co.uk/rss.xml",
  "https://www.theguardian.com/world/rss",
  "https://rss.dw.com/xml/rss-en-all"
];

// ⏱ KEEP NEWS FROM LAST 3 HOURS (IMPORTANT FIX)
function isFresh(pubDate) {
  const diff = (Date.now() - new Date(pubDate)) / 60000;
  return diff <= 180;
}

// 🎯 RELAXED FILTER (important fix)
function isRelevant(text) {
  const keywords = [
    "war","attack","strike","missile","drone","explosion",
    "military","conflict","invasion","battle",
    "gaza","israel","iran","ukraine","russia","syria",
    "ceasefire","troops","defense","army"
  ];

  text = text.toLowerCase();
  return keywords.some(k => text.includes(k));
}

// 📊 SCORING
function getScore(text) {
  const high = ["war","missile","airstrike","invasion","explosion"];
  const mid = ["attack","drone","strike","military","battle"];

  let score = 0;
  text = text.toLowerCase();

  high.forEach(w => { if (text.includes(w)) score += 5; });
  mid.forEach(w => { if (text.includes(w)) score += 2; });

  return score;
}

// MAIN FETCH
async function fetchNews() {
  console.log("\n🔄 Scanning feeds...");

  for (const url of feeds) {
    try {
      const feed = await parser.parseURL(url);
      const items = feed?.items || [];

      console.log(`✅ Feed loaded: ${url} | Items: ${items.length}`);

      for (const item of items) {
        try {
          const title = item.title || "";
          const summary = item.contentSnippet || item.summary || "";
          const link = item.link;

          if (!link) continue;

          const pubDate = item.pubDate || new Date().toISOString();

          if (!isFresh(pubDate)) continue;

          const text = `${title} ${summary}`;

          // ❗ fallback: allow some items even if not matched
          const relevant = isRelevant(text);
          const score = getScore(text);

          if (!relevant && score === 0) continue;

          console.log("🟡 Processing:", title);

          const { error } = await supabase
            .from("news")
            .upsert(
              {
                title,
                summary,
                link,
                source: url,
                timestamp: new Date(pubDate),
                score
              },
              {
                onConflict: "link"
              }
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

// START
console.log("🚀 News worker started...");
loop();
setInterval(loop, 30000);
