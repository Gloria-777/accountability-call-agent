import "dotenv/config";

const truthy = new Set(["1", "true", "yes", "on"]);

function booleanFromEnv(value, fallback = false) {
  if (value == null || value === "") return fallback;
  return truthy.has(String(value).toLowerCase());
}

function integerFromEnv(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function withoutTrailingSlash(value = "") {
  return value.replace(/\/+$/, "");
}

export function loadConfig(env = process.env) {
  return {
    port: integerFromEnv(env.PORT, 5050),
    publicBaseUrl: withoutTrailingSlash(env.PUBLIC_BASE_URL),
    adminToken: env.ADMIN_TOKEN ?? "",
    enableScheduler: booleanFromEnv(env.ENABLE_SCHEDULER, false),
    callCron: env.CALL_CRON || "0 20 * * *",
    timeZone: env.TIME_ZONE || "Asia/Shanghai",
    maxCallSeconds: integerFromEnv(env.MAX_CALL_SECONDS, 240),
    targetPhoneNumber: env.TARGET_PHONE_NUMBER || "",
    twilioAccountSid: env.TWILIO_ACCOUNT_SID || "",
    twilioAuthToken: env.TWILIO_AUTH_TOKEN || "",
    twilioPhoneNumber: env.TWILIO_PHONE_NUMBER || "",
    validateTwilioSignature: booleanFromEnv(
      env.VALIDATE_TWILIO_SIGNATURE,
      true,
    ),
    openaiApiKey: env.OPENAI_API_KEY || "",
    openaiWebhookSecret: env.OPENAI_WEBHOOK_SECRET || "",
    openaiProjectId: env.OPENAI_PROJECT_ID || "",
    openaiRealtimeModel:
      env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1-mini",
    openaiVoice: env.OPENAI_VOICE || "marin",
  };
}

export function getSetupStatus(config) {
  const checks = {
    publicUrl: Boolean(config.publicBaseUrl?.startsWith("https://")),
    adminToken: config.adminToken.length >= 16,
    targetNumber: /^\+[1-9]\d{7,14}$/.test(config.targetPhoneNumber),
    twilio: Boolean(
      config.twilioAccountSid &&
        config.twilioAuthToken &&
        config.twilioPhoneNumber,
    ),
    openai: Boolean(
      config.openaiApiKey &&
        config.openaiWebhookSecret &&
        /^proj_/.test(config.openaiProjectId),
    ),
  };

  return {
    ...checks,
    readyToCall: Object.values(checks).every(Boolean),
  };
}

export function assertCallReady(config) {
  const status = getSetupStatus(config);
  const missing = Object.entries(status)
    .filter(([key, value]) => key !== "readyToCall" && !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Call setup is incomplete: ${missing.join(", ")}`);
  }
}
