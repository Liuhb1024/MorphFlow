"use client";

import { useMemo, useState } from "react";

import styles from "../../styles/studio.module.css";
import { FrameExtractorCard } from "./FrameExtractorCard";
import { MediaAssetCard } from "./MediaAssetCard";
import { MediaUploadCard } from "./MediaUploadCard";
import type { StudioAssetView } from "./StudioSectionPage";

type MediaFilter = "all" | "video" | "image";

export function MediaLibrary({ assets, projectId }: { assets: readonly StudioAssetView[]; projectId: string }) {
  const [filter, setFilter] = useState<MediaFilter>("all");
  const images = useMemo(() => assets.filter((asset) => asset.mimeType.startsWith("image/")), [assets]);
  const videos = useMemo(() => assets.filter((asset) => asset.mimeType.startsWith("video/")), [assets]);
  const visible = filter === "image" ? images : filter === "video" ? videos : assets;
  const options = [
    { id: "all", label: "全部", count: assets.length },
    { id: "video", label: "视频", count: videos.length },
    { id: "image", label: "图片", count: images.length },
  ] as const;

  return <>
    <section className={styles.mediaToolbar}>
      <div aria-label="素材类型筛选" className={styles.filterTabs} role="group">
        {options.map((option) => <button aria-label={`${option.label} ${option.count}`} aria-pressed={filter === option.id} data-active={filter === option.id} key={option.id} onClick={() => setFilter(option.id)} type="button"><span>{option.label}</span><strong>{option.count}</strong></button>)}
      </div>
      <small className={styles.filterSummary}>显示 {visible.length} / {assets.length} 项</small>
    </section>
    <FrameExtractorCard projectId={projectId} videos={videos}/>
    <section className={styles.mediaGrid} aria-label="本地素材">
      {visible.map((asset, index) => <MediaAssetCard asset={asset} index={index} key={asset.id}/>)}
      {visible.length === 0 && assets.length > 0 ? <div className={styles.inlineEmpty}><strong>当前筛选下没有素材</strong><p>切换到其他类型，或上传新的本地文件。</p></div> : null}
      <MediaUploadCard projectId={projectId}/>
    </section>
  </>;
}
