import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import NodeCache from "node-cache";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(helmet());
app.use(cors({
  origin: true, // Allow all origins for development
  methods: ["POST", "OPTIONS", "HEAD"],
  credentials: false
}));
app.use(express.json({ limit: "500kb" }));

const limiter = rateLimit({ windowMs: 60 * 1000, max: 20 });
app.use(limiter);

const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY missing. Please set in .env file.");
  process.exit(1);
}

function normalizeText(text) {
  return text ? text.slice(0, 50000) : "";
}

// Simple status endpoint for the extension to check if backend is running
app.head("/scan", (req, res) => {
  res.status(200).end();
});

app.post("/scan", async (req, res) => {
  try {
    const { text, url } = req.body;
    if (!text) return res.status(400).json({ error: "No text supplied" });

    // Check if API key is valid
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
      console.error("Invalid Gemini API Key. Please set a valid API key in the .env file.");
      return res.status(500).json({ 
        error: "invalid_api_key", 
        message: "The Gemini API key is not configured. Please set a valid API key in the .env file."
      });
    }

    const normalized = normalizeText(text);
    const cacheKey = `${normalized.slice(0, 200)}|${url || ""}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ cached: true, results: cached });

    const prompt = `
You are a medical fact-checker AI. ONLY focus on topics related to:
- Medicine
- Health & wellness
- Fitness
- Mental health
- Psychology
- Veterinary health
- Pharmaceuticals
- Human anatomy & physiology
Ignore unrelated political, tech, or historical claims.

Given the text below, extract claims and classify as:
TRUE / MISINFORMATION / UNCLEAR.
Follow the JSON format:
{
 "results": [
  {
    "claim": "<claim>",
    "verdict": "MISINFORMATION|TRUE|UNCLEAR",
    "explanation": "<required if MISINFORMATION or UNCLEAR>",
    "danger": "Low|Moderate|High|Critical",
    "sources": ["https://...", "https://..."]
  }
 ]
}
Text:
"""${normalized}"""
(Page URL: ${url || "unknown"})
`;

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const data = await response.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let parsed;
    try {
      const match = raw.trim().match(/(\{[\s\S]*\})/);
      parsed = match ? JSON.parse(match[0]) : JSON.parse(raw);
    } catch (err) {
      console.error("JSON parse failed from Gemini:", err);
      return res.status(500).json({ error: "invalid_response", raw });
    }

    cache.set(cacheKey, parsed.results || []);
    res.json({ cached: false, results: parsed.results || [] });

  } catch (err) {
    console.error("Scan error:", err);
    res.status(500).json({ error: "internal_error", detail: err.message });
  }
});

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`✅ MedShield backend (Gemini) running on port ${port}`));
