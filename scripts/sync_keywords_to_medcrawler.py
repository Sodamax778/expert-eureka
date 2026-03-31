#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""将 config/keywords_xhs_boox.yaml 写入 MediaCrawler 的 base_config.KEYWORDS，并可将小红书排序改为「最新」。"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("请先安装依赖: pip install -r requirements-scripts.txt", file=sys.stderr)
    raise


def _repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _load_keywords_yaml(path: Path) -> tuple[str, list[str]]:
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    version = str(data.get("version", "0"))
    groups = data.get("groups") or {}
    seen: set[str] = set()
    ordered: list[str] = []
    if isinstance(groups, dict):
        for _name, items in groups.items():
            if not items:
                continue
            for kw in items:
                if kw is None:
                    continue
                s = str(kw).strip()
                if not s or s in seen:
                    continue
                seen.add(s)
                ordered.append(s)
    return version, ordered


def _join_keywords_medcrawler(keywords: list[str]) -> str:
    # 上游格式：英文逗号分隔；关键词内若含逗号则替换为中文逗号，避免被拆成多个关键词
    parts: list[str] = []
    for s in keywords:
        parts.append(s.replace(",", "，"))
    return ",".join(parts)


def _replace_line(content: str, pattern: re.Pattern[str], new_line: str) -> str:
    if not pattern.search(content):
        raise ValueError("未找到匹配行，请确认上游 base_config.py / xhs_config.py 结构未变")
    return pattern.sub(new_line, content, count=1)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--keywords-yaml",
        type=Path,
        default=_repo_root() / "config" / "keywords_xhs_boox.yaml",
        help="关键词 YAML 路径",
    )
    parser.add_argument(
        "--mc-root",
        type=Path,
        default=_repo_root() / "third_party" / "MediaCrawler",
        help="MediaCrawler 仓库根目录（含 config/base_config.py）",
    )
    parser.add_argument(
        "--no-sort-latest",
        action="store_true",
        help="不修改 xhs_config.SORT_TYPE（默认会改为 time_descending 以优先最新笔记）",
    )
    args = parser.parse_args()
    sort_latest = not args.no_sort_latest

    if not args.keywords_yaml.is_file():
        print(f"找不到关键词文件: {args.keywords_yaml}", file=sys.stderr)
        return 1
    base_config = args.mc_root / "config" / "base_config.py"
    xhs_config = args.mc_root / "config" / "xhs_config.py"
    if not base_config.is_file():
        print(
            f"找不到 {base_config}。请先: git submodule update --init",
            file=sys.stderr,
        )
        return 1

    version, keywords = _load_keywords_yaml(args.keywords_yaml)
    if not keywords:
        print("YAML 中无有效关键词", file=sys.stderr)
        return 1

    joined = _join_keywords_medcrawler(keywords)
    # 与上游一致：KEYWORDS = "..."
    keywords_line = f'KEYWORDS = {repr(joined)}'

    text = base_config.read_text(encoding="utf-8")
    text = _replace_line(
        text,
        re.compile(r"^KEYWORDS\s*=\s*.+$", re.MULTILINE),
        keywords_line,
    )
    with base_config.open("w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print(f"已写入 {len(keywords)} 个关键词到 {base_config}（keywords_version={version!r}）")

    if sort_latest and xhs_config.is_file():
        xhs_text = xhs_config.read_text(encoding="utf-8")
        xhs_text = _replace_line(
            xhs_text,
            re.compile(r"^SORT_TYPE\s*=\s*.+$", re.MULTILINE),
            'SORT_TYPE = "time_descending"',
        )
        with xhs_config.open("w", encoding="utf-8", newline="\n") as f:
            f.write(xhs_text)
        print(f"已将 SORT_TYPE 设为 time_descending: {xhs_config}")

    print(
        "下一步在子模块目录执行: uv run main.py --platform xhs --lt qrcode --type search",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
