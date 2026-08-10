"use client";

import Image from "next/image";
import Link from "next/link";
import {
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { StudioIcon, StudioShell } from "../studio";
import styles from "../../styles/workbench.module.css";
import type {
  AssetView,
  CapabilityView,
  ParameterFieldView,
  ParameterValue,
  ParameterValues,
  PricingView,
  ValidationIssue,
  WorkbenchViewModel,
} from "./types";
import { defaultsFor, validateDraft } from "./validation";

function providerId(capability: CapabilityView) {
  return capability.modelId.split("-")[0]?.toLowerCase() || "other";
}

function providerLabel(id: string) {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function uniqueBy<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function StageFrame({ asset, label }: { asset: AssetView; label: "A" | "B" }) {
  return (
    <figure className={styles.stageFrame}>
      <Image alt={asset.alt} fill priority sizes="(max-width: 1000px) 50vw, 35vw" src={asset.src}/>
      <figcaption><span data-frame-label>{label}</span><div><strong>{asset.label}</strong><small>{asset.sourceLabel}</small></div></figcaption>
    </figure>
  );
}

function GenerationStage({ capability, assets }: { capability: CapabilityView; assets: AssetView[] }) {
  const first = assets.find((asset) => asset.role === "first-frame");
  const last = assets.find((asset) => asset.role === "last-frame");
  const needsLast = capability.inputSlots.some((slot) => slot.id === "lastFrame");

  return (
    <section className={styles.stageCard} aria-labelledby="stage-heading">
      <div className={styles.stageToolbar}>
        <div><span>PREVIEW</span><h2 id="stage-heading">转场预览</h2></div>
        <div className={styles.previewControls}><span>并排预览</span><span>16:9</span></div>
      </div>
      <div className={styles.transitionLine} aria-label={needsLast ? "A 到 B 连续转场" : "从 A 开放生成"}>
        <span>A</span><i/><small>{needsLast ? "连续转场" : "开放终点"}</small><i/><span>{needsLast ? "B" : "∞"}</span>
      </div>
      <div className={styles.stageFrames} data-single={needsLast ? "false" : "true"}>
        {first ? <StageFrame asset={first} label="A"/> : <div className={styles.missingFrame}>缺少首帧 A</div>}
        {needsLast && last ? <StageFrame asset={last} label="B"/> : <div className={styles.openFrame}><StudioIcon name="spark" size={20}/><strong>由提示词引导终点</strong><p>当前模式只会发送首帧 A。</p></div>}
      </div>
      <div className={styles.scrubber}><span>00:00</span><div><i/></div><span>00:05</span></div>
    </section>
  );
}

function AssetStrip({ assets, bindings, capability, onBinding, projectId }: { assets: AssetView[]; bindings: Record<string, string[]>; capability: CapabilityView; onBinding: (slotId: string, assetIds: string[]) => void; projectId: string }) {
  return (
    <section className={styles.assetStrip} aria-labelledby="generation-assets">
      <div className={styles.blockTitle}><div><span>INPUTS</span><h2 id="generation-assets">生成素材</h2></div><small>{capability.inputSlots.length} 个必需输入</small></div>
      <div className={styles.assetRow}>
        {capability.inputSlots.map((slot) => {
          const compatible = assets.filter((item) => slot.accepts.includes(item.mediaType));
          const selected = bindings[slot.id] ?? [];
          const asset = assets.find((item) => item.id === selected[0]);
          return (
            <div className={styles.boundAsset} key={slot.id}>
              {asset ? <Image alt="" height={76} src={asset.src} width={135}/> : <span className={styles.assetPlaceholder}/>}
              <div><span data-slot-name>{slot.label}</span><strong>{asset?.label ?? "尚未绑定"}</strong><small>{asset?.sourceLabel ?? "请选择本地素材"}</small></div>
              <select aria-label={slot.label} multiple={slot.maxItems !== 1} onChange={(event) => onBinding(slot.id, Array.from(event.currentTarget.selectedOptions, (option) => option.value).filter(Boolean))} value={slot.maxItems === 1 ? selected[0] ?? "" : selected}>
                {slot.maxItems === 1 ? <option value="">请选择素材</option> : null}
                {compatible.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
              <em data-ready={selected.length > 0 ? "true" : "false"}>{selected.length > 0 ? `已选 ${selected.length}` : slot.required ? "必需" : "可选"}</em>
            </div>
          );
        })}
        <Link className={styles.referenceButton} href={`/projects/${encodeURIComponent(projectId)}/media`}><StudioIcon name="plus" size={16}/><span><strong>上传或管理素材</strong><small>图片 / 视频 / 手绘</small></span></Link>
      </div>
    </section>
  );
}

function CapabilityPicker({ capabilities, capability, onChange }: { capabilities: CapabilityView[]; capability: CapabilityView; onChange: (next: CapabilityView) => void }) {
  const providers = uniqueBy(capabilities, providerId).map((item) => providerId(item));
  const selectedProvider = providerId(capability);
  const providerCapabilities = capabilities.filter((item) => providerId(item) === selectedProvider);
  const models = uniqueBy(providerCapabilities, (item) => item.modelId);
  const modes = uniqueBy(providerCapabilities.filter((item) => item.modelId === capability.modelId), (item) => item.modeId);

  function selectProvider(event: ChangeEvent<HTMLSelectElement>) {
    const next = capabilities.find((item) => providerId(item) === event.target.value);
    if (next) onChange(next);
  }

  function selectModel(event: ChangeEvent<HTMLSelectElement>) {
    const sameMode = providerCapabilities.find((item) => item.modelId === event.target.value && item.modeId === capability.modeId);
    const next = sameMode ?? providerCapabilities.find((item) => item.modelId === event.target.value);
    if (next) onChange(next);
  }

  function selectMode(event: ChangeEvent<HTMLSelectElement>) {
    const next = providerCapabilities.find((item) => item.modelId === capability.modelId && item.modeId === event.target.value);
    if (next) onChange(next);
  }

  return (
    <section className={styles.inspectorSection}>
      <div className={styles.inspectorTitle}><span>01</span><div><h2>模型与模式</h2><p>选项来自 capability registry</p></div></div>
      <div className={styles.pickerFields}>
        <label><span>Provider</span><select aria-label="Provider" onChange={selectProvider} value={selectedProvider}>{providers.map((id) => <option key={id} value={id}>{providerLabel(id)}</option>)}</select></label>
        <label><span>视频模型</span><select aria-label="视频模型" onChange={selectModel} value={capability.modelId}>{models.map((item) => <option disabled={item.verification === "disabled"} key={item.modelId} value={item.modelId}>{item.modelLabel}{item.verification === "disabled" ? " · 暂不可用" : ""}</option>)}</select></label>
        <label><span>生成模式</span><select aria-label="Capability 模式" onChange={selectMode} value={capability.modeId}>{modes.map((item) => <option disabled={item.verification === "disabled"} key={item.modeId} value={item.modeId}>{item.modeLabel}{item.verification === "disabled" ? " · 暂不可用" : ""}</option>)}</select></label>
      </div>
      <div className={styles.capabilityMeta}><span>{capability.verification === "tested" ? "已完成真实测试" : capability.verification === "disabled" ? "当前不可用" : "文档支持 · 未实测"}</span><code>{capability.definitionVersion}</code></div>
    </section>
  );
}

function relatedIssues(fieldId: string, issues: ValidationIssue[]) {
  return issues.filter((issue) => issue.fieldIds.includes(fieldId));
}

function ParameterField({ field, value, issues, onChange }: { field: ParameterFieldView; value: ParameterValue; issues: ValidationIssue[]; onChange: (value: ParameterValue) => void }) {
  const baseId = useId();
  const inputId = `${baseId}-${field.id}`;
  const helpId = `${inputId}-help`;
  const fieldIssues = relatedIssues(field.id, issues);
  const errorId = `${inputId}-error`;
  const invalid = fieldIssues.some((issue) => issue.severity === "error");
  const describedBy = `${helpId}${fieldIssues.length ? ` ${errorId}` : ""}`;
  let control: ReactNode;

  if (field.kind === "enum") {
    control = <select aria-describedby={describedBy} aria-invalid={invalid} disabled={field.disabled} id={inputId} onChange={(event) => { const option = field.options.find((item) => String(item.value) === event.target.value); onChange(option?.value ?? event.target.value); }} value={String(value)}>{field.options.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}</select>;
  } else if (field.kind === "boolean") {
    control = <label className={styles.toggle}><input aria-describedby={describedBy} checked={Boolean(value)} disabled={field.disabled} id={inputId} onChange={(event) => onChange(event.target.checked)} type="checkbox"/><span/><em>{value ? "开启" : "关闭"}</em></label>;
  } else if (field.kind === "shot-list") {
    const shots = Array.isArray(value) ? value : field.defaultValue;
    control = (
      <div className={styles.shotList} id={inputId}>
        {shots.map((shot, index) => (
          <div className={styles.shotRow} key={`${index}-${shot.duration}`}>
            <span>{String(index + 1).padStart(2,"0")}</span>
            <input aria-label={`分镜 ${index + 1} 提示词`} disabled={field.disabled} maxLength={field.promptMaxLength} onChange={(event) => onChange(shots.map((item, shotIndex) => shotIndex === index ? { ...item, prompt: event.target.value } : item))} type="text" value={shot.prompt}/>
            <label><input aria-label={`分镜 ${index + 1} 时长`} disabled={field.disabled} min={1} onChange={(event) => onChange(shots.map((item, shotIndex) => shotIndex === index ? { ...item, duration: Number(event.target.value) } : item))} type="number" value={shot.duration}/><small>秒</small></label>
            <button aria-label={`删除分镜 ${index + 1}`} disabled={field.disabled || shots.length <= field.minItems} onClick={() => onChange(shots.filter((_, shotIndex) => shotIndex !== index))} type="button">×</button>
          </div>
        ))}
        <button disabled={field.disabled || shots.length >= field.maxItems} onClick={() => onChange([...shots, { prompt: "", duration: 1 }])} type="button">＋ 添加分镜</button>
      </div>
    );
  } else if (field.kind === "number") {
    control = <input aria-describedby={describedBy} aria-invalid={invalid} disabled={field.disabled} id={inputId} inputMode="numeric" max={field.max} min={field.min} onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))} step={field.step ?? (field.integer ? 1 : "any")} type="number" value={value as string | number}/>;
  } else {
    const props = { "aria-describedby": describedBy, "aria-invalid": invalid, disabled: field.disabled, id: inputId, onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value), value: String(value) };
    control = field.multiline ? <textarea {...props} rows={field.id === "prompt" ? 5 : 3}/> : <input {...props} type="text"/>;
  }

  return (
    <div className={styles.parameterField} data-invalid={invalid ? "true" : "false"}>
      <div><label htmlFor={inputId}>{field.label}</label>{field.kind === "text" && field.required ? <span>必填</span> : null}</div>
      {control}<p id={helpId}>{field.description}</p>
      {field.disabledReason ? <p className={styles.fieldBoundary}>{field.disabledReason}</p> : null}
      {field.kind === "boolean" && field.warning ? <p className={styles.fieldWarning}>{field.warning}</p> : null}
      {fieldIssues.length ? <p className={styles.fieldError} id={errorId}>{fieldIssues[0]?.message}</p> : null}
    </div>
  );
}

