import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import * as cheerio from "cheerio";
import { ScrapingTask, ScrapingRun, ScheduleInterval, TaskStatus, ExtractionType } from "./src/types.js";

// Ensure Node ESM paths work
const __dirname = path.resolve();
const DB_FILE = path.join(__dirname, "scraper_db.json");

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "15mb" }));

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// Helper: Read/Write Database
function loadDatabase(): { tasks: ScrapingTask[]; runs: ScrapingRun[] } {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Failed to load local DB, resetting:", error);
  }
  return { tasks: [], runs: [] };
}

function saveDatabase(data: { tasks: ScrapingTask[]; runs: ScrapingRun[] }) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to write to local DB:", error);
  }
}

// Ensure database file is initialized with some default tasks if empty
const dbInit = loadDatabase();
if (dbInit.tasks.length === 0) {
  const defaultTasks: ScrapingTask[] = [
    {
      id: "1",
      name: "Hacker News Top Stories",
      url: "https://news.ycombinator.com",
      extractionType: "selector",
      selector: ".athing",
      prompt: "Extract hacker news headlines, ranking, author, and story links",
      schedule: "hourly",
      createdAt: new Date().toISOString(),
      lastRunAt: null,
      status: "idle",
      isActive: true,
    },
    {
      id: "2",
      name: "Books to Scrape - AI Extraction",
      url: "http://books.toscrape.com",
      extractionType: "ai",
      selector: ".product_pod",
      prompt: "Extract book title, price, stock rating, and image URL",
      schedule: "daily",
      createdAt: new Date().toISOString(),
      lastRunAt: null,
      status: "idle",
      isActive: true,
    },
  ];
  saveDatabase({ tasks: defaultTasks, runs: [] });
}

// Function to clean HTML for Gemini context optimization
function cleanHtmlContent(html: string): string {
  const $ = cheerio.load(html);
  
  // Remove scripts, stylesheets, and visual elements that carry no content
  $("script, style, svg, iframe, noscript, header, footer, nav, link").remove();
  
  // Strip utility properties to simplify token footprint while preserving nesting
  $("*").each((_, el) => {
    const node = el as any;
    if (node.attribs) {
      const attrs = node.attribs;
      const cleanAttrs: Record<string, string> = {};
      if (attrs.href) cleanAttrs.href = attrs.href;
      if (attrs.src) cleanAttrs.src = attrs.src;
      if (attrs.id) cleanAttrs.id = attrs.id;
      if (attrs.class) {
        // Keep only first class name to reduce token weight
        cleanAttrs.class = attrs.class.split(" ")[0];
      }
      node.attribs = cleanAttrs;
    }
  });

  return $.html().substring(0, 50000); // Guard token length limit at 50,000 chars
}

// Helper: Selector-based scraping parsing
function cheerioExtract(html: string, selector: string): any[] {
  const $ = cheerio.load(html);
  const results: any[] = [];

  const matched = $(selector);
  matched.each((index, el) => {
    // Only capture first 50 results to keep layout pristine
    if (index >= 50) return;

    const item: Record<string, any> = { index: index + 1 };

    // Standard item text extraction
    const directText = $(el).clone().children().remove().end().text().trim();
    if (directText) {
      item.text = directText;
    }

    // Try extracting key tag text under the card
    const titleCandidates = $(el).find("h1, h2, h3, h4, h5, .title, .name, a.storylink, td.title a");
    if (titleCandidates.length > 0) {
      item.title = titleCandidates.first().text().trim();
      const href = titleCandidates.first().attr("href");
      if (href) item.link = href;
    }

    // Capture first anchor tag link if title link not set
    if (!item.link) {
      const firstLink = $(el).find("a").first();
      if (firstLink.length > 0) {
        item.linkValue = firstLink.text().trim();
        item.linkUrl = firstLink.attr("href");
      }
    }

    // Capture table data cell columns
    if ($(el).is("tr")) {
      $(el).find("td").each((cIdx, td) => {
        const cellText = $(td).text().trim();
        if (cellText) {
          item[`col_${cIdx + 1}`] = cellText;
        }
      });
    }

    // Generic child element class mapping to scrape structural subfields
    $(el).find("*").each((_, child) => {
      const cls = $(child).attr("class");
      if (cls) {
        const clsName = cls.split(" ")[0];
        const text = $(child).text().trim();
        // Skip excessively long descriptions which distort raw tables
        if (text && text.length > 0 && text.length < 150 && !item[clsName]) {
          item[clsName] = text;
        }
      }
    });

    results.push(item);
  });

  return results;
}

