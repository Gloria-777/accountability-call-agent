import test from "node:test";
import assert from "node:assert/strict";
import { getSetupStatus, loadConfig } from "../src/config.js";

test("scheduler stays disabled by default", () => {
  const config = loadConfig({});
  assert.equal(config.enableScheduler, false);
  assert.equal(config.openaiRealtimeModel, "gpt-realtime-2.1-mini");
});

test("setup is ready only when every external setting exists", () => {
  const config = loadConfig({
    PUBLIC_BASE_URL: "https://agent.example.com/",
    ADMIN_TOKEN: "a-very-long-admin-token",
    TARGET_PHONE_NUMBER: "+8613800138000",
    TWILIO_ACCOUNT_SID: "AC1234567890",
    TWILIO_AUTH_TOKEN: "secret",
    TWILIO_PHONE_NUMBER: "+14155550100",
    OPENAI_API_KEY: "sk-test",
    OPENAI_WEBHOOK_SECRET: "whsec_test",
    OPENAI_PROJECT_ID: "proj_test",
  });

  assert.equal(config.publicBaseUrl, "https://agent.example.com");
  assert.equal(getSetupStatus(config).readyToCall, true);
});

test("example placeholders are never treated as working credentials", () => {
  const config = loadConfig({
    PUBLIC_BASE_URL: "https://your-public-url.example.com",
    ADMIN_TOKEN: "replace-with-a-long-random-string",
    TARGET_PHONE_NUMBER: "phone-number",
    TWILIO_ACCOUNT_SID: "account-sid",
    TWILIO_AUTH_TOKEN: "auth-token",
    TWILIO_PHONE_NUMBER: "twilio-number",
    OPENAI_API_KEY: "api-key",
    OPENAI_WEBHOOK_SECRET: "webhook-secret",
    OPENAI_PROJECT_ID: "project-id",
  });

  assert.equal(getSetupStatus(config).readyToCall, false);
});
