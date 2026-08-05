# 小文 AI 阅读壁纸助手开发部署计划

> 公开版已调整为无账号、无数据库架构：Skill Key 只保存在用户浏览器，服务端仅做单次请求转发。部署细节以 `docs/public-deployment.md` 为准。

这份文档是给 0 基础开发者看的。目标是一步步做出一个网页工具：用户可以接入阅读数据，选择壁纸场景和 BOOX 设备型号，系统用预设模板把真实阅读数据填入占位，生成适合墨水屏的壁纸图片。

第一版不追求“AI 随机生图”，而是做稳定、可控、文字准确的模板生成。核心逻辑是：

```text
阅读数据
  -> 统一整理成标准字段
  -> 选择固定场景模板
  -> 把书名、作者、封面、书脊、阅读时长、批注等填入模板
  -> 按 BOOX 设备尺寸渲染图片
  -> 用户下载并自行传到设备
```

参考体验：https://www.xteink.cn/app/xt-agent/weread

## 1. 产品定位

小文 AI 阅读壁纸助手不是一个普通图片生成器，而是一个“阅读生活可视化工具”。

它要解决的问题：

- 把用户在文石阅读、微信读书里的阅读记录变成好看的墨水屏壁纸。
- 让用户不用懂设计，也能生成书柜、拼贴、小票、日历、批注卡片等场景。
- 第一版只生成图片，不自动推送到设备，降低开发难度。

第一版输出：

- JPG 图片。
- 尺寸适配 BOOX 设备。
- 支持下载。

第一版暂不做：

- 自动推送到 BOOX。
- 文石账号云端授权。
- 多用户账号系统。
- 复杂付费系统。

## 2. 数据来源规划

支持微信读书，也要支持文石阅读数据。

### 数据源 1：文石阅读数据

目标：读取用户在 BOOX / 文石阅读体系里的本地阅读数据。

可用于：

- 本地书架里的书籍。
- 阅读进度。
- 阅读记录。
- 批注、划线。
- 本机书籍封面或书籍元信息。

当前需要进一步确认的事情：

- 文石是否提供稳定可调用的开放接口。
- 如果没有开放接口，第一版是否通过“用户导出文件 / 本地上传文件 / 手动导入 JSON”来接入。
- 文石阅读数据中是否能拿到封面、书名、作者、阅读时长、跨日阅读记录、划线批注。

建议第一版策略：

```text
先设计统一数据格式
  -> 微信读书先接真实接口
  -> 文石阅读先预留 provider
  -> 后续找到稳定来源后再接入
```

也就是说，代码层面先不要把模板写死为“微信读书模板”，而要写成“阅读数据模板”。

### 数据源 2：微信读书数据

微信读书数据需要用户提供 `skillKey` 后才可调用。

用户流程：

```text
用户输入微信读书 skillKey
  -> 后端用 key 调用微信读书 skill 验证
  -> 验证成功后只保存到当前浏览器 localStorage
  -> 页面显示 SKILL 已装载
  -> 生成场景时通过 HTTPS 临时携带 key
```

安全要求：

- 不在前端完整显示 key。
- 不在服务端日志打印 key。
- 服务端不保存 key、阅读数据或生成图片。
- 删除连接时清除当前浏览器保存的 key。

已确认的微信读书 skill 调用规则：

```text
请求地址：https://i.weread.qq.com/api/agent/gateway
请求方法：POST
鉴权方式：Authorization: Bearer <WEREAD_API_KEY>
请求格式：JSON
skill_version：1.0.4
```

请求 body 顶层包含：

```json
{
  "api_name": "/shelf/sync",
  "skill_version": "1.0.4"
}
```

业务参数直接放在 body 顶层，不包 `params`。

### 统一数据源模型

后端不要让模板直接依赖某一家平台的原始字段。建议统一成：

```ts
type ReadingProvider = "weread" | "boox" | "mock";

type ReadingBook = {
  id: string;
  title: string;
  author?: string;
  coverUrl?: string;
  spineColor?: string;
  progress?: number;
  lastReadAt?: string;
};

type ReadingRecord = {
  date: string;
  bookId?: string;
  bookTitle?: string;
  minutes: number;
};

type ReadingAnnotation = {
  bookId?: string;
  bookTitle: string;
  author?: string;
  coverUrl?: string;
  highlightText: string;
  noteText?: string;
  chapter?: string;
  createdAt?: string;
};
```

这样同一个模板可以用微信读书数据，也可以用文石阅读数据。

## 3. 场景规划

现在计划支持 7 个场景。

### 1. 书柜墙

用途：生成像真实书柜一样的墨水屏壁纸。

