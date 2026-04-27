#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""调用 DeepSeek API 分析已导出的 BOOX 小红书 Markdown。"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-chat"
DEFAULT_SYSTEM_PROMPT = (
    "你是一个中文用户研究分析师。请基于输入的小红书笔记和评论原文，"
    "提炼 BOOX/文石产品的用户需求、痛点、正向反馈和可执行产品建议。"
)
DEFAULT_USER_PROMPT = """请输出结构化中文分析：

1. 高频需求与痛点（按重要性排序）
2. 不同机型/系列的差异
3. 用户原话证据（引用简短原文）
4. 产品/运营可执行建议
5. 仍需补充采样的问题
"""


def _read_optional_file(value: str) -> str:
    path = Path(value)
    if path.is_file():
        return path.read_text(encoding="utf-8")
    return value


def _chat_completion(
    *,
    api_key: str,
    base_url: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    source_text: str,
    temperature: float,
    max_tokens: int,
) -> str:
    endpoint = f"{base_url.rstrip('/')}/chat/completions"
    payload: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"{user_prompt}\n\n以下是待分析文本：\n\n{source_text}",
            },
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        endpoint,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"DeepSeek API 请求失败: HTTP {e.code}: {detail}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"DeepSeek API 网络请求失败: {e.reason}") from e

    try:
        return str(data["choices"][0]["message"]["content"]).strip()
    except (KeyError, IndexError, TypeError) as e:
        raise RuntimeError(f"DeepSeek API 返回格式异常: {data}") from e


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=Path,
        required=True,
        help="由 export_xhs_to_md.py 导出的 Markdown 文件",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="分析结果输出路径；不指定则打印到标准输出",
    )
    parser.add_argument(
        "--api-key-env",
        default="DEEPSEEK_API_KEY",
        help="读取 DeepSeek API key 的环境变量名",
    )
    parser.add_argument(
        "--base-url",
        default=os.environ.get("DEEPSEEK_BASE_URL", DEFAULT_BASE_URL),
        help="DeepSeek API base URL",
    )
    parser.add_argument(
        "--model",
        default=os.environ.get("DEEPSEEK_MODEL", DEFAULT_MODEL),
        help="DeepSeek 模型名，例如 deepseek-chat 或 deepseek-reasoner",
    )
    parser.add_argument(
        "--system-prompt",
        default=DEFAULT_SYSTEM_PROMPT,
        help="system prompt 文本；若值是文件路径则读取文件内容",
    )
    parser.add_argument(
        "--prompt",
        default=DEFAULT_USER_PROMPT,
        help="用户分析指令；若值是文件路径则读取文件内容",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=0.2,
        help="采样温度",
    )
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=4000,
        help="最多生成 token 数",
    )
    args = parser.parse_args()

    if not args.input.is_file():
        print(f"找不到输入文件: {args.input}", file=sys.stderr)
        return 1

    api_key = os.environ.get(args.api_key_env)
    if not api_key:
        print(
            f"请先设置环境变量 {args.api_key_env}，不要把 API key 写入代码或提交到仓库。",
            file=sys.stderr,
        )
        return 1

    source_text = args.input.read_text(encoding="utf-8")
    if not source_text.strip():
        print(f"输入文件为空: {args.input}", file=sys.stderr)
        return 1

    try:
        result = _chat_completion(
            api_key=api_key,
            base_url=args.base_url,
            model=args.model,
            system_prompt=_read_optional_file(args.system_prompt),
            user_prompt=_read_optional_file(args.prompt),
            source_text=source_text,
            temperature=args.temperature,
            max_tokens=args.max_tokens,
        )
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 1

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(result + "\n", encoding="utf-8")
        print(f"已写入 DeepSeek 分析结果: {args.out}")
    else:
        print(result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
