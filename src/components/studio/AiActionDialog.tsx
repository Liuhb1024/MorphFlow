"use client";

import { useEffect, useId, useRef } from "react";

import styles from "../../styles/studio.module.css";

export type AiActionPhase = "confirm" | "running" | "success" | "error";

export function AiActionDialog({
  open,
  phase,
  title,
  description,
  cost,
  facts,
  confirmLabel,
  progressLabel,
  statusMessage,
  onConfirm,
  onClose,
}: Readonly<{
  open: boolean;
  phase: AiActionPhase;
  title: string;
  description: string;
  cost: string;
  facts: readonly string[];
  confirmLabel: string;
  progressLabel: string;
  statusMessage: string;
  onConfirm: () => void;
  onClose: () => void;
}>) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open && phase !== "running") closeRef.current?.focus(); }, [open, phase]);
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && phase !== "running") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, phase, onClose]);
  if (!open) return null;

  const finished = phase === "success" || phase === "error";
  return <div className={styles.aiDialogLayer}>
    <button aria-label="关闭 AI 操作弹窗" className={styles.aiDialogBackdrop} disabled={phase === "running"} onClick={onClose} type="button"/>
    <section aria-labelledby={titleId} aria-modal="true" className={styles.aiDialog} role="dialog">
      <header><div className={styles.aiDialogMark} data-phase={phase}>{phase === "success" ? "✓" : phase === "error" ? "!" : "✦"}</div><div><span>REAL AI ACTION</span><h2 id={titleId}>{title}</h2></div><button aria-label="关闭" disabled={phase === "running"} onClick={onClose} ref={closeRef} type="button">×</button></header>
      {phase === "confirm" ? <><p>{description}</p><div className={styles.aiDialogFacts}>{facts.map((fact) => <span key={fact}>{fact}</span>)}</div><div className={styles.aiDialogCost}><span><strong>真实 API 调用</strong><small>确认后才会开始，不会重复提交</small></span><strong>{cost}</strong></div></> : null}
      {phase === "running" ? <div className={styles.aiDialogProgress}><div aria-label="AI 处理进度" aria-valuetext={progressLabel} role="progressbar"><i/></div><strong>{progressLabel}</strong><p>{statusMessage}</p><small>请求正在处理，请保持当前页面开启。</small></div> : null}
      {finished ? <div className={styles.aiDialogResult} data-phase={phase}><span>{phase === "success" ? "✓" : "!"}</span><strong>{phase === "success" ? statusMessage : "操作没有完成"}</strong>{phase === "error" ? <p>{statusMessage}</p> : null}</div> : null}
      <footer>{phase === "confirm" ? <><button onClick={onClose} type="button">返回修改</button><button onClick={onConfirm} type="button">{confirmLabel}</button></> : phase === "running" ? <span>正在安全等待模型响应…</span> : <><button onClick={onClose} type="button">关闭</button>{phase === "error" ? <button onClick={onConfirm} type="button">重新尝试</button> : null}</>}</footer>
    </section>
  </div>;
}
