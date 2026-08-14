"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { devices } from "@/lib/devices";
import { downloadImageAsJpeg } from "@/lib/download-jpeg";
import { readJsonResponse } from "@/lib/client-json";
import { templates } from "@/lib/templates";

type GenerateResponse = {
  imageUrl: string;
  width: number;
  height: number;
  prompt: string;
  dataSource?: "mock" | "boox" | "weread";
  mode: "template";
};

function GenerateContent() {
  const params = useSearchParams();
  const templateFromUrl = params.get("template");
  const initialTemplate = templateFromUrl || "monthly_receipt";
  const [templateKey, setTemplateKey] = useState(initialTemplate);
  const [deviceKey, setDeviceKey] = useState("note-x5-mini");
  const orientation = "portrait" as const;
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [status, setStatus] = useState("选择模板和设备后生成图片。");
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    setStatus("正在生成...");
    setResult(null);
    try {
      const response = await fetch("/api/wallpapers/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateKey, deviceKey, orientation })
      });
      const data = await readJsonResponse<GenerateResponse & { error?: string }>(response, "生成失败");
      if (!response.ok) {
        throw new Error(data.error || "生成失败");
      }
      setResult(data);
      const sourceText =
        data.dataSource === "weread"
          ? "已读取微信读书真实数据"
          : data.dataSource === "boox"
            ? "当前使用文石模拟数据"
            : "当前使用本地示例数据";
      setStatus(`${sourceText}；已用预设模板填充生成预览。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "生成失败");
    } finally {
      setBusy(false);
    }
  }

  async function downloadResult() {
    if (!result) return;
    setStatus("正在准备 JPG 图片...");
    try {
      await downloadImageAsJpeg({
        imageUrl: result.imageUrl,
        width: result.width,
        height: result.height,
        filename: `weread-${templateKey}-${result.width}x${result.height}.jpg`
      });
      setStatus("JPG 图片已下载。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "JPG 图片下载失败");
    }
  }

  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h1 className="section-title">生成壁纸</h1>
          <p className="section-copy">
            {templateFromUrl ? "模板已带入，选择 BOOX 设备后生成。" : "建议从首页点击具体模板进入；这里先默认本月阅读小票。"}
          </p>
        </div>
      </div>
      <div className="generate-layout">
        <div className="panel form-card">
          <div className="field">
            <label className="label" htmlFor="template">
              模板
            </label>
            <select className="select" id="template" value={templateKey} onChange={(event) => setTemplateKey(event.target.value)}>
              {templates.map((template) => (
                <option key={template.key} value={template.key}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="device">
              BOOX 设备
            </label>
            <select className="select" id="device" value={deviceKey} onChange={(event) => setDeviceKey(event.target.value)}>
              {devices.map((device) => (
                <option key={device.key} value={device.key}>
                  {device.name} · {device.width}x{device.height}
                </option>
              ))}
            </select>
          </div>
          <button className="button primary" disabled={busy} onClick={generate}>
            {busy ? "生成中..." : "生成图片"}
          </button>
          <p className="status">{status}</p>
        </div>
        <div className="panel form-card">
          {result ? (
            <>
              <img className="result-image" src={result.imageUrl} alt="生成的 BOOX 壁纸" />
              <div className="actions">
                <button className="button primary" onClick={downloadResult} type="button">
                  下载图片
                </button>
              </div>
              <p className="hint">
                目标尺寸：{result.width} x {result.height}。数据：{result.dataSource === "weread" ? "微信读书真实数据" : result.dataSource === "boox" ? "文石模拟数据" : "示例数据"}。图片：预设模板生成
              </p>
            </>
          ) : (
            <p className="status">生成结果会显示在这里。</p>
          )}
        </div>
      </div>
    </section>
  );
}

export default function GeneratePage() {
  return (
    <AppShell>
      <Suspense fallback={<p className="status">正在加载...</p>}>
        <GenerateContent />
      </Suspense>
    </AppShell>
  );
}
