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

    return await store.attachTwilioCall(
      record.id,
      call.sid,
      call.status || "initiated",
    );
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

export function buildGatherTwiml(config, spokenText) {
  const response = new twilio.twiml.VoiceResponse();
  const gather = response.gather({
    input: "speech",
    action: `${config.publicBaseUrl}/twilio/respond`,
    method: "POST",
    language: config.twilioSpeechLanguage,
    speechTimeout: "auto",
    timeout: 5,
    actionOnEmptyResult: true,
  });
  gather.say(
    { language: config.twilioSayLanguage },
    spokenText,
  );
  return response.toString();
}

export function buildConnectTwiml(config, goal) {
  const cleanGoal = goal?.trim() || "最近的行动目标";
  return buildGatherTwiml(
    config,
    `你好，这是一通由人工智能生成的行动回访电话。你现在的目标是：${cleanGoal}。方便聊两分钟吗？`,
  );
}

export function buildFinalTwiml(config, spokenText) {
  const response = new twilio.twiml.VoiceResponse();
  response.say({ language: config.twilioSayLanguage }, spokenText);
  response.hangup();
  return response.toString();
}
