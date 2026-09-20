import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cron from "node-cron";
import { loadConfig, getSetupStatus } from "./config.js";
import { JsonStore } from "./store.js";
import {
  buildConnectTwiml,
  initiateCall,
  isValidTwilioRequest,
} from "./telephony.js";
import {
  acceptRealtimeCall,
  createOpenAIClient,
  findSipHeader,
  monitorRealtimeCall,
  unwrapOpenAIWebhook,
} from "./realtime.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "..");
const config = loadConfig();
const store = new JsonStore(path.join(projectRoot, "data", "state.json"));
const app = express();
const openai = createOpenAIClient(config);
const liveSessions = new Map();

app.set("trust proxy", true);

// This route must receive the untouched body for signature verification.
app.post(
  "/webhooks/openai",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    let event;
    try {
      event = await unwrapOpenAIWebhook(
        openai,
        req.body.toString("utf8"),
        req.headers,
      );
    } catch (error) {
      console.warn("Rejected invalid OpenAI webhook:", error.message);
      return res.status(400).json({ error: "Invalid webhook signature" });
    }

    if (event.type !== "realtime.call.incoming") {
      return res.status(200).json({ received: true });
    }

    const callId = event.data.call_id;
    const twilioCallSid = findSipHeader(
      event,
      "X-Accountability-CallSid",
    );

    try {
      const state = await store.read();
      await store.linkOpenAICall(twilioCallSid, callId);
      await acceptRealtimeCall({
        config,
        callId,
        goal: state.goal.text,
      });
      const socket = monitorRealtimeCall({ config, callId, store });
      liveSessions.set(callId, socket);
      socket.once("close", () => liveSessions.delete(callId));
      return res.status(200).json({ received: true });
    } catch (error) {
      console.error("Could not accept incoming SIP call:", error);
      if (twilioCallSid) {
        await store.updateByTwilioSid(twilioCallSid, {
          status: "failed",
          error: error.message,
        });
      }
      return res.status(500).json({ error: "Could not accept SIP call" });
    }
  },
);

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

app.post("/twilio/connect", requireValidTwilio, (req, res) => {
  const xml = buildConnectTwiml(config, req.body?.CallSid);
  res.type("text/xml").send(xml);
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
  for (const socket of liveSessions.values()) socket.close();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
