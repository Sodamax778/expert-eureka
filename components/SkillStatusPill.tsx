"use client";

import { useEffect, useState } from "react";
import { getWereadSkillKey } from "@/lib/browser-storage";

export function SkillStatusPill() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const refresh = () => setConnected(Boolean(getWereadSkillKey()));
    refresh();
    window.addEventListener("weread-connection-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("weread-connection-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return <span className={connected ? "status-pill loaded" : "status-pill"}>{connected ? "已装载" : "未连接"}</span>;
}
