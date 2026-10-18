import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cron from "node-cron";
import { loadConfig, getSetupStatus } from "./config.js";
import { JsonStore } from "./store.js";
import {
  buildConnectTwiml,
  buildFinalTwiml,
  buildGatherTwiml,
  initiateCall,
  isValidTwilioRequest,
} from "./telephony.js";
import { generateDeepSeekReply } from "./deepseek.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "..");
const config = loadConfig();
const store = new JsonStore(path.join(projectRoot, "data", "state.json"));
const app = express();
const liveSessions = new Map();

app.set("trust proxy", true);

app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: false }));

function requireAdmin(req, res, next) {
  if (!config.adminToken || config.adminToken.length < 16) {
    return res.status(503).json({ error: "ADMIN_TOKEN 尚未正确配置" });
  }
  const supplied = req.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (supplied !== config.adminToken) {
    return res.status(401).json({ error: "管理令牌不正确" });
  }
  next();
}

function requireValidTwilio(req, res, next) {
  if (!isValidTwilioRequest(req, config)) {
    return res.status(403).send("Invalid Twilio signature");
  }
  next();
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, scheduler: config.enableScheduler });
});

app.get("/api/state", requireAdmin, async (_req, res, next) => {
  try {
    const state = await store.read();
    res.json({
      ...state,
      setup: getSetupStatus(config),
      schedule: {
        enabled: config.enableScheduler,
        cron: config.callCron,
        timeZone: config.timeZone,
      },
      targetNumberSuffix: config.targetPhoneNumber.slice(-4),
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/goal", requireAdmin, async (req, res, next) => {
  try {
    const goal = await store.setGoal(String(req.body?.text ?? ""));
    res.json({ goal });
  } catch (error) {
    if (error.message.includes("目标长度")) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

app.post("/api/calls", requireAdmin, async (_req, res, next) => {
  try {
    const call = await initiateCall({ config, store, trigger: "manual" });
    res.status(202).json({ call });
  } catch (error) {
    next(error);
  }
});

app.post("/twilio/connect", requireValidTwilio, async (req, res, next) => {
  try {
    const callSid = String(req.body?.CallSid || "");
    const state = await store.read();
    liveSessions.set(callSid, {
      goal: state.goal.text,
      messages: [],
      turnCount: 0,
      emptyInputCount: 0,
    });
    await store.startConversation(callSid);
    res.type("text/xml").send(buildConnectTwiml(config, state.goal.text));
  } catch (error) {
    next(error);
  }
});

app.post("/twilio/respond", requireValidTwilio, async (req, res) => {
  const callSid = String(req.body?.CallSid || "");
  const speech = String(req.body?.SpeechResult || "").trim().slice(0, 1000);
  const session = liveSessions.get(callSid);

  if (!session) {
    return res
      .type("text/xml")
      .send(buildFinalTwiml(config, "这次通话状态已经失效，请稍后重试。再见。"));
  }

  if (!speech) {
    session.emptyInputCount += 1;
    if (session.emptyInputCount < 2) {
      return res
        .type("text/xml")
        .send(buildGatherTwiml(config, "抱歉，我没有听清。请再说一次。"));
    }

    await store.saveCheckinByTwilioSid(callSid, {
      status: "reschedule",
      summary: "连续两次未识别到回答",
      next_action: "稍后重新回访",
      recordedAt: new Date().toISOString(),
    });
    liveSessions.delete(callSid);
    return res
      .type("text/xml")
      .send(buildFinalTwiml(config, "我还是没有听清，我们稍后再聊。再见。"));
  }

  session.emptyInputCount = 0;
  session.turnCount += 1;
  session.messages.push({ role: "user", content: speech });

  try {
    const reply = await generateDeepSeekReply({
      config,
      goal: session.goal,
      messages: session.messages,
    });
    session.messages.push({ role: "assistant", content: reply.spokenText });

    const reachedTurnLimit = session.turnCount >= config.maxConversationTurns;
    if (reply.done || reachedTurnLimit) {
      const checkin = {
        status: reply.status || "partial",
        summary: reply.summary || `通话达到轮次上限，最后回答：${speech.slice(0, 120)}`,
        next_action: reply.nextAction,
        recordedAt: new Date().toISOString(),
      };
      await store.saveCheckinByTwilioSid(callSid, checkin);
      liveSessions.delete(callSid);
      const ending = reachedTurnLimit && !reply.done
        ? `${reply.spokenText} 今天先聊到这里，再见。`
        : reply.spokenText;
      return res.type("text/xml").send(buildFinalTwiml(config, ending));
    }

    return res
      .type("text/xml")
      .send(buildGatherTwiml(config, reply.spokenText));
  } catch (error) {
    console.error("DeepSeek conversation failed:", error.message);
    await store.updateByTwilioSid(callSid, {
      status: "failed",
      error: error.message,
    });
    liveSessions.delete(callSid);
    return res
      .type("text/xml")
      .send(buildFinalTwiml(config, "抱歉，回访助手暂时无法响应，请稍后再试。再见。"));
  }
});

app.post("/twilio/status", requireValidTwilio, async (req, res, next) => {
  try {
    const changes = {
      status: req.body?.CallStatus || "unknown",
    };
    if (req.body?.CallDuration) {
      changes.durationSeconds = Number(req.body.CallDuration);
    }
    await store.updateByTwilioSid(req.body?.CallSid, changes);
    if (["completed", "busy", "no-answer", "canceled", "failed"].includes(changes.status)) {
      liveSessions.delete(req.body?.CallSid);
    }
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

app.use(express.static(path.join(projectRoot, "public")));

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || "服务器内部错误" });
});

let scheduledTask = null;
if (config.enableScheduler) {
  scheduledTask = cron.schedule(
    config.callCron,
    async () => {
      try {
        await initiateCall({ config, store, trigger: "schedule" });
      } catch (error) {
        console.error("Scheduled call failed:", error);
      }
    },
    { timezone: config.timeZone, noOverlap: true },
  );
}

const server = app.listen(config.port, () => {
  console.log(`Accountability Call Agent: http://localhost:${config.port}`);
  console.log(
    `Scheduler: ${config.enableScheduler ? "enabled" : "disabled (safe default)"}`,
  );
});

function shutdown() {
  scheduledTask?.stop();
  liveSessions.clear();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
