# 小文 AI 研发接手说明

## 1. 产品结论

系统从阅读平台取得结构化数据，转换成统一数据结构，再填入固定 SVG 模板。它不是 AI 生图产品。

公开版用户流程：

1. 用户选择文石 BOOX 或微信读书。
2. 微信读书用户输入 Skill Key，验证成功后只保存到当前浏览器 `localStorage`。
3. 用户在场景弹窗中配置设备、方向、字体和模板选项。
4. 浏览器临时携带 Key 请求无状态接口，服务端查询数据并生成 SVG Data URL。
5. 浏览器把 SVG 转换为 JPG 下载，服务端不保存结果。

## 2. 数据源边界

| 数据源 | 当前状态 | 页面标识 |
| --- | --- | --- |
| 微信读书 | Skill Key 真实调用 | 微信读书真实数据 |
| 文石 BOOX | 独立模拟数据 | 文石模拟数据 |
| 本地 mock | 研发回退数据 | 本地示例数据 |

文石模拟数据位于 `lib/mock-boox.ts`。接入真实文石接口时新增适配器并返回统一快照，不要在模板中读取平台原始字段。

## 3. 核心架构

```text
浏览器 localStorage / IndexedDB
  -> SceneOutputs.tsx
    -> Authorization: Bearer <本次请求的 Skill Key>
    -> POST /api/wallpapers/generate
      -> 微信读书真实数据 / 文石模拟数据
      -> WallpaperSnapshot
      -> SVG 模板
      -> 临时字体子集化
      -> SVG Data URL
    -> 浏览器预览并转换 JPG
```

职责边界：

- `lib/browser-storage.ts`：浏览器端 Key、本地字体和字体预览。
- `lib/request-security.ts`：同源校验、Key 提取、内存限流和禁止缓存。
- `lib/weread.ts`：网关调用、错误处理和数据归一化；所有方法显式接收本次请求的 Key。
- `lib/wallpaper.ts`：模板路由、SVG 生成和字体注入。
- `lib/custom-fonts.ts`：只处理请求携带的临时字体，不读写磁盘。

## 4. 场景逻辑

| 场景 | 当前模板规则 |
| --- | --- |
| 书柜墙 | 固定 10 本；书脊、堆叠、上下层摆件和可调字号 |
| 每周购物小票 | 固定 5 本；本周不足时按最近阅读补齐；书摘默认折叠 |
| 本月阅读记录 | 月历；连续日期书目条带相连；支持极简和涂鸦 |
| 我的读书卡 | 封面、进度、时长、评价、划线和批注 |

## 5. 微信读书 Skill

网关为 `https://i.weread.qq.com/api/agent/gateway`，当前 `skill_version = 1.0.4`。

浏览器不能从自有域名直接跨域调用微信读书，因此由本站 API 做无状态转发。Key 只通过 HTTPS `Authorization` 请求头传递，不放入 URL、Cookie 或响应。

## 6. 本地 API

| 方法与路径 | 用途 |
| --- | --- |
| `POST /api/connections/weread` | 使用本次请求的 Key 校验连接并返回书架摘要 |
| `POST /api/weread/summary` | 使用本次请求的 Key 返回书架摘要 |
| `POST /api/wallpapers/generate` | 读取数据、处理临时字体并生成 SVG Data URL |

所有接口应保持同源、限流和 `Cache-Control: no-store`。不要增加完整 Key、Authorization 请求头或阅读响应正文日志。

## 7. Key 与字体

- Key 位于浏览器 `localStorage`，注销即删除。
- 自定义字体位于浏览器 `IndexedDB`，最大 24 MB。
- 选择自定义字体时，浏览器把字体随生成请求临时提交；服务端校验后只生成当前画面字符的 WOFF2 子集。
- 服务端不写入 `.data`、数据库或对象存储。
- 自定义字体许可证由上传用户负责，公开站点不要预装授权不明确的字体。

## 8. 开发与部署

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm start
```

最低要求是 Node.js 20+、HTTPS 和可访问微信读书网关的网络。无需可写持久化目录、数据库或服务端密钥。

## 9. 当前优先级

P0：

1. 在正式域名和 HTTPS 下完成真实 Key 回归测试。
2. 给请求参数增加完整运行时 schema 校验。
3. 确认文石真实数据和设备推送的官方授权方案。
4. 建立长文本、空数据、封面失败和大字体测试。

P1：

1. 增加本地字体删除和浏览器存储占用提示。
2. 完善微信读书逐日书目映射。
3. BOOX 实机灰阶和刷新残影验证。

## 10. 验收清单

- `pnpm typecheck` 和 `pnpm build` 通过。
- 浏览器刷新后仍显示本地 Skill 已装载；另一个浏览器不会看到该状态。
- 服务端目录不会出现 Key、阅读数据、字体或生成图片。
- 未装载 Key 时，微信数据源生成操作显示明确提示。
- 4 个场景均可使用文石模拟数据预览并下载 JPG。
- 自定义字体导入后可预览、生成和下载，服务端不保留完整字体。