function ParameterForm({ capability, values, issues, onChange }: { capability: CapabilityView; values: ParameterValues; issues: ValidationIssue[]; onChange: (id: string, value: ParameterValue) => void }) {
  const fields = capability.fields.filter((field): field is ParameterFieldView => Boolean(field));
  const common = fields.filter((field) => field.group === "common");
  const advanced = fields.filter((field) => field.group === "advanced");
  const render = (field: ParameterFieldView) => <ParameterField field={field} issues={issues} key={field.id} onChange={(value) => onChange(field.id,value)} value={values[field.id] ?? field.defaultValue}/>;
  return (
    <section className={styles.inspectorSection}>
      <div className={styles.inspectorTitle}><span>02</span><div><h2>生成参数</h2><p>{fields.length} 个模型字段</p></div></div>
      <div className={styles.parameterList}>{common.map(render)}</div>
      <details className={styles.advanced}><summary><span>高级参数</span><small>{advanced.length} 项</small></summary><div className={styles.parameterList}>{advanced.map(render)}</div></details>
      {capability.omittedFieldNote ? <p className={styles.fieldBoundary}>{capability.omittedFieldNote}</p> : null}
    </section>
  );
}

function PriceCard({ pricing }: { pricing: PricingView }) {
  const value = pricing.kind === "exact" ? `¥${pricing.amountCny.toFixed(2)}` : pricing.kind === "range" ? `¥${pricing.minCny.toFixed(2)}–${pricing.maxCny.toFixed(2)}` : "待确认";
  const detail = pricing.kind === "unknown" ? pricing.reason : pricing.evidenceLabel;
  return <div className={styles.priceCard}><span><strong>预计费用</strong><small>{detail}</small></span><strong>{value}</strong></div>;
}

