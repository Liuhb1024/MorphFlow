import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import styles from "../../styles/studio.module.css";
import { MediaUploadCard } from "./MediaUploadCard";
import { SecretSettingsCard } from "./SecretSettingsCard";
import { StudioIcon, StudioShell, type StudioSection } from "./StudioShell";

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
  director: { title: "导演台", description: "手写镜头意图，或稍后调用 VLM 辅助。" },
  jobs: { title: "生成任务", description: "查看真实提交任务与本地结果。" },
  settings: { title: "设置", description: "管理本地运行环境、存储与 API Key。" },
};

function PageNotice({ children }: { children: ReactNode }) {
  return <div className={styles.pageNotice}><span>i</span><p>{children}</p></div>;
}

function isImage(asset: StudioAssetView): boolean {
  return asset.mimeType.startsWith("image/");
}

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
  return <div><Image alt={asset.displayName} fill priority sizes="(max-width: 800px) 85vw, 38vw" src={asset.contentUrl}/><span>{label} · {asset.displayName}</span></div>;
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
            ["04", "模型生成", "提交链路尚未接通", "draft"],
          ].map(([step, title, detail, state]) => <div className={styles.flowCard} data-state={state} key={step}><span>{step}</span><i/><h3>{title}</h3><p>{detail}</p></div>)}
        </div>
      </section>
      <section className={styles.twoColumn}>
        <div className={styles.sectionBlock}><div className={styles.sectionTitle}><div><span>空间内容</span><h2>真实数据</h2></div></div><dl className={styles.detailList}><div><dt>镜头</dt><dd>{shots.length}</dd></div><div><dt>图片</dt><dd>{assets.filter(isImage).length}</dd></div><div><dt>视频</dt><dd>{assets.filter((asset) => asset.mimeType.startsWith("video/")).length}</dd></div><div><dt>生成结果</dt><dd>{assets.filter((asset) => asset.kind.startsWith("generated_")).length}</dd></div></dl></div>
        <div className={styles.sectionBlock}><div className={styles.sectionTitle}><div><span>下一步</span><h2>准备生成输入</h2></div></div><div className={styles.healthList}><div data-state={first ? "neutral" : "pending"}><i/><span><strong>首帧 A</strong><small>{first?.displayName ?? "尚未选择"}</small></span></div><div data-state={target ? "neutral" : "pending"}><i/><span><strong>目标帧 B</strong><small>{target?.displayName ?? "尚未选择"}</small></span></div><div data-state="pending"><i/><span><strong>真实任务提交</strong><small>仍保持关闭，不会误触发付费调用</small></span></div></div></div>
      </section>
    </div>
  );
}

function Media({ assets, projectId }: StudioPageContext) {
  const images = assets.filter(isImage);
  const videos = assets.filter((asset) => asset.mimeType.startsWith("video/"));
  return <div className={styles.contentStack}>
    <PageNotice>当前显示 {assets.length} 项真实本地素材。上传后写入当前空间，不会出现在其他项目中。</PageNotice>
    <section className={styles.mediaToolbar}><div className={styles.filterTabs}><button data-active="true" type="button">全部 {assets.length}</button><button type="button">视频 {videos.length}</button><button type="button">图片 {images.length}</button></div></section>
    <section className={styles.mediaGrid} aria-label="本地素材">
      {assets.map((asset, index) => <article className={styles.mediaCard} key={asset.id}><div className={styles.mediaPreview}>{isImage(asset) ? <Image alt={asset.displayName} fill priority={index < 2} sizes="(max-width: 900px) 100vw, 40vw" src={asset.contentUrl}/> : <div aria-label={`${asset.displayName} 视频素材`} role="img"/>}<span>{String(index + 1).padStart(2, "0")}</span><em>{isImage(asset) ? "本地图片" : "本地视频"}</em></div><div className={styles.mediaInfo}><div><h2>{asset.displayName}</h2><p>{Math.max(1, Math.round(asset.byteSize / 1024))} KB · {asset.kind}</p></div><small>LOCAL FILE</small></div></article>)}
      <MediaUploadCard projectId={projectId}/>
    </section>
    {assets.length === 0 ? <section className={styles.inlineEmpty}><strong>这个空间还是空的</strong><p>从本机上传视频、尾帧、目标图或手绘图。这里不会显示示例素材。</p></section> : null}
  </div>;
}

