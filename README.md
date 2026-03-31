# BOOX 用户需求分析（MediaCrawler 薄封装仓库）

本仓库将 [NanmiCoder/MediaCrawler](https://github.com/NanmiCoder/MediaCrawler) 以 **git submodule** 形式固定在 `third_party/MediaCrawler`，便于同步上游更新、在本机运行采集后把脚本与产出推送到你自己的 GitHub。

**建议远端**：在 [Sodamax778 的 GitHub](https://github.com/Sodamax778?tab=repositories) 上新建空仓库（或使用已有仓库），将本目录推送到该远端，例如：

```bash
git remote add origin https://github.com/Sodamax778/<你的仓库名>.git
git push -u origin main
```

## 环境与依赖

- **Python**：建议用 [uv](https://docs.astral.sh/uv/) 管理依赖（与上游 MediaCrawler 一致）。
- **Node.js**：上游部分步骤或工具链可能依赖 Node（按上游 README 为准）。
- **Playwright**：小红书等平台需浏览器自动化，需在 submodule 内安装浏览器。

合规提醒：MediaCrawler 上游面向学习研究，请遵守平台规则与法律要求，控制频率与规模。

## 首次克隆（含子模块）

```bash
git clone --recurse-submodules https://github.com/Sodamax778/<你的仓库名>.git
cd <你的仓库名>
```

若已克隆但未拉取子模块：

```bash
git submodule update --init --recursive
```

在子模块尚未成功检出前，本机 `git status` 可能显示 `third_party/MediaCrawler` 为未同步/删除，属正常现象；待上述命令在本机网络可达 GitHub 时执行成功后，工作区会恢复为已检出的子模块目录。

## 子模块固定版本（pinned commit）

当前子模块指向上游 **固定 commit**（非「始终跟踪 main」）：

| 项目 | 值 |
|------|-----|
| 上游仓库 | `https://github.com/NanmiCoder/MediaCrawler.git` |
| 固定 commit | `e8b18683a014a143a6bc8a59f4282e2e6c6128e9` |
| 说明 | 对应上游 `main` 在 2026-03-24 附近的快照（`update docs`） |

升级上游时（在本机网络可访问 GitHub 的前提下）：

```bash
cd third_party/MediaCrawler
git fetch origin
git checkout <新的 commit 或 tag>
cd ../..
git add third_party/MediaCrawler
git commit -m "chore: bump MediaCrawler submodule"
```

## 安装与运行（在子模块目录内）

以下命令在 **子模块路径** 执行，与上游 README 一致（登录方式、平台参数以 `uv run main.py --help` 为准）：

```bash
cd third_party/MediaCrawler
uv sync
uv run playwright install   # 或 playwright install chromium，按上游文档
```

小红书关键词搜索示例（二维码登录，具体选项以当前版本为准）：

```bash
uv run main.py --platform xhs --lt qrcode --type search
```

关键词、评论开关、排序与存储格式等请在 submodule 内的 `config/base_config.py`、`config/xhs_config.py`（或当前版本等价文件）中按 [上游文档](https://github.com/NanmiCoder/MediaCrawler/blob/main/docs/data_storage_guide.md) 调整。

## 本仓库后续脚本（规划中）

按计划可在此仓库根目录增加（与 submodule 并列，不复制上游全文）：

- `config/keywords_xhs_boox.yaml` — 关键词清单
- `scripts/sync_keywords_to_medcrawler.py` — 写入上游配置
- `scripts/export_xhs_to_md.py` — 从 JSONL 等导出 Markdown
- `output/` — Markdown 产物

流程就绪后：本机运行采集 → 导出 → `git add` / `commit` / `push` 到 `https://github.com/Sodamax778/<仓库名>.git`。