// AI-based parsing using Gemini AI
async function geminiExtract(html: string, prompt: string): Promise<any[]> {
  const cleanHtml = cleanHtmlContent(html);
  
  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: `You are an expert web scraper. Extract a cleanly structured JSON database of details from this HTML snippet according to instructions:
    
Extraction Prompt: "${prompt}"

Your response must be a strictly formatted JSON array containing flat items. Avoid deep nestings.
If no content could be found or parsed, return an empty array: []

Clean HTML Source:
${cleanHtml}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
        },
      },
    },
  });

  const rawText = response.text || "[]";
  try {
    const parsed = JSON.parse(rawText.trim());
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    console.error("Failed parsing Gemini JSON text, raw response:", rawText);
    throw new Error("Could not parse extracted AI structure to proper JSON list.");
  }
}

// Core execution engine
async function executeScrape(url: string, type: ExtractionType, instruction: string): Promise<any[]> {
  // Format URL nicely
  let formattedUrl = url.trim();
  if (!/^https?:\/\//i.test(formattedUrl)) {
    formattedUrl = "https://" + formattedUrl;
  }

  // Fetch target web pages
  const res = await fetch(formattedUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to download website header. Server returned HTTP ${res.status}`);
  }

  const html = await res.text();

  if (type === "selector") {
    if (!instruction) {
      throw new Error("CSS selector is required for selector-based extraction.");
    }
    const data = cheerioExtract(html, instruction);
    if (data.length === 0) {
      throw new Error(`Cheerio scrape yielded 0 rows. CSS selector "${instruction}" was not found or is dynamic on this page.`);
    }
    return data;
  } else {
    if (!instruction) {
      throw new Error("Natural language instructions are required for AI extraction.");
    }
    return await geminiExtract(html, instruction);
  }
}

// ==========================================
// API Endpoints
// ==========================================

// Get all tasks
app.get("/api/tasks", (req, res) => {
  const db = loadDatabase();
  res.json(db.tasks);
});

// Create task
app.post("/api/tasks", (req, res) => {
  const { name, url, extractionType, selector, prompt, schedule } = req.body;
  
  if (!name || !url) {
    res.status(400).json({ error: "Task Name and Target URL are required." });
    return;
  }

  const db = loadDatabase();
  const newTask: ScrapingTask = {
    id: Date.now().toString(),
    name,
    url,
    extractionType: extractionType || "ai",
    selector: selector || "",
    prompt: prompt || "",
    schedule: schedule || "manual",
    createdAt: new Date().toISOString(),
    lastRunAt: null,
    status: "idle",
    isActive: true,
  };

  db.tasks.push(newTask);
  saveDatabase(db);
  res.status(201).json(newTask);
});

// Update task
app.put("/api/tasks/:id", (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const db = loadDatabase();
  const taskIdx = db.tasks.findIndex((t) => t.id === id);

  if (taskIdx === -1) {
    res.status(404).json({ error: "Scraping task not found." });
    return;
  }

  db.tasks[taskIdx] = {
    ...db.tasks[taskIdx],
    ...updates,
  };

  saveDatabase(db);
  res.json(db.tasks[taskIdx]);
});

// Delete task
app.delete("/api/tasks/:id", (req, res) => {
  const { id } = req.params;
  const db = loadDatabase();
  
  db.tasks = db.tasks.filter((t) => t.id !== id);
  db.runs = db.runs.filter((r) => r.taskId !== id);
  
  saveDatabase(db);
  res.json({ success: true });
});

// Get all runs (history)
app.get("/api/runs", (req, res) => {
  const db = loadDatabase();
  // Sort runs by runAt descending
  const sortedRuns = [...db.runs].sort((a, b) => b.runAt.localeCompare(a.runAt));
  res.json(sortedRuns);
});

// Get a specific run with full dataset
app.get("/api/runs/:id", (req, res) => {
  const { id } = req.params;
  const db = loadDatabase();
  const run = db.runs.find((r) => r.id === id);
  if (!run) {
    res.status(404).json({ error: "Scraping history run not found." });
    return;
  }
  res.json(run);
});

