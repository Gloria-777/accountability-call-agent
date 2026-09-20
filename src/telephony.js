import twilio from "twilio";
import { assertCallReady } from "./config.js";

function getTwilioClient(config) {
  return twilio(config.twilioAccountSid, config.twilioAuthToken);
}

export async function initiateCall({ config, store, trigger }) {
  assertCallReady(config);
  const record = await store.createCall(trigger);

  try {
    const client = getTwilioClient(config);
    const call = await client.calls.create({
      to: config.targetPhoneNumber,
      from: config.twilioPhoneNumber,
      url: `${config.publicBaseUrl}/twilio/connect`,
      method: "POST",
      statusCallback: `${config.publicBaseUrl}/twilio/status`,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      timeLimit: config.maxCallSeconds,
    });

    return await store.updateCall(record.id, {
      twilioCallSid: call.sid,
      status: call.status || "initiated",
    });
  } catch (error) {
    await store.updateCall(record.id, {
      status: "failed",
      error: error.message,
    });
    throw error;
  }
}

export function isValidTwilioRequest(req, config) {
  if (!config.validateTwilioSignature) return true;
  const signature = req.get("x-twilio-signature");
  if (!signature || !config.publicBaseUrl) return false;
  const url = `${config.publicBaseUrl}${req.originalUrl}`;
  return twilio.validateRequest(
    config.twilioAuthToken,
    signature,
    url,
    req.body,
  );
}

export function buildConnectTwiml(config, twilioCallSid) {
  const response = new twilio.twiml.VoiceResponse();
  response.say(
    { language: "zh-CN" },
    "你好，这是一通由人工智能生成的行动回访电话。正在连接你的回访助手。",
  );

  const dial = response.dial({
    answerOnBridge: true,
    timeLimit: config.maxCallSeconds,
  });
  const customHeader = twilioCallSid
    ? `?X-Accountability-CallSid=${encodeURIComponent(twilioCallSid)}`
    : "";
  dial.sip(
    `sip:${config.openaiProjectId}@sip.api.openai.com;transport=tls${customHeader}`,
  );
  return response.toString();
}
