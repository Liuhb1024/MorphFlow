"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import styles from "../../styles/studio.module.css";

type Job = { id: string; capabilityId: string; modelId: string; status: string; providerTaskId: string | null; resultUrl: string | null; errorCode: string | null; estimatedCostCny: number | null };
const LABEL: Record<string, string> = { submitting: "提交中", submitted: "等待生成", running: "生成中", succeeded: "已完成", failed: "失败", unknown: "需要确认" };

export function JobsPanel({ projectId }: { projectId: string }) {
  const [jobs, setJobs] = useState<Job[]>([]); const [loading, setLoading] = useState(true); const [message, setMessage] = useState("");
  async function load() { try { const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/video-jobs`, { cache: "no-store" }); const body = await response.json() as { tasks?: Job[]; error?: string }; if (!response.ok || !body.tasks) throw new Error(body.error ?? "读取任务失败"); setJobs(body.tasks); } catch (error) { setMessage(error instanceof Error ? error.message : "读取任务失败"); } finally { setLoading(false); } }
  useEffect(() => {
    let active = true;
    void fetch(`/api/projects/${encodeURIComponent(projectId)}/video-jobs`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { tasks?: Job[]; error?: string };
        if (!response.ok || !body.tasks) throw new Error(body.error ?? "读取任务失败");
        if (active) setJobs(body.tasks);
      })
      .catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : "读取任务失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId]);
  async function poll(id: string) { setMessage("正在查询；若已完成，会立即下载到本地…"); try { const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/video-jobs/${encodeURIComponent(id)}/poll`, { method: "POST" }); const body = await response.json() as { task?: Job; error?: string }; if (!response.ok || !body.task) throw new Error(body.error ?? "查询失败"); await load(); setMessage(body.task.status === "succeeded" ? "视频已下载到本地素材库。" : `当前状态：${LABEL[body.task.status] ?? body.task.status}`); } catch (error) { setMessage(error instanceof Error ? error.message : "查询失败"); } }
  if (loading) return <section className={styles.emptyState}><h2>正在读取任务…</h2></section>;
  if (jobs.length === 0) return <section className={styles.emptyState}><h2>还没有生成任务</h2><p>提交真实视频请求后，任务 ID、状态和本地结果会显示在这里。</p><Link className={styles.primaryAction} href={`/projects/${encodeURIComponent(projectId)}/generate`}>开始生成 <span>→</span></Link></section>;
  return <div className={styles.contentStack}>{message ? <div className={styles.pageNotice} aria-live="polite"><span>i</span><p>{message}</p></div> : null}<section className={styles.jobsToolbar}><strong>{jobs.length} 个真实任务</strong><button onClick={() => void load()} type="button">刷新列表</button></section><section className={styles.mediaGrid}>{jobs.map((job) => <article className={styles.mediaCard} key={job.id}>{job.resultUrl ? <video controls preload="metadata" src={job.resultUrl}/> : <div className={styles.realEmptyFrame}><strong>{LABEL[job.status] ?? job.status}</strong></div>}<div className={styles.mediaInfo}><div><h2>{job.modelId}</h2><p>{job.capabilityId}</p><small>Provider ID：{job.providerTaskId ?? "未取得"}</small>{job.estimatedCostCny !== null ? <small>估算 ¥{job.estimatedCostCny.toFixed(2)}</small> : null}{job.errorCode ? <small>错误：{job.errorCode}</small> : null}</div>{job.providerTaskId && !["failed", "succeeded"].includes(job.status) ? <button onClick={() => void poll(job.id)} type="button">查询并下载</button> : null}</div></article>)}</section></div>;
}
