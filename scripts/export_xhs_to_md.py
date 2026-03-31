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

try:
    import yaml
except ImportError:
    yaml = None  # type: ignore


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


def _pick_newer_note(a: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    """同 note_id 多条记录时保留时间更新的那条（用于去重）。"""
    ta = _note_time_to_epoch_seconds(a.get("time")) or 0
    tb = _note_time_to_epoch_seconds(b.get("time")) or 0
    if tb > ta:
        return b
    if tb < ta:
        return a
    la = float(a.get("last_modify_ts") or 0)
    lb = float(b.get("last_modify_ts") or 0)
    return b if lb >= la else a


def _dedupe_comments_for_note(
    rows: list[dict[str, Any]],
) -> list[str]:
    """同一笔记多条评论：按 comment_id 去重，无 id 则按正文去重，保持首次出现顺序。"""
    seen_ids: set[str] = set()
    seen_text: set[str] = set()
    out: list[str] = []
    for row in rows:
        text = (row.get("content") or "").strip()
        if not text:
            continue
        cid = row.get("comment_id")
        if cid is not None and str(cid):
            s = str(cid)
            if s in seen_ids:
                continue
            seen_ids.add(s)
            out.append(text)
            seen_text.add(text)
            continue
        if text in seen_text:
            continue
        seen_text.add(text)
        out.append(text)
    return out


def _keywords_for_group(yaml_path: Path, group_name: str) -> set[str]:
    if yaml is None:
        raise RuntimeError("按分组过滤需要 PyYAML，请执行: pip install -r requirements-scripts.txt")
    data = yaml.safe_load(yaml_path.read_text(encoding="utf-8")) or {}
    groups = data.get("groups") or {}
    if group_name not in groups:
        names = ", ".join(sorted(groups.keys())) or "(无)"
        raise ValueError(f"未知分组 {group_name!r}。可选: {names}")
    raw = groups[group_name]
    if not isinstance(raw, list):
        raise ValueError(f"分组 {group_name!r} 应为列表")
    out: set[str] = set()
    for item in raw:
        if item is None:
            continue
        s = str(item).strip()
        if s and not s.startswith("#"):
            out.add(s)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--since-days",
        type=int,
        default=90,
        help="只保留笔记发布时间在最近 N 天内；与 --all-dates 互斥",
    )
    parser.add_argument(
        "--all-dates",
        action="store_true",
        help="不按时间过滤，导出 JSONL 内去重后的全部笔记（适合已停爬、只整理存量数据）",
    )
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
        help="用于 front matter 的 keywords_version（读取其中 version 字段）；与 --group 共用同一文件",
    )
    parser.add_argument(
        "--group",
        type=str,
        default=None,
        metavar="NAME",
        help="仅保留 source_keyword 属于该 YAML 分组下列词的笔记（如 p6_system、leaf5_series、t10c_series、ai_cross）；不设则合并全部分组",
    )
    parser.add_argument(
        "--out",
        type=Path,
        required=True,
        help="输出 Markdown 路径，例如 output/xhs_boox_raw_2026-03-31.md",
    )
    args = parser.parse_args()
    if args.all_dates and args.since_days != 90:
        print("已指定 --all-dates，将忽略 --since-days", file=sys.stderr)
    use_date_filter = not args.all_dates

    group_keywords: set[str] | None = None
    if args.group:
        try:
            group_keywords = _keywords_for_group(args.keywords_version_file, args.group)
        except (OSError, ValueError, RuntimeError) as e:
            print(str(e), file=sys.stderr)
            return 1

    data_dir = args.data_dir or (args.mc_root / "data" / "xhs" / "jsonl")

    content_files = list(args.contents) if args.contents else _discover_jsonl(data_dir, "search_contents")
    comment_files = list(args.comments) if args.comments else _discover_jsonl(data_dir, "search_comments")

    if not content_files:
        print(f"未找到笔记 JSONL。请确认已爬取且路径存在: {data_dir}", file=sys.stderr)
        return 1

    # 笔记：同 note_id 合并为一条，取 time 较新（若无则比 last_modify_ts）
    all_notes: dict[str, dict[str, Any]] = {}
    content_row_count = 0
    for fp in content_files:
        for row in _load_jsonl(fp):
            content_row_count += 1
            nid = row.get("note_id")
            if not nid:
                continue
            k = str(nid)
            if k not in all_notes:
                all_notes[k] = row
            else:
                all_notes[k] = _pick_newer_note(all_notes[k], row)

    raw_comments: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for fp in comment_files:
        for row in _load_jsonl(fp):
            nid = row.get("note_id")
            if not nid:
                continue
            raw_comments[str(nid)].append(row)

    comments_by_note: dict[str, list[str]] = {}
    for nid, rows in raw_comments.items():
        comments_by_note[nid] = _dedupe_comments_for_note(rows)

    now = datetime.now(timezone.utc).timestamp()
    cutoff = now - args.since_days * 86400

    filtered: list[tuple[str, dict[str, Any]]] = []
    for nid, row in all_notes.items():
        t = _note_time_to_epoch_seconds(row.get("time"))
        if t is None:
            t = _note_time_to_epoch_seconds(row.get("last_update_time"))
        if use_date_filter:
            if t is None or t < cutoff:
                continue
        if group_keywords is not None:
            sk = (row.get("source_keyword") or "").strip()
            if sk not in group_keywords:
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
        f"date_window_days: {args.since_days if use_date_filter else 'all'}",
        f"keywords_version: {kw_version}",
        "source: MediaCrawler",
        "deduplicated: true",
        f"notes_input_rows: {content_row_count}",
        f"notes_unique: {len(all_notes)}",
    ]
    if args.group:
        lines.append(f"keyword_group: {args.group}")
    summary = (
        f"共 {len(filtered)} 条笔记（已按 `note_id` 去重；评论已按 `comment_id`/正文去重）"
        + (
            f"；时间范围：最近 {args.since_days} 天"
            if use_date_filter
            else "；**未做时间过滤**（--all-dates）"
        )
        + (f"；仅分组 `{args.group}`" if args.group else "")
        + "。"
    )
    lines.extend(["---", "", summary, ""])

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