function ReviewDialog({ open, capability, values, bindings, projectId, onClose, returnRef }: { open: boolean; capability: CapabilityView; values: ParameterValues; bindings: Record<string, string[]>; projectId: string; onClose: () => void; returnRef: React.RefObject<HTMLButtonElement | null> }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ id: string } | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!open) return;
    const target = returnRef.current;
    closeRef.current?.focus();
    return () => target?.focus();
  }, [open, returnRef]);
  if (!open) return null;
  function keyDown(event: ReactKeyboardEvent<HTMLDivElement>) { if (event.key === "Escape") { event.preventDefault(); onClose(); } }
  async function submit() {
    setSubmitting(true); setMessage("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/video-jobs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ capabilityId: capability.id, values, bindings, confirmed: true }) });
      const body = await response.json() as { task?: { id: string }; error?: string };
      if (!response.ok || !body.task) throw new Error(body.error ?? "提交失败");
      setResult(body.task); setMessage("任务已真实提交，Provider task ID 已安全保存。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "提交失败"); }
    finally { setSubmitting(false); }
  }
  return (
    <div className={styles.dialogLayer}><button aria-label="关闭复核弹层" className={styles.dialogBackdrop} onClick={onClose} type="button"/><div aria-describedby="review-description" aria-labelledby="review-title" aria-modal="true" className={styles.dialog} onKeyDown={keyDown} role="dialog"><div className={styles.dialogHeader}><div><span>提交前检查</span><h2 id="review-title">生成配置复核</h2></div><button aria-label="关闭复核" onClick={onClose} ref={closeRef} type="button">×</button></div><p id="review-description">确认后会立即调用真实模型并产生对应费用；异步 task ID 会先保存，再进入查询。</p><dl><div><dt>Provider</dt><dd>{providerLabel(providerId(capability))}</dd></div><div><dt>模型</dt><dd>{capability.modelLabel}</dd></div><div><dt>模式</dt><dd>{capability.modeLabel}</dd></div><div><dt>输入</dt><dd>{capability.inputSlots.map((slot) => `${slot.label} ${bindings[slot.id]?.length ?? 0} 项`).join(" + ") || "纯文本"}</dd></div><div><dt>时长</dt><dd>{String(values.duration)} 秒</dd></div><div><dt>分辨率</dt><dd>{String(values.resolution ?? values.modelMode ?? "由模型决定")}</dd></div></dl><div className={styles.dialogNotice}><StudioIcon name="settings" size={17}/><span><strong>真实付费请求</strong><small>{capability.pricing.kind === "exact" ? `预计 ¥${capability.pricing.amountCny.toFixed(2)}` : capability.pricing.kind === "range" ? `预计 ¥${capability.pricing.minCny.toFixed(2)}–¥${capability.pricing.maxCny.toFixed(2)}` : "当前文档无法精确估价"}</small></span></div>{message ? <p aria-live="polite">{message}</p> : null}<div className={styles.dialogActions}>{result ? <Link href={`/projects/${encodeURIComponent(projectId)}/jobs`}>查看任务</Link> : <><button onClick={onClose} type="button">返回调整</button><button disabled={submitting} onClick={() => void submit()} type="button">{submitting ? "正在提交…" : "确认费用并提交"}</button></>}</div></div></div>
  );
}

function GenerationInspector({ capabilities, capability, values, issues, inputsValid, onCapability, onValue, onReview, reviewRef }: { capabilities: CapabilityView[]; capability: CapabilityView; values: ParameterValues; issues: ValidationIssue[]; inputsValid: boolean; onCapability: (next: CapabilityView) => void; onValue: (id: string, value: ParameterValue) => void; onReview: () => void; reviewRef: React.RefObject<HTMLButtonElement | null> }) {
  const errors = issues.filter((issue) => issue.severity === "error");
  const unavailable = capability.verification === "disabled";
  return (
    <aside className={styles.inspector} aria-label="生成检查器">
      <CapabilityPicker capabilities={capabilities} capability={capability} onChange={onCapability}/>
      <ParameterForm capability={capability} issues={issues} onChange={onValue} values={values}/>
      <div className={styles.reviewBar}>
        <div className={styles.validationState} data-valid={errors.length === 0 && !unavailable ? "true" : "false"}><span>{errors.length === 0 && !unavailable ? "✓" : "!"}</span><div><strong>{unavailable ? "当前 capability 不可用" : errors.length === 0 ? "参数检查通过" : `${errors.length} 项需要调整`}</strong><small>{unavailable ? "请切换到文档支持或已实测的模型模式" : errors[0]?.message ?? "可以进入配置复核"}</small></div></div>
        <PriceCard pricing={capability.pricing}/>
        <button disabled={errors.length > 0 || unavailable || !inputsValid} onClick={onReview} ref={reviewRef} type="button">检查并生成 <span>→</span></button>
        <p>{inputsValid ? "真实项目配置 · 将提交真实付费请求" : "请先为所有必需输入选择素材"}</p>
      </div>
    </aside>
  );
}

export function WorkbenchShell({ view }: { view: WorkbenchViewModel }) {
  const initial = view.capabilities.find((item) => item.id === view.initialCapabilityId) ?? view.capabilities[0];
  if (!initial) throw new Error("WorkbenchShell requires at least one capability view.");
  const [capability, setCapability] = useState(initial);
  const [values, setValues] = useState<ParameterValues>(() => defaultsFor(initial));
  const initialBindings = (item: CapabilityView) => Object.fromEntries(item.inputSlots.map((slot) => [slot.id, slot.assetId ? [slot.assetId] : []]));
  const [bindings, setBindings] = useState<Record<string, string[]>>(() => initialBindings(initial));
  const [reviewOpen, setReviewOpen] = useState(false);
  const reviewRef = useRef<HTMLButtonElement>(null);
  const issues = useMemo(() => validateDraft(capability, values), [capability, values]);

  function changeCapability(next: CapabilityView) { setCapability(next); setValues(defaultsFor(next)); setBindings(initialBindings(next)); }
  const inputsValid = capability.inputSlots.every((slot) => {
    const count = bindings[slot.id]?.length ?? 0;
    return (!slot.required || count > 0) && (slot.maxItems === null || count <= slot.maxItems);
  }) && (capability.modeId !== "multimodal-reference" || Object.values(bindings).some((ids) => ids.length > 0));

  return (
    <StudioShell active="generate" description="选择当前空间的真实输入、模型和完整参数。" flush projectId={view.project.id} projectName={view.project.name} title="生成视频">
      <div className={styles.generationLayout}>
        <div className={styles.generationCanvas}>
          <div className={styles.statusBanner}><span>真实空间</span><p>素材来自本地 SQLite；确认后会调用所选真实视频模型。</p></div>
          <GenerationStage assets={view.assets} capability={capability}/>
          <AssetStrip assets={view.assets} bindings={bindings} capability={capability} onBinding={(slotId, assetIds) => setBindings((current) => ({ ...current, [slotId]: assetIds }))} projectId={view.project.id}/>
        </div>
        <GenerationInspector capabilities={view.capabilities} capability={capability} inputsValid={inputsValid} issues={issues} onCapability={changeCapability} onReview={() => setReviewOpen(true)} onValue={(id,value) => setValues((current) => ({...current,[id]:value}))} reviewRef={reviewRef} values={values}/>
      </div>
      <ReviewDialog bindings={bindings} capability={capability} onClose={() => setReviewOpen(false)} open={reviewOpen} projectId={view.project.id} returnRef={reviewRef} values={values}/>
    </StudioShell>
  );
}
