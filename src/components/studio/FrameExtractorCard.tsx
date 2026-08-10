"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "../../styles/studio.module.css";
import type { StudioAssetView } from "./StudioSectionPage";

function waitFor(element: HTMLMediaElement, event: "loadedmetadata" | "seeked"): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("video_timeout")), 30_000);
    element.addEventListener(event, () => { window.clearTimeout(timer); resolve(); }, { once: true });
    element.addEventListener("error", () => { window.clearTimeout(timer); reject(new Error("video_decode_failed")); }, { once: true });
  });
}

export function FrameExtractorCard({ projectId, videos }: { projectId: string; videos: readonly StudioAssetView[] }) {
  const router = useRouter(); const [videoId, setVideoId] = useState(videos[0]?.id ?? ""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function extract() {
    const source = videos.find((video) => video.id === videoId); if (!source) return;
    setBusy(true); setMessage("正在读取视频高清尾帧…"); let objectUrl = "";
    try {
      const sourceResponse = await fetch(source.contentUrl, { cache: "no-store" }); if (!sourceResponse.ok) throw new Error("video_read_failed");
      objectUrl = URL.createObjectURL(await sourceResponse.blob());
      const video = document.createElement("video"); video.preload = "auto"; video.muted = true; video.src = objectUrl;
      await waitFor(video, "loadedmetadata"); video.currentTime = Math.max(0, video.duration - 0.04); await waitFor(video, "seeked");
      const canvas = document.createElement("canvas"); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const context = canvas.getContext("2d"); if (!context || canvas.width === 0 || canvas.height === 0) throw new Error("video_frame_unavailable"); context.drawImage(video, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("frame_encode_failed")), "image/png"));
      const form = new FormData(); form.set("file", new File([blob], `${source.displayName.replace(/\.[^.]+$/, "")}-tail.png`, { type: "image/png" })); form.set("kind", "first_frame");
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/assets`, { method: "POST", body: form }); if (!response.ok) throw new Error("frame_save_failed");
      setMessage("尾帧已作为首帧 A 保存到本地素材库。"); router.refresh();
    } catch (error) { setMessage(`提取失败：${error instanceof Error ? error.message : "无法读取视频"}`); }
    finally { if (objectUrl) URL.revokeObjectURL(objectUrl); setBusy(false); }
  }
  if (videos.length === 0) return null;
  return <section className={styles.mediaToolbar}><label><span>从已上传视频提取高清尾帧</span><select disabled={busy} onChange={(event) => setVideoId(event.target.value)} value={videoId}>{videos.map((video) => <option key={video.id} value={video.id}>{video.displayName}</option>)}</select></label><button disabled={busy || !videoId} onClick={() => void extract()} type="button">{busy ? "正在提取…" : "提取并保存为首帧 A"}</button>{message ? <small aria-live="polite">{message}</small> : null}</section>;
}
