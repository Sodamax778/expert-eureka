#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""将小红书 JSONL（contents + comments）按笔记发布时间过滤后导出为 Markdown。"""

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
            except json.JSONDecodeError as exc:
                print(f"跳过无效 JSONL 行 {path}:{line_no}: {exc}", file=sys.stderr)
    return rows


def _discover_jsonl(data_dir: Path, prefix: str) -> list[Path]:
    if not data_dir.is_dir():
        return []
    return sorted(data_dir.glob(f"{prefix}_*.jsonl"))


def _pick_newer_note(a: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    ta = _note_time_to_epoch_seconds(a.get("time")) or 0
    tb = _note_time_to_epoch_seconds(b.get("time")) or 0
    if tb > ta:
        return b
    if tb < ta:
        return a
    la = float(a.get("last_modify_ts") or 0)
    lb = float(b.get("last_modify_ts") or 0)
    return b if lb >= la else a


def _dedupe_comments_for_note(rows: list[dict[str, Any]]) -> list[str]:
    seen_ids: set[str] = set()
    seen_text: set[str] = set()
    out: list[str] = []
    for row in rows:
        text = (row.get("content") or "").strip()
        if not text:
            continue
        cid = row.get("comment_id")
        if cid is not None and str(cid):
            comment_id = str(cid)
            if comment_id in seen_ids:
                continue
            seen_ids.add(comment_id)
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
    return {str(item).strip() for item in raw if item is not None and str(item).strip()}


def _read_keywords_version(path: Path) -> str:
    if not path.is_file():
        return "N/A"
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        return "N/A"
    for line in raw.splitlines():
        if line.strip().startswith("version:"):
            return line.split(":", 1)[1].strip().strip('"').strip("'")
    return "N/A"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--since-days", type=int, default=90, help="只保留最近 N 天笔记")
    parser.add_argument("--all-dates", action="store_true", help="不按时间过滤")
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=_repo_root() / "data" / "raw" / "xhs" / "jsonl",
        help="JSONL 目录，默认 data/raw/xhs/jsonl",
    )
    parser.add_argument("--contents", type=Path, nargs="*", default=None, help="指定 search_contents_*.jsonl")
    parser.add_argument("--comments", type=Path, nargs="*", default=None, help="指定 search_comments_*.jsonl")
    parser.add_argument(
        "--keywords-version-file",
        type=Path,
        default=_repo_root() / "config" / "keywords_xhs_boox.yaml",
        help="关键词 YAML，用于读取 version 和 group",
    )
    parser.add_argument("--group", type=str, default=None, metavar="NAME", help="仅导出指定关键词分组")
    parser.add_argument("--out", type=Path, required=True, help="输出 Markdown 路径")
    args = parser.parse_args()

    use_date_filter = not args.all_dates
    group_keywords: set[str] | None = None
    if args.group:
        try:
            group_keywords = _keywords_for_group(args.keywords_version_file, args.group)
        except (OSError, ValueError, RuntimeError) as exc:
            print(str(exc), file=sys.stderr)
            return 1

    content_files = list(args.contents) if args.contents else _discover_jsonl(args.data_dir, "search_contents")
    comment_files = list(args.comments) if args.comments else _discover_jsonl(args.data_dir, "search_comments")
    if not content_files:
        print(f"未找到笔记 JSONL。请确认路径存在: {args.data_dir}", file=sys.stderr)
        return 1

    all_notes: dict[str, dict[str, Any]] = {}
    content_row_count = 0
    for fp in content_files:
        for row in _load_jsonl(fp):
            content_row_count += 1
            note_id = row.get("note_id")
            if not note_id:
                continue
            key = str(note_id)
            if key not in all_notes:
                all_notes[key] = row
            else:
                all_notes[key] = _pick_newer_note(all_notes[key], row)

    raw_comments: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for fp in comment_files:
        for row in _load_jsonl(fp):
            note_id = row.get("note_id")
            if note_id:
                raw_comments[str(note_id)].append(row)

    comments_by_note = {note_id: _dedupe_comments_for_note(rows) for note_id, rows in raw_comments.items()}

    now = datetime.now(timezone.utc).timestamp()
    cutoff = now - args.since_days * 86400
    filtered: list[tuple[str, dict[str, Any]]] = []
    for note_id, row in all_notes.items():
        note_time = _note_time_to_epoch_seconds(row.get("time"))
        if note_time is None:
            note_time = _note_time_to_epoch_seconds(row.get("last_update_time"))
        if use_date_filter and (note_time is None or note_time < cutoff):
            continue
        if group_keywords is not None and (row.get("source_keyword") or "").strip() not in group_keywords:
            continue
        filtered.append((note_id, row))

    filtered.sort(key=lambda item: _note_time_to_epoch_seconds(item[1].get("time")) or 0, reverse=True)

    generated_at = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%dT%H:%M:%S%z")
    args.out.parent.mkdir(parents=True, exist_ok=True)

    lines: list[str] = [
        "---",
        f"generated_at: {generated_at}",
        f"date_window_days: {args.since_days if use_date_filter else 'all'}",
        f"keywords_version: {_read_keywords_version(args.keywords_version_file)}",
        "source: xhs-jsonl",
        "deduplicated: true",
        f"notes_input_rows: {content_row_count}",
        f"notes_unique: {len(all_notes)}",
    ]
    if args.group:
        lines.append(f"keyword_group: {args.group}")
    lines.extend(
        [
            "---",
            "",
            f"共 {len(filtered)} 条笔记（已按 note_id 去重；评论已按 comment_id/正文去重）。",
            "",
        ]
    )

    for note_id, row in filtered:
        lines.extend(
            [
                f"## 笔记 `{note_id}`",
                "",
                f"- **标题**: {row.get('title') or 'N/A'}",
                f"- **正文**: {row.get('desc') or 'N/A'}",
                f"- **发布时间**: {_format_ts(_note_time_to_epoch_seconds(row.get('time')))}",
                f"- **链接**: {row.get('note_url') or 'N/A'}",
                f"- **来源关键词**: {row.get('source_keyword') or 'N/A'}",
                "- **评论原文**:",
            ]
        )
        comments = comments_by_note.get(note_id, [])
        if not comments:
            lines.append("  - N/A")
        else:
            lines.extend(f"  - {comment}" for comment in comments)
        lines.append("")

    args.out.write_text("\n".join(lines), encoding="utf-8")
    print(f"已写入 {args.out}（{len(filtered)} 条笔记）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
