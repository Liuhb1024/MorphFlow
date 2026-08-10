"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { ProjectSummaryDto } from "@/server/dal/projects";

import styles from "../../styles/project-library.module.css";
import { CreateProjectForm } from "./CreateProjectForm";

function formatDate(value: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function projectTone(id: string): number {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % 5;
}

type ProjectDialog = Readonly<{
  kind: "rename" | "delete";
  project: ProjectSummaryDto;
}>;

function FolderIcon({ open = false }: { open?: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d={open ? "M3.5 7.5h6l1.7 2H21l-2.2 8.5H5.3z" : "M3.5 6.5h6l1.8 2H20.5v9.5h-17z"}/></svg>;
}

export function ProjectLibrary({ projects, unavailable = false }: { projects: readonly ProjectSummaryDto[]; unavailable?: boolean }) {
  const [items, setItems] = useState([...projects]);
  const [query, setQuery] = useState("");
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ProjectDialog | null>(null);
  const [draftName, setDraftName] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const visibleProjects = useMemo(() => {
    const normalized = query.normalize("NFC").trim().toLocaleLowerCase("zh-CN");
    if (!normalized) return items;
    return items.filter((project) =>
      `${project.name} ${project.description}`.toLocaleLowerCase("zh-CN").includes(normalized),
    );
  }, [items, query]);

  function openDialog(kind: ProjectDialog["kind"], project: ProjectSummaryDto) {
    setActiveMenu(null);
    setError("");
    setDraftName(project.name);
    setConfirmation("");
    setDialog({ kind, project });
  }

  function closeDialog() {
    if (busy) return;
    setDialog(null);
    setError("");
  }

  async function renameProject() {
    if (!dialog || dialog.kind !== "rename" || !draftName.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(dialog.project.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draftName.trim() }),
      });
      const body = await response.json() as { project?: ProjectSummaryDto };
      if (!response.ok || !body.project) throw new Error("rename_failed");
      setItems((current) => current.map((project) =>
        project.id === body.project?.id ? body.project : project,
      ));
      setDialog(null);
    } catch {
      setError("名称没有保存，请检查本地项目库后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function deleteProject() {
    if (!dialog || dialog.kind !== "delete" || confirmation !== dialog.project.name) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(dialog.project.id)}`, {
        method: "DELETE",
      });
      const body = await response.json() as { deleted?: boolean };
      if (!response.ok || body.deleted !== true) throw new Error("delete_failed");
      setItems((current) => current.filter((project) => project.id !== dialog.project.id));
      setDialog(null);
    } catch {
      setError("项目没有删除，请检查本地存储后重试。");
    } finally {
      setBusy(false);
    }
  }

  return <main className={styles.library} onClick={() => setActiveMenu(null)}>
    <header className={styles.topbar}>
      <Link className={styles.brand} href="/projects" aria-label="MorphFlow 项目库">
        <span className={styles.brandMark}><i/><i/></span>
        <strong>MorphFlow</strong><span>Studio</span>
      </Link>
      <div className={styles.localStatus}><i/><span>本地工作区</span></div>
    </header>

    <div className={styles.appShell}>
      <aside className={styles.sidebar}>
        <nav aria-label="项目库导航">
          <span className={styles.navLabel}>工作区</span>
          <Link className={styles.navActive} href="/projects"><FolderIcon open/><span>全部项目</span><b>{items.length}</b></Link>
        </nav>
        <div className={styles.storageNote}>
          <span className={styles.storageIcon}>⌁</span>
          <div><strong>仅保存在本机</strong><p>素材与项目不会自动上传云端。</p></div>
        </div>
      </aside>

      <section className={styles.content} aria-label="项目文件夹">
        <div className={styles.breadcrumb}><span>MorphFlow</span><i>/</i><strong>项目库</strong></div>
        <div className={styles.pageHeading}>
          <div><span className={styles.eyebrow}>YOUR WORKSPACES</span><h1>创作空间</h1><p>一个项目就是一套独立的素材、提示词与生成任务。</p></div>
          <CreateProjectForm disabled={unavailable}/>
        </div>

        <div className={styles.toolbar}>
          <label className={styles.searchBox}>
            <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>
            <span className={styles.srOnly}>搜索项目</span>
            <input onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目" type="search" value={query}/>
          </label>
          <span className={styles.resultCount}>{query ? `${visibleProjects.length} 个结果` : `${items.length} 个项目`} · 最近修改优先</span>
        </div>

        {unavailable ? <section className={styles.unavailable}><strong>本地项目库不可用</strong><p>请先配置 MORPHFLOW_DATA_DIR；系统不会用演示项目替代真实数据。</p></section> : null}

        <div className={styles.folderGrid}>
          {visibleProjects.map((project) => <article className={styles.projectCard} data-tone={projectTone(project.id)} key={project.id}>
            <button
              aria-expanded={activeMenu === project.id}
              aria-label={`管理 ${project.name}`}
              className={styles.moreButton}
              onClick={(event) => {
                event.stopPropagation();
                setActiveMenu((current) => current === project.id ? null : project.id);
              }}
              type="button"
            ><i/><i/><i/></button>
            {activeMenu === project.id ? <div aria-label={`项目操作 ${project.name}`} className={styles.actionMenu} onClick={(event) => event.stopPropagation()}>
              <button onClick={() => openDialog("rename", project)} type="button">重命名</button>
              <button className={styles.deleteAction} onClick={() => openDialog("delete", project)} type="button">删除项目</button>
            </div> : null}
            <Link aria-label={`打开空间 ${project.name}`} className={styles.projectLink} href={`/projects/${encodeURIComponent(project.id)}/overview`}>
              <div className={styles.cardPreview}>
                <div className={styles.folderSymbol}><FolderIcon open/></div>
                <span>PROJECT {String(project.revision).padStart(2, "0")}</span>
              </div>
              <div className={styles.cardBody}>
                <h2>{project.name}</h2>
                <p>{project.description || "尚未添加项目说明"}</p>
                <footer><span>更新于 {formatDate(project.updatedAt)}</span><strong>进入项目 <b>↗</b></strong></footer>
              </div>
            </Link>
          </article>)}
        </div>

        {!unavailable && visibleProjects.length === 0 ? <div className={styles.emptyLibrary}>
          <span className={styles.emptyFolder}><FolderIcon/></span>
          <strong>{query ? "没有匹配的项目" : "还没有创作空间"}</strong>
          <p>{query ? "换一个关键词试试。" : "新建一个项目，把真实素材和生成任务集中到一起。"}</p>
        </div> : null}
        <footer className={styles.libraryFooter}><span>SQLite 本地项目库</span><span>API Key 由 macOS Keychain 保管</span></footer>
      </section>
    </div>

    {dialog ? <div className={styles.modalBackdrop} onMouseDown={(event) => {
      if (event.target === event.currentTarget) closeDialog();
    }}>
      <section aria-labelledby="project-dialog-title" aria-modal="true" className={styles.dialog} role="dialog">
        <button aria-label="关闭" className={styles.closeButton} disabled={busy} onClick={closeDialog} type="button">×</button>
        {dialog.kind === "rename" ? <>
          <span className={styles.dialogIcon}><FolderIcon/></span>
          <h2 id="project-dialog-title">重命名项目</h2>
          <p>名称会同步更新到本地项目库，不影响已有素材与任务。</p>
          <label><span>项目名称</span><input autoFocus maxLength={120} onChange={(event) => setDraftName(event.target.value)} value={draftName}/></label>
          {error ? <p aria-live="polite" className={styles.formError}>{error}</p> : null}
          <div className={styles.dialogActions}><button disabled={busy} onClick={closeDialog} type="button">取消</button><button disabled={busy || !draftName.trim()} onClick={renameProject} type="button">{busy ? "保存中…" : "保存名称"}</button></div>
        </> : <>
          <span className={`${styles.dialogIcon} ${styles.dangerIcon}`}>!</span>
          <h2 id="project-dialog-title">删除“{dialog.project.name}”？</h2>
          <p>项目记录和项目内的本地素材都会永久删除，此操作无法撤销。</p>
          <label><span>输入项目名称以确认</span><input autoFocus autoComplete="off" onChange={(event) => setConfirmation(event.target.value)} placeholder={dialog.project.name} value={confirmation}/></label>
          {error ? <p aria-live="polite" className={styles.formError}>{error}</p> : null}
          <div className={styles.dialogActions}><button disabled={busy} onClick={closeDialog} type="button">取消</button><button className={styles.dangerButton} disabled={busy || confirmation !== dialog.project.name} onClick={deleteProject} type="button">{busy ? "删除中…" : "永久删除"}</button></div>
        </>}
      </section>
    </div> : null}
  </main>;
}
