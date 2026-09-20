# 自律回访助手

一个面向个人使用的开源电话 Agent。它按计划拨打你自己的号码，用中文询问目标是否完成，并保存完成情况和下一步。

技术路径：Twilio 拨打电话，接通后通过 SIP 转到 OpenAI Realtime API。应用本身负责定时、鉴权、目标管理和回访记录。

> 这是学习项目，不适合批量营销或拨打未经同意的人。默认关闭自动拨号，并且只能拨打环境变量中预先配置的一个号码。

## 你将学到什么

完成这个项目后，你会理解一通 AI 电话的完整流程：

```text
网页点击或定时器
       |
       v
Twilio 拨打你的手机
       |
       v
手机接通后，Twilio Dial SIP
       |
       v
OpenAI 发送 realtime.call.incoming webhook
       |
       v
服务器验证签名并接受电话
       |
       v
Realtime Agent 对话并调用 record_checkin
       |
       v
结果写入 data/state.json
```

## 项目结构

```text
accountability-call-agent/
|- public/                 管理页面
|- src/
|  |- config.js            读取和检查环境变量
|  |- prompt.js            Agent 指令和记录工具
|  |- realtime.js          OpenAI SIP 接听与实时事件
|  |- telephony.js         Twilio 外呼和 TwiML
|  |- store.js             本地 JSON 数据存储
|  `- server.js            HTTP 路由和定时器
|- test/                   不拨号的自动化测试
|- .env.example            配置模板
`- package.json
```

## 第 1 步：准备本地环境

需要：

- Node.js 20 或更高版本
- Git
- 一个可以公开访问的 HTTPS 地址，开发时可使用 ngrok 或 Cloudflare Tunnel

安装依赖：

```bash
npm install
```

复制配置模板：

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

macOS 或 Linux：

```bash
cp .env.example .env
```

先只修改 `ADMIN_TOKEN`。使用至少 16 个字符的随机字符串，不要把 `.env` 上传到 GitHub。

启动程序：

```bash
npm run dev
```

打开 `http://localhost:5050`。输入 `ADMIN_TOKEN` 后，你应该能看到控制台，并且接入检查仍显示缺失。这个阶段不会拨打电话。

## 第 2 步：获得公网 HTTPS 地址

电话平台必须能访问本机服务器。以 ngrok 为例：

```bash
ngrok http 5050
```

把得到的 `https://...ngrok.app` 填入：

```dotenv
PUBLIC_BASE_URL=https://your-subdomain.ngrok.app
```

每次免费 ngrok 地址改变后，都要同时更新 `.env`、OpenAI webhook 地址，然后重启程序。

## 第 3 步：配置 OpenAI Realtime SIP

1. 在 OpenAI API 平台创建 Project，并取得以 `proj_` 开头的 Project ID。
2. 创建 API key，填入 `OPENAI_API_KEY`。密钥只能放在 `.env`。
3. 在 Project 的 Webhooks 页面新增端点：

   ```text
   https://你的公网地址/webhooks/openai
   ```

4. 订阅 `realtime.call.incoming`。
5. 把 webhook signing secret 填入 `OPENAI_WEBHOOK_SECRET`。
6. 把 Project ID 填入 `OPENAI_PROJECT_ID`。

默认使用成本较低、支持 SIP 的 `gpt-realtime-2.1-mini`。官方接入说明见 [Realtime API with SIP](https://developers.openai.com/api/docs/guides/realtime-sip)。

## 第 4 步：配置 Twilio

你需要一个具备 Voice 能力的 Twilio 号码。把以下内容填入 `.env`：

```dotenv
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
TARGET_PHONE_NUMBER=+86...
```

号码必须使用 E.164 格式，例如中国大陆号码写成 `+8613800138000`。

在 Twilio 控制台确认：

- 目标国家或地区已启用 Voice Geographic Permissions。
- 试用账户已经验证目标号码。
- 该账户和号码允许呼叫你的目标地区。

中国大陆线路的可用性、主叫号码显示和接通率取决于 Twilio 当时的政策。不要通过技术手段绕过地区或电信合规限制。

## 第 5 步：进行第一次测试

保持以下配置：

```dotenv
ENABLE_SCHEDULER=false
VALIDATE_TWILIO_SIGNATURE=true
MAX_CALL_SECONDS=240
```

重启程序，刷新控制台。只有所有检查均为“正常”时，“立即呼叫”才会启用。

先填写一个具体目标，例如：

```text
今晚 9 点前完成项目 README 的第一版
```

点击“立即呼叫”，确认后程序才会请求 Twilio 拨打 `.env` 中的固定号码。接通后你会先听到 AI 声明，随后进入回访对话。

出现问题时依次检查：

1. `GET /health` 是否返回 `{ "ok": true }`。
2. ngrok 是否收到了 `/twilio/connect` 请求。
3. OpenAI webhook 是否收到了 `realtime.call.incoming`。
4. 控制台是否显示签名错误或 API 错误。
5. Twilio Call Logs 中的错误代码。

## 第 6 步：开启定时拨号

先手动成功完成一通电话，再启用定时器：

```dotenv
ENABLE_SCHEDULER=true
CALL_CRON=0 20 * * *
TIME_ZONE=Asia/Shanghai
```

`0 20 * * *` 表示每天 20:00。修改后必须重启进程。服务器需要持续在线；电脑关机后不会拨号。

## 第 7 步：测试与代码检查

这些命令不会发起电话：

```bash
npm test
npm run check
```

测试覆盖配置检查、提示词、数据存储和 SIP TwiML 生成。GitHub Actions 会在每次推送时重复运行这些检查。

## 第 8 步：上传 GitHub

确认 `.env` 没有被跟踪：

```bash
git status
```

创建本地提交：

```bash
git init -b main
git add .
git commit -m "Initial personal accountability call agent"
```

在 GitHub 网站创建一个空仓库，例如 `accountability-call-agent`，不要勾选自动创建 README。然后执行 GitHub 提供的两条命令：

```bash
git remote add origin https://github.com/YOUR_NAME/accountability-call-agent.git
git push -u origin main
```

第一次推送可能要求在浏览器中登录 GitHub。不要把 GitHub 密码或 API key 写进命令、代码或聊天记录。

## 安全设计

- 自动拨号默认关闭。
- API 不接受临时号码，只能拨打 `TARGET_PHONE_NUMBER`。
- 管理接口需要 Bearer token。
- OpenAI webhook 使用官方 SDK 验证签名。
- Twilio webhook 默认验证 `X-Twilio-Signature`。
- `.env` 和实际通话记录被 `.gitignore` 排除。
- 页面仅显示手机号最后四位。
- Agent 开场明确披露 AI 身份。
- 默认最长通话 240 秒。

部署公网时还应使用 HTTPS、强管理令牌、进程守护和定期备份。需要录音时，应先确认所在地法律并取得明确同意；本项目默认不录音。

## 相关文档

- [OpenAI Realtime API](https://developers.openai.com/api/docs/guides/realtime)
- [OpenAI Realtime SIP](https://developers.openai.com/api/docs/guides/realtime-sip)
- [OpenAI Webhooks](https://developers.openai.com/api/docs/guides/webhooks)
- [Twilio Programmable Voice](https://www.twilio.com/docs/voice)

## 许可证

[MIT](LICENSE)
