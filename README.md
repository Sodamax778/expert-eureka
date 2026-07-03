# 小文 AI

这是小文 AI 后续开发与资料整理的私有代码库底座。

当前仓库已从早期 BOOX/MediaCrawler 薄封装形态清理为自有项目结构：不再绑定第三方 git submodule，不再把采集工具代码直接纳入仓库；只保留可复用的关键词配置、数据整理脚本和输出目录约定。

## 目录结构

```text
config/
  keywords_xhs_boox.yaml      # 小红书/BOOX 需求调研关键词，可继续扩展或替换
scripts/
  export_xhs_to_md.py         # 将采集得到的 JSONL 整理为 Markdown
output/
  .gitkeep                    # Markdown/报告输出目录占位
data/raw/xhs/jsonl/
  .gitkeep                    # 本地原始 JSONL 默认放置目录
requirements-scripts.txt      # 仓库脚本依赖
```

## 本地准备

```bash
python -m venv .venv
. .venv/bin/activate  # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements-scripts.txt
```

## 导出小红书 JSONL 为 Markdown

默认读取 `data/raw/xhs/jsonl/` 下的：

- `search_contents_*.jsonl`
- `search_comments_*.jsonl`

示例：

```bash
python scripts/export_xhs_to_md.py --since-days 90 --out output/xhs_boox_raw.md
```

导出全部存量数据：

```bash
python scripts/export_xhs_to_md.py --all-dates --out output/xhs_boox_all.md
```

按关键词分组导出：

```bash
python scripts/export_xhs_to_md.py --group p6_system --out output/xhs_boox_p6.md
```

也可以显式指定数据目录：

```bash
python scripts/export_xhs_to_md.py --data-dir /path/to/jsonl --out output/xhs_boox_raw.md
```

## 数据与隐私约定

- 仓库应保持 private，仅自己可见。
- 原始采集数据默认不提交，放在 `data/raw/` 本地处理。
- `output/` 可存放需要版本管理的整理结果；若包含个人信息、账号信息或未脱敏评论，应先确认可提交。
- 不提交 `.env`、令牌、cookie、浏览器会话、数据库文件和缓存目录。

## 后续开发建议

- 将小文 AI 的核心代码放入 `src/` 或应用框架推荐目录。
- 将一次性脚本放入 `scripts/`，稳定模块再沉淀为包内代码。
- 新增外部服务前，优先通过 `.env.example` 记录变量名，不提交真实密钥。
