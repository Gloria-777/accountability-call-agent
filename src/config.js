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

function isE164(value) {
  return /^\+[1-9]\d{7,14}$/.test(value);
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
    maxConversationTurns: integerFromEnv(env.MAX_CONVERSATION_TURNS, 6),
    targetPhoneNumber: env.TARGET_PHONE_NUMBER || "",
    twilioAccountSid: env.TWILIO_ACCOUNT_SID || "",
    twilioAuthToken: env.TWILIO_AUTH_TOKEN || "",
    twilioPhoneNumber: env.TWILIO_PHONE_NUMBER || "",
    validateTwilioSignature: booleanFromEnv(
      env.VALIDATE_TWILIO_SIGNATURE,
      true,
    ),
    twilioSpeechLanguage: env.TWILIO_SPEECH_LANGUAGE || "cmn-Hans-CN",
    twilioSayLanguage: env.TWILIO_SAY_LANGUAGE || "zh-CN",
    deepseekApiKey: env.DEEPSEEK_API_KEY || "",
    deepseekBaseUrl: withoutTrailingSlash(
      env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    ),
    deepseekModel: env.DEEPSEEK_MODEL || "deepseek-flash",
  };
}

export function getSetupStatus(config) {
  const checks = {
    publicUrl: /^https:\/\/[^\s]+$/i.test(config.publicBaseUrl),
    adminToken: config.adminToken.length >= 16,
    targetNumber: isE164(config.targetPhoneNumber),
    twilio: Boolean(
      /^AC[a-zA-Z0-9]{8,}$/.test(config.twilioAccountSid) &&
        config.twilioAuthToken &&
        isE164(config.twilioPhoneNumber),
    ),
    deepseek: Boolean(
      /^sk-[^\s]+/.test(config.deepseekApiKey) &&
        /^https:\/\/[^\s]+$/i.test(config.deepseekBaseUrl) &&
        config.deepseekModel,
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
