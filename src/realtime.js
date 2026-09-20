import { createHash } from "node:crypto";
import OpenAI from "openai";
import WebSocket from "ws";
import { buildInstructions, recordCheckinTool } from "./prompt.js";

function safetyIdentifier(config) {
  return `aca_${createHash("sha256")
    .update(config.targetPhoneNumber || "single-user")
    .digest("hex")
    .slice(0, 24)}`;
}

export function createOpenAIClient(config) {
  return new OpenAI({
    apiKey: config.openaiApiKey,
    webhookSecret: config.openaiWebhookSecret,
  });
}

export async function unwrapOpenAIWebhook(client, rawBody, headers) {
  return await client.webhooks.unwrap(rawBody, headers);
}

export function findSipHeader(event, name) {
  const headers = event?.data?.sip_headers ?? [];
  return headers.find(
    (header) => header.name?.toLowerCase() === name.toLowerCase(),
  )?.value;
}

export async function acceptRealtimeCall({ config, callId, goal }) {
  const response = await fetch(
    `https://api.openai.com/v1/realtime/calls/${encodeURIComponent(callId)}/accept`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": safetyIdentifier(config),
      },
      body: JSON.stringify({
        type: "realtime",
        model: config.openaiRealtimeModel,
        output_modalities: ["audio"],
        instructions: buildInstructions(goal),
        reasoning: { effort: "low" },
        audio: {
          input: {
            transcription: { model: "gpt-4o-mini-transcribe" },
            turn_detection: { type: "server_vad" },
          },
          output: { voice: config.openaiVoice },
        },
        tools: [recordCheckinTool],
        tool_choice: "auto",
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `OpenAI accept call failed (${response.status}): ${await response.text()}`,
    );
  }
}

function parseToolCall(event) {
  if (event.type === "response.function_call_arguments.done") {
    return {
      name: event.name,
      callId: event.call_id,
      arguments: event.arguments,
    };
  }

  if (
    event.type === "response.output_item.done" &&
    event.item?.type === "function_call"
  ) {
    return {
      name: event.item.name,
      callId: event.item.call_id,
      arguments: event.item.arguments,
    };
  }

  return null;
}

export function monitorRealtimeCall({ config, callId, store, logger = console }) {
  const socket = new WebSocket(
    `wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(callId)}`,
    {
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
        "OpenAI-Safety-Identifier": safetyIdentifier(config),
      },
    },
  );
  const handledToolCalls = new Set();

  socket.on("open", () => {
    socket.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: "电话已经接通。请现在按照系统指令主动做简短开场。",
            },
          ],
        },
      }),
    );
    socket.send(JSON.stringify({ type: "response.create" }));
  });

  socket.on("message", async (raw) => {
    try {
      const event = JSON.parse(raw.toString());
      if (event.type === "error") {
        logger.error("Realtime session error", event.error ?? event);
        return;
      }

      const toolCall = parseToolCall(event);
      if (
        !toolCall ||
        toolCall.name !== "record_checkin" ||
        handledToolCalls.has(toolCall.callId)
      ) {
        return;
      }
      handledToolCalls.add(toolCall.callId);

      const checkin = JSON.parse(toolCall.arguments || "{}");
      await store.saveCheckin(callId, {
        ...checkin,
        recordedAt: new Date().toISOString(),
      });

      socket.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: toolCall.callId,
            output: JSON.stringify({ saved: true }),
          },
        }),
      );
      socket.send(
        JSON.stringify({
          type: "response.create",
          response: {
            instructions: "简短确认已经记录，然后礼貌结束通话。",
          },
        }),
      );
    } catch (error) {
      logger.error("Could not process Realtime event", error);
    }
  });

  socket.on("error", (error) => {
    logger.error("Realtime monitoring connection failed", error);
  });

  socket.on("close", () => {
    logger.info(`Realtime monitoring closed for ${callId}`);
  });

  return socket;
}
