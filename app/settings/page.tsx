import { AppShell } from "@/components/AppShell";
import { ConnectionPanel } from "@/components/ConnectionPanel";

export default function SettingsPage() {
  return (
    <AppShell>
      <section className="section">
        <div className="section-head">
          <div>
            <h1 className="section-title">连接设置</h1>
            <p className="section-copy">第一版只需要微信读书 skillKey，不需要用户 ID。</p>
          </div>
        </div>
        <ConnectionPanel />
      </section>
    </AppShell>
  );
}
