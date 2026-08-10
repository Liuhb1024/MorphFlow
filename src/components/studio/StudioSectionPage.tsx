import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import styles from "../../styles/studio.module.css";
import { MediaUploadCard } from "./MediaUploadCard";
import { MediaAssetCard } from "./MediaAssetCard";
import { ImageGenerationPanel } from "./ImageGenerationPanel";
import { DirectorPanel } from "./DirectorPanel";
import { JobsPanel } from "./JobsPanel";
import { FrameExtractorCard } from "./FrameExtractorCard";
import { SecretSettingsCard } from "./SecretSettingsCard";
import { StudioShell, type StudioSection } from "./StudioShell";

export type StaticStudioSection = Exclude<StudioSection, "generate">;

export type StudioAssetView = Readonly<{
  id: string;
  contentUrl: string;
  displayName: string;
  kind: string;
  mimeType: string;
  byteSize: number;
}>;

export type StudioShotView = Readonly<{
  id: string;
  name: string;
  description: string;
  position: number;
}>;

type StudioPageContext = Readonly<{
  projectId: string;
  projectName: string;
  projectDescription: string;
  assets: readonly StudioAssetView[];
  shots: readonly StudioShotView[];
}>;

const sectionMeta: Record<StaticStudioSection, { title: string; description: string }> = {
  overview: { title: "项目概览", description: "这个空间只展示已经保存到本机的内容。" },
  media: { title: "素材库", description: "管理原始视频、图片和真实派生素材。" },
  image: { title: "目标画面", description: "选择真实参考图和目标画面 B。" },
  director: { title: "导演台", description: "手写镜头意图，或调用 Gemini VLM 辅助。" },
  jobs: { title: "生成任务", description: "查看真实提交任务与本地结果。" },
  settings: { title: "设置", description: "管理本地运行环境、存储与 API Key。" },
};

function PageNotice({ children }: { children: ReactNode }) {
  return <div className={styles.pageNotice}><span>i</span><p>{children}</p></div>;
}

function isImage(asset: StudioAssetView): boolean {
  return asset.mimeType.startsWith("image/");
}

function isVideo(asset: StudioAssetView): boolean { return asset.mimeType.startsWith("video/"); }

function selectFrames(assets: readonly StudioAssetView[]) {
  const images = assets.filter(isImage);
  const first = images.find((asset) => asset.kind === "first_frame") ?? images[0];
  const target = images.find((asset) => ["last_frame", "generated_image", "hand_drawn_image"].includes(asset.kind) && asset.id !== first?.id) ?? images.find((asset) => asset.id !== first?.id);
  return { images, first, target };
}

function FramePreview({ asset, label }: { asset: StudioAssetView | undefined; label: string }) {
  if (!asset) {
    return <div className={styles.realEmptyFrame}><span>{label}</span><strong>尚未选择素材</strong><small>前往素材库上传</small></div>;
  }
  return <div><Image alt={asset.displayName} fill priority sizes="(max-width: 800px) 85vw, 38vw" src={asset.contentUrl} unoptimized/><span>{label} · {asset.displayName}</span></div>;
}

function Overview(context: StudioPageContext) {
  const { projectId, projectName, projectDescription, assets, shots } = context;
  const { first, target } = selectFrames(assets);
  const readySteps = Number(assets.length > 0) + Number(Boolean(target));
  const projectBase = `/projects/${encodeURIComponent(projectId)}`;
  return (
    <div className={styles.overviewLayout}>
      <PageNotice>当前空间包含 {shots.length} 个镜头、{assets.length} 项本地素材；没有注入演示数据。</PageNotice>
      <section className={styles.heroCard}>
        <div>
          <span className={styles.softLabel}>LOCAL WORKSPACE · {shots.length} SHOTS</span>
          <h2>{projectName}</h2>
          <p>{projectDescription || "这个空间还没有说明。上传真实素材后，从 A、B 两帧开始配置转场。"}</p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryAction} href={`${projectBase}/media`}>{assets.length ? "管理素材" : "上传第一项素材"} <span>→</span></Link>
            <Link className={styles.secondaryAction} href={`${projectBase}/generate`}>配置生成</Link>
          </div>
        </div>
        <div className={styles.heroFrames}>
          <FramePreview asset={first} label="A"/>
          <FramePreview asset={target} label="B"/>
        </div>
      </section>
      <section className={styles.sectionBlock}>
        <div className={styles.sectionTitle}><div><span>真实进度</span><h2>从素材到生成</h2></div><small>{readySteps} / 4 已准备</small></div>
        <div className={styles.flowGrid}>
          {[
            ["01", "准备素材", assets.length ? `${assets.length} 项已保存` : "等待上传", assets.length ? "ready" : "draft"],
            ["02", "目标画面", target ? target.displayName : "等待选择 B", target ? "ready" : "draft"],
            ["03", "导演提示", "可选 · 尚未保存", "optional"],
            ["04", "模型生成", "可提交并跟踪真实任务", "ready"],
          ].map(([step, title, detail, state]) => <div className={styles.flowCard} data-state={state} key={step}><span>{step}</span><i/><h3>{title}</h3><p>{detail}</p></div>)}
        </div>
      </section>
      <section className={styles.twoColumn}>
        <div className={styles.sectionBlock}><div className={styles.sectionTitle}><div><span>空间内容</span><h2>真实数据</h2></div></div><dl className={styles.detailList}><div><dt>镜头</dt><dd>{shots.length}</dd></div><div><dt>图片</dt><dd>{assets.filter(isImage).length}</dd></div><div><dt>视频</dt><dd>{assets.filter((asset) => asset.mimeType.startsWith("video/")).length}</dd></div><div><dt>生成结果</dt><dd>{assets.filter((asset) => asset.kind.startsWith("generated_")).length}</dd></div></dl></div>
        <div className={styles.sectionBlock}><div className={styles.sectionTitle}><div><span>下一步</span><h2>准备生成输入</h2></div></div><div className={styles.healthList}><div data-state={first ? "neutral" : "pending"}><i/><span><strong>首帧 A</strong><small>{first?.displayName ?? "尚未选择"}</small></span></div><div data-state={target ? "neutral" : "pending"}><i/><span><strong>目标帧 B</strong><small>{target?.displayName ?? "尚未选择"}</small></span></div><div data-state="neutral"><i/><span><strong>真实任务提交</strong><small>提交前确认费用，结果自动保存到本地</small></span></div></div></div>
      </section>
    </div>
  );
}

