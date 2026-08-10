"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "../../styles/studio.module.css";
import type { StudioAssetView } from "./StudioSectionPage";

export function MediaAssetCard({ asset, index }: { asset: StudioAssetView; index: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const image = asset.mimeType.startsWith("image/");

  async function remove() {
    setDeleting(true);
    setMessage("");
    try {
      const response = await fetch(`/api/assets/${encodeURIComponent(asset.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const body = await response.json() as { deleted?: boolean; error?: string };
      if (!response.ok || body.deleted !== true) throw new Error(body.error ?? "delete_failed");
      setConfirming(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error && error.message === "asset_in_use"
        ? "该素材仍被派生结果引用，暂时不能删除。"
        : "删除失败，请重试或检查本地存储状态。");
    } finally {
      setDeleting(false);
    }
  }

  return <>
    <article className={styles.mediaCard}>
      <div className={styles.mediaPreview}>{image ? <Image alt={asset.displayName} fill priority={index < 2} sizes="(max-width: 900px) 100vw, 40vw" src={asset.contentUrl} unoptimized/> : <video controls preload="metadata" src={asset.contentUrl}/>}<span>{String(index + 1).padStart(2, "0")}</span><em>{image ? "本地图片" : "本地视频"}</em></div>
      <div className={styles.mediaInfo}><div><h2>{asset.displayName}</h2><p>{Math.max(1, Math.round(asset.byteSize / 1024))} KB · {asset.kind}</p></div><button aria-label={`删除 ${asset.displayName}`} className={styles.assetDeleteButton} onClick={() => { setMessage(""); setConfirming(true); }} type="button">删除</button></div>
      {message ? <p aria-live="polite" className={styles.assetError}>{message}</p> : null}
    </article>
    {confirming ? <div className={styles.assetDialogBackdrop} onKeyDown={(event) => { if (event.key === "Escape" && !deleting) setConfirming(false); }} onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setConfirming(false); }}>
      <section aria-labelledby={`delete-${asset.id}`} aria-modal="true" className={styles.assetDialog} role="dialog">
        <span className={styles.assetDialogIcon}>!</span>
        <h2 id={`delete-${asset.id}`}>删除素材</h2>
        <p>确定删除“{asset.displayName}”吗？本地文件和素材记录都会被永久移除，无法撤销。</p>
        <div><button autoFocus disabled={deleting} onClick={() => setConfirming(false)} type="button">取消</button><button className={styles.assetDangerButton} disabled={deleting} onClick={() => void remove()} type="button">{deleting ? "删除中…" : "确认删除"}</button></div>
      </section>
    </div> : null}
  </>;
}