视觉参考：用户提供的 2025 Finished 书架图。核心不是封面网格，而是书架层板、书脊、堆叠书、摆件共同组成的书柜画面。

视觉元素：

- 黑色或深灰背景。
- 2 到 4 层横向书架。
- 书籍以书脊形式竖排。
- 部分书可以横向堆叠。
- 书架上可以放摆件，例如：
  - 小植物。
  - 石膏头像。
  - 地球仪。
  - 杯子。
  - 小台灯。
- 顶部显示标题，例如 `2026 Finished`、`My Bookshelf`、`本月读过`。
- 副标题显示数量，例如 `31 books`。

数据占位：

```json
{
  "title": "2026 Finished",
  "subtitle": "31 books",
  "books": [
    {
      "title": "书名",
      "author": "作者",
      "spineColor": "#111111"
    }
  ],
  "decorations": ["plant", "bust", "globe"]
}
```

生成逻辑：

- 每本书不展示封面，而是把书名和作者排在书脊上。
- 书脊宽度根据书名长度和随机种子做变化。
- 颜色要控制为墨水屏友好：黑、白、灰，加少量低饱和强调色。
- 书籍数量多时按层分布，数量少时增加摆件和留白。
- 该场景替代当前“网格”样式，不再做普通封面九宫格。

### 2. 封面拼贴

用途：展示用户书架上的书籍封面，做成拼图式海报。

视觉元素：

- 多张书封面。
- 倾斜、叠放、裁切。
- 可选整齐网格或自由拼贴，但默认是拼贴。
- 角落显示书籍数量。

数据占位：

```json
{
  "books": [
    {
      "title": "书名",
      "author": "作者",
      "coverUrl": "封面地址"
    }
  ]
}
```

生成逻辑：

- 微信读书用 `/shelf/sync` 获取封面。
- 文石阅读后续从本地书库或导入数据获取封面。
- 服务端应尽量把封面转成内嵌图片，避免跨域导致预览失败。

### 3. 阅读每周小票

用途：展示本周阅读记录和阅读时长，像一张纸质小票。

内容字段：

- 本周日期范围。
- 本周阅读天数。
- 本周阅读总时长。
- 每天阅读时长。
- 本周读过的书。
- 一句摘录或总结文案。

数据占位：

```json
{
  "weekRange": "2026-07-06 ~ 2026-07-12",
  "readingDays": 5,
  "readingMinutes": 320,
  "dailyRecords": [
    { "date": "2026-07-06", "minutes": 42, "bookTitle": "书名" }
  ],
  "topBooks": ["书名 A", "书名 B"]
}
```

### 4. 阅读本月小票

用途：展示本月阅读记录和阅读时长。

内容字段：

- 月份。
- 本月阅读天数。
- 本月阅读总时长。
- 本月读过 / 在读书籍。
- 本月批注或划线数量。
- TOP 书籍。

数据占位：

```json
{
  "month": "2026-07",
  "readingDays": 12,
  "readingMinutes": 860,
  "bookCount": 5,
  "annotationCount": 32,
  "topBooks": ["书名 A", "书名 B"],
  "quote": "一句代表摘录"
}
```

### 5. 阅读月历

用途：生成一个月历式阅读习惯壁纸，重点是“哪天读了什么”和“跨日阅读同一本书”。

视觉元素：

- 月历格子。
- 每天显示阅读状态。
- 同一本书跨多天阅读时，用连续线条、相同纹理或相同书名标记串起来。
- 阅读时长可用深浅表示。

数据占位：

```json
{
  "month": "2026-07",
  "days": [
    {
      "date": "2026-07-01",
      "readingMinutes": 30,
      "bookId": "book-a",
      "bookTitle": "书名 A"
    }
  ]
}
```

生成逻辑：

- 先按日期画 7 列月历。
- 同一天多本书时优先显示阅读时长最长的一本。
- 跨日同一本书用同样的灰度块或同一条细线连接。
- 没有阅读的日期留白。

### 6. 我的批注划线

用途：把用户的划线句子和个人批注做成卡片壁纸。

内容字段：

- 书封面。
- 书名。
- 作者。
- 划线句子。
- 用户批注。
- 章节名或日期。

数据占位：

```json
{
  "bookTitle": "书名",
  "author": "作者",
  "coverUrl": "封面地址",
  "highlightText": "划线句子",
  "noteText": "我的批注",
  "chapter": "章节名",
  "createdAt": "2026-07-13"
}
```

生成逻辑：

- 长句自动分行。
- 批注和原文要有清晰层级。
- 墨水屏上避免浅灰文字过小。
- 如果没有封面，使用书脊或纯文字占位。

### 7. 文案壁纸

