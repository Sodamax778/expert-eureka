#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""读取 MediaCrawler 产出的小红书 JSONL（contents + comments），按笔记发布时间过滤后导出为 Markdown（保留原文，不做摘要）。"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _note_time_to_epoch_seconds(value: Any) -> float | None:
    if value is None:
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    if n <= 0:
        return None
    # 小红书常见为毫秒
    if n > 1e12:
        n = n / 1000.0
    return n


def _format_ts(epoch: float | None) -> str:
    if epoch is None:
        return "N/A"
    try:
        dt = datetime.fromtimestamp(epoch, tz=timezone.utc).astimezone()
        return dt.strftime("%Y-%m-%d %H:%M:%S %z")
    except (OSError, ValueError, OverflowError):
        return str(epoch)


def _load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as e:
                print(f"跳过无效 JSONL 行 {path}:{line_no}: {e}", file=sys.stderr)
    return rows


def _discover_jsonl(data_dir: Path, prefix: str) -> list[Path]:
    if not data_dir.is_dir():
        return []
    return sorted(data_dir.glob(f"{prefix}_*.jsonl"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--since-days", type=int, default=90, help="只保留笔记发布时间在最近 N 天内")
    parser.add_argument(
        "--mc-root",
        type=Path,
        default=_repo_root() / "third_party" / "MediaCrawler",
        help="MediaCrawler 根目录（用于默认 data 路径）",
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=None,
        help="JSONL 目录，默认 <mc-root>/data/xhs/jsonl",
    )
    parser.add_argument(
        "--contents",
        type=Path,
        nargs="*",
        default=None,
        help="指定 search_contents_*.jsonl（可多个）；不指定则自动收集 data-dir 下全部",
    )
    parser.add_argument(
        "--comments",
        type=Path,
        nargs="*",
        default=None,
        help="指定 search_comments_*.jsonl；不指定则自动收集",
    )
    parser.add_argument(
        "--keywords-version-file",
        type=Path,
        default=_repo_root() / "config" / "keywords_xhs_boox.yaml",
        help="用于 front matter 的 keywords_version（读取其中 version 字段）",
    )
    parser.add_argument(
        "--out",
        type=Path,
        required=True,
        help="输出 Markdown 路径，例如 output/xhs_boox_raw_2026-03-31.md",
    )
    args = parser.parse_args()

    data_dir = args.data_dir or (args.mc_root / "data" / "xhs" / "jsonl")

    content_files = list(args.contents) if args.contents else _discover_jsonl(data_dir, "search_contents")
    comment_files = list(args.comments) if args.comments else _discover_jsonl(data_dir, "search_comments")

    if not content_files:
        print(f"未找到笔记 JSONL。请确认已爬取且路径存在: {data_dir}", file=sys.stderr)
        return 1

    all_notes: dict[str, dict[str, Any]] = {}
    for fp in content_files:
        for row in _load_jsonl(fp):
            nid = row.get("note_id")
            if not nid:
                continue
            # 同 note_id 保留最后一次出现
            all_notes[str(nid)] = row

    comments_by_note: dict[str, list[str]] = defaultdict(list)
    for fp in comment_files:
        for row in _load_jsonl(fp):
            nid = row.get("note_id")
            if not nid:
                continue
            text = row.get("content")
            if text:
                comments_by_note[str(nid)].append(str(text))

    now = datetime.now(timezone.utc).timestamp()
    cutoff = now - args.since_days * 86400

    filtered: list[tuple[str, dict[str, Any]]] = []
    for nid, row in all_notes.items():
        t = _note_time_to_epoch_seconds(row.get("time"))
        if t is None:
            t = _note_time_to_epoch_seconds(row.get("last_update_time"))
        if t is None or t < cutoff:
            continue
        filtered.append((nid, row))

    filtered.sort(key=lambda x: _note_time_to_epoch_seconds(x[1].get("time")) or 0, reverse=True)

    kw_version = "N/A"
    if args.keywords_version_file.is_file():
        try:
            raw = args.keywords_version_file.read_text(encoding="utf-8")
            for line in raw.splitlines():
                if line.strip().startswith("version:"):
                    kw_version = line.split(":", 1)[1].strip().strip('"').strip("'")
                    break
        except OSError:
            pass

    generated_at = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%dT%H:%M:%S%z")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    lines: list[str] = [
        "---",
        f"generated_at: {generated_at}",
        f"date_window_days: {args.since_days}",
        f"keywords_version: {kw_version}",
        "source: MediaCrawler",
        "---",
        "",
        f"共 {len(filtered)} 条笔记（按 `time` 落在最近 {args.since_days} 天内；无时间字段的已排除）。",
        "",
    ]

    for nid, row in filtered:
        title = row.get("title") or "N/A"
        desc = row.get("desc") or "N/A"
        pub = _format_ts(_note_time_to_epoch_seconds(row.get("time")))
        url = row.get("note_url") or "N/A"
        sk = row.get("source_keyword") or "N/A"
        lines.append(f"## 笔记 `{nid}`")
        lines.append("")
        lines.append(f"- **标题**: {title}")
        lines.append(f"- **正文**: {desc}")
        lines.append(f"- **发布时间**: {pub}")
        lines.append(f"- **链接**: {url}")
        lines.append(f"- **来源关键词**: {sk}")
        lines.append("- **评论原文**:")
        cmts = comments_by_note.get(nid, [])
        if not cmts:
            lines.append("  - N/A")
        else:
            for c in cmts:
                lines.append(f"  - {c}")
        lines.append("")

    args.out.write_text("\n".join(lines), encoding="utf-8")
    print(f"已写入 {args.out}（{len(filtered)} 条笔记）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
