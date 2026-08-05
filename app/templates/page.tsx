import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { templates } from "@/lib/templates";

export default function TemplatesPage() {
  return (
    <AppShell>
      <section className="section">
        <div className="section-head">
          <div>
            <h1 className="section-title">模板选择</h1>
            <p className="section-copy">按参考网页先做四个场景，第一阶段优先打磨本月阅读小票。</p>
          </div>
        </div>
        <div className="grid">
          {templates.map((template) => (
            <Link className="card" href={`/generate?template=${template.key}`} key={template.key}>
              <div>
                <div className="mini-art">{template.name}</div>
                <h3>{template.name}</h3>
                <p>{template.summary}</p>
              </div>
              <p>{template.priority}</p>
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