用途：用户自己输入文案，系统设计成墨水屏壁纸。

数据来源：

- 用户手动输入。
- 可选使用用户阅读数据作为署名或页脚。

表单字段：

```text
主文案
副标题
署名
风格
BOOX 设备型号
横屏 / 竖屏
```

生成逻辑：

- 第一版仍使用预设排版模板，不调用 AI 生图。
- 后续可以增加 AI 辅助排版或文案润色，但最终图片仍应由模板渲染，保证文字准确。

## 4. 页面规划

### 首页

首页放在一个页面内，不做复杂顶部导航。

包含：

1. 数据源连接区。
2. 能力说明区。
3. 场景输出区。

数据源连接区需要支持：

- 微信读书：输入 skillKey 后激活。
- 文石阅读：先显示“即将支持”或“导入数据”入口。

场景输出区展示 7 个卡片：

1. 书柜墙
2. 封面拼贴
3. 阅读每周小票
4. 阅读本月小票
5. 阅读月历
6. 我的批注划线
7. 文案壁纸

点击卡片后弹出生成弹窗，不跳转二级页面。

### 生成弹窗

弹窗结构参考 xteink：

```text
左侧：场景配置
右侧：设备预览
底部：下载图片 / 后续推送到设备
```

通用字段：

- 数据源：自动 / 微信读书 / 文石阅读 / 示例数据。
- BOOX 设备型号。
- 横屏 / 竖屏。
- 刷新预览。
- 下载图片。

不同场景的特殊字段：

- 书柜墙：标题、书架层数、摆件开关、书脊配色。
- 封面拼贴：拼贴密度、是否显示书名、换一批。
- 每周小票：选择周、本周总结文案。
- 本月小票：选择月份、是否显示 TOP 书。
- 阅读月历：选择月份、跨日连接样式。
- 我的批注划线：选择书籍、选择划线、换一句。
- 文案壁纸：输入文案、选择字体风格。

## 5. 设备与输出

第一版只做“生成图片”，不做自动推送。

用户自己负责把生成好的图片传到 BOOX 设备。

第一版支持：

- 选择 BOOX 设备型号。
- 按该设备分辨率生成图片。
- 下载 PNG。

BOOX 设备配置示例：

```text
BOOX Palma / Palma 2: 824 x 1648
BOOX Leaf 系列: 1264 x 1680
BOOX Page: 1264 x 1680
BOOX Note Air 系列: 1404 x 1872
BOOX Tab 系列: 1860 x 2480
自定义尺寸: 用户手动输入宽高
```

后续版本再考虑：

- 二维码下载链接。
- 邮箱发送。
- WebDAV 同步。
- BOOX 自动化推送。

## 6. 未来账号与自动更新的数据设计

当前公开版不使用数据库，以下结构只保留给未来用户主动开启账号、定时生成和设备同步时评审，不能用于当前网页保存 Skill Key。

### users

```text
id
display_name
created_at
updated_at
```

### connections

```text
id
user_id
provider
encrypted_access_key
key_hint
status
last_verified_at
created_at
updated_at
```

说明：

- `provider` 支持 `weread`、`boox`。
- 微信读书保存加密后的 skillKey。
- 文石阅读后续可能保存导入文件记录、授权 token 或本地索引。

### reading_books

```text
id
user_id
provider
external_book_id
title
author
cover_url
spine_color
progress
raw_json
updated_at
```

### reading_records

```text
id
user_id
provider
book_id
date
reading_minutes
raw_json
created_at
```

### annotations

```text
id
user_id
provider
book_id
highlight_text
note_text
chapter
created_at
raw_json
```

### templates

```text
id
template_key
name
scene
config_json
created_at
updated_at
```

模板 key：

```text
bookshelf_spines
cover_collage
weekly_receipt
monthly_receipt
reading_calendar
annotations_card
copywriting_wallpaper
```

### wallpaper_jobs

```text
id
user_id
template_id
provider
device_profile
width
height
orientation
status
input_snapshot
output_image_url
error_message
created_at
updated_at
```

## 7. 模板生成方式

第一版图片生成不调用 AI 生图接口，而是使用预设模板填入真实数据。

为什么这样做：

- 书名、作者、数字不会被 AI 画错。
- 墨水屏排版稳定。
- 生成速度快。
- 成本低。
- 更适合后续下载和推送到 BOOX。

推荐技术路线：

```text
模板数据
  -> SVG 模板
  -> 服务端渲染 PNG
  -> 返回预览和下载地址
```

书柜墙模板要注意：

- 书脊文字可能是竖排，也可能旋转 90 度。
- 中文书名要处理换行。
- 书架层板要有明确横线和阴影。
- 摆件只是辅助视觉，不能压过书籍。
- 墨水屏黑底时，文字和书脊对比必须足够。

