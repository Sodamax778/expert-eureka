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
uv run playwright install   # 或 uv run playwright install chromium，按上游文档
```

### 终端常见问题

| 现象 | 原因 | 处理 |
|------|------|------|
| `zsh: permission denied: .../MediaCrawler` | 把文件夹路径当成「程序」执行了 | 必须带 **`cd`**：`cd "/Users/你的用户名/.../third_party/MediaCrawler"` |
| 只输入了 `sync` | 少了前面的 `uv` | 正确是 **`uv sync`**（在已进入 `MediaCrawler` 目录后执行） |
| `command not found: uv` | 未安装 `uv`，或终端是安装前开的 | 安装：在终端执行 `curl -LsSf https://astral.sh/uv/install.sh \| sh`，然后**关掉终端再开**，或执行 `source ~/.zshrc`；确认 `uv` 在 `~/.local/bin` |

### `uv sync` / `playwright install` / `main.py` 各自做什么？

| 命令 | 作用 | 关系 |
|------|------|------|
| **`uv sync`** | 按子模块里的项目配置，下载并安装 **Python 依赖包**（装在 `MediaCrawler/.venv`） | 先做这一步，爬虫代码才能跑 |
| **`uv run playwright install`** | 再下载 **自动化用的浏览器内核**（Chromium 等）到本机缓存，供打开网页、扫码登录 | 依赖已在上一步装好；没有浏览器，程序无法打开小红书页面 |
| **`uv run main.py --platform xhs ...`** | **真正开始爬**：读 `config/base_config.py` 里的 `KEYWORDS`，打开浏览器、登录、搜索、把结果写入 `data/` | 必须单独占一行执行；若与别的命令粘在同一行，可能不会运行 |

若上游配置里 **`ENABLE_CDP_MODE = True`**，程序会尝试连接**本机已安装的 Chrome** 的调试端口，而不是刚装的 Playwright 浏览器，容易表现为窗口不对或终端「很久没新输出」。**本仓库建议在同步关键词时加 `--no-cdp`**，已写入 `ENABLE_CDP_MODE = False`。

**关于「想用 Safari」**：本爬虫基于 **Playwright**，只能驱动其自带的 **Chromium / Firefox / WebKit 引擎**。**不能**改成你 Mac 里默认的 **Safari.app**（苹果未提供与 Playwright 相同的自动化接口）。你看到的「像 Chrome 的浏览器」一般是 **Playwright 的 Chromium**，属正常。若需要接近 Safari 的排版，可研究上游是否支持 WebKit 通道，但**仍不是桌面 Safari**，且可能与反爬脚本不兼容，本仓库默认不切换。

**页面一闪就关**：常见原因是首页一直等 `load` 事件超时，进程报错退出后浏览器被关掉。同步脚本默认会给 `media_platform/xhs/core.py` 打补丁（`domcontentloaded` + 更长超时）；另建议加 **`--keep-browser-open`**，让任务跑完后也不自动关窗口，方便扫码。

**`Locator.click: Timeout` 点登录没反应**：说明**还没进入正常爬取**，程序在自动点「登录」时失败就退出了。本仓库在子模块 `media_platform/xhs/login.py` 中增加了多种登录按钮定位方式（仍可能被小红书改版打破）。若仍失败：在浏览器里**手动点开登录并完成扫码**后，可看上游是否支持 **cookie 登录**（`LOGIN_TYPE = cookie`）绕过自动点击。

### 小红书关键词搜索（二维码登录）

```bash
uv run main.py --platform xhs --lt qrcode --type search
```

