import React from "react";
import { Play, Globe, Sparkles, Code, Trash2, Edit2, Calendar, Ban, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { ScrapingTask } from "../types";
import { formatDate } from "../utils";

interface TaskCardProps {
  task: ScrapingTask;
  onRun: (id: string) => void;
  onToggleActive: (id: string) => void;
  onEdit: (task: ScrapingTask) => void;
  onDelete: (id: string) => void;
  onViewLogs: (taskId: string) => void;
  runsCount: number;
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onRun,
  onToggleActive,
  onEdit,
  onDelete,
  onViewLogs,
  runsCount,
}) => {
  const getScheduleLabel = (sched: string) => {
    switch (sched) {
      case "hourly": return "Every hour";
      case "daily": return "Every day";
      case "weekly": return "Every week";
      default: return "On demand";
    }
  };

  return (
    <div className={`bg-white border text-zinc-950 rounded-xl shadow-xs overflow-hidden transition-all duration-200 hover:border-zinc-300 relative ${task.status === "running" ? "ring-1 ring-blue-500 border-blue-500" : "border-zinc-200"}`}>
      
      {/* Top Banner indicating Extraction Mode */}
      <div className="flex border-b border-zinc-100 px-5 py-3.5 items-center justify-between bg-zinc-50/50">
        <div className="flex items-center space-x-2">
          {task.extractionType === "ai" ? (
            <span className="inline-flex items-center text-[11px] font-semibold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-100">
              <Sparkles size={11} className="mr-1" />
              AI Parser
            </span>
          ) : (
            <span className="inline-flex items-center text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
              <Code size={11} className="mr-1" />
              CSS Selector
            </span>
          )}
          <span className="inline-flex items-center text-[11px] font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">
            <Calendar size={11} className="mr-1" />
            {getScheduleLabel(task.schedule)}
          </span>
          {task.maxRows && task.maxRows > 0 && (
            <span className="inline-flex items-center text-[11px] font-semibold text-amber-750 bg-amber-50 dark:text-amber-400 dark:bg-zinc-800/60 px-2 py-0.5 rounded-full border border-amber-100 dark:border-zinc-700">
              Limit: {task.maxRows} rows
            </span>
          )}
        </div>
        
        {/* Active Schedule Toggle */}
        {task.schedule !== "manual" && (
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              checked={task.isActive} 
              onChange={() => onToggleActive(task.id)}
              className="sr-only peer" 
            />
            <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            <span className="ml-1.5 text-[11px] font-medium text-zinc-650">
              {task.isActive ? "Scheduled" : "Paused"}
            </span>
          </label>
        )}
      </div>

      <div className="p-5">
        <h4 className="font-semibold text-zinc-900 group-hover:text-blue-600 leading-tight truncate">{task.name}</h4>
        
        {/* Destination Target */}
        <div className="flex items-center space-x-1 mt-1 text-zinc-500 text-xs">
          <Globe size={12} className="shrink-0 text-zinc-405" />
          <a href={task.url} target="_blank" rel="noreferrer" className="hover:underline truncate hover:text-blue-500 font-mono">
            {task.url}
          </a>
        </div>

        {/* Dynamic Detail (Prompt or Selector) */}
        <div className="mt-3.5 bg-zinc-50 rounded-lg p-2.5 text-xs text-zinc-700 font-mono line-clamp-2 min-h-[48px] border border-zinc-100">
          {task.extractionType === "ai" ? (
            <span className="text-zinc-500 text-[11px] italic font-sans block mb-0.5">Scrape prompt:</span>
          ) : (
            <span className="text-zinc-500 text-[11px] block mb-0.5 font-sans">Selector matching:</span>
          )}
          {task.extractionType === "ai" ? task.prompt : task.selector}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-zinc-100 text-xs text-zinc-500">
          <div>
            <span className="block text-[10px] uppercase font-semibold text-zinc-400">Past Crawls</span>
            <button 
              onClick={() => runsCount > 0 && onViewLogs(task.id)}
              className={`font-medium ${runsCount > 0 ? "text-blue-600 hover:underline" : "text-zinc-500"}`}
              disabled={runsCount === 0}
            >
              {runsCount} {runsCount === 1 ? "run" : "runs"}
            </button>
          </div>
          <div>
            <span className="block text-[10px] uppercase font-semibold text-zinc-400">Last Active</span>
            <span className="font-medium text-zinc-700">
              {task.lastRunAt ? formatDate(task.lastRunAt) : "Never executed"}
            </span>
          </div>
        </div>

        {/* Controls Panel */}
        <div className="flex items-center mt-5 pt-3 border-t border-zinc-100 justify-between">
          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => onRun(task.id)}
              disabled={task.status === "running"}
              className={`inline-flex items-center justify-center space-x-1 text-xs font-semibold px-3 py-1.5 rounded-lg shadow-2xs cursor-pointer transition-colors ${task.status === "running" ? "bg-zinc-100 text-zinc-400" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
            >
              {task.status === "running" ? (
                <>
                  <Loader2 size={13} className="animate-spin text-zinc-400" />
                  <span>Crawling...</span>
                </>
              ) : (
                <>
                  <Play size={12} fill="currentColor" />
                  <span>Scrape Now</span>
                </>
              )}
            </button>
            
            <button
              onClick={() => onViewLogs(task.id)}
              disabled={runsCount === 0}
              className={`inline-flex items-center justify-center text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${runsCount > 0 ? "border-zinc-200 text-zinc-700 bg-white hover:bg-zinc-50 cursor-pointer" : "border-zinc-100 text-zinc-350 bg-zinc-50 cursor-not-allowed"}`}
            >
              View Data
            </button>
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => onEdit(task)}
              className="p-1.5 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 rounded-lg cursor-pointer transition-colors"
              title="Edit Scraper Settings"
            >
              <Edit2 size={14} />
            </button>
            <button
              onClick={() => onDelete(task.id)}
              className="p-1.5 text-zinc-400 hover:text-red-650 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
              title="Delete Scraper"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Decorative Active Task overlay indicator at bottom */}
      {task.status === "running" && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500 overflow-hidden">
          <div className="w-1/3 h-full bg-blue-300 animate-[pulse_1.5s_infinite]"></div>
        </div>
      )}
      {task.status === "success" && (
        <div className="absolute top-[18px] right-5 flex items-center space-x-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
          <CheckCircle size={11} />
          <span>Success</span>
        </div>
      )}
      {task.status === "failed" && (
        <div className="absolute top-[18px] right-5 flex items-center space-x-1 text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
          <AlertCircle size={11} />
          <span>Failed</span>
        </div>
      )}
    </div>
  );
};