## 8. 开发阶段拆分

### 第 0 阶段：准备环境

你需要准备：

- GitHub 账号。
- 当前 private 仓库。
- Node.js。
- Codex 或 VS Code。

最少需要会：

```bash
npm install
npm run dev
```

### 第 1 阶段：首页和连接状态

目标：

- 首页能打开。
- 显示微信读书连接区。
- 显示文石阅读数据入口占位。
- 显示 7 个场景卡片。

验收标准：

- 本地访问 `http://localhost:3000` 能看到首页。
- 微信读书 key 激活后显示“已装载”。
- 文石阅读显示“即将支持”或“导入数据”。

### 第 2 阶段：微信读书真实数据

目标：

- 输入 skillKey。
- 激活时调用 `/shelf/sync` 验证。
- 成功后只保存到当前浏览器。
- 能读取书架和阅读统计。

验收标准：

- 书架条目数是真实数据。
- 封面拼贴可以用真实封面。
- 小票可以用真实阅读时长。

### 第 3 阶段：统一阅读数据模型

目标：

- 把微信读书原始字段转成统一模型。
- 为文石阅读预留同样的数据结构。

验收标准：

- 模板只读统一模型，不直接读微信读书原始字段。
- mock / weread / boox 三种 provider 可以切换。

### 第 4 阶段：书柜墙与封面拼贴

目标：

- 把原来的书架封面墙拆成两个场景：
  - 书柜墙：书脊 + 书架 + 摆件。
  - 封面拼贴：封面拼图。

验收标准：

- 书柜墙不再是普通封面网格。
- 少量书、多量书都能自动排布。
- 预览适合 BOOX 墨水屏。

### 第 5 阶段：小票和月历

目标：

- 阅读每周小票。
- 阅读本月小票。
- 阅读月历。

验收标准：

- 周/月切换正确。
- 阅读时长准确。
- 月历能表现跨日阅读同一本书。

### 第 6 阶段：批注划线和文案壁纸

目标：

- 我的批注划线。
- 文案壁纸。

验收标准：

- 长划线句子不溢出。
- 用户输入文案能生成稳定排版。

### 第 7 阶段：部署上线

目标：

- 项目可以通过公网网址访问。
- HTTPS 可用。
- 服务端无持久化用户数据。

部署步骤：

1. 把代码推送到 GitHub。
2. 在 Linux 服务器安装 Docker 和 Nginx。
3. 使用 `docker compose up -d --build` 启动。
4. 配置域名与 HTTPS。
5. 打开部署后网址测试。

## 9. 推荐项目目录

```text
xiaowen-reading-wallpaper/
  app/
    page.tsx
    api/
      connections/
        weread/
          route.ts
        boox/
          route.ts
      wallpapers/
        generate/
          route.ts
  components/
    ConnectionPanel.tsx
    SceneOutputs.tsx
    WallpaperPreview.tsx
  lib/
    providers/
      weread.ts
      boox.ts
      mock.ts
    reading-model.ts
    crypto.ts
    templates.ts
    devices.ts
    wallpaper.ts
  docs/
    weread-wallpaper-dev-plan.md
  public/
    generated/
```

## 10. 密钥与隐私安全

不能做：

- 不能把用户 key 写死在代码里。
- 不能把真实 key 提交到 GitHub。
- 不能在日志里打印完整 key。
- 不能在网页上完整显示 key。
- 不能未经用户确认上传文石本地阅读文件。

应该做：

- Key 只保存在当前浏览器 `localStorage`。
- 调用微信读书 Skill 时通过 HTTPS 临时提交，服务端用完即丢。
- 页面只显示脱敏 Key。
- 用户可以从当前浏览器删除 Key。
- 文石阅读导入文件要明确告诉用户用途。

当前公开版无需数据库和服务端加密环境变量。后续新增第三方服务凭证时，环境变量只放在部署平台，不提交到 GitHub。

## 11. 当前下一步

建议下一步按这个顺序开发：

1. 更新首页场景卡片，把 4 个旧场景改成 7 个新场景。
2. 把“书架封面墙”拆成：
   - 书柜墙
   - 封面拼贴
3. 先实现书柜墙 SVG 模板：
   - 书架层板
   - 书脊排列
   - 横向堆叠书
   - 小植物 / 头像 / 地球仪等摆件
4. 保留微信读书 key 激活逻辑。
5. 新增文石阅读数据源占位，不急着接真实接口。

第一优先级：

```text
书柜墙视觉模板
```

原因：这是当前和参考图差距最大的地方，也是产品辨识度最高的场景。
