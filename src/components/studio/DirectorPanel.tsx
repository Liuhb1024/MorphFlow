"use client";

import Image from "next/image";
import { useState } from "react";

import styles from "../../styles/studio.module.css";
import { AiActionDialog, type AiActionPhase } from "./AiActionDialog";
import type { StudioAssetView } from "./StudioSectionPage";

function defaultFirst(images: readonly StudioAssetView[]): string {
  return images.find((image) => image.kind === "first_frame")?.id ?? images[0]?.id ?? "";
}

function defaultLast(images: readonly StudioAssetView[], firstId: string): string {
  return images.find((image) => image.id !== firstId && ["last_frame", "generated_image", "hand_drawn_image"].includes(image.kind))?.id
    ?? images.find((image) => image.id !== firstId)?.id
    ?? "";
}

export function DirectorPanel({ projectId, images }: { projectId: string; images: readonly StudioAssetView[] }) {
  const initialFirst = defaultFirst(images);
  const [firstId, setFirstId] = useState(initialFirst);
  const [lastId, setLastId] = useState(() => defaultLast(images, initialFirst));
  const [intent, setIntent] = useState("");
  const [advice, setAdvice] = useState("");
  const [targetModel, setTargetModel] = useState("kling-v3");
  const [duration, setDuration] = useState(5);
  const [audio, setAudio] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogPhase, setDialogPhase] = useState<AiActionPhase>("confirm");
  const [dialogMessage, setDialogMessage] = useState("");
  const firstFrame = images.find((image) => image.id === firstId);
  const lastFrame = images.find((image) => image.id === lastId);
  const frames = [firstFrame, lastFrame].filter((frame): frame is StudioAssetView => Boolean(frame));
  const frameSummary = firstFrame && lastFrame ? `${firstFrame.displayName} → ${lastFrame.displayName}` : firstFrame ? `${firstFrame.displayName} · 单图` : "纯文本导演";
  async function generate() {
    if (!intent.trim()) return;
    setDialogPhase("running"); setDialogMessage("正在分析输入画面、目标模型和镜头意图…");
    setBusy(true); setMessage("导演正在分析画面与意图…");
    try {
      const mode = frames.length >= 2 ? "first-last-frame" : "image-to-video";
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/director`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: intent.trim(), assetIds: frames.map((frame) => frame.id), capabilityId: `${targetModel}:${mode}`, duration, audio, confirmed: true }) });
      const body = await response.json() as { advice?: string; error?: string };
      if (!response.ok || !body.advice) throw new Error(body.error ?? "director_failed");
      setAdvice(body.advice); setMessage("导演建议已生成，可以继续手工修改并复制到生成页。"); setDialogMessage("视频导演提示词已生成"); setDialogPhase("success");
    } catch (error) { const failure = error instanceof Error ? error.message : "请检查 Key 和模型权限"; setMessage(`导演调用失败：${failure}`); setDialogMessage(failure); setDialogPhase("error"); }
    finally { setBusy(false); }
  }
  return <section className={styles.directorGrid}>
    <section className={styles.directorFramePicker}><header><div><span>SHOT INPUTS</span><h2>选择导演参考画面</h2></div><small>{frames.length === 2 ? "首尾帧模式" : frames.length === 1 ? "单图生视频模式" : "纯文本模式"}</small></header><div className={styles.directorFrameSlots}><label><span><b>A</b><strong>首帧 A</strong></span><select aria-label="首帧 A" disabled={busy} onChange={(event) => { const next = event.target.value; setFirstId(next); if (!next || next === lastId) setLastId(""); }} value={firstId}><option value="">不使用图片</option>{images.map((image) => <option key={image.id} value={image.id}>{image.displayName}</option>)}</select>{firstFrame ? <div className={styles.directorFramePreview}><Image alt={firstFrame.displayName} fill sizes="(max-width: 800px) 90vw, 36vw" src={firstFrame.contentUrl} unoptimized/><em>首帧 A</em></div> : <div className={styles.directorFrameEmpty}>未选择首帧</div>}</label><i>→</i><label><span><b>B</b><strong>尾帧 B</strong></span><select aria-label="尾帧 B" disabled={busy || !firstId} onChange={(event) => setLastId(event.target.value)} value={lastId}><option value="">不使用尾帧 · 单图生视频</option>{images.map((image) => <option disabled={image.id === firstId} key={image.id} value={image.id}>{image.displayName}</option>)}</select>{lastFrame ? <div className={styles.directorFramePreview}><Image alt={lastFrame.displayName} fill sizes="(max-width: 800px) 90vw, 36vw" src={lastFrame.contentUrl} unoptimized/><em>尾帧 B</em></div> : <div className={styles.directorFrameEmpty}>{images.length ? "未选择尾帧" : "素材库暂无图片"}</div>}</label></div></section>
    <div className={styles.scriptEditor}><div className={styles.panelHeader}><div><span>WORKING PROMPT</span><h2>镜头意图与导演结果</h2></div><span className={styles.savedLocal}>{advice ? "已生成" : "待输入"}</span></div><label className={styles.largeField}><span>你的创作意图</span><textarea onChange={(event) => setIntent(event.target.value)} placeholder="描述想要的转场、运动、节奏和绝对不能改变的主体细节" rows={6} value={intent}/></label><label className={styles.largeField}><span>Gemini 导演提示词</span><textarea onChange={(event) => setAdvice(event.target.value)} placeholder="生成结果会出现在这里，你可以继续编辑" rows={9} value={advice}/></label>{advice ? <button className={styles.dashedButton} onClick={() => void navigator.clipboard.writeText(advice)} type="button">复制提示词</button> : null}</div>
    <aside className={styles.vlmPanel}><div className={styles.panelHeader}><div><span>GEMINI · REAL API</span><h2>VLM 导演</h2></div></div><p>按你选择的 A、B 顺序分析真实图片，并按目标视频模型、时长与音频能力组织镜头提示词。</p><div className={styles.directorInputSummary}><span>{frames.length === 2 ? "A → B" : frames.length === 1 ? "A" : "TEXT"}</span><div><strong>{frameSummary}</strong><small>{frames.length === 2 ? "连续首尾帧约束" : frames.length === 1 ? "根据首帧设计运动" : "不包含视觉参考"}</small></div></div><div className={styles.directorOptions}><label><span>目标视频模型</span><select onChange={(event) => setTargetModel(event.target.value)} value={targetModel}><option value="kling-v3">可灵 Kling</option><option value="vidu-q3-pro">Vidu Q3 Pro</option><option value="paiwo-v5.6-itv">Paiwo v5.6</option><option value="minimax-hailuo-2.3">MiniMax Hailuo</option><option value="happyhorse-i2v">HappyHorse</option></select></label><label><span>目标时长</span><input max={30} min={1} onChange={(event) => setDuration(Number(event.target.value))} type="number" value={duration}/></label><label className={styles.directorAudio}><input checked={audio} onChange={(event) => setAudio(event.target.checked)} type="checkbox"/><span>目标模式启用音频</span></label></div><button className={styles.primaryButtonWide} disabled={busy || !intent.trim()} onClick={() => { setDialogOpen(true); setDialogPhase("confirm"); setDialogMessage(""); }} type="button">{busy ? "正在分析…" : "确认并生成导演建议"}</button>{busy ? <div className={styles.inlineAiProgress}><span><i/></span><strong>{message}</strong></div> : <small aria-live="polite" className={styles.honestNote}>{message || "调用前会再次确认真实费用。"}</small>}</aside>
    <AiActionDialog confirmLabel="确认并开始生成" cost="价格待账单确认" description="Gemini VLM 将读取当前镜头意图和你选择的参考画面，生成适配目标视频模型的提示词。" facts={[frameSummary, targetModel, `${duration} 秒`, audio ? "包含音频提示" : "纯视觉提示"]} onClose={() => { if (!busy) setDialogOpen(false); }} onConfirm={() => void generate()} open={dialogOpen} phase={dialogPhase} progressLabel="正在生成视频导演提示词" statusMessage={dialogMessage} title="生成视频导演提示词"/>
  </section>;
}
