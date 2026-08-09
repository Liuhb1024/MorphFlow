import Link from "next/link";
import type { CSSProperties } from "react";

import type { ProjectSummaryDto } from "@/server/dal/projects";

import styles from "../../styles/project-library.module.css";
import { CreateProjectForm } from "./CreateProjectForm";

function formatDate(value: number): string {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export function ProjectLibrary({ projects, unavailable = false }: { projects: readonly ProjectSummaryDto[]; unavailable?: boolean }) {
  return <main className={styles.library}>
    <header className={styles.libraryHeader}><Link className={styles.brand} href="/projects"><span className={styles.brandMark}><i/><i/></span><strong>MorphFlow</strong></Link><div><span>LOCAL-FIRST VIDEO STUDIO</span><h1>创作空间</h1><p>每个文件夹都是一个独立项目。进入后操作素材、画面、导演、模型与任务；退出即可回到这里。</p></div><aside><strong>{projects.length}</strong><span>个本地空间</span><small>SQLite · macOS</small></aside></header>
    {unavailable ? <section className={styles.unavailable}><strong>本地项目库不可用</strong><p>请先为服务配置有效的 MORPHFLOW_DATA_DIR。页面不会创建临时 demo 项目。</p></section> : null}
    <section className={styles.desk} aria-label="项目文件夹">
      <div className={styles.deskHeader}><div><span>PROJECT ARCHIVE</span><h2>我的文件夹</h2></div><small>按最近修改排序</small></div>
      <div className={styles.folderGrid}>
        {projects.map((project, index) => <Link aria-label={`打开空间 ${project.name}`} className={styles.folder} href={`/projects/${encodeURIComponent(project.id)}/overview`} key={project.id} style={{ "--folder-index": index } as CSSProperties}><span className={styles.folderTab}>MF / {String(index + 1).padStart(2, "0")}</span><div className={styles.folderBody}><span className={styles.folderGlyph}><i/><i/><i/></span><div><h2>{project.name}</h2><p>{project.description || "尚未添加项目说明"}</p></div><footer><span>更新于 {formatDate(project.updatedAt)}</span><strong>打开空间 →</strong></footer></div></Link>)}
        <CreateProjectForm disabled={unavailable}/>
      </div>
      {!unavailable && projects.length === 0 ? <div className={styles.emptyLibrary}><strong>还没有创作空间</strong><p>创建第一个文件夹开始整理真实素材。</p></div> : null}
    </section>
    <footer className={styles.libraryFooter}><span>所有数据默认保存在本机</span><span>API Key 存储在 macOS Keychain</span><span>退出空间不会停止本地任务</span></footer>
  </main>;
}