function Media({ assets, projectId }: StudioPageContext) {
  const images = assets.filter(isImage);
  const videos = assets.filter(isVideo);
  return <div className={styles.contentStack}>
    <PageNotice>当前显示 {assets.length} 项真实本地素材。上传后写入当前空间，不会出现在其他项目中。</PageNotice>
    <section className={styles.mediaToolbar}><div className={styles.filterTabs}><span>全部 {assets.length}</span><span>视频 {videos.length}</span><span>图片 {images.length}</span></div></section>
    <FrameExtractorCard projectId={projectId} videos={videos}/>
    <section className={styles.mediaGrid} aria-label="本地素材">
      {assets.map((asset, index) => <MediaAssetCard asset={asset} index={index} key={asset.id}/>)}
      <MediaUploadCard projectId={projectId}/>
    </section>
    {assets.length === 0 ? <section className={styles.inlineEmpty}><strong>这个空间还是空的</strong><p>从本机上传视频、尾帧、目标图或手绘图。这里不会显示示例素材。</p></section> : null}
  </div>;
}

function ImageStudio(context: StudioPageContext) {
  const { target, images } = selectFrames(context.assets);
  return <div className={styles.contentStack}>
    <PageNotice>AI 生图是可选步骤。所有预览均来自当前空间的真实素材。</PageNotice>
    <ImageGenerationPanel images={images} projectId={context.projectId} {...(target ? { target } : {})}/>
  </div>;
}

function Director(context: StudioPageContext) {
  const { first, target } = selectFrames(context.assets);
  const frames = [first, target].filter((asset): asset is StudioAssetView => Boolean(asset));
  return <div className={styles.contentStack}>
    <PageNotice>导演台不预填虚构提示词。只有你主动输入或真实 VLM 返回的内容才会出现。</PageNotice>
    <DirectorPanel frames={frames} projectId={context.projectId}/>
  </div>;
}

function Jobs({ projectId }: StudioPageContext) {
  return <JobsPanel projectId={projectId}/>;
}

function Settings() {
  return <div className={styles.settingsLayout}><PageNotice>完整密钥只保存在 macOS Keychain；项目、任务与素材元数据保存在本机 SQLite。</PageNotice><nav className={styles.settingsNav} aria-label="设置分类"><a href="#runtime">运行环境</a><a href="#credentials">API 与密钥</a><a href="#storage">本地存储</a><a href="#privacy">隐私与日志</a></nav><div className={styles.settingsContent}><section className={styles.settingsSection} id="runtime"><div><h2>运行环境</h2><p>真实任务链路所需的本地组件。</p></div><div className={styles.settingRows}><div><span><strong>Node 服务</strong><small>Next.js 本地服务</small></span><em data-tone="blue">本地运行</em></div><div><span><strong>任务处理</strong><small>提交、查询与结果下载</small></span><em data-tone="blue">页面触发</em></div><div><span><strong>SQLite</strong><small>当前空间元数据</small></span><em data-tone="blue">已连接</em></div></div></section><section className={styles.settingsSection} id="credentials"><div><h2>API 与密钥</h2><p>密钥不会返回页面。</p></div><SecretSettingsCard/></section><section className={styles.settingsSection} id="storage"><div><h2>本地存储</h2><p>原始文件与派生结果不会上传到 MorphFlow 云服务。</p></div><div className={styles.settingRows}><div><span><strong>数据目录</strong><small>由本地服务配置，页面不暴露绝对路径</small></span><em data-tone="blue">已配置</em></div><div><span><strong>保留原始素材</strong><small>派生内容不覆盖原件</small></span><em data-tone="blue">启用</em></div></div></section><section className={styles.settingsSection} id="privacy"><div><h2>隐私与日志</h2><p>所有 Provider 错误必须经过集中脱敏。</p></div><div className={styles.privacyBox}><strong>安全边界</strong><ul><li>完整 API Key 不返回页面</li><li>保存与删除只调用本机接口</li><li>项目之间隔离素材</li><li>日志不记录 Authorization</li></ul></div></section></div></div>;
}

export function StudioSectionPage({ section, projectId, projectName, projectDescription, assets, shots }: { section: StaticStudioSection; projectId: string; projectName: string; projectDescription: string; assets: readonly StudioAssetView[]; shots: readonly StudioShotView[] }) {
  const meta = sectionMeta[section];
  const context = { projectId, projectName, projectDescription, assets, shots };
  const pageBySection: Record<StaticStudioSection, ReactNode> = { overview: <Overview {...context}/>, media: <Media {...context}/>, image: <ImageStudio {...context}/>, director: <Director {...context}/>, jobs: <Jobs {...context}/>, settings: <Settings/> };
  return <StudioShell active={section} description={meta.description} projectId={projectId} projectName={projectName} title={meta.title}>{pageBySection[section]}</StudioShell>;
}
