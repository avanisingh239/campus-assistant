export type IngestSourceType = "paste" | "whatsapp_export" | "admin_form";

export interface IngestOptions {
  sourceType?: IngestSourceType;
  sourceGroupName?: string;
  submittedBy?: string;
}

export interface IngestResult {
  messageId: string;
  announcementIds: string[];
  extractedCount: number;
}