function ImageStudio(context: StudioPageContext) {
  const { first, target, images } = selectFrames(context.assets);
  return <div className={styles.contentStack}>
    <PageNotice>AI 生图是可选步骤。所有预览均来自当前空间的真实素材。</PageNotice>
    <section className={styles.imageWorkspace}>
      <div className={styles.referencePanel}><div className={styles.panelHeader}><div><span>REFERENCE</span><h2>参考画面</h2></div><small>{first ? "1 张" : "未选择"}</small></div>{first ? <div className={styles.referenceImage}><Image alt={first.displayName} fill priority sizes="40vw" src={first.contentUrl}/><span>{first.displayName}</span></div> : <div className={styles.panelEmpty}>尚无参考图</div>}<Link className={styles.dashedButton} href={`/projects/${encodeURIComponent(context.projectId)}/media`}><StudioIcon name="plus" size={16}/> 从素材库添加</Link></div>
      <div className={styles.promptPanel}><div className={styles.panelHeader}><div><span>GPT IMAGE · OPTIONAL</span><h2>创作目标画面 B</h2></div><span className={styles.unverifiedBadge}>提交未接通</span></div><label className={styles.largeField}><span>画面描述</span><textarea placeholder="描述你希望生成或编辑的真实目标画面" rows={7}/><small>草稿当前只存在于输入框，不会自动发送。</small></label><div className={styles.inlineFields}><label><span>画幅</span><select defaultValue="16:9"><option>16:9</option><option>9:16</option><option>1:1</option></select></label><label><span>参考图</span><select defaultValue={String(images.length)}><option value={String(images.length)}>{images.length} 张可用</option></select></label></div><div className={styles.costLine}><span><strong>费用状态</strong><small>实际提交前必须再次确认</small></span><strong>待确认</strong></div><button className={styles.primaryButtonWide} disabled type="button">生成目标画面 <span>提交链路尚未接通</span></button></div>
      <div className={styles.resultPanel}><div className={styles.panelHeader}><div><span>TARGET</span><h2>当前 B</h2></div><small>{target ? "本地素材" : "未选择"}</small></div>{target ? <div className={styles.targetImage}><Image alt={target.displayName} fill priority sizes="30vw" src={target.contentUrl}/></div> : <div className={styles.panelEmpty}>尚无目标画面</div>}<p>{target?.displayName ?? "等待上传或生成"}</p><small>新结果不会覆盖原始素材。</small></div>
    </section>
  </div>;
}

function Director(context: StudioPageContext) {
  const { first, target } = selectFrames(context.assets);
  return <div className={styles.contentStack}>
    <PageNotice>导演台不预填虚构提示词。只有你主动输入或真实 VLM 返回的内容才会出现。</PageNotice>
    <section className={styles.directorGrid}>
      <div className={styles.scriptEditor}><div className={styles.panelHeader}><div><span>WORKING PROMPT</span><h2>镜头意图</h2></div><span className={styles.savedLocal}>未保存</span></div><label className={styles.largeField}><span>通用导演提示</span><textarea placeholder="例如：描述镜头运动、转场节奏、主体连续性与禁止出现的变化" rows={11}/></label><div className={styles.promptMeta}><span>等待输入</span><span>手写优先</span><span>未提交</span></div></div>
      <aside className={styles.vlmPanel}><div className={styles.panelHeader}><div><span>OPTIONAL ASSISTANT</span><h2>VLM 导演 · 可选</h2></div><StudioIcon name="spark"/></div><p>未来会分析你选择的真实 A、B 和创作意图，不会使用示例帧。</p><label><span>导演模型</span><select defaultValue="gemini"><option value="gemini">Gemini 3.6 Flash · 文本连通已验证</option></select></label><div className={styles.vlmInputs}>{first ? <div><Image alt={first.displayName} height={72} src={first.contentUrl} width={128}/><span>A</span></div> : <div className={styles.miniEmpty}>缺少 A</div>}{target ? <div><Image alt={target.displayName} height={72} src={target.contentUrl} width={128}/><span>B</span></div> : <div className={styles.miniEmpty}>缺少 B</div>}</div><button className={styles.primaryButtonWide} disabled type="button">生成导演建议</button><small className={styles.honestNote}>VLM 页面提交尚未接通。</small></aside>
    </section>
    <section className={styles.timelineCard}><div className={styles.panelHeader}><div><span>MANUAL TIMELINE</span><h2>时间线</h2></div><small>空白</small></div><div className={styles.timelineEmpty}>输入并保存镜头意图后，再创建真实时间线。</div></section>
  </div>;
}

