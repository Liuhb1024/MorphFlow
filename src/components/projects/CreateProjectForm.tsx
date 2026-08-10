"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import styles from "../../styles/project-library.module.css";

export function CreateProjectForm({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    if (!name) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const body = await response.json() as { project?: { id?: string } };
      if (!response.ok || !body.project?.id) throw new Error("create_failed");
      router.push(`/projects/${encodeURIComponent(body.project.id)}/overview`);
      router.refresh();
    } catch {
      setError("无法创建项目，请检查本地数据目录。");
      setSubmitting(false);
    }
  }

  return <>
    <button className={styles.createButton} disabled={disabled} onClick={() => setOpen(true)} type="button"><span>＋</span>{disabled ? "本地存储不可用" : "新建创作空间"}</button>
    {open ? <div className={styles.modalBackdrop} onMouseDown={(event) => {
      if (!submitting && event.target === event.currentTarget) setOpen(false);
    }}>
      <form aria-labelledby="create-project-title" aria-modal="true" className={styles.dialog} onSubmit={submit} role="dialog">
        <button aria-label="关闭" className={styles.closeButton} disabled={submitting} onClick={() => setOpen(false)} type="button">×</button>
        <span className={styles.newProjectIcon}>＋</span>
        <h2 id="create-project-title">新建创作空间</h2>
        <p>素材、提示词和生成任务都会隔离保存在这个项目中。</p>
        <label><span>空间名称</span><input autoFocus maxLength={120} name="name" placeholder="例如：雨夜能量转场" required/></label>
        <label><span>说明（可选）</span><textarea maxLength={2000} name="description" placeholder="简单记录这次转场的目标" rows={3}/></label>
        {error ? <p aria-live="polite" className={styles.formError}>{error}</p> : null}
        <div className={styles.dialogActions}><button disabled={submitting} onClick={() => setOpen(false)} type="button">取消</button><button disabled={submitting} type="submit">{submitting ? "正在创建…" : "创建并进入"}</button></div>
      </form>
    </div> : null}
  </>;
}
