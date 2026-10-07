import type { DocumentRequestStatus, DocumentStatus } from "@/lib/types";

export const DOCUMENT_BUCKET = "client-documents";

/** Mirrors the bucket's own limits, so the user sees the error before the upload. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "text/csv": "csv",
  "text/plain": "txt",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export const ALLOWED_LABEL = "PDF, JPG, PNG, CSV, TXT, Word or Excel, up to 50 MB";

/** What the file picker offers. */
export const ACCEPT_ATTR = ".pdf,.jpg,.jpeg,.png,.webp,.csv,.txt,.xls,.xlsx,.doc,.docx";

/**
 * Browsers disagree about MIME types: Windows reports .csv as
 * application/vnd.ms-excel, and a file dragged from some apps arrives
 * with an empty type altogether. The extension is the more reliable
 * signal, so it decides when the reported type is one we don't accept.
 */
const EXT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  csv: "text/csv",
  txt: "text/plain",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export const extensionOf = (fileName: string) =>
  (fileName.includes(".") ? fileName.split(".").pop() ?? "" : "").toLowerCase();

/** The type we will store the file as, or "" if we do not accept it. */
export function resolveMimeType(fileName: string, reported: string | undefined) {
  const byExtension = EXT_TYPES[extensionOf(fileName)];
  if (byExtension) return byExtension;
  return reported && ALLOWED_TYPES[reported] ? reported : "";
}

/** Coarse family, for the icon shown beside the file name. */
export function fileKind(mimeType: string): "pdf" | "image" | "sheet" | "doc" | "text" {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.includes("spreadsheet") || mimeType.includes("ms-excel") || mimeType === "text/csv") return "sheet";
  if (mimeType.includes("word")) return "doc";
  return "text";
}

export const REQUEST_STATUS: Record<DocumentRequestStatus, { label: string; tone: "" | "green" | "amber" | "blue" | "red" }> = {
  REQUESTED: { label: "Waiting for client", tone: "amber" },
  UPLOADED: { label: "Awaiting review", tone: "blue" },
  UNDER_REVIEW: { label: "Under review", tone: "blue" },
  ACCEPTED: { label: "Accepted", tone: "green" },
  REJECTED: { label: "Rejected", tone: "red" },
  CANCELLED: { label: "Cancelled", tone: "" },
};

export const DOCUMENT_STATUS: Record<DocumentStatus, { label: string; tone: "" | "green" | "blue" | "red" }> = {
  UPLOADED: { label: "Awaiting review", tone: "blue" },
  ACCEPTED: { label: "Accepted", tone: "green" },
  REJECTED: { label: "Rejected", tone: "red" },
  SUPERSEDED: { label: "Replaced", tone: "" },
};

export const REQUEST_SELECT =
  "*, client:clients(name), task:tasks!document_requests_task_id_fkey(id, title)";

/** A request is still outstanding until the file is accepted or the request is dropped. */
export const isRequestOpen = (s: DocumentRequestStatus) => s !== "ACCEPTED" && s !== "CANCELLED";

/** The client still has to act on these. */
export const needsClient = (s: DocumentRequestStatus) => s === "REQUESTED" || s === "REJECTED";

export const formatBytes = (bytes: number | null) => {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Storage path for a new upload. Never built from the user's file name:
 * only ids we generated ourselves and an extension we allow.
 */
export function storagePath(clientId: string, requestId: string, mimeType: string) {
  const ext = ALLOWED_TYPES[mimeType] ?? "bin";
  return `${clientId}/${requestId}/${crypto.randomUUID()}.${ext}`;
}
