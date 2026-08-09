import Link from "next/link";
import type { ReactNode } from "react";

import styles from "../../styles/studio.module.css";

export type StudioSection =
  | "overview"
  | "media"
  | "image"
  | "director"
  | "generate"
  | "jobs"
  | "settings";

const navigation: ReadonlyArray<{
  id: StudioSection;
  label: string;
  icon: IconName;
  description: string;
}> = [
  { id: "overview", label: "概览", icon: "grid", description: "项目状态" },
  { id: "media", label: "素材", icon: "media", description: "视频与图片" },
  { id: "image", label: "画面", icon: "image", description: "目标画面 B" },
  { id: "director", label: "导演", icon: "spark", description: "提示词与镜头" },
  { id: "generate", label: "生成", icon: "play", description: "模型与参数" },
  { id: "jobs", label: "任务", icon: "clock", description: "队列与结果" },
];

type IconName =
  | "grid"
  | "media"
  | "image"
  | "spark"
  | "play"
  | "clock"
  | "settings"
  | "search"
  | "chevron"
  | "plus";

export function StudioIcon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    media: <><path d="M4 5h16v14H4z"/><path d="m9 9 6 3-6 3z"/></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="1.5"/><path d="m4 17 5-5 3 3 2-2 6 6"/></>,
    spark: <><path d="m12 2 1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5z"/><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z"/></>,
    play: <><circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></>,
    chevron: <path d="m9 6 6 6-6 6"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
  };
  return (
    <svg aria-hidden="true" className={styles.icon} height={size} viewBox="0 0 24 24" width={size}>
      {paths[name]}
    </svg>
  );
}

export function StudioShell({
  active,
  title,
  description,
  children,
  actions,
  flush = false,
  projectId,
  projectName,
}: {
  active: StudioSection;
  title: string;
  description: string;
  children: ReactNode;
  actions?: ReactNode;
  flush?: boolean;
  projectId: string;
  projectName: string;
}) {
  const projectBase = `/projects/${encodeURIComponent(projectId)}`;
  return (
    <div className={styles.appShell}>
      <a className={styles.skipLink} href="#studio-content">跳到主要内容</a>
      <aside className={styles.sidebar}>
        <Link aria-label="MorphFlow 创作空间" className={styles.brand} href="/projects">
          <span className={styles.brandMark}><span /><span /></span>
          <span>MorphFlow</span>
        </Link>

        <Link aria-label="退出当前空间" className={styles.projectSwitcher} href="/projects">
          <span className={styles.projectThumb}>M</span>
          <span><strong>{projectName}</strong><small>退出空间</small></span>
          <StudioIcon name="chevron" size={14} />
        </Link>

        <nav aria-label="项目工作区" className={styles.navigation}>
          <p>工作区</p>
          {navigation.map((item) => (
            <Link
              aria-current={active === item.id ? "page" : undefined}
              className={styles.navLink}
              data-active={active === item.id ? "true" : "false"}
              href={`${projectBase}/${item.id}`}
              key={item.id}
            >
              <StudioIcon name={item.icon} />
              <span><strong>{item.label}</strong><small>{item.description}</small></span>
            </Link>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <Link
            aria-current={active === "settings" ? "page" : undefined}
            className={styles.navLink}
            data-active={active === "settings" ? "true" : "false"}
            href={`${projectBase}/settings`}
          >
            <StudioIcon name="settings" />
            <span><strong>设置</strong><small>本地环境与密钥</small></span>
          </Link>
          <div className={styles.localState}>
            <span className={styles.localDot} />
            <span><strong>本地工作区</strong><small>SQLite 已连接</small></span>
          </div>
        </div>
      </aside>

      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <div className={styles.mobileBrand}>MorphFlow</div>
          <button aria-label="搜索项目与素材" className={styles.searchButton} type="button">
            <StudioIcon name="search" size={16} />
            <span>搜索项目、素材或任务</span>
            <kbd>⌘ K</kbd>
          </button>
          <div className={styles.topbarActions}>
            <span className={styles.previewBadge}>本地空间</span>
            <button aria-label="打开帮助" className={styles.roundButton} type="button">?</button>
            <span className={styles.avatar} aria-label="本地用户">H</span>
          </div>
        </header>

        <main className={styles.main} id="studio-content">
          <header className={styles.pageHeader}>
            <div>
              <p>MORPHFLOW / {active.toUpperCase()}</p>
              <h1>{title}</h1>
              <span>{description}</span>
            </div>
            {actions ? <div className={styles.pageActions}>{actions}</div> : null}
          </header>
          <div className={flush ? styles.flushContent : styles.pageContent}>{children}</div>
        </main>
      </div>
    </div>
  );
}
