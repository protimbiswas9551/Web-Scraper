export type ExtractionType = 'selector' | 'ai';
export type ScheduleInterval = 'manual' | 'hourly' | 'daily' | 'weekly';
export type TaskStatus = 'idle' | 'running' | 'success' | 'failed';

export interface ScrapingTask {
  id: string;
  name: string;
  url: string;
  extractionType: ExtractionType;
  selector?: string; // CSS selector for selector mode, or element selector
  prompt?: string; // Natural language extraction instructions for AI mode
  schedule: ScheduleInterval;
  createdAt: string;
  lastRunAt: string | null;
  status: TaskStatus;
  isActive: boolean; // For schedule enabled/disabled
}

export interface ScrapingRun {
  id: string;
  taskId: string;
  taskName: string;
  runAt: string;
  status: 'success' | 'failed';
  resultsCount: number;
  errorMessage: string | null;
  data: any[]; // Extracted row items
  rawHtmlSample?: string; // Truncated HTML for preview
}

export interface ExportFormat {
  type: 'csv' | 'json';
}
