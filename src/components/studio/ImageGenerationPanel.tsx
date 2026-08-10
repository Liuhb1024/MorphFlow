"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "../../styles/studio.module.css";
import type { StudioAssetView } from "./StudioSectionPage";

export function ImageGenerationPanel({ projectId, images, target }: { projectId: string; images: readonly StudioAssetView[]; target?: StudioAssetView }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(() => images.map((item) => item.id));
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("2048x1152");
  const [quality, setQuality] = useState("high");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function generate() {
    if (!prompt.trim() || selected.length === 0) return;
    if (!window.confirm("确认调用 GPT Image 2？预计费用 ¥0.30，本次会产生真实 API 费用。")) return;
    setBusy(true); setMessage("正在生成目标画面，请不要关闭页面…");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceAssetIds: selected, prompt: prompt.trim(), size, quality, background: "auto", outputFormat: "png", confirmCostCny: 0.3 }),
      });
      const body = await response.json() as { asset?: { displayName?: string }; error?: string };
      if (!response.ok || !body.asset) throw new Error(body.error ?? "generation_failed");
      setMessage(`生成完成：${body.asset.displayName ?? "新目标画面"}`);
      router.refresh();
    } catch (error) {
      setMessage(`生成失败：${error instanceof Error ? error.message : "请检查 Key、余额和模型权限"}`);
    } finally { setBusy(false); }
  }

  async function optimize() {
    if (!prompt.trim() || !window.confirm("将调用 Gemini 优化这段提示词，可能产生少量费用。继续？")) return;
    setBusy(true); setMessage("正在按 GPT Image 2 的提示词结构优化…");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/optimize-image-prompt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, confirmed: true }) });
      const body = await response.json() as { prompt?: string; error?: string };
      if (!response.ok || !body.prompt) throw new Error(body.error ?? "优化失败");
      setPrompt(body.prompt); setMessage("提示词已优化，你仍可继续修改再生成。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "优化失败"); }
    finally { setBusy(false); }
  }

  return <section className={styles.imageWorkspace}>
    <div className={styles.referencePanel}><div className={styles.panelHeader}><div><span>REFERENCES</span><h2>参考画面</h2></div><small>{selected.length} 张已选</small></div><div className={styles.vlmInputs}>{images.map((image) => <label key={image.id}><Image alt={image.displayName} height={72} src={image.contentUrl} width={128}/><input checked={selected.includes(image.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, image.id] : current.filter((id) => id !== image.id))} type="checkbox"/><span>{image.displayName}</span></label>)}</div>{images.length === 0 ? <div className={styles.panelEmpty}>请先到素材库上传参考图片</div> : null}</div>
    <div className={styles.promptPanel}><div className={styles.panelHeader}><div><span>GPT IMAGE 2 · REAL API</span><h2>创作目标画面 B</h2></div><span className={styles.unverifiedBadge}>¥0.30 / 次</span></div><label className={styles.largeField}><span>画面描述</span><textarea onChange={(event) => setPrompt(event.target.value)} placeholder="描述要保留什么、改变什么，以及最终的光线、构图和效果" rows={7} value={prompt}/><small>点击生成后会先显示真实费用确认。</small></label><button className={styles.dashedButton} disabled={busy || !prompt.trim()} onClick={() => void optimize()} type="button">AI 优化提示词</button><div className={styles.inlineFields}><label><span>输出尺寸</span><select onChange={(event) => setSize(event.target.value)} value={size}><option value="1024x1024">1024×1024</option><option value="1536x1024">1536×1024</option><option value="1024x1536">1024×1536</option><option value="2048x1152">2048×1152</option><option value="3840x2160">3840×2160</option></select></label><label><span>渲染质量</span><select onChange={(event) => setQuality(event.target.value)} value={quality}><option value="low">低 · 快速草稿</option><option value="medium">中</option><option value="high">高</option><option value="auto">自动</option></select></label></div><button className={styles.primaryButtonWide} disabled={busy || !prompt.trim() || selected.length === 0} onClick={() => void generate()} type="button">{busy ? "正在生成…" : "确认费用并生成目标画面"}</button>{message ? <small aria-live="polite" className={styles.honestNote}>{message}</small> : null}</div>
    <div className={styles.resultPanel}><div className={styles.panelHeader}><div><span>TARGET</span><h2>当前 B</h2></div><small>{target ? "本地结果" : "未生成"}</small></div>{target ? <div className={styles.targetImage}><Image alt={target.displayName} fill priority sizes="30vw" src={target.contentUrl}/></div> : <div className={styles.panelEmpty}>生成结果会安全保存到本地素材库</div>}<p>{target?.displayName ?? "等待生成"}</p><small>新结果不会覆盖原始素材。</small></div>
  </section>;
}