评论开关、单帖评论条数、存储格式等仍可在 submodule 内 `config/base_config.py` 中调整；默认 JSONL 路径形如 `third_party/MediaCrawler/data/xhs/jsonl/search_contents_<日期>.jsonl` 与 `search_comments_<日期>.jsonl`。详见 [上游 data_storage_guide](https://github.com/NanmiCoder/MediaCrawler/blob/main/docs/data_storage_guide.md)。

## 本仓库脚本（关键词同步与 Markdown 导出）

仓库根目录（非子模块内）：

| 路径 | 作用 |
|------|------|
| `config/keywords_xhs_boox.yaml` | BOOX/文石相关搜索词，按分组维护 |
| `scripts/sync_keywords_to_medcrawler.py` | 写入 `KEYWORDS`、`SORT_TYPE`；**建议 `--no-cdp --keep-browser-open`**；并默认给小红书 `core.py` 打首页 `goto` 补丁（可用 `--skip-xhs-goto-patch` 关闭） |
| `scripts/export_xhs_to_md.py` | 读取上述 JSONL，按笔记 `time` 过滤最近 N 天（默认 90），生成原始文本导向的 Markdown |
| `scripts/deepseek_analyze_xhs.py` | 调用 DeepSeek Chat Completions API，分析导出的 Markdown 并生成需求/痛点/建议 |
| `output/` | 建议将导出 `.md` 放在此目录并纳入版本管理 |
| `requirements-scripts.txt` | 仅脚本依赖：`PyYAML`（与 MediaCrawler 的 `uv` 环境分离） |
| `scripts/fix_submodule_and_sync.sh` | 网络导致子模块不完整时：拉齐代码并执行关键词同步 |

### 推荐流程（本机）

```bash
# 仓库根目录
bash scripts/fix_submodule_and_sync.sh   # 可选：子模块已完整时可跳过，直接下面两行

pip install -r requirements-scripts.txt   # 或 uv pip install -r requirements-scripts.txt

python scripts/sync_keywords_to_medcrawler.py --no-cdp --keep-browser-open

cd third_party/MediaCrawler
uv sync
uv run playwright install    # 若先出现 400 再自动换镜像下载，属正常；第二次运行可能几乎无输出
uv run main.py --platform xhs --lt qrcode --type search   # 单独一行执行，勿与上一行粘在一起

cd ../..
python scripts/export_xhs_to_md.py --since-days 90 --out output/xhs_boox_raw_$(date +%Y-%m-%d).md
```

说明：`export_xhs_to_md.py` 默认从 `third_party/MediaCrawler/data/xhs/jsonl/` 收集所有 `search_contents_*.jsonl` / `search_comments_*.jsonl`；也可用 `--contents`、`--comments` 指定文件。

- **去重**：同 `note_id` 多条记录合并为一条（保留发布时间较新的）；评论按 `comment_id` 去重，无 id 则按正文去重。  
- **停爬后导出全部**：加 **`--all-dates`** 不做 90 天时间过滤，例如：  
  `python scripts/export_xhs_to_md.py --all-dates --out output/xhs_boox_dedup_$(date +%Y-%m-%d).md`

按系列单独出 md（与 `config/keywords_xhs_boox.yaml` 中 `groups` 键名一致）：加 `--group`，例如 `--group p6_system`、`leaf5_series`、`t10c_series`、`ai_cross`（按 `source_keyword` 与 YAML 中该组词条精确匹配过滤）。

### 使用 DeepSeek 分析导出的 Markdown

DeepSeek key 请只放在本机环境变量中，不要写入代码或提交到 Git：

```bash
cp .env.example .env
# 编辑 .env，把 DEEPSEEK_API_KEY=... 改成你的 key
set -a; source .env; set +a

python scripts/deepseek_analyze_xhs.py \
  --input output/xhs_boox_raw_$(date +%Y-%m-%d).md \
  --out output/xhs_boox_deepseek_analysis_$(date +%Y-%m-%d).md
```

默认模型为 `deepseek-chat`。如需推理模型，可设置环境变量或命令行参数：

```bash
DEEPSEEK_MODEL=deepseek-reasoner python scripts/deepseek_analyze_xhs.py --input <导出.md> --out <分析.md>
```

完成后：`git add` / `commit` / `push` 到 `https://github.com/Sodamax778/expert-eureka.git`。
