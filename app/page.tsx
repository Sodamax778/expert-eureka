"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { CompactConnectionPanel } from "@/components/ConnectionPanel";
import { FontLibrary } from "@/components/FontLibrary";
import { SceneOutputs } from "@/components/SceneOutputs";
import { SkillStatusPill } from "@/components/SkillStatusPill";
import { defaultFontKey } from "@/lib/font-catalog";
import type { TemplateKey } from "@/lib/templates";

const scenes = [
  {
    key: "weekly_receipt" as TemplateKey,
    title: "每周购物小票",
    desc: "把本周读过的 5 本书，打印成一张阅读账单。",
    tone: "receipt",
    source: "微信读书"
  },
  {
    key: "reading_calendar" as TemplateKey,
    title: "本月阅读记录",
    desc: "每天读过的书，在手绘月历上连续铺开。",
    tone: "calendar",
    source: "微信读书"
  }
];

export default function Home() {
  const [preferredFontKey, setPreferredFontKey] = useState(defaultFontKey);
  const [fontLibraryVersion, setFontLibraryVersion] = useState(0);

  useEffect(() => {
    const savedFontKey = window.localStorage.getItem("xiaowen-preferred-font");
    if (savedFontKey) setPreferredFontKey(savedFontKey);
  }, []);

  function selectPreferredFont(fontKey: string) {
    setPreferredFontKey(fontKey);
    window.localStorage.setItem("xiaowen-preferred-font", fontKey);
  }

  return (
    <AppShell>
      <div className="doodle-home">
        <header className="doodle-topbar">
          <a className="doodle-brand" href="#scenes" aria-label="薯饼壁纸实验室首页">
            <span className="doodle-brand-mark">薯饼</span>
            <strong>-壁纸实验室</strong>
          </a>
          <div className="doodle-top-actions">
            <div className="doodle-source-status">
              <span>微信读书</span>
              <SkillStatusPill />
            </div>
            <FontLibrary
              selectedFontKey={preferredFontKey}
              onSelect={selectPreferredFont}
              onLibraryChange={() => setFontLibraryVersion((value) => value + 1)}
            />
          </div>
        </header>

        <div className="doodle-workspace">
          <section className="doodle-intro" aria-labelledby="home-title">
            <div className="doodle-intro-copy">
              <span className="doodle-kicker">A reader lives a thousand lives.</span>
              <h1 id="home-title">
                <span className="editorial-title-line">把读过的书，</span>
                <span className="editorial-title-line">留在每天见面的屏幕上。</span>
              </h1>
              <p>装载微信读书 Skill Key，选择小票或月历。数据只在当前浏览器中使用。</p>
              <div className="editorial-doodles" aria-hidden="true">
                <span className="editorial-star">✦</span>
                <span className="editorial-wave">∿ ∿ ∿</span>
                <span className="editorial-bookmark" />
                <span className="editorial-coffee" />
              </div>
            </div>

            <div className="doodle-connection">
              <div className="doodle-section-label">
                <span>01</span>
                <strong>连接微信读书</strong>
              </div>
              <CompactConnectionPanel />
            </div>
          </section>

          <section className="doodle-scenes" id="scenes" aria-labelledby="scenes-title">
            <div className="doodle-section-head">
              <div>
                <span>02</span>
                <h2 id="scenes-title">屏保灵感</h2>
              </div>
              <p>点击卡片，打开实时预览与设置。</p>
            </div>
            <SceneOutputs
              scenes={scenes}
              preferredFontKey={preferredFontKey}
              fontLibraryVersion={fontLibraryVersion}
            />
          </section>
        </div>
      </div>
    </AppShell>
  );
}
