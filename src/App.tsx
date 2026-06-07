import React, { useState, useEffect } from "react";
import { 
  Database, 
  Calendar, 
  History, 
  FileSpreadsheet, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  Play, 
  Plus, 
  Search, 
  Trash2, 
  Edit2, 
  Globe, 
  Sparkles, 
  Code, 
  X, 
  Download, 
  ExternalLink, 
  ChevronRight, 
  Info,
  Check,
  RefreshCw,
  Clock,
  Sliders,
  FileJson,
  Layers,
  Mail,
  Cloud,
  Lock
} from "lucide-react";
import { ScrapingTask, ScrapingRun, ExtractionType, ScheduleInterval } from "./types";
import { StatsSection } from "./components/StatsSection";
import { TaskCard } from "./components/TaskCard";
import { convertJsonToCsv, downloadFile, formatDate } from "./utils";

type TabType = "dashboard" | "scrapers" | "runs" | "playground";

export default function App() {
  const [tasks, setTasks] = useState<ScrapingTask[]>([]);
  const [runs, setRuns] = useState<ScrapingRun[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Task creation/editing modal states
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ScrapingTask | null>(null);
  const [taskName, setTaskName] = useState("");
  const [taskUrl, setTaskUrl] = useState("");
  const [extractionType, setExtractionType] = useState<ExtractionType>("ai");
  const [selector, setSelector] = useState("");
  const [prompt, setPrompt] = useState("");
  const [schedule, setSchedule] = useState<ScheduleInterval>("manual");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Advanced anti-bot & automated workflow states
  const [jsRendering, setJsRendering] = useState(false);
  const [userAgentMode, setUserAgentMode] = useState<'standard' | 'mobile' | 'googlebot' | 'custom'>("standard");
  const [customUserAgent, setCustomUserAgent] = useState("");
  const [headersJson, setHeadersJson] = useState("");
  const [cookieSession, setCookieSession] = useState("");
  const [delaySecs, setDelaySecs] = useState<number>(0);
  const [proxyAddress, setProxyAddress] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [chainTaskId, setChainTaskId] = useState("");

  // Recurring Email Delivery configuration states
  const [emailDeliveryEnabled, setEmailDeliveryEnabled] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState("");
  const [emailSendOn, setEmailSendOn] = useState<'always' | 'success' | 'failed'>("always");
  const [emailFormat, setEmailFormat] = useState<'json' | 'csv' | 'inline_html'>("json");
  const [emailSmtpHost, setEmailSmtpHost] = useState("");
  const [emailSmtpPort, setEmailSmtpPort] = useState<number>(587);
  const [emailSmtpUser, setEmailSmtpUser] = useState("");
  const [emailSmtpPass, setEmailSmtpPass] = useState("");
  const [emailSmtpSecure, setEmailSmtpSecure] = useState(false);

  // Cloud Storage Export configuration states
  const [storageDeliveryEnabled, setStorageDeliveryEnabled] = useState(false);
  const [storageProvider, setStorageProvider] = useState<'aws_s3' | 'google_drive' | 'dropbox' | 'custom_api'>("custom_api");
  const [storageTarget, setStorageTarget] = useState("");
  const [storageFormat, setStorageFormat] = useState<'json' | 'csv'>("json");
  const [storageConfigJson, setStorageConfigJson] = useState("");

  // Run detailed viewer
  const [selectedRun, setSelectedRun] = useState<ScrapingRun | null>(null);

  // Playground / Sandbox state
  const [playUrl, setPlayUrl] = useState("http://books.toscrape.com");
  const [playType, setPlayType] = useState<ExtractionType>("ai");
  const [playSelector, setPlaySelector] = useState(".product_pod h3 a");
  const [playPrompt, setPlayPrompt] = useState("Extract the titles and prices of major books listed on this page");
  const [playResults, setPlayResults] = useState<any[] | null>(null);
  const [playLoading, setPlayLoading] = useState(false);
  const [playError, setPlayError] = useState("");

  // Playground dynamic parameters
  const [playJsRendering, setPlayJsRendering] = useState(false);
  const [playUserAgentMode, setPlayUserAgentMode] = useState<'standard' | 'mobile' | 'googlebot' | 'custom'>("standard");
  const [playCustomUserAgent, setPlayCustomUserAgent] = useState("");
  const [playHeadersJson, setPlayHeadersJson] = useState("");
  const [playCookieSession, setPlayCookieSession] = useState("");
  const [playDelaySecs, setPlayDelaySecs] = useState<number>(0);
  const [playProxyAddress, setPlayProxyAddress] = useState("");

  // Notification Toast state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Sync data from Express server
  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [tasksRes, runsRes] = await Promise.all([
        fetch("/api/tasks"),
        fetch("/api/runs")
      ]);
      
      if (tasksRes.ok && runsRes.ok) {
        const tasksData: ScrapingTask[] = await tasksRes.json();
        const runsData: ScrapingRun[] = await runsRes.json();
        setTasks(tasksData);
        setRuns(runsData);
      }
    } catch (err) {
      console.error("Failed to sync API database states:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Poll for live status changes (e.g. running to success)
    const interval = setInterval(() => {
      fetchData(true);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Calculate stats dynamically
  const totalCompletedRuns = runs.length;
  const totalCollectedRows = runs.reduce((acc, r) => acc + (r.status === "success" ? r.resultsCount : 0), 0);
  
  // Scraper Actions
  const handleAddNewClick = () => {
    setEditingTask(null);
    setTaskName("");
    setTaskUrl("");
    setExtractionType("ai");
    setSelector("");
    setPrompt("");
    setSchedule("manual");
    setFormError("");

    // Advanced parameters default reset
    setJsRendering(false);
    setUserAgentMode("standard");
    setCustomUserAgent("");
    setHeadersJson("");
    setCookieSession("");
    setDelaySecs(0);
    setProxyAddress("");
    setWebhookUrl("");
    setChainTaskId("");

    // Delivery resets
    setEmailDeliveryEnabled(false);
    setEmailRecipient("");
    setEmailSendOn("always");
    setEmailFormat("json");
    setEmailSmtpHost("");
    setEmailSmtpPort(587);
    setEmailSmtpUser("");
    setEmailSmtpPass("");
    setEmailSmtpSecure(false);

    setStorageDeliveryEnabled(false);
    setStorageProvider("custom_api");
    setStorageTarget("");
    setStorageFormat("json");
    setStorageConfigJson("");

    setIsTaskModalOpen(true);
  };

  const handleEditClick = (task: ScrapingTask) => {
    setEditingTask(task);
    setTaskName(task.name);
    setTaskUrl(task.url);
    setExtractionType(task.extractionType);
    setSelector(task.selector || "");
    setPrompt(task.prompt || "");
    setSchedule(task.schedule);
    setFormError("");

    // Read saved configuration settings safely
    setJsRendering(!!task.jsRendering);
    setUserAgentMode(task.userAgentMode || "standard");
    setCustomUserAgent(task.customUserAgent || "");
    setHeadersJson(task.headersJson || "");
    setCookieSession(task.cookieSession || "");
    setDelaySecs(task.delaySecs || 0);
    setProxyAddress(task.proxyAddress || "");
    setWebhookUrl(task.webhookUrl || "");
    setChainTaskId(task.chainTaskId || "");

    // Load saved delivery parameters
    setEmailDeliveryEnabled(!!task.emailDeliveryEnabled);
    setEmailRecipient(task.emailRecipient || "");
    setEmailSendOn(task.emailSendOn || "always");
    setEmailFormat(task.emailFormat || "json");
    setEmailSmtpHost(task.emailSmtpHost || "");
    setEmailSmtpPort(task.emailSmtpPort || 587);
    setEmailSmtpUser(task.emailSmtpUser || "");
    setEmailSmtpPass(task.emailSmtpPass || "");
    setEmailSmtpSecure(!!task.emailSmtpSecure);

    setStorageDeliveryEnabled(!!task.storageDeliveryEnabled);
    setStorageProvider(task.storageProvider || "custom_api");
    setStorageTarget(task.storageTarget || "");
    setStorageFormat(task.storageFormat || "json");
    setStorageConfigJson(task.storageConfigJson || "");

    setIsTaskModalOpen(true);
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskName.trim()) return setFormError("Task Name is required.");
    if (!taskUrl.trim()) return setFormError("Target URL is required.");
    if (extractionType === "selector" && !selector.trim()) {
      return setFormError("CSS selector is required in Selector matching mode.");
    }
    if (extractionType === "ai" && !prompt.trim()) {
      return setFormError("Natural language crawl descriptor is required for AI mode.");
    }

    setIsSaving(true);
    setFormError("");

    const payload = {
      name: taskName,
      url: taskUrl,
      extractionType,
      selector: extractionType === "selector" ? selector : "",
      prompt: extractionType === "ai" ? prompt : "",
      schedule,

      // Advanced parameters
      jsRendering,
      userAgentMode,
      customUserAgent,
      headersJson,
      cookieSession,
      delaySecs,
      proxyAddress,
      webhookUrl,
      chainTaskId,

      // Email notification params
      emailDeliveryEnabled,
      emailRecipient,
      emailSendOn,
      emailFormat,
      emailSmtpHost,
      emailSmtpPort,
      emailSmtpUser,
      emailSmtpPass,
      emailSmtpSecure,

      // Cloud storage params
      storageDeliveryEnabled,
      storageProvider,
      storageTarget,
      storageFormat,
      storageConfigJson
    };

    try {
      const url = editingTask ? `/api/tasks/${editingTask.id}` : "/api/tasks";
      const method = editingTask ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showToast(editingTask ? "Crawl task settings updated!" : "New scraper task registered successfully!");
        setIsTaskModalOpen(false);
        fetchData(true);
      } else {
        const errObj = await res.json();
        setFormError(errObj.error || "Failed to submit scraping form settings.");
      }
    } catch (err) {
      setFormError("API interface network connection error.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!window.confirm("Are you sure you want to permanently delete this web scraper from your schedule?")) return;
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Scraper task was deleted successfully.", "info");
        // Clear viewing details if it matches
        if (selectedRun && selectedRun.taskId === id) {
          setSelectedRun(null);
        }
        fetchData(true);
      }
    } catch (err) {
      showToast("Could not communicate task deletion to database.", "error");
    }
  };

  const handleRunTaskNow = async (id: string) => {
    showToast("Scraping engine crawling target in background...", "info");
    // Update local state temporarily to running to feel ultra responsive
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: "running" } : t));
    
    try {
      const res = await fetch(`/api/tasks/${id}/run`, { method: "POST" });
      if (res.ok) {
        // Fetch runs soon after
        setTimeout(() => {
          fetchData(true);
        }, 1500);
      } else {
        showToast("Scraper executor service failed to boot.", "error");
      }
    } catch (err) {
      showToast("Network failure triggering task run instruction.", "error");
    }
  };

  const handleToggleActive = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const isNewActive = !task.isActive;
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: isNewActive }),
      });
      if (res.ok) {
        showToast(isNewActive ? "Automatic schedule enabled." : "Schedule paused.");
        fetchData(true);
      }
    } catch (err) {
      showToast("Failed to switch scheduled status.", "error");
    }
  };

  // Run details spreadsheet pop up
  const handleViewRunsForTask = (taskId: string) => {
    // Find latest run of this task
    const latestRun = runs.find(r => r.taskId === taskId);
    if (latestRun) {
      setSelectedRun(latestRun);
      setActiveTab("runs");
    } else {
      showToast("No crawlers have successfully logged data for this scraper yet.", "info");
    }
  };

  // Playground query engine trigger
  const runPlaygroundScrape = async () => {
    if (!playUrl) {
      setPlayError("Target URL is required for test query.");
      return;
    }
    setPlayLoading(true);
    setPlayError("");
    setPlayResults(null);

    try {
      const res = await fetch("/api/test-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: playUrl,
          extractionType: playType,
          selector: playType === "selector" ? playSelector : "",
          prompt: playType === "ai" ? playPrompt : "",
          
          jsRendering: playJsRendering,
          userAgentMode: playUserAgentMode,
          customUserAgent: playCustomUserAgent,
          headersJson: playHeadersJson,
          cookieSession: playCookieSession,
          delaySecs: playDelaySecs,
          proxyAddress: playProxyAddress
        }),
      });

      const result = await res.json();
      if (res.ok && result.success) {
        setPlayResults(result.data);
        showToast(`Tested successfully! Collected ${result.data.length} records.`, "success");
      } else {
        setPlayError(result.error || "Extraction failed. Make sure the CSS selector matches active visual tags on the page.");
      }
    } catch (err) {
      setPlayError("The request failed. The website might be blocking raw crawl connections or token limit was reached.");
    } finally {
      setPlayLoading(false);
    }
  };

  const handleDownloadRun = (run: ScrapingRun, format: "csv" | "json") => {
    if (!run.data || run.data.length === 0) {
      showToast("Cannot download empty database run.", "info");
      return;
    }

    if (format === "csv") {
      const csvStr = convertJsonToCsv(run.data);
      downloadFile(csvStr, `${run.taskName.replace(/\s+/g, "_")}_extracted.csv`, "text/csv;charset=utf-8;");
      showToast("CSV dataset harvested successfully!");
    } else {
      const jsonStr = JSON.stringify(run.data, null, 2);
      downloadFile(jsonStr, `${run.taskName.replace(/\s+/g, "_")}_extracted.json`, "application/json;charset=utf-8;");
      showToast("JSON dataset exported successfully!");
    }
  };

  // Filter tasks based on Search Query
  const filteredTasks = tasks.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    t.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div id="main_viewport" className="w-full h-screen bg-slate-50 flex overflow-hidden font-sans text-slate-800">
      
      {/* Toast Notifier */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce flex items-center space-x-2.5 bg-slate-900 text-white rounded-lg px-4 py-3 shadow-xl border border-slate-700">
          {toast.type === "success" && <Check className="text-emerald-400" size={17} />}
          {toast.type === "error" && <AlertCircle className="text-rose-400" size={17} />}
          {toast.type === "info" && <Info className="text-blue-400" size={17} />}
          <span className="text-xs font-semibold">{toast.message}</span>
        </div>
      )}

      {/* Left Sidebar Navigation */}
      <aside className="w-64 bg-slate-900 flex flex-col flex-shrink-0 border-r border-slate-950">
        
        {/* Branding header in Sidebar */}
        <div className="p-6 flex items-center gap-3 border-b border-slate-800/60">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
            <RefreshCw size={15} className="text-white animate-spin-none" />
          </div>
          <div>
            <span className="text-white font-bold text-lg tracking-tight block">ScrapeFlow</span>
            <span className="text-[10px] text-slate-500 font-mono tracking-widest block uppercase">Engine v1.4</span>
          </div>
        </div>

        {/* Navigation links matching colors from professional polish */}
        <nav className="mt-6 flex-1 px-4 space-y-1">
          <button 
            type="button"
            onClick={() => setActiveTab("dashboard")} 
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer ${
              activeTab === "dashboard" 
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/10" 
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <span className="opacity-95 text-lg">⊞</span> Dashboard State
          </button>

          <button 
            type="button"
            onClick={() => { setActiveTab("scrapers"); }} 
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer ${
              activeTab === "scrapers" 
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/10" 
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <span className="opacity-95 text-lg">☰</span> Manage Scrapers
          </button>

          <button 
            type="button"
            onClick={() => {
              setActiveTab("runs");
              // If no run is selected, default to first latest run
              if (!selectedRun && runs.length > 0) {
                setSelectedRun(runs[0]);
              }
            }} 
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer ${
              activeTab === "runs" 
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/10" 
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <span className="opacity-95 text-lg">◔</span> Harvester Exports
          </button>

          <button 
            type="button"
            onClick={() => { setActiveTab("playground"); }} 
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer ${
              activeTab === "playground" 
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/10" 
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <span className="opacity-95 text-lg">✦</span> Live Playground
          </button>
        </nav>

        {/* Dynamic usage statistics strictly based on harvest collection */}
        <div className="p-5 border-t border-slate-800">
          <div className="bg-slate-800 rounded-xl p-4 text-xs border border-slate-700/40">
            <p className="text-slate-400 font-medium mb-1.5 flex items-center justify-between">
              <span>Local Database Plan</span>
              <span className="text-[10px] text-blue-400 bg-blue-900/40 px-1.5 py-0.5 rounded">Active</span>
            </p>
            <div className="w-full bg-slate-700 h-1.5 rounded-full mb-2 overflow-hidden">
              <div 
                className="bg-blue-500 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, (totalCollectedRows / 15000) * 100)}%` }}
              ></div>
            </div>
            <p className="text-white font-semibold">
              {totalCollectedRows.toLocaleString()} / 15,000 items
            </p>
            <p className="text-[10.5px] text-slate-500 mt-1">Reset hourly limits on premium tiers</p>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        
        {/* Top Header Panel - Professional Polish styled header bar */}
        <header id="app_header" className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center space-x-3">
            <h1 className="text-lg font-semibold text-slate-900">
              {activeTab === "dashboard" && "Scraper Dashboard State"}
              {activeTab === "scrapers" && "Global Scrapers Setup"}
              {activeTab === "runs" && "Harvester Spreadsheet and Files"}
              {activeTab === "playground" && "AI Testing Sandbox"}
            </h1>
            {loading && <Loader2 className="animate-spin text-blue-600" size={16} />}
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 shrink-0" size={15} />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search scraping tasks..." 
                className="bg-slate-50 border-none text-xs pl-9 pr-4 py-2 rounded-lg w-64 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
            <button 
              type="button"
              onClick={handleAddNewClick}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 cursor-pointer shadow-sm"
            >
              <Plus size={14} strokeWidth={2.5} />
              <span>New Scraper</span>
            </button>
          </div>
        </header>

        {/* Page Body Viewport (Scrollable container layout) */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          
          {/* ======================================================== */}
          {/* TAB 1: DASHBOARD                                         */}
          {/* ======================================================== */}
          {activeTab === "dashboard" && (
            <div className="space-y-6 animate-fade-in">
              
              {/* Modular Statistics layout block */}
              <StatsSection tasks={tasks} runs={runs} />

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Active schedule cards column */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900 flex items-center space-x-2">
                      <span>Configured Web Scrapers</span>
                      <span className="text-xs bg-slate-200/80 text-slate-700 px-2.5 py-0.5 rounded-full font-medium">
                        {filteredTasks.length} total
                      </span>
                    </h3>
                    <button 
                      type="button"
                      onClick={() => { setActiveTab("scrapers"); }}
                      className="text-xs text-blue-600 hover:underline font-medium hover:text-blue-700"
                    >
                      View list settings
                    </button>
                  </div>
                  
                  {filteredTasks.length === 0 ? (
                    <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-xs">
                      <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-500 mb-3">
                        <Database size={20} />
                      </div>
                      <p className="text-sm font-semibold text-slate-800">No scrapers configured</p>
                      <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                        Add target websites with custom selectors or prompt the Gemini model to parse details automatically.
                      </p>
                      <button 
                        type="button"
                        onClick={handleAddNewClick}
                        className="mt-4 bg-blue-600 text-white rounded-lg px-4 py-2 text-xs font-medium hover:bg-blue-700 inline-flex items-center space-x-2"
                      >
                        <Plus size={14} />
                        <span>Add First Scraper</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredTasks.map((task) => {
                        const runsCount = runs.filter(r => r.taskId === task.id).length;
                        return (
                          <TaskCard 
                            key={task.id}
                            task={task}
                            onRun={handleRunTaskNow}
                            onToggleActive={handleToggleActive}
                            onEdit={handleEditClick}
                            onDelete={handleDeleteTask}
                            onViewLogs={handleViewRunsForTask}
                            runsCount={runsCount}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Right hand layout: Quick crawl activity logs */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-900">Recent Executions Logs</h3>
                  
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs max-h-[480px] overflow-y-auto space-y-3">
                    {runs.length === 0 ? (
                      <div className="text-center py-10">
                        <Clock size={32} className="text-slate-300 mx-auto mb-2" />
                        <p className="text-xs font-medium text-slate-500">No executions recorded yet.</p>
                      </div>
                    ) : (
                      runs.slice(0, 10).map((run) => (
                        <div 
                          key={run.id}
                          onClick={() => {
                            setSelectedRun(run);
                            setActiveTab("runs");
                          }}
                          className="p-3 border border-slate-150 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer group flex items-start justify-between"
                        >
                          <div className="min-w-0">
                            <span className="block font-medium text-slate-800 text-[12.5px] truncate group-hover:text-blue-600">
                              {run.taskName}
                            </span>
                            <span className="text-[11px] text-slate-500 flex items-center space-x-1.5 mt-0.5">
                              <span>{formatDate(run.runAt)}</span>
                              <span>•</span>
                              <span className="font-mono">{run.resultsCount} items captured</span>
                            </span>
                          </div>
                          
                          <div>
                            {run.status === "success" ? (
                              <span className="text-[10px] uppercase font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                OK
                              </span>
                            ) : (
                              <span className="text-[10px] uppercase font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-100" title={run.errorMessage || ""}>
                                ERR
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: MANAGE SCRAPERS                                   */}
          {/* ======================================================== */}
          {activeTab === "scrapers" && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs">
                
                <div className="px-6 py-4 border-b border-slate-150 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-slate-900">Registered Scrapers Registry</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Schedule, configure, and monitor automated crawl jobs</p>
                  </div>
                  <button 
                    type="button"
                    onClick={handleAddNewClick}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors flex items-center space-x-1 cursor-pointer"
                  >
                    <Plus size={13} />
                    <span>Create Scraper</span>
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/75 border-b border-slate-150 text-slate-500 uppercase text-[10px] tracking-wider">
                        <th className="px-6 py-3.5 font-bold">Scraper Details</th>
                        <th className="px-6 py-3.5 font-bold">Crawl Target</th>
                        <th className="px-6 py-3.5 font-bold">Extraction Strategy</th>
                        <th className="px-6 py-3.5 font-bold">Schedule</th>
                        <th className="px-6 py-3.5 font-bold">Execution State</th>
                        <th className="px-6 py-3.5 font-bold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans">
                      {filteredTasks.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-10 font-sans text-slate-400 italic">
                            No scraping targets match the search query. Try typing another search term.
                          </td>
                        </tr>
                      ) : (
                        filteredTasks.map((task) => {
                          const taskRuns = runs.filter(r => r.taskId === task.id);
                          return (
                            <tr key={task.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4">
                                <span className="font-semibold text-slate-900 block text-sm">{task.name}</span>
                                <span className="text-[10.5px] text-slate-405 block mt-0.5">Created: {formatDate(task.createdAt)}</span>
                              </td>
                              <td className="px-6 py-4 max-w-xs">
                                <div className="flex items-center space-x-1.5">
                                  <Globe size={13} className="text-slate-400 shrink-0" />
                                  <a href={task.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline hover:text-blue-700 truncate font-mono">
                                    {task.url}
                                  </a>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                {task.extractionType === "ai" ? (
                                  <div className="flex items-center space-x-1.5">
                                    <Sparkles size={11} className="text-violet-500" />
                                    <span className="font-medium text-violet-700">Gemini AI Model</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center space-x-1.5">
                                    <Code size={11} className="text-emerald-500" />
                                    <span className="font-medium text-emerald-700 font-mono">CSS: {task.selector}</span>
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4">
                                <span className="bg-slate-100 text-slate-700 font-medium px-2 py-0.5 rounded uppercase text-[10px] tracking-wide">
                                  {task.schedule === "manual" ? "manual (on demand)" : task.schedule}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                {task.status === "running" ? (
                                  <span className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 font-semibold rounded-full uppercase text-[10px] tracking-wide">
                                    <Loader2 className="animate-spin text-blue-500 mr-1" size={10} />
                                    Crawling
                                  </span>
                                ) : task.status === "success" ? (
                                  <span className="inline-flex items-center px-2 py-0.5 bg-green-50 text-emerald-700 border border-emerald-100 font-semibold rounded-full uppercase text-[10px] tracking-wide">
                                    IDLE (OK)
                                  </span>
                                ) : task.status === "failed" ? (
                                  <span className="inline-flex items-center px-2 py-0.5 bg-red-50 text-red-700 border border-red-100 font-semibold rounded-full uppercase text-[10px] tracking-wide">
                                    IDLE (ERROR)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 bg-slate-150 text-slate-600 font-semibold rounded-full uppercase text-[10px] tracking-wide">
                                    Idle
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-right space-x-2">
                                <button 
                                  onClick={() => handleRunTaskNow(task.id)}
                                  disabled={task.status === "running"}
                                  className={`text-xs font-semibold px-2 py-1 rounded transition-colors cursor-pointer ${task.status === "running" ? "bg-slate-100 text-slate-400" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
                                >
                                  Run
                                </button>
                                <button 
                                  onClick={() => handleEditClick(task)}
                                  className="border border-slate-220 text-slate-700 hover:bg-slate-100 px-2 py-1 rounded cursor-pointer"
                                  title="Edit params"
                                >
                                  Edit
                                </button>
                                <button 
                                  onClick={() => handleDeleteTask(task.id)}
                                  className="border border-slate-220 text-red-600 hover:bg-rose-50 px-2 py-1 rounded cursor-pointer"
                                  title="Delete target"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 3: HARVEST EXPORTS SPREADSHEET CARD                  */}
          {/* ======================================================== */}
          {activeTab === "runs" && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              
              {/* Runs List side sidebar */}
              <div className="lg:col-span-1 space-y-4">
                <h3 className="font-semibold text-slate-900">Saved Datasets</h3>
                <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-150 shadow-xs max-h-[600px] overflow-y-auto">
                  {runs.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      No datasets successfully collected yet.
                    </div>
                  ) : (
                    runs.map((r) => (
                      <div
                        key={r.id}
                        onClick={() => setSelectedRun(r)}
                        className={`p-3.5 cursor-pointer text-xs transition-colors hover:bg-slate-50/80 ${selectedRun?.id === r.id ? "bg-blue-50/50 border-r-4 border-blue-600" : ""}`}
                      >
                        <div className="font-semibold text-slate-900 flex items-center justify-between">
                          <span className="truncate max-w-[120px]">{r.taskName}</span>
                          {r.status === "success" ? (
                            <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1 py-0.2 rounded border border-emerald-105">OK</span>
                          ) : (
                            <span className="text-[9px] bg-red-50 text-red-700 px-1 py-0.2 rounded border border-red-105">ERR</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1 flex items-center justify-between">
                          <span>{formatDate(r.runAt)}</span>
                          <span className="font-mono text-zinc-700 font-medium">{r.resultsCount} records</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Comprehensive Spreadsheet Layout Grid for Captured Raw Table Data */}
              <div className="lg:col-span-3 space-y-4">
                {selectedRun ? (
                  <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col min-h-[500px]">
                    
                    {/* Header Panel */}
                    <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div>
                        <div className="flex items-center space-x-2">
                          <h2 className="font-bold text-slate-900 text-base">{selectedRun.taskName} Dataset</h2>
                          <span className="bg-blue-100 text-blue-800 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide">
                            Crawl ID: #{selectedRun.id.substring(Math.max(0, selectedRun.id.length - 4))}
                          </span>
                        </div>
                        <p className="text-xs text-slate-505 mt-0.5 font-mono">
                          Harvested: {formatDate(selectedRun.runAt)} • Status: <span className="font-semibold text-emerald-600">{selectedRun.status.toUpperCase()}</span>
                        </p>
                      </div>

                      {/* Download Exports Controls */}
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => handleDownloadRun(selectedRun, "csv")}
                          className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center space-x-1.5 cursor-pointer"
                        >
                          <Download size={12} className="text-emerald-500" />
                          <span>Export CSV</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadRun(selectedRun, "json")}
                          className="bg-slate-900 hover:bg-black text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center space-x-1.5 cursor-pointer"
                        >
                          <FileJson size={12} className="text-violet-400" />
                          <span>Export JSON</span>
                        </button>
                      </div>
                    </div>

                    {/* Table View section */}
                    <div className="flex-1 overflow-auto max-h-[480px]">
                      {selectedRun.status === "failed" ? (
                        <div className="p-8 text-center bg-rose-50/30">
                          <AlertCircle size={40} className="text-rose-500 mx-auto mb-2" />
                          <h4 className="font-semibold text-rose-950">Scraping Engine Execution Failed</h4>
                          <p className="text-xs text-rose-700 mt-1 max-w-md mx-auto font-mono">
                            {selectedRun.errorMessage || "The scrapers was unable to load content. Check if the page is behind Cloudflare or utilizes dynamic client side script rendering."}
                          </p>
                        </div>
                      ) : !selectedRun.data || selectedRun.data.length === 0 ? (
                        <div className="p-8 text-center text-slate-400">
                          This scraper executed successfully but returned 0 flat row records matching your instructions.
                        </div>
                      ) : (
                        <table className="w-full text-left text-[11.5px] border-collapse">
                          <thead>
                            <tr className="bg-slate-100/50 border-b border-slate-200 text-slate-600 font-mono uppercase tracking-wider text-[10px]">
                              <th className="px-4 py-2.5 font-bold border-r border-slate-200 w-12 text-center">Row</th>
                              {Object.keys(selectedRun.data[0] || {}).map((colName) => (
                                <th key={colName} className="px-4 py-2.5 font-bold border-r border-slate-200">
                                  {colName}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-150">
                            {selectedRun.data.map((rowData, rIdx) => (
                              <tr key={rIdx} className="hover:bg-slate-50 transition-colors font-mono">
                                <td className="px-4 py-2 border-r border-slate-150 bg-slate-50/50 text-slate-500 font-semibold text-center">
                                  {rIdx + 1}
                                </td>
                                {Object.keys(selectedRun.data[0] || {}).map((colName) => {
                                  const cellVal = rowData[colName];
                                  const cellString = typeof cellVal === "object" ? JSON.stringify(cellVal) : String(cellVal || "");
                                  
                                  return (
                                    <td key={colName} className="px-4 py-2 border-r border-slate-150 whitespace-nowrap overflow-hidden text-ellipsis max-w-[250px] text-zinc-800">
                                      {cellString.startsWith("http") ? (
                                        <a href={cellString} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center space-x-1">
                                          <span className="truncate">{cellString}</span>
                                          <ExternalLink size={9} className="shrink-0" />
                                        </a>
                                      ) : (
                                        cellString
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>

                    {/* Footer Stats block in Spreadsheet */}
                    <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                      <span>Representing <b>{selectedRun.resultsCount}</b> rows of datasets harvested</span>
                      <span>UTF-8 Encoding Active</span>
                    </div>

                    {/* AUTOMATED DELIVERIES TRACE AUDIT LOGBOOK */}
                    {selectedRun.deliveryLogs && selectedRun.deliveryLogs.length > 0 && (
                      <div className="bg-slate-950 border-t border-slate-800 p-4 font-mono text-[10.5px] text-slate-300">
                        <div className="flex items-center gap-1.5 text-slate-100 font-bold mb-2 text-[11px] tracking-wide uppercase">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                          <span>📦 Automatic Delivery Audit Logs</span>
                        </div>
                        <div className="max-h-[140px] overflow-y-auto space-y-1.5 scrollbar-thin pr-2 scrollbar-track-slate-900 scrollbar-thumb-slate-700">
                          {selectedRun.deliveryLogs.map((logLine, lIdx) => {
                            let isErr = logLine.includes("Error") || logLine.includes("Failed") || logLine.includes("negative");
                            let isSuccess = logLine.includes("Success!") || logLine.includes("successful") || logLine.includes("dispatched") || logLine.includes("Dropbox upload successful") || logLine.includes("Drive Success!");
                            let colorClass = isErr ? "text-rose-450 font-semibold" : isSuccess ? "text-emerald-400" : "text-slate-350";
                            return (
                              <div key={lIdx} className={`leading-tight ${colorClass}`}>
                                {logLine}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-xs">
                    <FileSpreadsheet size={44} className="text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-800 font-semibold">No Dataset Selected</p>
                    <p className="text-xs text-slate-500 mt-1">Please select an executed run dataset from the left sidebar panel to preview and export CSV or JSON.</p>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 4: LIVE PLAYGROUND (AI SANDBOX)                       */}
          {/* ======================================================== */}
          {activeTab === "playground" && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
              
              {/* Configuration parameters drawer */}
              <div className="lg:col-span-2 space-y-5 bg-white border border-slate-200 rounded-xl p-6 shadow-xs h-fit">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Crawl Query Sandbox</h3>
                  <p className="text-xs text-slate-550 mt-1 leading-normal">
                    Experiment parsing elements instantly before dedicating schedules or scraping profiles.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Target URL */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Target Webpage URL</label>
                    <input 
                      type="url" 
                      value={playUrl}
                      onChange={(e) => setPlayUrl(e.target.value)}
                      placeholder="e.g. http://books.toscrape.com"
                      className="w-full text-xs border border-slate-220 rounded-lg p-2.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none font-mono"
                    />
                  </div>

                  {/* Extraction Type Selector */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Extraction Protocol</label>
                    <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setPlayType("ai")}
                        className={`py-1.5 text-xs font-semibold rounded-md flex items-center justify-center space-x-1 cursor-pointer transition-colors ${playType === "ai" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"}`}
                      >
                        <Sparkles size={11} className="text-violet-500" />
                        <span>AI Instruction</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPlayType("selector")}
                        className={`py-1.5 text-xs font-semibold rounded-md flex items-center justify-center space-x-1 cursor-pointer transition-colors ${playType === "selector" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"}`}
                      >
                        <Code size={11} className="text-emerald-500" />
                        <span>CSS Selector</span>
                      </button>
                    </div>
                  </div>

                  {/* Parameter Input Box */}
                  <div>
                    {playType === "ai" ? (
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Crawl Guidance (Gemini prompt)</label>
                        <textarea
                          rows={4}
                          value={playPrompt}
                          onChange={(e) => setPlayPrompt(e.target.value)}
                          placeholder="What data rows do you want matching from this website layout? (e.g. Extract story link title, link href, score points)"
                          className="w-full text-xs border border-slate-220 rounded-lg p-2.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                        ></textarea>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">CSS Selectors tag</label>
                        <input
                          type="text"
                          value={playSelector}
                          onChange={(e) => setPlaySelector(e.target.value)}
                          placeholder="e.g. .athing or tr.submission-row"
                          className="w-full text-xs border border-slate-220 rounded-lg p-2.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none font-mono"
                        />
                      </div>
                    )}
                  </div>

                  {/* Advanced Sandbox Elements */}
                  <div className="border-t border-slate-150 pt-4 space-y-3 bg-slate-50/50 p-2.5 rounded-lg border">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-600">Sandbox Anti-Bot Tactics</label>
                    
                    <div className="flex items-center space-x-2 bg-white border border-slate-150 p-2 rounded-lg shadow-2xs">
                      <input 
                        type="checkbox"
                        id="playJsRendering"
                        checked={playJsRendering}
                        onChange={(e) => setPlayJsRendering(e.target.checked)}
                        className="rounded border-slate-350 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                      />
                      <label htmlFor="playJsRendering" className="text-xs text-slate-700 font-medium cursor-pointer">
                        Simulate JS Fluid Rendering
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[9.5px] font-bold text-slate-500 uppercase tracking-wide">UA Signature</label>
                        <select
                          value={playUserAgentMode}
                          onChange={(e) => setPlayUserAgentMode(e.target.value as any)}
                          className="w-full text-xs border border-slate-200 bg-white rounded-lg p-1.5 focus:border-blue-500 outline-none"
                        >
                          <option value="standard">Standard Chrome</option>
                          <option value="mobile">iOS Safari</option>
                          <option value="googlebot">Googlebot</option>
                          <option value="custom">Custom UA</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[9.5px] font-bold text-slate-500 uppercase tracking-wide">Polite Delay (Sec)</label>
                        <input 
                          type="number"
                          placeholder="0"
                          min={0}
                          value={playDelaySecs}
                          onChange={(e) => setPlayDelaySecs(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-full text-xs border border-slate-200 bg-white rounded-lg p-1.5 focus:border-blue-500 outline-none font-mono"
                        />
                      </div>
                    </div>

                    {playUserAgentMode === "custom" && (
                      <div>
                        <label className="block text-[9.5px] font-bold text-slate-500 uppercase">Custom UA String</label>
                        <input 
                          type="text"
                          placeholder="Mozilla/5.0..."
                          value={playCustomUserAgent}
                          onChange={(e) => setPlayCustomUserAgent(e.target.value)}
                          className="w-full text-xs border border-slate-200 bg-white rounded-lg p-1.5 focus:border-blue-500 outline-none"
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[9.5px] font-bold text-slate-500 uppercase tracking-wide">Session Cookie</label>
                        <input 
                          type="text"
                          placeholder="session=123..."
                          value={playCookieSession}
                          onChange={(e) => setPlayCookieSession(e.target.value)}
                          className="w-full text-xs border border-slate-200 bg-white rounded-lg p-1.5 focus:border-blue-500 outline-none font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-[9.5px] font-bold text-slate-500 uppercase tracking-wide">IP Proxy Tunnel</label>
                        <input 
                          type="text"
                          placeholder="1.2.3.4:80"
                          value={playProxyAddress}
                          onChange={(e) => setPlayProxyAddress(e.target.value)}
                          className="w-full text-xs border border-slate-200 bg-white rounded-lg p-1.5 focus:border-blue-500 outline-none font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9.5px] font-bold text-slate-500 uppercase tracking-wide">Custom Headers override (JSON)</label>
                      <textarea
                        rows={1}
                        placeholder='{"Referer": "https://google.com"}'
                        value={playHeadersJson}
                        onChange={(e) => setPlayHeadersJson(e.target.value)}
                        className="w-full text-[10.5px] font-mono border border-slate-200 bg-white rounded-lg p-1.5 focus:border-blue-500 outline-none"
                      ></textarea>
                    </div>

                  </div>

                  <button
                    type="button"
                    onClick={runPlaygroundScrape}
                    disabled={playLoading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-xs font-bold transition-colors flex items-center justify-center space-x-2 cursor-pointer shadow-sm disabled:opacity-80 disabled:cursor-not-allowed"
                  >
                    {playLoading ? (
                      <>
                        <Loader2 size={13} className="animate-spin text-white" />
                        <span>Analyzing layout & crawling...</span>
                      </>
                    ) : (
                      <>
                        <Play size={11} fill="currentColor" />
                        <span>Perform Sandbox crawl</span>
                      </>
                    )}
                  </button>

                </div>
              </div>

              {/* Crawl Preview results visualizer */}
              <div className="lg:col-span-3 space-y-4">
                <h3 className="font-semibold text-slate-900">Sandbox Preview Outbox</h3>
                
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden min-h-[400px] flex flex-col justify-between shadow-xs">
                  
                  {playLoading ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
                      <div className="w-12 h-12 bg-blue-50/50 rounded-full flex items-center justify-center mb-3 animate-[pulse_1.5s_infinite]">
                        <RefreshCw size={20} className="text-blue-600 animate-spin" />
                      </div>
                      <h4 className="font-semibold text-slate-800 text-sm">Contacting scrape crawler...</h4>
                      <p className="text-xs text-slate-405 mt-1 max-w-sm">
                        Downloading landing page headers and routing target container contents to AI processing grids...
                      </p>
                    </div>
                  ) : playError ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-10 bg-rose-50/25 text-center">
                      <AlertCircle size={36} className="text-red-500 mb-2" />
                      <h4 className="font-bold text-red-950 text-sm">Sandbox Fail</h4>
                      <p className="text-xs text-red-750 mt-1 font-mono max-w-lg">
                        {playError}
                      </p>
                    </div>
                  ) : playResults ? (
                    <div className="flex-1 flex flex-col justify-between">
                      {/* Sub header indicating success count */}
                      <div className="px-6 py-3 bg-emerald-50 text-emerald-900 text-xs font-semibold flex items-center justify-between border-b border-emerald-100">
                        <span className="flex items-center space-x-1.5">
                          <CheckCircle size={14} className="text-emerald-500" />
                          <span>Extracted {playResults.length} structures perfectly</span>
                        </span>
                        <span>Previewing top 20 rows</span>
                      </div>

                      {/* Preview Table */}
                      <div className="overflow-auto max-h-[360px] p-2">
                        {playResults.length === 0 ? (
                          <div className="text-center py-10 italic text-xs text-slate-400 font-sans">
                            Scraping completed but returned no structured rows. Try using a simpler selector or specifying precise row keys in the prompt.
                          </div>
                        ) : (
                          <table className="w-full text-left text-[11px] border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-widest text-[9.5px]">
                                <th className="p-2 border-r border-slate-150 text-center w-8">Row</th>
                                {Object.keys(playResults[0] || {}).map((k) => (
                                  <th key={k} className="p-2 border-r border-slate-150">
                                    {k}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {playResults.slice(0, 20).map((row, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 font-mono text-[11.5px] text-zinc-800">
                                  <td className="p-2 border-r border-slate-150 font-bold text-center bg-slate-50/50 text-slate-400">
                                    {idx + 1}
                                  </td>
                                  {Object.keys(playResults[0] || {}).map((k) => (
                                    <td key={k} className="p-2 border-r border-slate-150 max-w-[150px] truncate whitespace-nowrap">
                                      {String(row[k])}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>

                      {/* Export buttons inside playground */}
                      <div className="p-4 bg-slate-50/50 border-t border-slate-200 flex justify-end space-x-2">
                        <button
                          type="button"
                          onClick={() => {
                            const csvStr = convertJsonToCsv(playResults);
                            downloadFile(csvStr, "playground_scrape_data.csv", "text/csv;charset=utf-8;");
                          }}
                          className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer flex items-center space-x-1"
                        >
                          <Download size={11} className="text-emerald-500" />
                          <span>Export CSV</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const jsonStr = JSON.stringify(playResults, null, 2);
                            downloadFile(jsonStr, "playground_scrape_data.json", "application/json;charset=utf-8;");
                          }}
                          className="bg-slate-900 hover:bg-black text-white text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer flex items-center space-x-1"
                        >
                          <FileJson size={11} className="text-violet-400" />
                          <span>Export JSON</span>
                        </button>
                      </div>

                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-400">
                      <Layers size={40} className="text-slate-350 mb-3" />
                      <p className="text-slate-800 font-semibold text-sm">Sandbox Unexecuted</p>
                      <p className="text-xs text-slate-500 mt-1 max-w-xs">
                        Enter target specs under the sidebar and launch a crawl sandbox to examine results instantly!
                      </p>
                    </div>
                  )}

                </div>
              </div>

            </div>
          )}

        </div>
      </main>

      {/* ======================================================== */}
      {/* TASK REOPEN FORM BACKDROP MODAL                           */}
      {/* ======================================================== */}
      {isTaskModalOpen && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-slide-up">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-150 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-900 text-base">
                {editingTask ? "Edit Scraper Profile" : "Register New Web Scraper Target"}
              </h3>
              <button 
                type="button"
                onClick={() => setIsTaskModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 hover:bg-slate-200 p-1 rounded-md transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveTask} className="flex flex-col">
              
              {/* Form Content Body (Scrollable for comfortable viewport) */}
              <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                {formError && (
                  <div className="bg-rose-50 text-rose-800 p-3 rounded-lg flex items-start space-x-2 text-xs font-semibold border border-rose-100">
                    <AlertCircle size={15} className="shrink-0 mt-0.5" />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Task Title */}
                <div>
                  <label className="block text:[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Crawl Profile Title</label>
                  <input 
                    type="text"
                    required
                    placeholder="e.g. Hacker News Top stories"
                    value={taskName}
                    onChange={(e) => setTaskName(e.target.value)}
                    className="w-full text-xs border border-slate-220 rounded-lg p-2.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                </div>

                {/* URL Landing Link */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Target Website Landing-Page Link</label>
                  <input 
                    type="url"
                    required
                    placeholder="e.g. https://news.ycombinator.com"
                    value={taskUrl}
                    onChange={(e) => setTaskUrl(e.target.value)}
                    className="w-full text-xs font-mono border border-slate-220 rounded-lg p-2.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                </div>

                {/* Schema logic switch */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Parsing Mode Strategy</label>
                  <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setExtractionType("ai")}
                      className={`py-1.5 text-xs font-semibold rounded-md flex items-center justify-center space-x-1 cursor-pointer transition-colors ${extractionType === "ai" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"}`}
                    >
                      <Sparkles size={11} className="text-violet-500" />
                      <span>Gemini AI Extraction</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setExtractionType("selector")}
                      className={`py-1.5 text-xs font-semibold rounded-md flex items-center justify-center space-x-1 cursor-pointer transition-colors ${extractionType === "selector" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"}`}
                    >
                      <Code size={11} className="text-emerald-500" />
                      <span>CSS Selectors Tagging</span>
                    </button>
                  </div>
                </div>

                {/* Detail parameters mapping */}
                <div>
                  {extractionType === "ai" ? (
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Crawl prompt instructions (Natural Language)</label>
                      <textarea
                        rows={3}
                        required
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="e.g. Extract the rank, title, author name, and direct story links into JSON blocks"
                        className="w-full text-xs border border-slate-220 rounded-lg p-2.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                      ></textarea>
                      <p className="text-[10.5px] mt-1 text-slate-505 leading-normal">
                        Instructions will be evaluated dynamically by Gemini Flash model targeting optimal context efficiency.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Crawl Row Matching CSS Selectors</label>
                      <input 
                        type="text"
                        required
                        placeholder="e.g. tr.athing or div.story"
                        value={selector}
                        onChange={(e) => setSelector(e.target.value)}
                        className="w-full text-xs font-mono border border-slate-220 rounded-lg p-2.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                      />
                      <p className="text-[10.5px] mt-1 text-slate-505">
                        Extracts child table rows and subheadings automatically using standard Cheerio selector queries.
                      </p>
                    </div>
                  )}
                </div>

                {/* Cron Schedules setup */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Automatic Scraping Frequency Interval</label>
                  <select
                    value={schedule}
                    onChange={(e) => setSchedule(e.target.value as ScheduleInterval)}
                    className="w-full text-xs border border-slate-220 bg-white rounded-lg p-2.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none font-medium"
                  >
                    <option value="manual">Manual Execution (On demand only)</option>
                    <option value="hourly">Hourly execution (Automated schedule)</option>
                    <option value="daily">Daily execution (Every 24 hours)</option>
                    <option value="weekly">Weekly execution (Every 7 days)</option>
                  </select>
                </div>

                {/* ADVANCED BYPASS & CONTROL ADVOCACY */}
                <div className="border-t border-slate-150 pt-4 space-y-4">
                  <h4 className="text-xs font-bold text-slate-950 tracking-wider uppercase flex items-center gap-1.5 text-blue-600">
                    <Sliders size={12} className="text-blue-500" />
                    <span>⚙ Advanced & Anti-Bot Bypass Settings</span>
                  </h4>

                  {/* JS Hydrated Simulator & Politeness Delay */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 p-2.5 rounded-lg">
                      <input 
                        type="checkbox"
                        id="jsRendering"
                        checked={jsRendering}
                        onChange={(e) => setJsRendering(e.target.checked)}
                        className="rounded border-slate-350 text-blue-600 focus:ring-blue-500 h-4 w-4"
                      />
                      <label htmlFor="jsRendering" className="text-xs text-slate-700 font-medium cursor-pointer">
                        Simulate JS Hydrated Rendering
                      </label>
                    </div>

                    <div>
                      <label className="block text-[10.5px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Politeness Delay (Sec)</label>
                      <input 
                        type="number"
                        min={0}
                        max={60}
                        placeholder="e.g. 3"
                        value={delaySecs}
                        onChange={(e) => setDelaySecs(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full text-xs border border-slate-220 rounded-lg p-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none font-mono"
                      />
                    </div>
                  </div>

                  {/* Anti-Bot Header Rotation UA */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-[10.5px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Simulated User Agent Style</label>
                      <select
                        value={userAgentMode}
                        onChange={(e) => setUserAgentMode(e.target.value as any)}
                        className="w-full text-xs border border-slate-x bg-white rounded-lg p-2.5 focus:border-blue-500 outline-none font-medium"
                      >
                        <option value="standard">Chrome Desktop (Standard)</option>
                        <option value="mobile">Safari Mobile (iOS)</option>
                        <option value="googlebot">Googlebot Crawler (Search Indexing)</option>
                        <option value="custom">Custom Signature Text</option>
                      </select>
                    </div>

                    {userAgentMode === "custom" && (
                      <div>
                        <label className="block text-[10.5px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Custom UA Signature String</label>
                        <input 
                          type="text"
                          placeholder="Mozilla/5.0..."
                          value={customUserAgent}
                          onChange={(e) => setCustomUserAgent(e.target.value)}
                          className="w-full text-xs border border-slate-220 rounded-lg p-2.5 focus:border-blue-500 outline-none"
                        />
                      </div>
                    )}
                  </div>

                  {/* Cookie simulation and Proxy Tunneling info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-[10.5px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Session Cookie Payload</label>
                      <input 
                        type="text"
                        placeholder="e.g. session=abc1234; path=/"
                        value={cookieSession}
                        onChange={(e) => setCookieSession(e.target.value)}
                        className="w-full text-xs border border-slate-220 rounded-lg p-2.5 focus:border-blue-500 outline-none font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[10.5px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Simulated IP Proxy Tunnel</label>
                      <input 
                        type="text"
                        placeholder="e.g. 192.168.1.100:8080"
                        value={proxyAddress}
                        onChange={(e) => setProxyAddress(e.target.value)}
                        className="w-full text-xs border border-slate-220 rounded-lg p-2.5 focus:border-blue-500 outline-none font-mono"
                      />
                    </div>
                  </div>

                  {/* Advanced headers override JSON */}
                  <div>
                    <label className="block text-[10.5px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Custom Headers Payload (JSON object)</label>
                    <textarea
                      rows={1}
                      placeholder='e.g. {"Authorization": "Bearer abc", "Referer": "https://google.com"}'
                      value={headersJson}
                      onChange={(e) => setHeadersJson(e.target.value)}
                      className="w-full text-[11px] font-mono border border-slate-220 rounded-lg p-2.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                    ></textarea>
                  </div>

                  {/* WORKFLOW AUTOMATION PIPELINES */}
                  <h4 className="text-xs font-bold text-slate-905 tracking-wider uppercase flex items-center gap-1.5 text-blue-600 pt-3 border-t border-slate-100">
                    <Layers size={12} className="text-blue-500" />
                    <span>⚡ Workflow Automation Actions</span>
                  </h4>

                  {/* Webhook Endpoint triggers and Chaining */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-[10.5px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Webhook target HTTP POST Callback</label>
                      <input 
                        type="url"
                        placeholder="e.g. https://api.mysite.com/endpoints/webhook"
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                        className="w-full text-xs border border-slate-220 rounded-lg p-2.5 focus:border-blue-500 outline-none font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[10.5px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Sequential Chaining Trigger</label>
                      <select
                        value={chainTaskId}
                        onChange={(e) => setChainTaskId(e.target.value)}
                        className="w-full text-xs border border-slate-220 bg-white rounded-lg p-2.5 focus:border-blue-500 outline-none font-medium"
                      >
                        <option value="">-- No secondary task trigger --</option>
                        {tasks
                          .filter(t => t.id !== editingTask?.id)
                          .map(t => (
                            <option key={t.id} value={t.id}>
                              Launch "{t.name}" next
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  {/* RECURRING EMAIL DELIVERY */}
                  <div className="border-t border-slate-100 pt-4 mt-3">
                    <div className="flex items-center justify-between mb-3.5">
                      <h4 className="text-xs font-bold text-slate-905 tracking-wider uppercase flex items-center gap-1.5 text-blue-650 font-sans">
                        <Mail size={12} className="text-blue-500" />
                        <span>📧 Scheduled Email Delivery</span>
                      </h4>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={emailDeliveryEnabled}
                          onChange={(e) => setEmailDeliveryEnabled(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4 bg-slate-200 rounded-full peer peer-focus:ring-0 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                        <span className="ml-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider leading-none">Enable</span>
                      </label>
                    </div>

                    {emailDeliveryEnabled && (
                      <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3.5 space-y-3.5 mb-3.5 animate-fadeIn">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Recipient Inbox Email</label>
                            <input 
                              type="email" 
                              required
                              placeholder="e.g. hello@example.com"
                              value={emailRecipient}
                              onChange={(e) => setEmailRecipient(e.target.value)}
                              className="w-full text-xs border border-slate-220 bg-white rounded-lg p-2 focus:border-blue-500 outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Notify On Trigger</label>
                            <select
                              value={emailSendOn}
                              onChange={(e) => setEmailSendOn(e.target.value as any)}
                              className="w-full text-xs border border-slate-220 bg-white rounded-lg p-2 focus:border-blue-500 outline-none font-medium"
                            >
                              <option value="always">Always notify</option>
                              <option value="success">On Success only</option>
                              <option value="failed">On Failure only</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Attachment Format</label>
                            <select
                              value={emailFormat}
                              onChange={(e) => setEmailFormat(e.target.value as any)}
                              className="w-full text-xs border border-slate-220 bg-white rounded-lg p-2 focus:border-blue-500 outline-none font-medium"
                            >
                              <option value="json">JSON format list</option>
                              <option value="csv">CSV spreadsheet list</option>
                              <option value="inline_html">Inline preview HTML table</option>
                            </select>
                          </div>
                        </div>

                        {/* SMTP configure expander */}
                        <details className="group border-t border-blue-100/40 pt-2.5">
                          <summary className="flex items-center gap-1 text-[10px] font-bold text-blue-900 cursor-pointer select-none">
                            <span className="transition-transform group-open:rotate-90">▸</span>
                            Custom SMTP Server Mailbox Settings (Optional)
                          </summary>
                          
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-3">
                            <div className="md:col-span-2">
                              <label className="block text-[9.5px] font-bold text-slate-500 mb-1 uppercase tracking-wider">SMTP Server Host</label>
                              <input 
                                type="text" 
                                placeholder="e.g. smtp.gmail.com"
                                value={emailSmtpHost}
                                onChange={(e) => setEmailSmtpHost(e.target.value)}
                                className="w-full text-xs border border-slate-220 bg-white rounded-lg p-2 focus:border-blue-500 outline-none font-mono"
                              />
                            </div>

                            <div>
                              <label className="block text-[9.5px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Port</label>
                              <input 
                                type="number" 
                                placeholder="e.g. 587"
                                value={emailSmtpPort || ""}
                                onChange={(e) => setEmailSmtpPort(Number(e.target.value))}
                                className="w-full text-xs border border-slate-220 bg-white rounded-lg p-2 focus:border-blue-500 outline-none"
                              />
                            </div>

                            <div className="flex items-center pt-5">
                              <label className="flex items-center space-x-2 text-xs font-semibold text-slate-650 cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  checked={emailSmtpSecure}
                                  onChange={(e) => setEmailSmtpSecure(e.target.checked)}
                                  className="rounded border-slate-300 text-blue-600 focus:ring-0"
                                />
                                <span>SSL / TLS Encrypt</span>
                              </label>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3">
                            <div>
                              <label className="block text-[9.5px] font-bold text-slate-500 mb-1 uppercase tracking-wider">SMTP Signed Account</label>
                              <input 
                                type="text" 
                                placeholder="e.g. notifications@yourdomain.com"
                                value={emailSmtpUser}
                                onChange={(e) => setEmailSmtpUser(e.target.value)}
                                className="w-full text-xs border border-slate-220 bg-white rounded-lg p-2 focus:border-blue-500 outline-none"
                              />
                            </div>

                            <div>
                              <label className="block text-[9.5px] font-bold text-slate-500 mb-1 uppercase tracking-wider">SMTP Secure Password</label>
                              <input 
                                type="password" 
                                placeholder="••••••••••••"
                                value={emailSmtpPass}
                                onChange={(e) => setEmailSmtpPass(e.target.value)}
                                className="w-full text-xs border border-slate-220 bg-white rounded-lg p-2 focus:border-blue-500 outline-none font-mono"
                              />
                            </div>
                          </div>
                        </details>
                      </div>
                    )}
                  </div>

                  {/* COGNITIVE CLOUD STORAGE EXPORT */}
                  <div className="border-t border-slate-100 pt-4 mt-3">
                    <div className="flex items-center justify-between mb-3.5">
                      <h4 className="text-xs font-bold text-slate-905 tracking-wider uppercase flex items-center gap-1.5 text-blue-650 font-sans">
                        <Cloud size={12} className="text-blue-500" />
                        <span>☁️ Cloud Storage Delivery</span>
                      </h4>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={storageDeliveryEnabled}
                          onChange={(e) => setStorageDeliveryEnabled(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4 bg-slate-200 rounded-full peer peer-focus:ring-0 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                        <span className="ml-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider leading-none">Enable</span>
                      </label>
                    </div>

                    {storageDeliveryEnabled && (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3.5 animate-fadeIn">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Cloud Target Registry</label>
                            <select
                              value={storageProvider}
                              onChange={(e) => setStorageProvider(e.target.value as any)}
                              className="w-full text-xs border border-slate-220 bg-white rounded-lg p-2 focus:border-blue-500 outline-none font-medium"
                            >
                              <option value="custom_api">Custom Endpoint (REST HTTP POST)</option>
                              <option value="google_drive">Google Drive Workspace GFolder</option>
                              <option value="dropbox">Dropbox Folder Directory</option>
                              <option value="aws_s3">AWS S3 Compatible Bucket</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Target Folder / URL Endpoint</label>
                            <input 
                              type="text" 
                              required
                              placeholder={
                                storageProvider === 'aws_s3' ? 'my-aws-s3-bucket-name' :
                                storageProvider === 'dropbox' ? '/Scraped/Reports' :
                                storageProvider === 'google_drive' ? 'folder-shares-id-abc' :
                                'https://api.mycloud.com/scraper/v1/hook'
                              }
                              value={storageTarget}
                              onChange={(e) => setStorageTarget(e.target.value)}
                              className="w-full text-xs border border-slate-220 bg-white rounded-lg p-2 focus:border-blue-500 outline-none font-mono"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Document Format</label>
                            <select
                              value={storageFormat}
                              onChange={(e) => setStorageFormat(e.target.value as any)}
                              className="w-full text-xs border border-slate-220 bg-white rounded-lg p-2 focus:border-blue-500 outline-none font-medium"
                            >
                              <option value="json">JSON format</option>
                              <option value="csv">CSV spreadsheet</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">
                            Authorization Parameters / Token Headers (Config JSON object)
                          </label>
                          <textarea
                            rows={2}
                            placeholder={
                              storageProvider === 'dropbox' ? '{\n  "accessToken": "dbx-your-api-long-lived-token"\n}' :
                              storageProvider === 'google_drive' ? '{\n  "token": "google-drive-oauth-bearer-token"\n}' :
                              storageProvider === 'custom_api' ? '{\n  "headers": {\n    "Authorization": "Bearer x-y-z",\n    "X-Source": "crawlers"\n  }\n}' :
                              '{\n  "accessKeyId": "AKIA...",\n  "secretAccessKey": "...",\n  "region": "us-east-1"\n}'
                            }
                            value={storageConfigJson}
                            onChange={(e) => setStorageConfigJson(e.target.value)}
                            className="w-full text-[11px] border border-slate-220 bg-white rounded-lg p-2.5 focus:border-blue-500 outline-none font-mono"
                          ></textarea>
                        </div>
                      </div>
                    )}
                  </div>

                </div>

              </div>

              {/* Bottom Sticky modal controls */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-150 flex items-center justify-end space-x-2.5">
                <button
                  type="button"
                  onClick={() => setIsTaskModalOpen(false)}
                  className="border border-slate-250 hover:bg-slate-50 text-slate-800 text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer flex items-center space-x-1 shadow-sm disabled:opacity-80"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="animate-spin text-white" size={13} />
                      <span>Verifying reachability & saving...</span>
                    </>
                  ) : (
                    <span>{editingTask ? "Apply Changes" : "Save Scraper Profile"}</span>
                  )}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
