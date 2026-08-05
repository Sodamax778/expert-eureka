# GitHub + EdgeOne Makers 部署说明

本项目是 Next.js 全栈应用。页面、微信读书接口和壁纸生成接口必须一起部署，不能使用纯静态 HTML 托管。

## 1. 部署前准备

需要：

- 一个 GitHub 账号。
- 一个 EdgeOne Makers 账号。
- 当前项目对应的 GitHub 仓库 `Sodamax778/expert-eureka`。

不需要：

- 云服务器。
- 数据库或对象存储。
- 服务端微信读书 Key。
- OpenAI API Key。

用户自己的微信读书 Skill Key 保存在浏览器 `localStorage`，只在请求微信读书数据时通过 HTTPS 临时发送给本站 API。服务端不持久化 Key、阅读数据、字体或生成图片。

## 2. 上传到 GitHub

在项目目录执行：

```bash
git status
git add .
git commit -m "Prepare public EdgeOne deployment"
git push origin main
```

推送后打开：

```text
https://github.com/Sodamax778/expert-eureka
```

确认页面能看到 `app/`、`components/`、`lib/`、`public/`、`package.json` 和 `edgeone.json`，且仓库中没有 `.env`、`.next`、`node_modules` 或真实 `wrk-` Key。

## 3. 在 EdgeOne Makers 导入 GitHub

1. 打开 EdgeOne Makers 控制台并登录。
2. 点击“创建项目”。
3. 选择“导入 Git 仓库”。
4. 选择 GitHub，并授权 EdgeOne 读取 `Sodamax778/expert-eureka`。
5. 选择该仓库，生产分支选择 `main`。
6. 框架预设选择 `Next.js`。
7. 加速区域优先选择“全球”或“不含中国大陆”。这样测试阶段无需 ICP 备案。

## 4. 构建配置

项目根目录为仓库根目录 `./`。

```text
Node.js 版本：22.11.0
安装命令：pnpm install --frozen-lockfile
构建命令：pnpm build
输出目录：.next
```

项目不需要配置环境变量。`edgeone.json` 已将壁纸素材纳入 Node.js Cloud Functions，并把函数最长运行时间设为 60 秒。

确认配置后点击“开始部署”。首次构建通常需要数分钟。

## 5. 上线验收

部署成功后，EdgeOne 会提供一个 HTTPS 域名。按顺序检查：

1. 首页能正常打开，两个屏保卡片图片没有变形。
2. 输入自己的微信读书 Skill Key 后能显示“已装载”。
3. 每周购物小票能生成预览并下载 JPG。
4. 本月阅读记录能生成预览并下载 JPG。
5. 刷新页面后 Key 仍在当前浏览器，换一个浏览器则没有 Key。
6. 关闭贴纸后，右上角和底部贴纸都消失。

## 6. 后续更新

以后本地修改完成后，只需提交并推送：

```bash
git add .
git commit -m "Update wallpaper templates"
git push origin main
```

EdgeOne 会自动拉取 `main` 分支并重新部署。部署失败时，在 EdgeOne 项目的“部署记录”中打开构建日志，优先检查 Node.js 版本、安装命令、构建命令和输出目录。

## 7. 自定义域名

初期可直接使用 EdgeOne 提供的 HTTPS 域名。需要品牌域名时，再在项目设置的“域名管理”中添加自己的域名并按提示配置 DNS。选择中国大陆加速区域并使用自定义域名时，需要提前完成 ICP 备案。
