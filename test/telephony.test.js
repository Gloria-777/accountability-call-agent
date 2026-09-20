import test from "node:test";
import assert from "node:assert/strict";
import { buildConnectTwiml } from "../src/telephony.js";

test("TwiML discloses AI and dials only the configured OpenAI project", () => {
  const xml = buildConnectTwiml(
    { openaiProjectId: "proj_demo", maxCallSeconds: 180 },
    "CA123",
  );

  assert.match(xml, /人工智能/);
  assert.match(xml, /proj_demo@sip\.api\.openai\.com/);
  assert.match(xml, /X-Accountability-CallSid=CA123/);
  assert.match(xml, /timeLimit="180"/);
});
