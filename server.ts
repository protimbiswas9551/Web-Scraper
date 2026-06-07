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

// Core execution engine with bypass settings
async function executeScrape(
  url: string,
  type: ExtractionType,
  instruction: string,
  task?: Partial<ScrapingTask>
): Promise<any[]> {
  // Format URL nicely
  let formattedUrl = url.trim();
  if (!/^https?:\/\//i.test(formattedUrl)) {
    formattedUrl = "https://" + formattedUrl;
  }

  // 1. Politeness Throttling Delay Simulation
  if (task?.delaySecs && task.delaySecs > 0) {
    console.log(`[Throttler] Sleep period active. Awaiting politeness delay: ${task.delaySecs} seconds...`);
    await new Promise((resolve) => setTimeout(resolve, task.delaySecs! * 1000));
  }

  const requestHeaders: Record<string, string> = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
  };

  // 2. User Agent Selection (Bypassing anti-bot signatures)
  if (task?.userAgentMode === "mobile") {
    requestHeaders["User-Agent"] = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1";
  } else if (task?.userAgentMode === "googlebot") {
    requestHeaders["User-Agent"] = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
  } else if (task?.userAgentMode === "custom" && task.customUserAgent) {
    requestHeaders["User-Agent"] = task.customUserAgent;
  } else {
    requestHeaders["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  }

  // 3. Custom simulated proxy/routing headers
  if (task?.proxyAddress) {
    console.log(`[Proxy Routing] Directing fetch tunnel: ${task.proxyAddress}`);
    requestHeaders["X-Simulated-Proxy-Address"] = task.proxyAddress;
  }

  // 4. Session Cookies Setup
  if (task?.cookieSession) {
    requestHeaders["Cookie"] = task.cookieSession;
  }

  // 5. Custom headers override
  if (task?.headersJson) {
    try {
      const customOnes = JSON.parse(task.headersJson);
      Object.assign(requestHeaders, customOnes);
    } catch (e) {
      console.warn("Could not parse headersJson configuration:", e);
    }
  }

  // Fetch target web pages
  const res = await fetch(formattedUrl, {
    headers: requestHeaders,
  });

  if (!res.ok) {
    throw new Error(`Failed to download website data. Server returned HTTP Status ${res.status}`);
  }

  let html = await res.text();

  // 6. Handle Dynamic content rendering simulator (JS hydration recovery)
  if (task?.jsRendering) {
    console.log("[JS Rendering Engine] Parsing hydratable script frames & JSON blocks for content expansion...");
    const $ = cheerio.load(html);
    let unpackingCount = 0;

    // Expand Next.js Static states
    const nextDataEl = $("#__NEXT_DATA__");
    if (nextDataEl.length > 0) {
      try {
        const parsedNode = JSON.parse(nextDataEl.text().trim());
        if (parsedNode.props && parsedNode.props.pageProps) {
          const flatNodeData = JSON.stringify(parsedNode.props.pageProps);
          console.log("[JS Simulator] NextJS Hydration frame resolved.");
          $("body").append(`<div id="js-virtual-hydration" data-unpack="true" style="display:none">${flatNodeData}</div>`);
          unpackingCount++;
        }
      } catch (err) {
        console.warn("Could not digest standard NextJS state script tags:", err);
      }
    }

    // Expand other script variables (Nuxt, Remix, window.APP_DATA, or simple custom globals)
    $("script").each((_, scriptEl) => {
      const textVal = $(scriptEl).text();
      if (textVal.includes("__INITIAL_STATE__") || textVal.includes("window.APP_DATA") || textVal.includes("window.__remixContext")) {
        try {
          const matched = textVal.match(/(?:window\.[_A-Z0-9]+|__INITIAL_STATE__|__remixContext)\s*=\s*({[\s\S]+?});?/i);
          if (matched && matched[1]) {
            const unpackedData = JSON.parse(matched[1]);
            $("body").append(`<div id="js-virtual-remix" data-unpack="true" style="display:none">${JSON.stringify(unpackedData)}</div>`);
            unpackingCount++;
          }
        } catch (e) {}
      }
    });

    if (unpackingCount > 0) {
      html = $.html();
    }
  }

  if (type === "selector") {
    if (!instruction) {
      throw new Error("CSS selector is required for selector-based extraction.");
    }
    const data = cheerioExtract(html, instruction);
    if (data.length === 0) {
      throw new Error(`Cheerio scrape yielded 0 rows. CSS selector "${instruction}" was not found or is dynamic on this page. Try enabling JS simulation rendering mode.`);
    }
    return data;
  } else {
    if (!instruction) {
      throw new Error("Natural language instructions are required for AI extraction.");
    }
    return await geminiExtract(html, instruction);
  }
}

// Shared webhook dispatcher
async function fireWebhook(url: string, run: ScrapingRun) {
  try {
    console.log(`[Webhook Delivery] Triggering callback endpoint: ${url}`);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Crawl-Source": "ScrapeFlow-Engine"
      },
      body: JSON.stringify({
        event: run.status === "success" ? "scrape.success" : "scrape.failed",
        runId: run.id,
        taskId: run.taskId,
        taskName: run.taskName,
        status: run.status,
        timestamp: run.runAt,
        resultsCount: run.resultsCount,
        error: run.errorMessage,
        data: run.data,
      }),
    });
    console.log(`[Webhook Delivery] Target URL returned HTTP status: ${response.status}`);
  } catch (err: any) {
    console.error(`[Webhook Delivery Error] Delivery failed for URL ${url}:`, err.message);
  }
}

