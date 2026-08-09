"use client";

import { useEffect, useState } from "react";

import styles from "../../styles/studio.module.css";

type SecretStatus = { configured: boolean; lastFour?: string };

function safeStatus(value: unknown): SecretStatus {
  if (typeof value !== "object" || value === null || !("configured" in value)) throw new Error("invalid_status");
  const record = value as Record<string, unknown>;
  if (typeof record.configured !== "boolean") throw new Error("invalid_status");
  return { configured: record.configured, ...(typeof record.lastFour === "string" ? { lastFour: record.lastFour.slice(-4) } : {}) };
}

export function SecretSettingsCard() {
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<SecretStatus>({ configured: false });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("正在读取 Keychain 状态…");
  const [messageTone, setMessageTone] = useState<"muted" | "success" | "error">("muted");

  useEffect(() => {
    let active = true;
    async function loadStatus() {
      try {
        const response = await fetch("/api/settings/provider-key", { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) throw new Error("status_failed");
        const next = safeStatus(await response.json());
        if (!active) return;
        setStatus(next);
        setMessage(next.configured ? "Key 已安全保存在系统 Keychain。" : "尚未配置 DMXAPI Key。");
        setMessageTone("muted");
      } catch {
        if (!active) return;
        setMessage("无法读取 Keychain 状态，请确认本地服务和系统权限。");
        setMessageTone("error");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadStatus();
    return () => { active = false; };
  }, []);

  async function saveKey() {
    if (draft.trim().length === 0) return;
    setLoading(true); setMessage("正在安全写入 Keychain…"); setMessageTone("muted");
    try {
      const response = await fetch("/api/settings/provider-key", { method: "PUT", cache: "no-store", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: draft }) });
      if (!response.ok) throw new Error("save_failed");
      setStatus(safeStatus(await response.json()));
      setDraft("");
      setMessage("Key 已保存。输入框已清空，密钥不会在页面中回显。"); setMessageTone("success");
    } catch {
      setMessage("保存失败。未确认写入成功，请检查 Keychain 权限后重试。"); setMessageTone("error");
    } finally { setLoading(false); }
  }

  async function deleteKey() {
    if (!status.configured || !window.confirm("确定从系统 Keychain 删除 DMXAPI Key？")) return;
    setLoading(true); setMessage("正在删除 Key…"); setMessageTone("muted");
    try {
      const response = await fetch("/api/settings/provider-key", { method: "DELETE", cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error("delete_failed");
      setStatus({ configured: false }); setDraft("");
      setMessage("Key 已从系统 Keychain 删除。"); setMessageTone("success");
    } catch {
      setMessage("删除失败。Keychain 状态未确认，请稍后重试。"); setMessageTone("error");
    } finally { setLoading(false); }
  }

  return (
    <div className={styles.secretEditor}>
      <div className={styles.secretSummary}>
        <span className={styles.secretIcon}>•••</span>
        <span><strong>DMXAPI Key</strong><small>{status.configured ? `已配置 · 末四位 ${status.lastFour ?? "••••"}` : "未配置 · 页面永不回显完整密钥"}</small></span>
        <em data-configured={status.configured ? "true" : "false"}>{status.configured ? "已配置" : "未配置"}</em>
      </div>
      <label className={styles.secretField}>
        <span>输入新 Key</span>
        <input aria-label="输入新 Key" autoCapitalize="none" autoComplete="new-password" disabled={loading} onChange={(event) => setDraft(event.target.value)} placeholder={status.configured ? "输入新 Key 以替换" : "仅用于写入系统 Keychain"} spellCheck={false} type="password" value={draft}/>
        <small>提交到本机接口后直接写入 macOS Keychain；React 状态不会持久化。</small>
      </label>
      <p aria-live="polite" className={styles.secretMessage} data-tone={messageTone}>{message}</p>
      <div className={styles.secretActions}>
        <button disabled={loading || draft.trim().length === 0} onClick={() => void saveKey()} type="button">保存到 Keychain</button>
        <button disabled={loading || !status.configured} onClick={() => void deleteKey()} type="button">删除 Key</button>
        <button disabled type="button">测试连接 · 待接入</button>
      </div>
    </div>
  );
}
