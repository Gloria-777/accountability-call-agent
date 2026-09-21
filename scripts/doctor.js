import { getSetupStatus, loadConfig } from "../src/config.js";

const labels = {
  publicUrl: "PUBLIC_BASE_URL (public HTTPS URL)",
  adminToken: "ADMIN_TOKEN (at least 16 characters)",
  targetNumber: "TARGET_PHONE_NUMBER (E.164)",
  twilio: "Twilio SID, token, and E.164 phone number",
  openai: "OpenAI API key, webhook secret, and project ID",
};

const status = getSetupStatus(loadConfig());
console.log("Accountability Call Agent configuration\n");

for (const [key, label] of Object.entries(labels)) {
  console.log(`${status[key] ? "OK " : "-- "} ${label}`);
}

if (status.readyToCall) {
  console.log("\nReady. Keep ENABLE_SCHEDULER=false for the first manual test.");
} else {
  console.log("\nNot ready. Complete the missing values in .env and run again.");
  process.exitCode = 1;
}
