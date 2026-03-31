# BOOX 用户需求分析（MediaCrawler 薄封装仓库）

本仓库将 [NanmiCoder/MediaCrawler](https://github.com/NanmiCoder/MediaCrawler) 以 **git submodule** 形式固定在 `third_party/MediaCrawler`，便于同步上游更新、在本机运行采集后把脚本与产出推送到你自己的 GitHub。

**当前约定远端**：[Sodamax778/expert-eureka](https://github.com/Sodamax778/expert-eureka)（`https://github.com/Sodamax778/expert-eureka.git`）。若本机尚未配置 `origin`，执行：

```bash
git remote add origin https://github.com/Sodamax778/expert-eureka.git
git push -u origin main
```

若已存在错误的 `origin`，可改为：`git remote set-url origin https://github.com/Sodamax778/expert-eureka.git`。

**推送报错 `fatal: 'origin' does not appear to be a git repository`**：说明未添加名为 `origin` 的远程，按上面 `git remote add` 即可。

若你希望改用其他仓库名，在 GitHub 新建空库后执行 `git remote set-url origin https://github.com/Sodamax778/<新仓库>.git`。

### GitHub 推送身份验证（HTTPS）

出现 **`Password authentication is not supported`** 时：GitHub 已不允许用「账户登录密码」推代码，需使用 **Personal Access Token（PAT）** 或改用 **SSH**。

使用 HTTPS 时，终端出现 `Username for 'https://github.com':` 后：

- **Username**：只填你的 GitHub 用户名（例如 `Sodamax778`），**不要**把整行 `git remote add ...` 或其它命令粘进去。
- **Password**：粘贴 PAT（在 GitHub → Settings → Developer settings → Personal access tokens 创建，勾选 `repo` 权限）。

更省事的方式：

- 安装 [GitHub CLI](https://cli.github.com/) 后执行 `gh auth login`，按提示登录；再在同一目录执行 `git push`。
- 或改用 SSH：将 `origin` 设为 `git@github.com:Sodamax778/expert-eureka.git`，并先在 GitHub 账户里添加本机 SSH 公钥。

## 环境与依赖

- **Python**：建议用 [uv](https://docs.astral.sh/uv/) 管理依赖（与上游 MediaCrawler 一致）。
- **Node.js**：上游部分步骤或工具链可能依赖 Node（按上游 README 为准）。
- **Playwright**：小红书等平台需浏览器自动化，需在 submodule 内安装浏览器。

合规提醒：MediaCrawler 上游面向学习研究，请遵守平台规则与法律要求，控制频率与规模。

## 首次克隆（含子模块）

```bash
git clone --recurse-submodules https://github.com/Sodamax778/expert-eureka.git
cd expert-eureka
```

若已克隆但未拉取子模块：

```bash
git submodule update --init --recursive
```

在子模块尚未成功检出前，本机 `git status` 可能显示 `third_party/MediaCrawler` 为未同步/删除，属正常现象；待上述命令在本机网络可达 GitHub 时执行成功后，工作区会恢复为已检出的子模块目录。

### 子模块下载失败（`curl 18` / `early EOF` / `RPC failed`）

多为网络不稳定导致 Git 传输中断。可换 Wi‑Fi、手机热点或稍后重试，然后在**仓库根目录**执行一键修复（会浅拉固定版本并同步关键词）：

```bash
bash scripts/fix_submodule_and_sync.sh
```

**终端使用注意**：请**每次只粘贴一行命令**并按回车；不要把多行命令粘在同一行，否则后面的 `pip`、`python` 不会执行。

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

评论开关、单帖评论条数、存储格式等仍可在 submodule 内 `config/base_config.py` 中调整；默认 JSONL 路径形如 `third_party/MediaCrawler/data/xhs/jsonl/search_contents_<日期>.jsonl` 与 `search_comments_<日期>.jsonl`。详见 [上游 data_storage_guide](https://github.com/NanmiCoder/MediaCrawler/blob/main/docs/data_storage_guide.md)。

## 本仓库脚本（关键词同步与 Markdown 导出）

仓库根目录（非子模块内）：

| 路径 | 作用 |
|------|------|
| `config/keywords_xhs_boox.yaml` | BOOX/文石相关搜索词，按分组维护 |
| `scripts/sync_keywords_to_medcrawler.py` | 写入子模块 `config/base_config.py` 的 `KEYWORDS`，并将 `xhs_config.SORT_TYPE` 设为 `time_descending`（最新优先，可用 `--no-sort-latest` 关闭） |
| `scripts/export_xhs_to_md.py` | 读取上述 JSONL，按笔记 `time` 过滤最近 N 天（默认 90），生成原始文本导向的 Markdown |
| `output/` | 建议将导出 `.md` 放在此目录并纳入版本管理 |
| `requirements-scripts.txt` | 仅脚本依赖：`PyYAML`（与 MediaCrawler 的 `uv` 环境分离） |
| `scripts/fix_submodule_and_sync.sh` | 网络导致子模块不完整时：拉齐代码并执行关键词同步 |

### 推荐流程（本机）

```bash
# 仓库根目录
bash scripts/fix_submodule_and_sync.sh   # 可选：子模块已完整时可跳过，直接下面两行

pip install -r requirements-scripts.txt   # 或 uv pip install -r requirements-scripts.txt

python scripts/sync_keywords_to_medcrawler.py

cd third_party/MediaCrawler
uv sync && uv run playwright install
uv run main.py --platform xhs --lt qrcode --type search

cd ../..
python scripts/export_xhs_to_md.py --since-days 90 --out output/xhs_boox_raw_$(date +%Y-%m-%d).md
```

说明：`export_xhs_to_md.py` 默认从 `third_party/MediaCrawler/data/xhs/jsonl/` 收集所有 `search_contents_*.jsonl` / `search_comments_*.jsonl`；也可用 `--contents`、`--comments` 指定文件。

按系列单独出 md（与 `config/keywords_xhs_boox.yaml` 中 `groups` 键名一致）：加 `--group`，例如 `--group p6_system`、`leaf5_series`、`t10c_series`、`ai_cross`（按 `source_keyword` 与 YAML 中该组词条精确匹配过滤）。

完成后：`git add` / `commit` / `push` 到 `https://github.com/Sodamax778/expert-eureka.git`。
