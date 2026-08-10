"use client";

import Image from "next/image";
import { useState } from "react";

import styles from "../../styles/studio.module.css";
import type { StudioAssetView } from "./StudioSectionPage";

export function DirectorPanel({ projectId, frames }: { projectId: string; frames: readonly StudioAssetView[] }) {
  const [intent, setIntent] = useState("");
  const [advice, setAdvice] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function generate() {
    if (!intent.trim()) return;
    if (!window.confirm("确认调用 Gemini 3.6 Flash 导演？本次会产生真实 API 费用，当前单价尚待 DMXAPI 账单确认。")) return;
    setBusy(true); setMessage("导演正在分析画面与意图…");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/director`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: intent.trim(), assetIds: frames.map((frame) => frame.id), confirmed: true }) });
      const body = await response.json() as { advice?: string; error?: string };
      if (!response.ok || !body.advice) throw new Error(body.error ?? "director_failed");
      setAdvice(body.advice); setMessage("导演建议已生成，可以继续手工修改并复制到生成页。");
    } catch (error) { setMessage(`导演调用失败：${error instanceof Error ? error.message : "请检查 Key 和模型权限"}`); }
    finally { setBusy(false); }
  }
  return <section className={styles.directorGrid}>
    <div className={styles.scriptEditor}><div className={styles.panelHeader}><div><span>WORKING PROMPT</span><h2>镜头意图与导演结果</h2></div><span className={styles.savedLocal}>{advice ? "已生成" : "待输入"}</span></div><label className={styles.largeField}><span>你的创作意图</span><textarea onChange={(event) => setIntent(event.target.value)} placeholder="描述想要的转场、运动、节奏和绝对不能改变的主体细节" rows={6} value={intent}/></label><label className={styles.largeField}><span>Gemini 导演提示词</span><textarea onChange={(event) => setAdvice(event.target.value)} placeholder="生成结果会出现在这里，你可以继续编辑" rows={9} value={advice}/></label>{advice ? <button className={styles.dashedButton} onClick={() => void navigator.clipboard.writeText(advice)} type="button">复制提示词</button> : null}</div>
    <aside className={styles.vlmPanel}><div className={styles.panelHeader}><div><span>GEMINI · REAL API</span><h2>VLM 导演</h2></div></div><p>按 A、B 顺序分析当前真实图片，并结合你的意图生成视频镜头提示词。</p><div className={styles.vlmInputs}>{frames.map((frame, index) => <div key={frame.id}><Image alt={frame.displayName} height={72} src={frame.contentUrl} width={128}/><span>{index === 0 ? "A" : index === 1 ? "B" : `R${index - 1}`}</span></div>)}{frames.length === 0 ? <div className={styles.miniEmpty}>没有图片也可做纯文本导演</div> : null}</div><button className={styles.primaryButtonWide} disabled={busy || !intent.trim()} onClick={() => void generate()} type="button">{busy ? "正在分析…" : "确认并生成导演建议"}</button><small aria-live="polite" className={styles.honestNote}>{message || "调用前会再次确认真实费用。"}</small></aside>
  </section>;
}
