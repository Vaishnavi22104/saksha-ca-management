"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";
import {
  ACCEPT_ATTR,
  ALLOWED_LABEL,
  DOCUMENT_BUCKET,
  MAX_UPLOAD_BYTES,
  fileKind,
  formatBytes,
  resolveMimeType,
} from "@/lib/documents";
import { prepareUploadAction, recordUploadAction } from "../actions";

type Phase = "idle" | "checking" | "sending" | "saving" | "done";

/** A small glyph per file family, so the chosen file is recognisable. */
function FileIcon({ mimeType }: { mimeType: string }) {
  const kind = fileKind(mimeType);
  const paths: Record<string, string> = {
    pdf: "M14 3v5h5M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM8.5 17v-4h1.2a1.2 1.2 0 0 1 0 2.4H8.5",
    image: "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Zm0 12 5-5 4 4 3-3 6 6M8.5 9.5h.01",
    sheet: "M14 3v5h5M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM8 13h8M8 17h8M12 13v4",
    doc: "M14 3v5h5M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM9 13h6M9 17h4",
    text: "M14 3v5h5M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM9 13h6M9 17h6M9 9h2",
  };
  return (
    <span className={`up-icon k-${kind}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round">
        <path d={paths[kind]} />
      </svg>
    </span>
  );
}

/**
 * Sends the file straight to storage with the one-object ticket the
 * server issued, reporting progress as it goes. XMLHttpRequest rather
 * than fetch, because only it reports upload progress.
 */
function putToStorage(args: {
  path: string;
  token: string;
  contentType: string;
  file: File;
  onProgress: (percent: number) => void;
  signal: AbortSignal;
}) {
  return new Promise<void>((resolve, reject) => {
    const url =
      `${env.supabaseUrl}/storage/v1/object/upload/sign/${DOCUMENT_BUCKET}/` +
      args.path.split("/").map(encodeURIComponent).join("/") +
      `?token=${encodeURIComponent(args.token)}`;

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("content-type", args.contentType);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "max-age=3600");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) args.onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let detail = "";
      try {
        detail = (JSON.parse(xhr.responseText)?.message as string) ?? "";
      } catch {
        // Storage answers with plain text on some errors; the status is enough.
      }
      reject(new Error(detail || `Storage refused the file (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("The connection dropped while sending the file."));
    xhr.onabort = () => reject(new Error("aborted"));
    args.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(args.file);
  });
}

/**
 * Pick or drop a file, watch it go, see it land. The file goes from the
 * browser to private storage directly; the server only issues the ticket
 * and records the version afterwards.
 */
