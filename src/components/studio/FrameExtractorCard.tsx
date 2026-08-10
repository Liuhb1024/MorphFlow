"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import styles from "../../styles/studio.module.css";
import type { StudioAssetView } from "./StudioSectionPage";

type ExtractMode = "tail" | "time";

function waitFor(element: HTMLMediaElement, event: "seeked"): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("video_timeout")), 30_000);
    element.addEventListener(event, () => { window.clearTimeout(timer); resolve(); }, { once: true });
    element.addEventListener("error", () => { window.clearTimeout(timer); reject(new Error("video_decode_failed")); }, { once: true });
  });
}

function secondsLabel(value: number): string {
  return `${value.toFixed(2)} 秒`;
}

export function FrameExtractorCard({ projectId, videos }: { projectId: string; videos: readonly StudioAssetView[] }) {
  const router = useRouter();
  const previewRef = useRef<HTMLVideoElement>(null);
  const [videoId, setVideoId] = useState(videos[0]?.id ?? "");
  const [mode, setMode] = useState<ExtractMode>("tail");
  const [seconds, setSeconds] = useState("0");
  const [duration, setDuration] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const source = videos.find((video) => video.id === videoId);
  const requestedSeconds = Number(seconds);
  const maxTime = Math.max(0, duration - 0.04);
  const validTime = Number.isFinite(requestedSeconds) && requestedSeconds >= 0 && (duration === 0 || requestedSeconds <= maxTime);

  useEffect(() => {
    const video = previewRef.current;
    if (!video) return;
    const synchronize = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) setDuration(video.duration);
    };
    const timer = window.setTimeout(synchronize, 0);
    video.addEventListener("loadedmetadata", synchronize);
    video.addEventListener("durationchange", synchronize);
    return () => {
      window.clearTimeout(timer);
      video.removeEventListener("loadedmetadata", synchronize);
      video.removeEventListener("durationchange", synchronize);
    };
  }, [videoId]);

  useEffect(() => {
    const video = previewRef.current;
    if (mode === "tail" && video && duration > 0) video.currentTime = maxTime;
  }, [duration, maxTime, mode, videoId]);
  function updateTime(value: string) {
    setSeconds(value);
    const next = Number(value);
    const preview = previewRef.current;
    if (preview && Number.isFinite(next) && next >= 0 && next <= maxTime) preview.currentTime = next;
  }

  async function extract() {
    const video = previewRef.current;
    if (!source || !video || !Number.isFinite(video.duration) || video.duration <= 0 || (mode === "time" && !validTime)) return;
    const preciseTime = mode === "tail" ? Math.max(0, video.duration - 0.04) : requestedSeconds;
    setBusy(true);
    setMessage(`正在截取 ${secondsLabel(preciseTime)}的高清画面…`);
    try {
      if (Math.abs(video.currentTime - preciseTime) > 0.005) {
        const sought = waitFor(video, "seeked");
        video.currentTime = preciseTime;
        await sought;
      }
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context || canvas.width === 0 || canvas.height === 0) throw new Error("video_frame_unavailable");
      context.drawImage(video, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("frame_encode_failed")), "image/png"));
      const suffix = mode === "tail" ? "tail" : `${preciseTime.toFixed(2).replace(".", "-")}s`;
      const form = new FormData();
      form.set("file", new File([blob], `${source.displayName.replace(/\.[^.]+$/, "")}-frame-${suffix}.png`, { type: "image/png" }));
      form.set("kind", "first_frame");
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/assets`, { method: "POST", body: form, credentials: "same-origin" });
      if (!response.ok) throw new Error("frame_save_failed");
      setMessage(`${secondsLabel(preciseTime)}的画面已作为首帧 A 保存。`);
      router.refresh();
    } catch (error) {
      setMessage(`提取失败：${error instanceof Error ? error.message : "无法读取视频"}`);
    } finally {
      setBusy(false);
    }
  }

  if (!source) return null;
  return <section className={styles.extractorCard}>
    <div className={styles.extractorPreview}>
      <video controls key={source.id} muted onLoadedMetadata={(event) => { if (event.currentTarget.duration > 0) setDuration(event.currentTarget.duration); }} preload="metadata" ref={previewRef} src={source.contentUrl}/>
      <span>{mode === "tail" ? "尾帧" : secondsLabel(validTime ? requestedSeconds : 0)}</span>
    </div>
    <div className={styles.extractorControls}>
      <header><span>FRAME EXTRACTOR</span><h2>截取视频画面</h2><p>选择精确秒数或视频尾帧，高清保存为首帧 A。</p></header>
      <label className={styles.extractorSource}><span>来源视频</span><select disabled={busy} onChange={(event) => { setVideoId(event.target.value); setDuration(0); setSeconds("0"); setMessage(""); }} value={videoId}>{videos.map((video) => <option key={video.id} value={video.id}>{video.displayName}</option>)}</select></label>
      <div aria-label="截取方式" className={styles.extractorModes} role="group"><button aria-pressed={mode === "time"} data-active={mode === "time"} disabled={busy} onClick={() => setMode("time")} type="button">指定时间</button><button aria-pressed={mode === "tail"} data-active={mode === "tail"} disabled={busy} onClick={() => { setMode("tail"); if (previewRef.current && duration > 0) previewRef.current.currentTime = maxTime; }} type="button">尾帧</button></div>
      <div className={styles.extractorTime}>
        <label><span>截取时间（秒）</span><input aria-label="截取时间（秒）" disabled={busy || mode === "tail"} max={duration > 0 ? maxTime : undefined} min="0" onChange={(event) => updateTime(event.target.value)} step="0.01" type="number" value={seconds}/></label>
        <input aria-label="截取时间轴" disabled={busy || mode === "tail" || duration === 0} max={maxTime || 0} min="0" onChange={(event) => updateTime(event.target.value)} step="0.01" type="range" value={validTime ? Math.min(requestedSeconds, maxTime) : 0}/>
        <small>00:00.00 <span>{duration > 0 ? secondsLabel(duration) : "读取时长中…"}</span></small>
      </div>
      <footer><button disabled={busy || !videoId || duration === 0 || (mode === "time" && !validTime)} onClick={() => void extract()} type="button">{busy ? "正在提取…" : mode === "tail" ? "截取尾帧" : `截取 ${secondsLabel(validTime ? requestedSeconds : 0)}画面`}</button>{message ? <small aria-live="polite">{message}</small> : <small>PNG 原分辨率 · 保存到当前素材库</small>}</footer>
    </div>
  </section>;
}
