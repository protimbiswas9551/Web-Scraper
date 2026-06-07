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

  // Anti-Bot & Request Settings
  jsRendering?: boolean;
  userAgentMode?: 'standard' | 'mobile' | 'googlebot' | 'custom';
  customUserAgent?: string;
  headersJson?: string;
  cookieSession?: string;
  delaySecs?: number;
  proxyAddress?: string;

  // Automation & Delivery Workflow
  webhookUrl?: string;
  chainTaskId?: string;

  // Recurring Email Delivery Settings
  emailDeliveryEnabled?: boolean;
  emailRecipient?: string;
  emailSendOn?: 'always' | 'success' | 'failed';
  emailFormat?: 'json' | 'csv' | 'inline_html';
  emailSmtpHost?: string;
  emailSmtpPort?: number;
  emailSmtpUser?: string;
  emailSmtpPass?: string;
  emailSmtpSecure?: boolean;
  emailSchedule?: ScheduleInterval;
  emailLastSentAt?: string | null;

  // Cloud Storage Export Settings
  storageDeliveryEnabled?: boolean;
  storageProvider?: 'aws_s3' | 'google_drive' | 'dropbox' | 'custom_api';
  storageTarget?: string; // e.g. AWS Bucket, GDrive Folder ID, Dropbox Folder Path, Custom API endpoint
  storageFormat?: 'json' | 'csv';
  storageConfigJson?: string; // Store key/secrets/tokens or headers in JSON
  storageSchedule?: ScheduleInterval;
  storageLastSentAt?: string | null;
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
  deliveryLogs?: string[]; // Auditing traces of background email & cloud uploads
}

export interface ExportFormat {
  type: 'csv' | 'json';
}