// Immediate manual trigger for a task
app.post("/api/tasks/:id/run", async (req, res) => {
  const { id } = req.params;
  const db = loadDatabase();
  const taskIdx = db.tasks.findIndex((t) => t.id === id);

  if (taskIdx === -1) {
    res.status(404).json({ error: "Scraping task not found." });
    return;
  }

  const task = db.tasks[taskIdx];
  task.status = "running";
  saveDatabase(db);

  // Trigger scrape asynchronously so client UI stays highly responsive
  res.json({ message: "Scraping task initiated successfully.", task });

  (async () => {
    const runId = Date.now().toString();
    const runAt = new Date().toISOString();
    let scrapingResults: any[] = [];
    let scraperStatus: "success" | "failed" = "success";
    let errmsg: string | null = null;

    try {
      const instruction = task.extractionType === "selector" ? (task.selector || "") : (task.prompt || "");
      scrapingResults = await executeScrape(task.url, task.extractionType, instruction);
    } catch (err: any) {
      scraperStatus = "failed";
      errmsg = err.message || "An unknown scraping error occurred.";
      console.error(`Task ${task.name} execution failed:`, errmsg);
    }

    const completedDb = loadDatabase();
    const updatedTaskIdx = completedDb.tasks.findIndex((t) => t.id === id);
    if (updatedTaskIdx !== -1) {
      completedDb.tasks[updatedTaskIdx].status = scraperStatus === "success" ? "success" : "failed";
      completedDb.tasks[updatedTaskIdx].lastRunAt = runAt;
    }

    const newRun: ScrapingRun = {
      id: runId,
      taskId: task.id,
      taskName: task.name,
      runAt,
      status: scraperStatus,
      resultsCount: scrapingResults.length,
      errorMessage: errmsg,
      data: scrapingResults,
    };

    completedDb.runs.push(newRun);
    saveDatabase(completedDb);
  })();
});

// Test query scraper for sandbox previews
app.post("/api/test-scrape", async (req, res) => {
  const { url, extractionType, selector, prompt } = req.body;

  if (!url) {
    res.status(400).json({ error: "Target URL is required for testing." });
    return;
  }

  try {
    const instruction = extractionType === "selector" ? selector : prompt;
    const data = await executeScrape(url, extractionType, instruction);
    res.json({ success: true, count: data.length, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Scraping query failed." });
  }
});

// ==========================================
// BACKGROUND RETRY & SCHEDULER
// ==========================================
// Automatically checks for active schedules every 30 seconds
setInterval(() => {
  const db = loadDatabase();
  const now = new Date();
  let dbModified = false;

  db.tasks.forEach((task) => {
    if (!task.isActive || task.schedule === "manual" || task.status === "running") {
      return;
    }

    // Determine intervals
    let intervalMs = 0;
    if (task.schedule === "hourly") intervalMs = 60 * 60 * 1000;
    else if (task.schedule === "daily") intervalMs = 24 * 60 * 60 * 1000;
    else if (task.schedule === "weekly") intervalMs = 7 * 24 * 60 * 60 * 1000;

    const lastRun = task.lastRunAt ? new Date(task.lastRunAt) : new Date(0);
    const msSinceLastRun = now.getTime() - lastRun.getTime();

    if (msSinceLastRun >= intervalMs) {
      console.log(`[Scheduler] Auto-executing scheduled task: "${task.name}"`);
      task.status = "running";
      dbModified = true;

      // Asynchronous run
      (async () => {
        const runId = Date.now().toString();
        const runAt = new Date().toISOString();
        let results: any[] = [];
        let status: "success" | "failed" = "success";
        let errmsg: string | null = null;

        try {
          const instr = task.extractionType === "selector" ? (task.selector || "") : (task.prompt || "");
          results = await executeScrape(task.url, task.extractionType, instr);
        } catch (err: any) {
          status = "failed";
          errmsg = err.message || "Auto-run failure.";
        }

        const runDb = loadDatabase();
        const runTaskIdx = runDb.tasks.findIndex((t) => t.id === task.id);
        if (runTaskIdx !== -1) {
          runDb.tasks[runTaskIdx].status = status === "success" ? "success" : "failed";
          runDb.tasks[runTaskIdx].lastRunAt = runAt;
        }

        const newRun: ScrapingRun = {
          id: runId,
          taskId: task.id,
          taskName: task.name,
          runAt,
          status,
          resultsCount: results.length,
          errorMessage: errmsg,
          data: results,
        };

        runDb.runs.push(newRun);
        saveDatabase(runDb);
      })();
    }
  });

  if (dbModified) {
    saveDatabase(db);
  }
}, 30000);

// ==========================================
// Vite Dev Server / Static Production Asset Delivery
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Vite Middlewares for development
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve Static files in Production env
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Web Scraper Dashboard active on port ${PORT}`);
  });
}

startServer();
