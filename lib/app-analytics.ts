import { createHmac, timingSafeEqual } from "node:crypto";

export const eventNames = ["install", "app_active", "connected", "setup_complete", "wallpaper_selected", "wallpaper_update"] as const;
export type AppEvent = { id: string; at: number; name: typeof eventNames[number]; template: "none" | "receipt" | "calendar" | "cover"; mode: "none" | "manual" | "auto"; outcome: "none" | "success" | "failure" };
export type AppBatch = { installation: string; version: string; events: AppEvent[] };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
export function parseBatch(value: unknown, now = Date.now()): AppBatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid batch");
  const batch = value as Record<string, unknown>;
  if (!exact(batch, ["installation", "version", "events"]) || typeof batch.installation !== "string" || !uuid.test(batch.installation) || typeof batch.version !== "string" || !/^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}(?:-local)?$/.test(batch.version) || !Array.isArray(batch.events) || !batch.events.length || batch.events.length > 20) throw new Error("Invalid batch");
  const events = batch.events.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid event");
    const e = item as Record<string, unknown>;
    if (!exact(e, ["id", "at", "name", "template", "mode", "outcome"]) || typeof e.id !== "string" || !uuid.test(e.id) || typeof e.at !== "number" || !Number.isSafeInteger(e.at) || e.at < now - 7 * 86400000 || e.at > now + 300000 || !eventNames.includes(e.name as AppEvent["name"]) || typeof e.template !== "string" || !["none", "receipt", "calendar", "cover"].includes(e.template) || typeof e.mode !== "string" || !["none", "manual", "auto"].includes(e.mode) || typeof e.outcome !== "string" || !["none", "success", "failure"].includes(e.outcome)) throw new Error("Invalid event");
    return e as AppEvent;
  });
  return { installation: batch.installation, version: batch.version, events };
}
export function day(at: number) { return new Date(at + 8 * 3600000).toISOString().slice(0, 10); }
export function eventKey(batch: AppBatch, event: AppEvent, salt: string) {
  const pseudonym = createHmac("sha256", salt).update(batch.installation).digest("hex").slice(0, 32);
  return ["events-v1", day(event.at), pseudonym, batch.version, event.name, event.template, event.mode, event.outcome, event.id + ".json"].join("/");
}
export function authorized(header: string | null, token: string | undefined) {
  if (!token || token.length < 32 || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7)), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function summarize(keys: string[], days: number, now = Date.now()) {
  const start = day(now - (days - 1) * 86400000), end = day(now), active = new Set<string>(), week = new Set<string>(), month = new Set<string>(), installs = new Set<string>(), allDevices = new Set<string>();
  const daily: Record<string, { date: string; users: Set<string>; newInstalls: Set<string>; manualSuccess: number; manualFailure: number; autoSuccess: number; autoFailure: number; connected: number; setupComplete: number }> = {};
  const templates: Record<string, number> = { receipt: 0, calendar: 0, cover: 0 }, versions: Record<string, Set<string>> = {};
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) continue; seen.add(key);
    const [prefix, date, device, version, name, template, mode, outcome, id] = key.split("/");
    if (prefix !== "events-v1" || !id || date < start || date > end || !eventNames.includes(name as AppEvent["name"])) continue;
    const row = daily[date] ??= { date, users: new Set(), newInstalls: new Set(), manualSuccess: 0, manualFailure: 0, autoSuccess: 0, autoFailure: 0, connected: 0, setupComplete: 0 };
    allDevices.add(device); (versions[version] ??= new Set()).add(device);
    if (name === "install") { row.newInstalls.add(device); installs.add(device); }
    if (name === "app_active") { row.users.add(device); if (date === end) active.add(device); if (date >= day(now - 6 * 86400000)) week.add(device); if (date >= day(now - 29 * 86400000)) month.add(device); }
    if (name === "connected") row.connected++;
    if (name === "setup_complete") row.setupComplete++;
    if (name === "wallpaper_selected" && template in templates) templates[template]++;
    if (name === "wallpaper_update" && (mode === "manual" || mode === "auto") && (outcome === "success" || outcome === "failure")) row[(mode + (outcome === "success" ? "Success" : "Failure")) as "manualSuccess"]++;
  }
  return { range: { start, end, days }, devicesInRange: allDevices.size, newInstallations: installs.size, dau: active.size, wau: days >= 7 ? week.size : null, mau: days >= 30 ? month.size : null, templates, versions: Object.fromEntries(Object.entries(versions).map(([v, ids]) => [v, ids.size])), daily: Object.values(daily).sort((a,b) => a.date.localeCompare(b.date)).map(row => ({ ...row, users: row.users.size, newInstalls: row.newInstalls.size })), note: "仅含开启统计的实例；首次启用、清空数据、重装或关闭后重新开启会计为新统计实例，不代表精确安装量或人数。后台更新不计活跃，未采集的历史无法补算。" };
}
