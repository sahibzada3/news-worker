import Parser from "rss-parser";
import axios from "axios";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";

const parser = new Parser({
  headers: {
    "User-Agent": "Mozilla/5.0"
  },
  timeout: 20000
});

// RSS FEEDS
const feeds = [
  "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml",
  "https://feeds.bbci.co.uk/news/world/rss.xml",
  "https://www.aljazeera.com/xml/rss/all.xml",
  "https://www.aljazeera.com/xml/rss/middleeast.xml",
  "https://www.telegraph.co.uk/rss.xml",
  "https://www.theguardian.com/world/rss",
  "https://rss.dw.com/xml/rss-en-all"
];

// ⏱ KEEP NEWS FROM LAST 3 HOURS
function isFresh(pubDate) {
  const diff = (Date.now() - new Date(pubDate)) / 60000;
  return diff <= 180;
}

// 🎯 FILTER
function isRelevant(text) {
  const keywords = [
    "war",
    "attack",
    "strike",
    "missile",
    "drone",
    "explosion",
    "military",
    "conflict",
    "invasion",
    "battle",
    "gaza",
    "israel",
    "iran",
    "ukraine",
    "russia",
    "syria",
    "iraq",
    "middle east",
    "houthis",
    "hamas",
    "lebanon",
    "hezbollah",
    "ceasefire",
    "troops",
    "defense",
    "army"
  ];

  text = text.toLowerCase();

  return keywords.some((k) => text.includes(k));
}

// 📊 SCORING
function getScore(text) {
  const high = [
    "war",
    "missile",
    "airstrike",
    "invasion",
    "explosion"
  ];

  const mid = [
    "attack",
    "drone",
    "strike",
    "military",
    "battle"
  ];

  let score = 0;

  text = text.toLowerCase();

  high.forEach((w) => {
    if (text.includes(w)) score += 5;
  });

  mid.forEach((w) => {
    if (text.includes(w)) score += 2;
  });

  return score;
}

// 🧠 ARTICLE EXTRACTION
async function extractArticle(url) {
  try {
    const res = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      },
      timeout: 15000
    });

    const $ = cheerio.load(res.data);

    $("script, style, nav, footer, header").remove();

    let text = "";

    // Main article paragraphs
    $("article p").each((i, el) => {
      text += $(el).text() + "\n";
    });

    // Fallback
    if (text.length < 300) {
      $("p").each((i, el) => {
        text += $(el).text() + "\n";
      });
    }

    // Image extraction
    const image =
      $("meta[property='og:image']").attr("content") ||
      $("img").first().attr("src") ||
      null;

    return {
      content: text.trim().slice(0, 5000),
      image
    };

  } catch (err) {
    console.log("❌ Scrape failed:", url);
    return null;
  }
}

// MAIN FETCH FUNCTION
async function fetchNews(env) {

  console.log("🔄 Scanning feeds...");

  // Supabase Client
  const supabase = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_KEY
  );

  for (const url of feeds) {

    try {

      const feed = await parser.parseURL(url);

      const items = feed?.items || [];

      console.log(`✅ Feed loaded: ${url} | Items: ${items.length}`);

      for (const item of items) {

        try {

          const title = item.title || "";

          const snippet =
            item.contentSnippet ||
            item.summary ||
            "";

          const link = item.link;

          if (!link) continue;

          const pubDate =
            item.pubDate ||
            new Date().toISOString();

          if (!isFresh(pubDate)) continue;

          const text = `${title} ${snippet}`;

          const relevant = isRelevant(text);

          const score = getScore(text);

          if (!relevant && score === 0) continue;

          console.log("🟡 Processing:", title);

          // Extract article
          const articleData = await extractArticle(link);

          const fullContent =
            articleData?.content ||
            snippet;

          const image =
            articleData?.image ||
            item.enclosure?.url ||
            null;

          const { error } = await supabase
            .from("news")
            .upsert(
              {
                title,
                summary: snippet,
                content: fullContent,
                image,
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

            console.log(
              "❌ Supabase error:",
              error.message
            );

          } else {

            console.log("📰 Saved:", title);

          }

        } catch (itemErr) {

          console.log(
            "❌ Item error:",
            itemErr.message
          );

        }
      }

    } catch (feedErr) {

      console.log("❌ Feed failed:", url);

      console.log(
        "Reason:",
        feedErr.message
      );

    }
  }

  console.log("✅ News scan completed");
}

// CLOUDLFARE WORKER
export default {

  // Runs every cron trigger
  async scheduled(event, env, ctx) {

    console.log("🚀 Scheduled worker started");

    await fetchNews(env);

  },

  // Optional browser test
  async fetch(request, env, ctx) {

    return new Response(
      "News worker is running successfully."
    );

  }

};