// Unified task scraper runner
async function runScrapingTask(taskId: string): Promise<ScrapingRun> {
  const runId = Date.now().toString();
  const runAt = new Date().toISOString();
  let scrapingResults: any[] = [];
  let scraperStatus: "success" | "failed" = "success";
  let errmsg: string | null = null;
  let taskCopy: ScrapingTask | null = null;

  // 1. Mark status as running
  const initDb = loadDatabase();
  const tIdx = initDb.tasks.findIndex((t) => t.id === taskId);
  if (tIdx !== -1) {
    initDb.tasks[tIdx].status = "running";
    taskCopy = initDb.tasks[tIdx];
    saveDatabase(initDb);
  } else {
    throw new Error("Target scraping task was not found to execute.");
  }

  // 2. Perform raw HTTP crawl + dynamic simulation + select extraction
  try {
    const instruction = taskCopy.extractionType === "selector" ? (taskCopy.selector || "") : (taskCopy.prompt || "");
    scrapingResults = await executeScrape(taskCopy.url, taskCopy.extractionType, instruction, taskCopy);
  } catch (err: any) {
    scraperStatus = "failed";
    errmsg = err.message || "An unexpected scraper parser error occurred.";
    console.error(`[Scraper Thread] Scraper task execution "${taskCopy.name}" (${taskId}) failed:`, errmsg);
  }

  // 3. Save resulting ScrapingRun and update Task details
  const finalDb = loadDatabase();
  const finalTIdx = finalDb.tasks.findIndex((t) => t.id === taskId);
  if (finalTIdx !== -1) {
    finalDb.tasks[finalTIdx].status = scraperStatus === "success" ? "success" : "failed";
    finalDb.tasks[finalTIdx].lastRunAt = runAt;
  }

  const newRun: ScrapingRun = {
    id: runId,
    taskId: taskCopy.id,
    taskName: taskCopy.name,
    runAt,
    status: scraperStatus,
    resultsCount: scrapingResults.length,
    errorMessage: errmsg,
    data: scrapingResults,
  };

  finalDb.runs.push(newRun);
  saveDatabase(finalDb);

  // 4. Automation hook triggers in background
  if (taskCopy.webhookUrl) {
    // Fire webhook asynchronously
    fireWebhook(taskCopy.webhookUrl, newRun).catch(e => {
       console.error("Webhook promise logging fallback failure:", e);
    });
  }

  if (taskCopy.chainTaskId && scraperStatus === "success") {
    const chainTargetId = taskCopy.chainTaskId;
    console.log(`[Workflow Chainer] Scraper "${taskCopy.name}" completed. Auto-igniting chained scraper ID: ${chainTargetId}`);
    // Run chained task asynchronously
    setTimeout(() => {
      runScrapingTask(chainTargetId).catch((err) => {
        console.error(`[Workflow Chainer Error] Failed to execute scheduled chain action for ${chainTargetId}:`, err);
      });
    }, 1000);
  }

  return newRun;
}

