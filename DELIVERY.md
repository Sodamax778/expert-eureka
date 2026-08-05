# 研发交付清单

交付日期：2026-07-17

## 包含内容

- `app/`：Next.js 页面和 API。
- `components/`：首页、连接、字体和场景工作台组件。
- `lib/`：数据适配、模板渲染、设备、字体、加密和模拟数据。
- `types/`：第三方模块类型声明。
- `docs/`：产品设计、研发接手和开发输入文档。
- `README.md`：启动、构建、目录和隐私说明。
- `package.json`、`pnpm-lock.yaml`：已锁定并验证的依赖。
- `.env.example`、`.gitignore`：环境变量示例与安全忽略规则。

## 主动排除

- `.data/`：本地微信读书连接、用户上传字体。
- `.env.local`、`.env`：真实环境变量和密钥。
- `.next/`、`node_modules/`、`tsconfig.tsbuildinfo`：可重新生成的构建与依赖缓存。
- `.git/`：原仓库历史和远端信息。
- 早期小红书采集脚本、原始数据和输出目录：与当前网页运行无关。

## 交付前验证

- `pnpm install --lockfile-only --offline`：通过。
- `pnpm typecheck`：通过。
- `pnpm build`：通过。
- Next.js 版本：16.2.10。
- Node.js 建议版本：20 或更高。

## 研发阅读顺序

1. `README.md`
2. `docs/product-design.md`
3. `docs/developer-handoff.md`
4. `lib/wallpaper.ts`
5. `lib/weread.ts`
6. `components/SceneOutputs.tsx`
