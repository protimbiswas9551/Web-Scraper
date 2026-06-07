import React from "react";
import { Database, Calendar, History, FileSpreadsheet, CheckCircle, HelpCircle } from "lucide-react";
import { ScrapingTask, ScrapingRun } from "../types";

interface StatsSectionProps {
  tasks: ScrapingTask[];
  runs: ScrapingRun[];
}

export const StatsSection: React.FC<StatsSectionProps> = ({ tasks, runs }) => {
  const activeSchedules = tasks.filter((t) => t.isActive && t.schedule !== "manual").length;
  const totalCompletedRuns = runs.length;
  const successfulRuns = runs.filter((r) => r.status === "success").length;
  const totalExtractedRows = runs.reduce((acc, r) => acc + (r.status === "success" ? r.resultsCount : 0), 0);
  
  const successRate = totalCompletedRuns > 0 
    ? Math.round((successfulRuns / totalCompletedRuns) * 100) 
    : 100;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* Metric 1 */}
      <div className="bg-white border border-zinc-150 rounded-xl p-5 shadow-xs flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Total Scrapers</p>
          <h3 className="text-2xl font-semibold text-zinc-900 mt-1 font-display">{tasks.length}</h3>
          <p className="text-xs text-zinc-650 mt-1">Concurring targets</p>
        </div>
        <div className="bg-zinc-100 p-2.5 rounded-lg text-zinc-600">
          <Database size={20} />
        </div>
      </div>

      {/* Metric 2 */}
      <div className="bg-white border border-zinc-150 rounded-xl p-5 shadow-xs flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Active Schedules</p>
          <h3 className="text-2xl font-semibold text-zinc-900 mt-1 font-display">{activeSchedules}</h3>
          <p className="text-xs text-green-600 mt-1 font-medium">Automatic execution active</p>
        </div>
        <div className="bg-blue-50 p-2.5 rounded-lg text-blue-600">
          <Calendar size={20} />
        </div>
      </div>

      {/* Metric 3 */}
      <div className="bg-white border border-zinc-150 rounded-xl p-5 shadow-xs flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Data Rows Collected</p>
          <h3 className="text-2xl font-semibold text-zinc-900 mt-1 font-display">
            {totalExtractedRows.toLocaleString()}
          </h3>
          <p className="text-xs text-zinc-650 mt-1">Ready to export as CSV/JSON</p>
        </div>
        <div className="bg-emerald-50 p-2.5 rounded-lg text-emerald-600">
          <FileSpreadsheet size={20} />
        </div>
      </div>

      {/* Metric 4 */}
      <div className="bg-white border border-zinc-150 rounded-xl p-5 shadow-xs flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Success Rate</p>
          <h3 className="text-2xl font-semibold text-zinc-900 mt-1 font-display">{successRate}%</h3>
          <p className="text-xs text-zinc-650 mt-1">
            {successfulRuns} / {totalCompletedRuns} jobs succeeded
          </p>
        </div>
        <div className={`p-2.5 rounded-lg ${successRate > 90 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
          <History size={20} />
        </div>
      </div>
    </div>
  );
};