// Quick reachability validator for target URLs
async function checkUrlReachability(url: string): Promise<{ reachable: boolean; error?: string }> {
  let formattedUrl = url.trim();
  if (!/^https?:\/\//i.test(formattedUrl)) {
    formattedUrl = "https://" + formattedUrl;
  }

  try {
    new URL(formattedUrl);
  } catch (e) {
    return { reachable: false, error: "The provided URL structure is invalid." };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6 seconds timeout limit

    const res = await fetch(formattedUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
      },
    });
    clearTimeout(timeoutId);
    return { reachable: true };
  } catch (err: any) {
    let errorDescription = "Network connection failed, domain name not found, or destination server is offline.";
    if (err.name === "AbortError") {
      errorDescription = "Destination reachability check timed out (server took more than 6s to respond).";
    } else if (err.message) {
      errorDescription = err.message;
    }
    return { reachable: false, error: errorDescription };
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

// Create task with full parameters list support
app.post("/api/tasks", async (req, res) => {
  const { 
    name, 
    url, 
    extractionType, 
    selector, 
    prompt, 
    schedule,
    jsRendering,
    userAgentMode,
    customUserAgent,
    headersJson,
    cookieSession,
    delaySecs,
    proxyAddress,
    webhookUrl,
    chainTaskId
  } = req.body;
  
  if (!name || !url) {
    res.status(400).json({ error: "Task Name and Target URL are required." });
    return;
  }

  // URL Reachability check validator
  const reachCheck = await checkUrlReachability(url);
  if (!reachCheck.reachable) {
    res.status(400).json({ error: `Provided Target URL is unreachable: ${reachCheck.error}` });
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

    // Advanced features
    jsRendering: !!jsRendering,
    userAgentMode: userAgentMode || "standard",
    customUserAgent: customUserAgent || "",
    headersJson: headersJson || "",
    cookieSession: cookieSession || "",
    delaySecs: typeof delaySecs === "number" ? delaySecs : 0,
    proxyAddress: proxyAddress || "",
    webhookUrl: webhookUrl || "",
    chainTaskId: chainTaskId || "",
  };

  db.tasks.push(newTask);
  saveDatabase(db);
  res.status(201).json(newTask);
});

// Update task
app.put("/api/tasks/:id", async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const db = loadDatabase();
  const taskIdx = db.tasks.findIndex((t) => t.id === id);

  if (taskIdx === -1) {
    res.status(404).json({ error: "Scraping task not found." });
    return;
  }

  // URL Reachability check validator on URL change
  if (updates.url && updates.url !== db.tasks[taskIdx].url) {
    const reachCheck = await checkUrlReachability(updates.url);
    if (!reachCheck.reachable) {
      res.status(400).json({ error: `Provided Target URL is unreachable: ${reachCheck.error}` });
      return;
    }
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
    try {
      await runScrapingTask(id);
    } catch (err) {
      console.error("[Async Manual Trigger] Execution failed:", err);
    }
  })();
});

// Test query scraper for sandbox previews (with fully loaded bypass parameters)
app.post("/api/test-scrape", async (req, res) => {
  const { 
    url, 
    extractionType, 
    selector, 
    prompt,
    jsRendering,
    userAgentMode,
    customUserAgent,
    headersJson,
    cookieSession,
    delaySecs,
    proxyAddress
  } = req.body;

  if (!url) {
    res.status(400).json({ error: "Target URL is required for testing." });
    return;
  }

  try {
    const instruction = extractionType === "selector" ? selector : prompt;
    const data = await executeScrape(url, extractionType, instruction, {
      jsRendering,
      userAgentMode,
      customUserAgent,
      headersJson,
      cookieSession,
      delaySecs,
      proxyAddress
    });
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

      // Asynchronous run via dynamic runner
      (async () => {
        try {
          await runScrapingTask(task.id);
        } catch (err) {
          console.error(`[Scheduler Async Error] Task ${task.name} auto-run failed:`, err);
        }
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
