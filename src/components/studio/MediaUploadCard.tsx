"use client";

import { useRef, useState } from "react";

import styles from "../../styles/studio.module.css";
import { StudioIcon } from "./StudioShell";

export function MediaUploadCard({ projectId }: { projectId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("文件会写入 MorphFlow 本地数据目录");
  const [tone, setTone] = useState<"muted" | "success" | "error">("muted");

  async function upload(file: File) {
    setUploading(true); setTone("muted"); setMessage("正在校验并保存到本机…");
    const form = new FormData();
    form.set("file", file);
    form.set("kind", file.type.startsWith("video/") ? "source_video" : "source_image");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/assets`, { method: "POST", body: form, credentials: "same-origin" });
      if (!response.ok) throw new Error("upload_failed");
      setMessage(`${file.name} 已保存到本地素材库。`); setTone("success");
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      setMessage("上传失败。请检查文件格式、本地数据目录和服务状态。"); setTone("error");
    } finally { setUploading(false); }
  }

  return (
    <div className={styles.uploadCard}>
      <input
        accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm"
        aria-label="选择本地视频或图片"
        disabled={uploading}
        onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }}
        ref={inputRef}
        type="file"
      />
      <button disabled={uploading} onClick={() => inputRef.current?.click()} type="button">
        <span><StudioIcon name="plus" size={20}/></span>
        <strong>{uploading ? "正在保存…" : "上传视频或图片"}</strong>
        <small>支持 PNG、JPEG、WebP、MP4、MOV、WebM</small>
      </button>
      <p aria-live="polite" data-tone={tone}>{message}</p>
    </div>
  );
}
