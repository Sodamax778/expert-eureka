#!/usr/bin/env bash
# 子模块克隆中断（curl 18 / early EOF）时：浅层拉取固定版本并同步关键词。
# 用法：在仓库根目录执行  bash scripts/fix_submodule_and_sync.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PIN="e8b18683a014a143a6bc8a59f4282e2e6c6128e9"
SUB="$ROOT/third_party/MediaCrawler"

echo "== 1/4 增大 Git 缓冲（降低大仓库传输中断概率，可重复执行）"
git config --global http.postBuffer 524288000 2>/dev/null || true
git config --global http.version HTTP/1.1 2>/dev/null || true

echo "== 2/4 进入子模块并拉取固定版本（浅克隆）"
mkdir -p "$ROOT/third_party"
if [[ ! -f "$SUB/.git" ]] && [[ ! -d "$SUB/.git" ]]; then
  echo "未找到子模块目录，尝试: git submodule update --init --recursive"
  git submodule update --init --recursive || true
fi

if [[ ! -d "$SUB" ]]; then
  echo "错误: 仍无 $SUB，请检查网络后重试。"
  exit 1
fi

cd "$SUB"
# 若工作区是空的但存在 gitdir，直接 fetch + checkout
if [[ ! -f "config/base_config.py" ]]; then
  echo "子模块文件不完整，正在拉取 commit $PIN ..."
  git fetch --depth 1 origin "$PIN" || git fetch origin "$PIN"
  git checkout -f "$PIN"
fi

if [[ ! -f "config/base_config.py" ]]; then
  echo "错误: 仍无 config/base_config.py。请换稳定网络或开 VPN 后重试本脚本。"
  exit 1
fi

echo "== 3/4 安装脚本依赖（PyYAML）"
cd "$ROOT"
pip3 install -r requirements-scripts.txt

echo "== 4/4 同步 YAML 关键词到 MediaCrawler"
python3 scripts/sync_keywords_to_medcrawler.py --no-cdp --keep-browser-open

echo ""
echo "完成。下一步："
echo "  cd third_party/MediaCrawler && uv sync && uv run playwright install"
echo "  uv run main.py --platform xhs --lt qrcode --type search"
