"use client";

import { useEffect, useState } from "react";
import {
  clearWereadSkillKey,
  getWereadSkillKey,
  setWereadSkillKey,
  wereadAuthorizationHeaders,
  wereadKeyHint
} from "@/lib/browser-storage";

type ConnectionState = {
  connected: boolean;
  keyHint?: string;
};

type WereadSummary = {
  total: number;
  ebooks: number;
  audiobooks: number;
};

type ActivationStatus = "idle" | "verifying" | "active" | "failed";

async function verifySkillKey(skillKey: string) {
  const response = await fetch("/api/connections/weread", {
    method: "POST",
    cache: "no-store",
    headers: wereadAuthorizationHeaders(skillKey)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "微信读书 Skill 激活失败。");
  return data as { message: string; summary: WereadSummary };
}

async function loadSummary(skillKey: string) {
  const response = await fetch("/api/weread/summary", {
    method: "POST",
    cache: "no-store",
    headers: wereadAuthorizationHeaders(skillKey)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "查询微信读书数据失败。");
  return data as WereadSummary;
}

function localConnection(): ConnectionState {
  const skillKey = getWereadSkillKey();
  return skillKey ? { connected: true, keyHint: wereadKeyHint(skillKey) } : { connected: false };
}

export function ConnectionPanel() {
  const [skillKey, setSkillKey] = useState("");
  const [connection, setConnection] = useState<ConnectionState>({ connected: false });
  const [status, setStatus] = useState("Key 只保存在当前浏览器，不会写入服务端。");
  const [busy, setBusy] = useState(false);

  useEffect(() => setConnection(localConnection()), []);

  async function saveKey() {
    setBusy(true);
    setStatus("正在验证连接...");
    try {
      const data = await verifySkillKey(skillKey.trim());
      setWereadSkillKey(skillKey);
      setConnection(localConnection());
      setSkillKey("");
      setStatus(data.message);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "激活失败。");
    } finally {
      setBusy(false);
    }
  }

  async function testKey() {
    const savedKey = getWereadSkillKey();
    if (!savedKey) return;
    setBusy(true);
    setStatus("正在测试连接...");
    try {
      const summary = await loadSummary(savedKey);
      setStatus(`连接正常，查询到 ${summary.total} 本书架条目。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "测试失败。");
    } finally {
      setBusy(false);
    }
  }

  function deleteKey() {
    clearWereadSkillKey();
    setConnection({ connected: false });
    setStatus("已从当前浏览器删除 Key。");
  }

  return (
    <div className="form-wrap">
      <div className="panel form-card">
        <div className="field">
          <label className="label" htmlFor="skillKey">微信读书 Skill Key</label>
          <input
            autoComplete="off"
            className="input"
            id="skillKey"
            type="password"
            value={skillKey}
            onChange={(event) => setSkillKey(event.target.value)}
            placeholder="粘贴你的微信读书 Skill Key"
          />
          <p className="hint">Key 仅保存在这个浏览器中，请只在自己的设备上使用。</p>
        </div>
        <div className="actions">
          <button className="button primary" disabled={busy || !skillKey.trim()} onClick={saveKey} type="button">激活</button>
          <button className="button secondary" disabled={busy || !connection.connected} onClick={testKey} type="button">测试连接</button>
          <button className="button secondary" disabled={busy || !connection.connected} onClick={deleteKey} type="button">删除</button>
        </div>
      </div>
      <div className="panel form-card">
        <h2>连接状态</h2>
        <p className={connection.connected ? "status good" : "status warn"}>
          {connection.connected ? `已装载：${connection.keyHint}` : "尚未连接微信读书 Skill。"}
        </p>
        <p className="status">{status}</p>
      </div>
    </div>
  );
}

export function CompactConnectionPanel() {
  const [skillKey, setSkillKey] = useState("");
  const [connection, setConnection] = useState<ConnectionState>({ connected: false });
  const [summary, setSummary] = useState<WereadSummary | null>(null);
  const [status, setStatus] = useState("Key 仅保存在当前浏览器，不会上传保存到服务端。");
  const [activationStatus, setActivationStatus] = useState<ActivationStatus>("idle");
  const [busy, setBusy] = useState(false);

  async function refreshFromBrowser() {
    const nextConnection = localConnection();
    setConnection(nextConnection);
    if (!nextConnection.connected) {
      setActivationStatus("idle");
      setSummary(null);
      return;
    }
    setActivationStatus("active");
    const savedKey = getWereadSkillKey();
    try {
      setSummary(await loadSummary(savedKey));
      setStatus("已读取当前微信读书书架数据。Key 仍只保存在此浏览器。 ");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "查询数据失败。");
    }
  }

  useEffect(() => {
    refreshFromBrowser().catch(() => setStatus("读取浏览器连接状态失败。"));
  }, []);

  async function activate() {
    setBusy(true);
    setActivationStatus("verifying");
    setStatus("正在验证 Skill Key...");
    try {
      const data = await verifySkillKey(skillKey.trim());
      setWereadSkillKey(skillKey);
      setSkillKey("");
      setSummary(data.summary);
      setConnection(localConnection());
      setActivationStatus("active");
      setStatus(data.message);
    } catch (error) {
      setActivationStatus("failed");
      setStatus(error instanceof Error ? error.message : "激活失败。");
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    clearWereadSkillKey();
    setConnection({ connected: false });
    setSummary(null);
    setActivationStatus("idle");
    setStatus("已从当前浏览器删除 Key。");
  }

  const statusText =
    activationStatus === "active"
      ? "已装载"
      : activationStatus === "verifying"
        ? "验证中"
        : activationStatus === "failed"
          ? "激活失败"
          : "未装载";

  return (
    <div className="panel install-card">
      {connection.connected ? (
        <div className="loaded-card">
          <div className="loaded-top">
            <div>
              <p className="loaded-title">SKILL 已装载</p>
              <p className="loaded-key">⌕ {connection.keyHint}</p>
            </div>
            <button className="button secondary" disabled={busy} onClick={logout} type="button">注销技能</button>
          </div>
          <div className="loaded-summary">
            <strong>{summary ? `${summary.total} 本书架条目` : "正在查询书架..."}</strong>
            <span>电子书 {summary?.ebooks ?? "-"} · 有声书 {summary?.audiobooks ?? "-"}</span>
          </div>
          <p className="local-note">{status}</p>
        </div>
      ) : (
        <>
          <div className={`skill-status ${activationStatus}`}>
            <span className="skill-status-dot" />
            <span>SKILL {statusText}</span>
          </div>
          <h2>装载 Skill</h2>
          <p className="hint">粘贴微信读书 API Key。验证成功后只保存在当前浏览器。</p>
          <div className="inline-form">
            <input
              autoComplete="off"
              className="input"
              type="password"
              value={skillKey}
              onChange={(event) => setSkillKey(event.target.value)}
              placeholder="wrk-xxxxxxxxxxxxxxxx"
            />
            <button className="button primary" disabled={busy || !skillKey.trim()} onClick={activate} type="button">
              {activationStatus === "verifying" ? "验证中" : "激活"}
            </button>
          </div>
          <a className="help-link" href="https://weread.qq.com/r/weread-skills" rel="noreferrer" target="_blank">如何获取 API Key?</a>
          <div className="local-note">{status}</div>
        </>
      )}
    </div>
  );
}