function Jobs({ projectId }: StudioPageContext) {
  return <div className={styles.contentStack}><PageNotice>这里只会出现真实提交并持久化到 SQLite 的任务。</PageNotice><section className={styles.jobsToolbar}><div className={styles.filterTabs}><button data-active="true" type="button">全部</button><button type="button">进行中</button><button type="button">成功</button><button type="button">需要处理</button></div><span>0 个任务</span></section><section className={styles.emptyState}><span className={styles.emptyIcon}><StudioIcon name="clock" size={25}/></span><h2>还没有生成任务</h2><p>当前空间没有提交过真实请求。任务链路接通后，Provider task ID、进度和本地结果会显示在这里。</p><Link className={styles.primaryAction} href={`/projects/${encodeURIComponent(projectId)}/generate`}>查看生成配置 <span>→</span></Link></section></div>;
}

function Settings() {
  return <div className={styles.settingsLayout}><PageNotice>完整密钥只保存在 macOS Keychain；项目与素材元数据保存在本机 SQLite。</PageNotice><nav className={styles.settingsNav} aria-label="设置分类"><a href="#runtime">运行环境</a><a href="#credentials">API 与密钥</a><a href="#storage">本地存储</a><a href="#privacy">隐私与日志</a></nav><div className={styles.settingsContent}><section className={styles.settingsSection} id="runtime"><div><h2>运行环境</h2><p>真实任务链路所需的本地组件。</p></div><div className={styles.settingRows}><div><span><strong>Node 服务</strong><small>Next.js 本地服务</small></span><em data-tone="blue">本地运行</em></div><div><span><strong>任务 Worker</strong><small>提交、轮询、下载与 FFmpeg</small></span><em data-tone="red">未接通</em></div><div><span><strong>SQLite</strong><small>当前空间元数据</small></span><em data-tone="blue">已连接</em></div></div></section><section className={styles.settingsSection} id="credentials"><div><h2>API 与密钥</h2><p>密钥不会返回页面。</p></div><SecretSettingsCard/></section><section className={styles.settingsSection} id="storage"><div><h2>本地存储</h2><p>原始文件与派生结果不会上传到 MorphFlow 云服务。</p></div><div className={styles.settingRows}><div><span><strong>数据目录</strong><small>由本地服务配置，页面不暴露绝对路径</small></span><em data-tone="blue">已配置</em></div><div><span><strong>保留原始素材</strong><small>派生内容不覆盖原件</small></span><em data-tone="blue">启用</em></div></div></section><section className={styles.settingsSection} id="privacy"><div><h2>隐私与日志</h2><p>所有 Provider 错误必须经过集中脱敏。</p></div><div className={styles.privacyBox}><strong>安全边界</strong><ul><li>完整 API Key 不返回页面</li><li>保存与删除只调用本机接口</li><li>项目之间隔离素材</li><li>日志不记录 Authorization</li></ul></div></section></div></div>;
}

export function StudioSectionPage({ section, projectId, projectName, projectDescription, assets, shots }: { section: StaticStudioSection; projectId: string; projectName: string; projectDescription: string; assets: readonly StudioAssetView[]; shots: readonly StudioShotView[] }) {
  const meta = sectionMeta[section];
  const context = { projectId, projectName, projectDescription, assets, shots };
  const pageBySection: Record<StaticStudioSection, ReactNode> = { overview: <Overview {...context}/>, media: <Media {...context}/>, image: <ImageStudio {...context}/>, director: <Director {...context}/>, jobs: <Jobs {...context}/>, settings: <Settings/> };
  return <StudioShell active={section} description={meta.description} projectId={projectId} projectName={projectName} title={meta.title}>{pageBySection[section]}</StudioShell>;
}
