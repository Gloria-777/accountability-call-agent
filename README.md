# 自律回访助手

[![CI](https://github.com/Gloria-777/accountability-call-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/Gloria-777/accountability-call-agent/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

一个可自行部署的开源中文电话 Agent。它通过 Twilio 拨打你预先配置的号码，询问目标进展，使用 DeepSeek 生成追问，并保存结论和下一步。

无需修改源码。Fork 或克隆仓库后，只需在本地 `.env` 中填写自己的 DeepSeek API、Twilio 账户、公网地址和手机号。密钥与真实通话数据不会进入 Git。

> 本项目只适合个人回访、学习以及已经明确同意接听的人，不适合营销或批量外呼。自动拨号默认关闭，而且程序只能拨打 `.env` 中预先配置的一个号码。

## 工作方式

```text
网页点击或定时器
       |
       v
Twilio 拨打固定手机号
       |
       v
Twilio <Gather> 识别用户语音
       |
       v
DeepSeek 生成简短 JSON 回复
       |
       v
Twilio <Say> 朗读回复并继续收听
       |
       v
结论写入 data/state.json
```

这是轮流说话的语音对话，每轮会有短暂停顿，不是可以随时互相打断的全双工实时通话。DeepSeek 只生成文字；语音识别、朗读和电话线路由 Twilio 提供并可能分别计费。

## 最快开始

需要 Node.js 20 或更高版本、Git、DeepSeek API key、具备 Voice 能力的 Twilio 号码，以及公网 HTTPS 地址。

```bash
git clone https://github.com/Gloria-777/accountability-call-agent.git
cd accountability-call-agent
npm install
npm run setup
```

`npm run setup` 会从 `.env.example` 创建 `.env`，并自动生成随机 `ADMIN_TOKEN`。它不会覆盖已经存在的 `.env`。

打开 `.env`，填写：

| 配置 | 用途 | 示例格式 |
| --- | --- | --- |
| `PUBLIC_BASE_URL` | ngrok、Cloudflare Tunnel 或服务器 HTTPS 地址 | `https://example.ngrok.app` |
| `TARGET_PHONE_NUMBER` | 接听回访的固定号码 | `+8613800138000` |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID | `AC...` |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token | 密钥 |
| `TWILIO_PHONE_NUMBER` | 具备 Voice 能力的 Twilio 号码 | `+14155550100` |
| `DEEPSEEK_API_KEY` | DeepSeek API key | `sk-...` |
| `DEEPSEEK_BASE_URL` | DeepSeek 兼容接口地址 | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | 支持 JSON Output 的模型 | `deepseek-flash` |

所有号码都必须使用 E.164 格式。密钥只能放在 `.env` 或部署平台的私密环境变量中，绝不要粘贴到 Issue、聊天、源码或 GitHub Actions 日志。

检查并启动：

```bash
npm run doctor
npm start
```

浏览器打开 `http://localhost:5050`，使用 `.env` 里的 `ADMIN_TOKEN` 登录。第一次测试应保持 `ENABLE_SCHEDULER=false`。

## 1. DeepSeek 配置

在 [DeepSeek 开放平台](https://platform.deepseek.com/) 创建新的 API key，填入：

```dotenv
DEEPSEEK_API_KEY=sk-你的新密钥
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
```

默认配置使用 DeepSeek 官方兼容接口和 JSON Output。若使用第三方中转站，必须确认它兼容 `/chat/completions`、Bearer 鉴权、`response_format: {"type":"json_object"}`，并自行评估密钥和对话内容的隐私风险。

## 2. Twilio 配置

在 [Twilio Console](https://console.twilio.com/) 准备一个具备 Voice 能力的号码，然后填写：

```dotenv
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
TARGET_PHONE_NUMBER=+86...
```

还要确认：

- 目标国家或地区已在 Voice Geographic Permissions 中启用。
- Twilio 试用账户已经验证目标号码。
- 账户和购买的号码允许呼叫目标地区。
- 你理解通话、语音识别和文字转语音的实际价格。

中国大陆线路的可用性、主叫显示和接通率取决于 Twilio 当时的政策。不要绕过地区、电信或同意要求。

## 3. 公网 HTTPS 地址

Twilio 必须能够访问本机服务。开发时可使用 ngrok：

```bash
ngrok http 5050
```

把得到的地址填入：

```dotenv
PUBLIC_BASE_URL=https://your-subdomain.ngrok.app
```

免费地址改变后需更新 `.env` 并重启程序。无需在 DeepSeek 控制台配置 webhook；Twilio 会访问 `/twilio/connect`、`/twilio/respond` 和 `/twilio/status`。

## 4. 第一次安全测试

保持：

```dotenv
ENABLE_SCHEDULER=false
VALIDATE_TWILIO_SIGNATURE=true
MAX_CALL_SECONDS=240
MAX_CONVERSATION_TURNS=6
```

运行 `npm run doctor`，只有所有项目都显示正常后，网页的“立即呼叫”按钮才会启用。先设置一个具体目标，再点击按钮并确认。程序只会拨打 `TARGET_PHONE_NUMBER`。

出现问题时依次检查：

1. `GET /health` 是否返回 `{ "ok": true }`。
2. 公网隧道是否收到 `/twilio/connect` 和 `/twilio/respond`。
3. 服务端是否出现 Twilio 签名或 DeepSeek 状态码错误。
4. Twilio Call Logs 中的错误码和目的地许可。
5. DeepSeek 余额、模型名以及中转站的 JSON Output 兼容性。

## 5. 开启定时回访

手动成功完成一通电话后，再修改：

```dotenv
ENABLE_SCHEDULER=true
CALL_CRON=0 20 * * *
TIME_ZONE=Asia/Shanghai
```

示例表示每天 20:00。修改后重启程序；服务器必须持续在线。

## 配置选项

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `5050` | 本地 HTTP 端口 |
| `MAX_CALL_SECONDS` | `240` | Twilio 最长通话秒数 |
| `MAX_CONVERSATION_TURNS` | `6` | 最多识别多少轮用户回答 |
| `TWILIO_SPEECH_LANGUAGE` | `cmn-Hans-CN` | Twilio 语音识别语言 |
| `TWILIO_SAY_LANGUAGE` | `zh-CN` | Twilio 朗读语言 |
| `VALIDATE_TWILIO_SIGNATURE` | `true` | 验证 Twilio webhook 签名 |

## 项目结构

```text
accountability-call-agent/
|- public/                 管理页面
|- src/
|  |- config.js            环境变量与就绪检查
|  |- prompt.js            DeepSeek JSON 对话指令
|  |- deepseek.js          DeepSeek 请求和结果校验
|  |- telephony.js         Twilio 外呼与 TwiML
|  |- store.js             本地 JSON 数据存储
|  `- server.js            HTTP 路由、会话与定时器
|- test/                   不拨号、不请求真实 API 的测试
|- scripts/                初始化与配置检查工具
|- .env.example            配置模板
`- package.json
```

运行离线检查：

```bash
npm test
npm run check
```

## 数据与安全

- 自动拨号默认关闭，API 不接受临时号码。
- 管理接口使用 Bearer token，页面只显示手机号最后四位。
- Twilio webhook 默认验证 `X-Twilio-Signature`。
- `.env`、`data/state.json` 和 `node_modules` 被 Git 忽略。
- 完整对话不会写入磁盘，只保存状态、简短总结和下一步。
- 开场会明确披露 AI 身份，默认不录音。
- 内存会话适合单实例个人部署；多实例部署应改用共享数据库。

部署公网时应使用 HTTPS、强管理令牌和进程守护。若要录音或拨打他人，应先取得明确同意并确认所在地法律。

## 官方文档

- [DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode/)
- [DeepSeek API](https://api-docs.deepseek.com/)
- [Twilio Programmable Voice](https://www.twilio.com/docs/voice)
- [Twilio `<Gather>`](https://www.twilio.com/docs/voice/twiml/gather)
- [Twilio `<Say>`](https://www.twilio.com/docs/voice/twiml/say)

## 许可证

[MIT](LICENSE)
