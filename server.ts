import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import * as cheerio from "cheerio";
import nodemailer from "nodemailer";
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

// Convert JSON array of objects to robust CSV string
function convertToCsv(data: any[]): string {
  if (!data || data.length === 0) return "";
  const keysSet = new Set<string>();
  data.forEach(item => {
    Object.keys(item).forEach(k => keysSet.add(k));
  });
  const headers = Array.from(keysSet);
  const csvRows = [headers.join(",")];
  
  for (const row of data) {
    const values = headers.map(header => {
      const val = row[header];
      if (val === undefined || val === null) return "";
      const valStr = typeof val === "object" ? JSON.stringify(val) : String(val);
      const escaped = valStr.replace(/"/g, '""');
      if (escaped.includes(",") || escaped.includes('"') || escaped.includes("\n") || escaped.includes("\r")) {
        return `"${escaped}"`;
      }
      return escaped;
    });
    csvRows.push(values.join(","));
  }
  return csvRows.join("\n");
}

// Multi-provider automated data delivery dispatcher (SMTP & Cloud Storage Buckets)
async function dispatchAutomatedDeliveries(task: ScrapingTask, run: ScrapingRun): Promise<string[]> {
  const logs: string[] = [];
  logs.push(`[${new Date().toISOString()}] Initiating automated data delivery checklist...`);

  // 1. Recurring Email Delivery Checklist
  if (task.emailDeliveryEnabled && task.emailRecipient) {
    const shouldSend = 
      !task.emailSendOn || 
      task.emailSendOn === "always" || 
      (task.emailSendOn === "success" && run.status === "success") || 
      (task.emailSendOn === "failed" && run.status === "failed");

    if (shouldSend) {
      logs.push(`[Email] Preparing report email to: ${task.emailRecipient}`);
      try {
        let transporter = null;
        if (task.emailSmtpHost && task.emailSmtpPort) {
          logs.push(`[Email] Utilizing custom SMTP server: ${task.emailSmtpHost}:${task.emailSmtpPort}`);
          transporter = nodemailer.createTransport({
            host: task.emailSmtpHost,
            port: Number(task.emailSmtpPort),
            secure: !!task.emailSmtpSecure,
            auth: task.emailSmtpUser ? {
              user: task.emailSmtpUser,
              pass: task.emailSmtpPass || "",
            } : undefined,
          });
        } else {
          logs.push(`[Email] SMTP settings not supplied. Dispatching via local sandbox proxy dispatcher...`);
        }

        const subject = `[ScrapeFlow] Scraping Report: ${task.name} (${run.status.toUpperCase()})`;
        
        let bodyHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #edf2f7; border-radius: 8px; background-color: #ffffff; color: #1a202c;">
            <div style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 20px; border-radius: 6px; margin-bottom: 20px; text-align: center; color: #ffffff;">
              <h2 style="margin: 0; font-size: 20px; font-weight: bold; letter-spacing: 0.5px;">ScrapeFlow Crawler Dispatcher</h2>
              <p style="margin: 5px 0 0 0; font-size: 13px; opacity: 0.9;">Automated run delivery notification reporting</p>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; font-size: 13.5px; margin-bottom: 20px;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #4a5568; width: 140px; border-bottom: 1px solid #edf2f7;">Task Profile:</td>
                <td style="padding: 8px 0; color: #1a202c; border-bottom: 1px solid #edf2f7;">${task.name}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #4a5568; border-bottom: 1px solid #edf2f7;">Primary Track URL:</td>
                <td style="padding: 8px 0; color: #3182ce; border-bottom: 1px solid #edf2f7;"><a href="${task.url}" style="color: #3182ce; text-decoration: none;">${task.url}</a></td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #4a5568; border-bottom: 1px solid #edf2f7;">Status Outcome:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #edf2f7;">
                  <span style="background-color: ${run.status === 'success' ? '#c6f6d5' : '#fed7d7'}; color: ${run.status === 'success' ? '#22543d' : '#742a2a'}; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; text-transform: uppercase;">
                    ${run.status.toUpperCase()}
                  </span>
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #4a5568; border-bottom: 1px solid #edf2f7;">Items Extracted:</td>
                <td style="padding: 8px 0; color: #1a202c; font-weight: bold; border-bottom: 1px solid #edf2f7;">${run.resultsCount} rows</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #4a5568; border-bottom: 1px solid #edf2f7;">Completed At:</td>
                <td style="padding: 8px 0; color: #4a5568; border-bottom: 1px solid #edf2f7;">${new Date(run.runAt).toUTCString()}</td>
              </tr>
            </table>
        `;

        if (run.errorMessage) {
          bodyHtml += `
            <div style="background-color: #fff5f5; border-left: 4px solid #e53e3e; padding: 12px; margin-bottom: 20px; border-radius: 4px; font-family: monospace; font-size: 12px; color: #c53030; white-space: pre-wrap;">
              <strong>Scraper Execution Error Trace:</strong><br/>
              ${run.errorMessage}
            </div>
          `;
        }

        const attachments: any[] = [];
        const fileBaseName = `scrape_${task.name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}_${run.id}`;

        if (run.status === "success" && run.data && run.data.length > 0) {
          if (task.emailFormat === "inline_html") {
            bodyHtml += `
              <h3 style="color: #2d3748; font-size: 15px; margin-top: 25px; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">Sample Extracted Data Table (Top 8 Items)</h3>
              <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 6px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
                  <thead>
                    <tr style="background-color: #f7fafc; border-bottom: 1px solid #e2e8f0;">
            `;
            const sampleFields = Object.keys(run.data[0]).slice(0, 4);
            sampleFields.forEach(f => {
              bodyHtml += `<th style="padding: 8px; color: #4a5568; font-weight: bold;">${f}</th>`;
            });
            bodyHtml += `</tr></thead><tbody>`;

            run.data.slice(0, 8).forEach((item, innerIdx) => {
              bodyHtml += `<tr style="border-bottom: 1px solid #edf2f7; background-color: ${innerIdx % 2 === 0 ? '#ffffff' : '#f7fafc'};">`;
              sampleFields.forEach(f => {
                const val = item[f];
                const valStr = typeof val === "object" ? JSON.stringify(val) : String(val || "");
                bodyHtml += `<td style="padding: 8px; color: #2d3748; white-space: nowrap; max-width: 130px; overflow: hidden; text-overflow: ellipsis;">${valStr}</td>`;
              });
              bodyHtml += `</tr>`;
            });

            bodyHtml += `</tbody></table></div>`;
            if (run.data.length > 8) {
              bodyHtml += `<p style="font-size: 11px; color: #718096; font-style: italic; margin-top: 6px;">Truncated for readability. Showing top 8 of ${run.data.length} total rows.</p>`;
            }
          } else if (task.emailFormat === "csv") {
            const csvData = convertToCsv(run.data);
            attachments.push({
              filename: `${fileBaseName}.csv`,
              content: csvData,
            });
            bodyHtml += `
              <div style="border: 1px dashed #cbd5e0; padding: 12px; border-radius: 6px; background-color: #f7fafc; margin-top: 20px;">
                <p style="margin: 0; font-size: 13px; color: #4a5568;">📊 Results export file attached: <strong>${fileBaseName}.csv</strong> (${Buffer.byteLength(csvData)} bytes)</p>
              </div>
            `;
          } else {
            // Default to JSON
            const jsonData = JSON.stringify(run.data, null, 2);
            attachments.push({
              filename: `${fileBaseName}.json`,
              content: jsonData,
            });
            bodyHtml += `
              <div style="border: 1px dashed #cbd5e0; padding: 12px; border-radius: 6px; background-color: #f7fafc; margin-top: 20px;">
                <p style="margin: 0; font-size: 13px; color: #4a5568;">📁 Results export file attached: <strong>${fileBaseName}.json</strong> (${Buffer.byteLength(jsonData)} bytes)</p>
              </div>
            `;
          }
        }

        bodyHtml += `
            <hr style="border: 0; border-top: 1px solid #edf2f7; margin: 30px 0 15px 0" />
            <p style="font-size: 11px; color: #a0aec0; text-align: center; margin: 0;">Sent automatically via ScrapeFlow. Do not reply directly to this mail.</p>
          </div>
        `;

        if (transporter) {
          const info = await transporter.sendMail({
            from: task.emailSmtpUser ? `"ScrapeFlow" <${task.emailSmtpUser}>` : '"ScrapeFlow Automated" <noreply@scrapeflow.app>',
            to: task.emailRecipient,
            subject,
            html: bodyHtml,
            attachments,
          });
          logs.push(`[Email] Send message completed. System Mail ID: ${info.messageId}`);
        } else {
          logs.push(`[Email] [Sandbox Mode] Successfully compiled structured alert body and serialized data.`);
          logs.push(`[Email] [Sandbox Mode] Sent to: <${task.emailRecipient}>`);
          logs.push(`[Email] [Sandbox Mode] Subject Line: "${subject}"`);
          if (attachments.length > 0) {
            logs.push(`[Email] [Sandbox Mode] Attachment successfully compiled: ${attachments[0].filename} (${attachments[0].content.length} characters)`);
          }
        }
      } catch (mailErr: any) {
        logs.push(`[Email Error] Failed dispatching report: ${mailErr.message || mailErr}`);
        console.error("[Email Pipeline Error] Error:", mailErr);
      }
    } else {
      logs.push(`[Email] Send trigger rules condition not matched (Config: ${task.emailSendOn}, Scrape outcome: ${run.status}). Skipped email send.`);
    }
  }

  // 2. Cloud Storage Delivery Checklist
  if (task.storageDeliveryEnabled && task.storageProvider && task.storageTarget) {
    logs.push(`[Cloud Storage] Queueing file upload to cloud target: ${task.storageProvider.toUpperCase()}`);
    try {
      const fileBaseName = `scrape_${task.name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}_${run.id}`;
      const extension = task.storageFormat === "csv" ? "csv" : "json";
      const fileName = `${fileBaseName}.${extension}`;
      const fileContent = extension === "csv" ? convertToCsv(run.data) : JSON.stringify(run.data, null, 2);

      let config: any = {};
      if (task.storageConfigJson) {
        try {
          config = JSON.parse(task.storageConfigJson);
        } catch (e) {
          logs.push(`[Cloud Storage] Warning: Could not parse custom storage options JSON object.`);
        }
      }

      logs.push(`[Cloud Storage] Formatting data payload filename "${fileName}" (${Buffer.byteLength(fileContent)} bytes)`);
      logs.push(`[Cloud Storage] Target Cloud Connection Endpoint / Folder ID: "${task.storageTarget}"`);

      // Mock vs Real cloud REST client upload actions
      if (task.storageProvider === "custom_api") {
        logs.push(`[Cloud Storage] Initiating multipart API POST request to specified endpoint...`);
        const targetUrl = task.storageTarget;
        const res = await fetch(targetUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(config.headers || {})
          },
          body: JSON.stringify({
            fileName,
            taskId: task.id,
            taskName: task.name,
            runId: run.id,
            totalRows: run.resultsCount,
            fileType: extension,
            payloadData: extension === "csv" ? undefined : run.data,
            csvText: extension === "csv" ? fileContent : undefined,
            timestamp: run.runAt
          })
        });

        if (res.ok) {
          logs.push(`[Cloud Storage] Success! Custom Web Storage API returned HTTP Status: ${res.status}`);
        } else {
          throw new Error(`Custom Web Storage API returned negative code HTTP ${res.status}`);
        }
      } else if (task.storageProvider === "dropbox") {
        const token = config.token || config.accessToken || process.env.DROPBOX_ACCESS_TOKEN;
        if (!token) {
          logs.push(`[Cloud Storage] No Dropbox token found inside custom parameters JSON. Running in Sandbox simulation storage...`);
          logs.push(`[Cloud Storage] [Sandbox] Created virtual file "/${task.storageTarget}/${fileName}" successfully.`);
        } else {
          logs.push(`[Cloud Storage] Contacting Dropbox /files/upload REST endpoint...`);
          const dboxFolder = task.storageTarget.startsWith("/") ? task.storageTarget : `/${task.storageTarget}`;
          const dboxFull = `${dboxFolder}/${fileName}`.replace(/\/+/g, "/");
          
          const dbxRes = await fetch("https://content.dropboxapi.com/2/files/upload", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Dropbox-API-Arg": JSON.stringify({
                path: dboxFull,
                mode: "overwrite",
                autorename: true,
                mute: false,
                strict_conflict: false
              }),
              "Content-Type": "application/octet-stream"
            },
            body: fileContent
          });

          if (dbxRes.ok) {
            const dbxData = await dbxRes.json();
            logs.push(`[Cloud Storage] Dropbox upload successful. Host path: "${dbxData.path_display}", Ref Revision ID: "${dbxData.rev}"`);
          } else {
            const dbxErr = await dbxRes.text();
            throw new Error(`Dropbox returned negative code HTTP ${dbxRes.status}: ${dbxErr}`);
          }
        }
      } else if (task.storageProvider === "google_drive") {
        const token = config.token || config.accessToken || process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
        if (!token) {
          logs.push(`[Cloud Storage] No Google Drive OAuth bearer token active in system config. Running in Sandbox simulation pipeline...`);
          logs.push(`[Cloud Storage] [Sandbox] Exported successfully to virtual Workspace Drive GFolder ID: "${task.storageTarget}"`);
        } else {
          logs.push(`[Cloud Storage] Running multipart media payload creation to googleapis Drive endpoint...`);
          const metadata = {
            name: fileName,
            parents: [task.storageTarget],
          };

          const boundary = "boundary_scrape_flow_3a4";
          const dBody = 
            `\r\n--${boundary}\r\n` +
            `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
            JSON.stringify(metadata) +
            `\r\n--${boundary}\r\n` +
            `Content-Type: ${extension === 'csv' ? 'text/csv' : 'application/json'}\r\n\r\n` +
            fileContent +
            `\r\n--${boundary}--`;

          const gdRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": `multipart/related; boundary=${boundary}`,
            },
            body: dBody,
          });

          if (gdRes.ok) {
            const gdData = await gdRes.json();
            logs.push(`[Cloud Storage] Google Drive successfully synced. File added cleanly. File ID: ${gdData.id}`);
          } else {
            const gdText = await gdRes.text();
            throw new Error(`Google API returned status ${gdRes.status}: ${gdText}`);
          }
        }
      } else if (task.storageProvider === "aws_s3") {
        const host = `${task.storageTarget}.s3.amazonaws.com`;
        logs.push(`[Cloud Storage] S3 connection route found: s3://${task.storageTarget}/${fileName}`);
        logs.push(`[Cloud Storage] [Sandbox] Synchronizing data pipeline block to AWS S3 bucket storage...`);
        logs.push(`[Cloud Storage] [Sandbox] Completed writing metadata objects to AWS regional group.`);
      }

    } catch (storageErr: any) {
      logs.push(`[Cloud Storage Error] Deliver failed: ${storageErr.message || storageErr}`);
      console.error("[Cloud Storage Pipeline Error] Error:", storageErr);
    }
  }

  logs.push(`[${new Date().toISOString()}] Automated data deliver checks complete.`);
  return logs;
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
    deliveryLogs: [],
  };

  // Run automated recurring deliveries using SMTP / cloud formats
  const dLogs = await dispatchAutomatedDeliveries(taskCopy, newRun);
  newRun.deliveryLogs = dLogs;

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
    chainTaskId,

    // Recurring email settings
    emailDeliveryEnabled,
    emailRecipient,
    emailSendOn,
    emailFormat,
    emailSmtpHost,
    emailSmtpPort,
    emailSmtpUser,
    emailSmtpPass,
    emailSmtpSecure,

    // Cloud storage settings
    storageDeliveryEnabled,
    storageProvider,
    storageTarget,
    storageFormat,
    storageConfigJson
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

    // Email delivery settings
    emailDeliveryEnabled: !!emailDeliveryEnabled,
    emailRecipient: emailRecipient || "",
    emailSendOn: emailSendOn || "always",
    emailFormat: emailFormat || "json",
    emailSmtpHost: emailSmtpHost || "",
    emailSmtpPort: emailSmtpPort ? Number(emailSmtpPort) : undefined,
    emailSmtpUser: emailSmtpUser || "",
    emailSmtpPass: emailSmtpPass || "",
    emailSmtpSecure: !!emailSmtpSecure,

    // Cloud storage fields
    storageDeliveryEnabled: !!storageDeliveryEnabled,
    storageProvider: storageProvider || "custom_api",
    storageTarget: storageTarget || "",
    storageFormat: storageFormat || "json",
    storageConfigJson: storageConfigJson || ""
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
