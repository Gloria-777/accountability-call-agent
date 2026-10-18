import test from "node:test";
import assert from "node:assert/strict";
import { buildConnectTwiml, buildFinalTwiml } from "../src/telephony.js";

test("TwiML discloses AI and gathers Mandarin speech", () => {
  const xml = buildConnectTwiml(
    {
      publicBaseUrl: "https://agent.example.com",
      twilioSpeechLanguage: "cmn-Hans-CN",
      twilioSayLanguage: "zh-CN",
    },
    "完成 README",
  );

  assert.match(xml, /人工智能/);
  assert.match(xml, /完成 README/);
  assert.match(xml, /input="speech"/);
  assert.match(xml, /language="cmn-Hans-CN"/);
  assert.match(xml, /action="https:\/\/agent\.example\.com\/twilio\/respond"/);
  assert.doesNotMatch(xml, /<(?:Dial|Sip)[ >]/i);
});

test("final TwiML speaks and hangs up", () => {
  const xml = buildFinalTwiml(
    { twilioSayLanguage: "zh-CN" },
    "已经记录，再见。",
  );
  assert.match(xml, /已经记录/);
  assert.match(xml, /<Hangup\/>/);
});
