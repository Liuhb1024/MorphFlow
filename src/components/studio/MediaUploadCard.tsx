"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "../../styles/studio.module.css";
import { StudioIcon } from "./StudioShell";

export function MediaUploadCard({ projectId }: { projectId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("文件会写入 MorphFlow 本地数据目录");
  const [tone, setTone] = useState<"muted" | "success" | "error">("muted");
  const [imageKind, setImageKind] = useState("source_image");
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  async function upload(files: readonly File[]) {
    if (files.length === 0) return;
    if (files.length > 50) {
      setTone("error"); setMessage("一次最多上传 50 个文件，请分批选择。");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setUploading(true); setTone("muted");
    let completed = 0;
    const failures: string[] = [];
    for (const [index, file] of files.entries()) {
      setProgress({ current: index + 1, total: files.length });
      setMessage(`正在校验并保存 ${index + 1} / ${files.length}：${file.name}`);
      const form = new FormData();
      form.set("file", file);
      form.set("kind", file.type.startsWith("video/") ? "source_video" : imageKind);
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/assets`, { method: "POST", body: form, credentials: "same-origin" });
        if (!response.ok) throw new Error("upload_failed");
        completed += 1;
      } catch {
        failures.push(file.name);
      }
    }
    if (completed > 0) router.refresh();
    if (failures.length === 0) {
      setMessage(`${completed} 个文件已保存到本地素材库。`); setTone("success");
    } else {
      const names = failures.slice(0, 3).join("、");
      setMessage(`已保存 ${completed} 个，失败 ${failures.length} 个：${names}${failures.length > 3 ? " 等" : ""}`); setTone("error");
    }
    if (inputRef.current) inputRef.current.value = "";
    setProgress(null); setUploading(false);
  }

  return (
    <div className={styles.uploadCard}>
      <input
        accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime"
        aria-label="批量选择本地视频或图片"
        disabled={uploading}
        multiple
        onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length > 0) void upload(files); }}
        ref={inputRef}
        type="file"
      />
      <button disabled={uploading} onClick={() => inputRef.current?.click()} type="button">
        <span><StudioIcon name="plus" size={20}/></span>
        <strong>{progress ? `正在保存 ${progress.current} / ${progress.total}` : "批量上传视频或图片"}</strong>
        <small>可多选 · 支持 PNG、JPEG、WebP、MP4、MOV</small>
      </button>
      <label><span>图片用途</span><select disabled={uploading} onChange={(event) => setImageKind(event.target.value)} value={imageKind}><option value="source_image">普通图片</option><option value="first_frame">首帧 A / 视频尾帧</option><option value="last_frame">目标画面 B / 尾帧</option><option value="reference_image">参考图片</option><option value="hand_drawn_image">手绘图片</option></select></label>
      <p aria-live="polite" data-tone={tone}>{message}</p>
    </div>
  );
}
