"use client";

import { useState } from "react";
import { fileKind } from "@/lib/documents";

/**
 * The small thumbnail beside a version in the list. Images show
 * themselves; everything else shows a glyph for its type. Either way
 * clicking it opens the file full size in a new tab.
 */
export function DocumentThumb({
  id,
  fileName,
  mimeType,
}: {
  id: string;
  fileName: string;
  mimeType: string;
}) {
  const [failed, setFailed] = useState(false);
  const kind = fileKind(mimeType ?? "");
  const showImage = kind === "image" && !failed;

  const glyphs: Record<string, string> = {
    pdf: "M14 3v5h5M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM8.5 17v-4h1.2a1.2 1.2 0 0 1 0 2.4H8.5",
    image: "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Zm0 12 5-5 4 4 3-3 6 6",
    sheet: "M14 3v5h5M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM8 13h8M8 17h8M12 13v4",
    doc: "M14 3v5h5M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM9 13h6M9 17h4",
    text: "M14 3v5h5M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM9 13h6M9 17h6M9 9h2",
  };

  return (
    <a
      className={`vt k-${kind}`}
      href={`/documents/download/${id}?mode=view`}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open ${fileName}`}
    >
      {showImage ? (
        // A signed, private URL behind our own route — next/image would need
        // the storage host allow-listed for no benefit at this size.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/documents/download/${id}?mode=view`} alt="" onError={() => setFailed(true)} />
      ) : (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={glyphs[kind]} />
        </svg>
      )}
    </a>
  );
}