export function UploadForm(props: { requestId: string; nextVersion: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  const busy = phase === "checking" || phase === "sending" || phase === "saving";

  /** Everything we can tell the person before a single byte is sent. */
  const choose = (picked: File | null | undefined) => {
    setError("");
    setPhase("idle");
    setPercent(0);
    if (!picked) return;
    if (picked.size === 0) {
      setFile(null);
      setError("That file is empty.");
      return;
    }
    if (picked.size > MAX_UPLOAD_BYTES) {
      setFile(null);
      setError(`${picked.name} is ${formatBytes(picked.size)}. The limit is 50 MB.`);
      return;
    }
    if (!resolveMimeType(picked.name, picked.type)) {
      setFile(null);
      setError(`${picked.name} isn't a file type we accept. Allowed: ${ALLOWED_LABEL}.`);
      return;
    }
    setFile(picked);
  };

  const reset = () => {
    setFile(null);
    setPhase("idle");
    setPercent(0);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const send = async () => {
    if (!file || busy) return;
    setError("");
    setPercent(0);
    setPhase("checking");

    const ticket = await prepareUploadAction({
      requestId: props.requestId,
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
    });
    if (ticket.error || !ticket.path || !ticket.token || !ticket.contentType) {
      setPhase("idle");
      setError(ticket.error ?? "The upload could not be started.");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("sending");

    try {
      await putToStorage({
        path: ticket.path,
        token: ticket.token,
        contentType: ticket.contentType,
        file,
        onProgress: setPercent,
        signal: controller.signal,
      });
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "The file could not be sent.";
      if (message === "aborted") {
        reset();
        return;
      }
      // The signed ticket is one endpoint; if it is unreachable the
      // library's own path is worth one attempt before giving up.
      try {
        const supabase = createClient();
        const { error: fallbackError } = await supabase.storage
          .from(DOCUMENT_BUCKET)
          .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: ticket.contentType });
        if (fallbackError) throw fallbackError;
        setPercent(100);
      } catch {
        setPhase("idle");
        setError(message);
        return;
      }
    } finally {
      abortRef.current = null;
    }

    setPhase("saving");
    const saved = await recordUploadAction({
      requestId: props.requestId,
      path: ticket.path,
      fileName: file.name,
      mimeType: ticket.contentType,
      size: file.size,
    });
    if (saved.error) {
      setPhase("idle");
      setError(saved.error);
      return;
    }

    setPhase("done");
    router.refresh();
  };

  if (phase === "done") {
    return (
      <div className="panel-b up-done" role="status">
        <span className="up-tick" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7" /></svg>
        </span>
        <p className="strong">Uploaded as version {props.nextVersion}</p>
        <p className="small muted">Your CA firm will review it and let you know.</p>
        <button type="button" className="btn" onClick={reset}>Upload another version</button>
      </div>
    );
  }

  return (
    <div className="panel-b up">
      {error && <div className="notice red" role="alert">{error}</div>}

      {!file ? (
        <div
          className={`up-drop${dragging ? " on" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            choose(e.dataTransfer.files?.[0]);
          }}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); }
          }}
          role="button"
          tabIndex={0}
        >
          <span className="up-cloud" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V7m0 0L8.5 10.5M12 7l3.5 3.5" />
              <path d="M20 16.5A3.5 3.5 0 0 0 18 10a6 6 0 0 0-11.7 1.5A3.75 3.75 0 0 0 7 19h1" />
            </svg>
          </span>
          <p className="strong">
            {props.nextVersion === 1 ? "Drop the file here" : `Drop version ${props.nextVersion} here`}
          </p>
          <p className="small muted">or <span className="up-link">browse your computer</span></p>
          <p className="up-rules small muted">{ALLOWED_LABEL}</p>
        </div>
      ) : (
        <div className="up-file">
          <FileIcon mimeType={resolveMimeType(file.name, file.type)} />
          <span className="up-meta">
            <b title={file.name}>{file.name}</b>
            <span className="small muted">
              {formatBytes(file.size)}
              {phase === "sending" && ` · ${percent}% sent`}
              {phase === "checking" && " · checking"}
              {phase === "saving" && " · finishing"}
            </span>
          </span>
          {!busy && (
            <button type="button" className="up-x" onClick={reset} aria-label="Remove this file">×</button>
          )}
        </div>
      )}

      {busy && (
        <div className="up-bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${phase === "sending" ? Math.max(percent, 3) : 100}%` }}
            className={phase === "sending" ? undefined : "pulse"} />
        </div>
      )}

      <input
        ref={inputRef}
        id="f-file"
        type="file"
        className="sr-only"
        accept={ACCEPT_ATTR}
        onChange={(e) => choose(e.target.files?.[0])}
      />

      <div className="up-foot">
        <button type="button" className="btn primary" onClick={send} disabled={!file || busy}>
          {phase === "sending" ? `Uploading ${percent}%` : phase === "saving" ? "Finishing…" : "Upload"}
        </button>
        {phase === "sending" && (
          <button type="button" className="linkbtn" onClick={() => abortRef.current?.abort()}>Cancel</button>
        )}
        {!busy && <span className="small muted">Only your CA firm can open it.</span>}
      </div>
    </div>
  );
}
