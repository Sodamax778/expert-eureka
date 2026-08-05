# 薯饼壁纸实验室

薯饼壁纸实验室把微信读书的阅读记录填入固定 SVG 模板，生成适配文石 Leaf 系列的 JPG 壁纸。当前版本不调用 AI 生图，核心是“数据归一化 + 模板占位渲染”。

## 当前能力

- 微信读书 Skill Key 真实调用，Key 只保存在用户自己的浏览器。
- 2 个首发场景：每周购物小票、本月阅读记录。
- 文石 Leaf 系列竖版尺寸、模板选项和自动预览。
- 系统字体与用户字体导入；用户字体保存在浏览器 IndexedDB，生成时临时子集化并嵌入 SVG。
- 浏览器转换并下载 JPG。

## 公开版数据原则

- 服务端不保存 Skill Key、阅读数据、用户字体或生成图片。
- Skill Key 使用 `localStorage` 保存，用户字体使用 `IndexedDB` 保存。
- 调用真实数据时，浏览器通过 HTTPS 临时提交 Key；接口转发到微信读书后立即释放。
- API 响应统一使用 `Cache-Control: no-store`，Key 不放入 URL、不写入应用日志。
- 项目不需要数据库、对象存储或服务端加密密钥。

## 技术栈

- Next.js 16 App Router
- React 19
- TypeScript 6
- 服务端 SVG 模板渲染
- 浏览器 JPG 转换
- `subset-font` 临时字体子集化

## 本地启动

需要 Node.js 20+ 和 pnpm。

```bash
pnpm install --frozen-lockfile
pnpm dev
```

访问 `http://localhost:3000`。公开部署必须使用 HTTPS。

## EdgeOne Makers 部署

项目已包含 `edgeone.json`。把代码推送到 GitHub 后，在 EdgeOne Makers 导入仓库即可，无需服务器、数据库或环境变量。

部署时使用：

```text
框架：Next.js
Node.js：22.11.0
安装命令：pnpm install --frozen-lockfile
构建命令：pnpm build
输出目录：.next
生产分支：main
```

详细步骤见 [GitHub + EdgeOne 部署说明](docs/public-deployment.md)。

## 检查与构建

```bash
pnpm typecheck
pnpm build
pnpm start
```

`pnpm build` 使用 Webpack，因为 `subset-font` 服务端依赖按该模式完成验证。

## 核心目录

```text
app/                         页面与无状态服务端 API
components/                  首页、连接面板、字体列表、场景工作台
lib/browser-storage.ts       浏览器 Key 与 IndexedDB 字体存储
lib/request-security.ts      同源校验、临时鉴权、限流和 no-store 响应
lib/weread.ts                微信读书 Skill 调用与数据归一化
lib/mock-boox.ts             文石模拟数据，后续由真实适配器替换
lib/wallpaper.ts             模板选择、SVG 渲染和字体注入总入口
lib/custom-fonts.ts          临时字体校验与 WOFF2 子集化
docs/public-deployment.md    公开部署说明
```

`.env*`、`.data/`、`node_modules/` 和 `.next/` 不进入 Git。旧版开发机上的 `.data/` 不会被新代码读取，可在确认不再需要后自行清理。

## 先读文档

1. [GitHub + EdgeOne 部署说明](docs/public-deployment.md)
2. [产品设计文档](docs/product-design.md)
3. [研发接手说明](docs/developer-handoff.md)
4. [每日自动更新屏保 PRD](docs/auto-refresh-wallpaper-prd.md)
5. [设计图片清单与交付要求](docs/design-asset-checklist.md)
