"use client";

import { useState } from "react";
import type { ViewModel } from "@/lib/viewModel";

export const AVATAR_PREFIXES = ["https://", "ipfs://", "data:image/"];

export function isAvatarValue(v: string): boolean {
  return AVATAR_PREFIXES.some((p) => v.startsWith(p));
}

/** URL or upload for the `avatar` record; the value written on chain is always a URL. */
export function AvatarUploader({ v }: { v: ViewModel }) {
  const [tab, setTab] = useState<"url" | "upload">("url");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const res = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": file.type }, body: await file.arrayBuffer() });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { url: string };
      v.fields.recordValue(json.url);
      setTab("url");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="avatar-uploader-container">
      <div className="avatar-tabs">
        <button type="button" className={`tab ${tab === "url" ? "active" : ""}`} onClick={() => setTab("url")}>
          URL
        </button>
        <button type="button" className={`tab ${tab === "upload" ? "active" : ""}`} onClick={() => setTab("upload")}>
          Upload
        </button>
      </div>
      {tab === "url" ? (
        <>
          <textarea
            id="record-value"
            maxLength={512}
            value={v.recordValue}
            onChange={(e) => v.fields.recordValue(e.target.value)}
            placeholder={`Value for ${v.recordKey}...`}
          />
          {v.recordValue && (
            <div className="avatar-preview-box">
              {isAvatarValue(v.recordValue) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={v.recordValue.replace("ipfs://", "https://ipfs.io/ipfs/")}
                  alt="Avatar preview"
                  className="avatar-preview"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <p className="field-note invalid">Avatar URL must start with https://, ipfs://, or data:image/</p>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="upload-dropzone">
          <input type="file" accept="image/png, image/jpeg, image/webp, image/gif" onChange={upload} disabled={uploading} />
          {uploading ? <p>Uploading...</p> : <p>Select an image to upload (max 5MB)</p>}
          {error && <p className="field-note invalid">{error}</p>}
        </div>
      )}
    </div>
  );
}
