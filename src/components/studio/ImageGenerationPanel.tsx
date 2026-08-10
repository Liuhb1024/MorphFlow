"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import styles from "../../styles/studio.module.css";
import { matchedImageSize, sourceAspectLabel } from "./image-aspect";
import type { StudioAssetView } from "./StudioSectionPage";

export function ImageGenerationPanel({ projectId, images, target }: { projectId: string; images: readonly StudioAssetView[]; target?: StudioAssetView }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(() => images.map((item) => item.id));
  const [dimensions, setDimensions] = useState<Record<string, { width: number; height: number }>>({});
  const [prompt, setPrompt] = useState("");
  const [sizeMode, setSizeMode] = useState("match");
  const [quality, setQuality] = useState("high");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const ratioReference = images.find((image) => image.id === selected[0]);
  const sourceDimensions = ratioReference ? dimensions[ratioReference.id] : undefined;
  const matchedSize = sourceDimensions ? matchedImageSize(sourceDimensions.width, sourceDimensions.height) : "auto";
  const aspectLabel = sourceDimensions ? sourceAspectLabel(sourceDimensions.width, sourceDimensions.height) : "读取中";
  const size = sizeMode === "match" ? matchedSize : sizeMode;
  const previewAspect = sourceDimensions ? `${sourceDimensions.width} / ${sourceDimensions.height}` : undefined;
  const selectedImages = useMemo(() => selected.map((id) => images.find((image) => image.id === id)).filter((image): image is StudioAssetView => Boolean(image)), [images, selected]);

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
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/optimize-image-prompt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, referenceAssetIds: selected, aspectRatio: aspectLabel, confirmed: true }) });
      const body = await response.json() as { prompt?: string; error?: string };
      if (!response.ok || !body.prompt) throw new Error(body.error ?? "优化失败");
      setPrompt(body.prompt); setMessage("提示词已优化，你仍可继续修改再生成。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "优化失败"); }
    finally { setBusy(false); }
  }

  return <section className={styles.imageWorkspace}>
    <div className={styles.referencePanel}><div className={styles.panelHeader}><div><span>REFERENCES</span><h2>参考画面</h2></div><small>{selected.length} 张已选</small></div><div className={styles.referenceChoices}>{images.map((image) => { const active = selected.includes(image.id); const order = selected.indexOf(image.id); return <label data-selected={active ? "true" : "false"} key={image.id}><span className={styles.referenceThumb}><Image alt={image.displayName} fill onLoad={(event) => { const { naturalWidth: width, naturalHeight: height } = event.currentTarget; setDimensions((current) => current[image.id]?.width === width && current[image.id]?.height === height ? current : { ...current, [image.id]: { width, height } }); }} sizes="180px" src={image.contentUrl} unoptimized/></span><span className={styles.referenceChoiceText}><strong>{image.displayName}</strong><small>{dimensions[image.id] ? `${dimensions[image.id]?.width}×${dimensions[image.id]?.height}` : "读取图片尺寸…"}</small></span><input checked={active} onChange={(event) => setSelected((current) => event.target.checked ? [...current, image.id] : current.filter((id) => id !== image.id))} type="checkbox"/><em>{active ? order === 0 ? "比例基准" : `参考 ${order + 1}` : "选择"}</em></label>; })}</div>{images.length === 0 ? <div className={styles.panelEmpty}>请先到素材库上传参考图片</div> : null}</div>
    <div className={styles.promptPanel}><div className={styles.panelHeader}><div><span>GPT IMAGE 2 · REAL API</span><h2>创作目标画面 B</h2></div><span className={styles.unverifiedBadge}>¥0.30 / 次</span></div><label className={styles.largeField}><span>画面描述</span><textarea onChange={(event) => setPrompt(event.target.value)} placeholder="例如：保留人物身份、姿势与构图，将天空改造成紫蓝色能量裂隙；光线从右后方照亮轮廓，不增加其他人物。" rows={7} value={prompt}/><small>写清楚“保留什么、改变什么、禁止什么”，AI 导演会结合所选图片精修。</small></label><button className={styles.optimizeButton} disabled={busy || !prompt.trim() || selected.length === 0} onClick={() => void optimize()} type="button"><span className={styles.optimizeMark}>✦</span><span>AI 深度优化提示词</span><small>Gemini VLM · 会查看参考图</small></button><div className={styles.ratioSummary}><span>比例基准</span><strong>{ratioReference?.displayName ?? "请先选择参考图"}</strong><small>{sourceDimensions ? `${sourceDimensions.width}×${sourceDimensions.height} · ${aspectLabel} → ${size.replace("x", "×")}` : "正在读取原图比例，生成时默认保持一致"}</small></div><div className={styles.inlineFields}><label><span>输出比例与尺寸</span><select onChange={(event) => setSizeMode(event.target.value)} value={sizeMode}><option value="match">跟随第一张参考图 · {matchedSize.replace("x", "×")}</option><option value="1024x1024">方形 · 1024×1024</option><option value="1536x1024">横向 · 1536×1024</option><option value="1024x1536">竖向 · 1024×1536</option><option value="2048x1152">16:9 · 2048×1152</option><option value="1152x2048">9:16 · 1152×2048</option></select></label><label><span>渲染质量</span><select onChange={(event) => setQuality(event.target.value)} value={quality}><option value="low">低 · 快速草稿</option><option value="medium">中 · 平衡</option><option value="high">高 · 最佳细节</option><option value="auto">自动</option></select></label></div><div className={styles.costLine}><span><strong>本次生成</strong><small>{selectedImages.length} 张参考图 · {size.replace("x", "×")} · {quality === "high" ? "高质量" : quality}</small></span><strong>¥0.30</strong></div><button className={styles.primaryButtonWide} disabled={busy || !prompt.trim() || selected.length === 0} onClick={() => void generate()} type="button"><span>{busy ? "正在生成目标画面…" : "确认费用并生成"}</span>{busy ? null : <b>→</b>}</button>{message ? <small aria-live="polite" className={styles.honestNote}>{message}</small> : null}</div>
    <div className={styles.resultPanel}><div className={styles.panelHeader}><div><span>TARGET</span><h2>当前 B</h2></div><small>{target ? "本地结果" : "未生成"}</small></div>{target ? <div className={styles.targetImage} style={previewAspect ? { aspectRatio: previewAspect } : undefined}><Image alt={target.displayName} fill priority sizes="30vw" src={target.contentUrl} unoptimized/></div> : <div className={styles.panelEmpty} style={previewAspect ? { aspectRatio: previewAspect } : undefined}>生成结果会按参考图比例保存到本地素材库</div>}<p>{target?.displayName ?? "等待生成"}</p><small>新结果不会覆盖原始素材。</small></div>
  </section>;
}
