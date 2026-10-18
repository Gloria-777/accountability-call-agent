import { buildSystemPrompt, CHECKIN_STATUSES } from "./prompt.js";

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parseJsonObject(content) {
  if (typeof content !== "string") {
    throw new Error("DeepSeek returned no message content");
  }

  const withoutFence = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  let parsed;
  try {
    parsed = JSON.parse(withoutFence);
  } catch {
    throw new Error("DeepSeek returned invalid JSON");
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("DeepSeek returned an invalid response object");
  }
  return parsed;
}

export function normalizeDeepSeekReply(value) {
  const spokenText = cleanText(value?.spoken_text, 300);
  if (!spokenText) throw new Error("DeepSeek returned an empty spoken_text");

  const done = value?.done === true;
  const suppliedStatus = cleanText(value?.status, 32);
  const status = done
    ? CHECKIN_STATUSES.includes(suppliedStatus)
      ? suppliedStatus
      : "partial"
    : "";

  return {
    spokenText,
    done,
    status,
    summary: done ? cleanText(value?.summary, 300) : "",
    nextAction: done ? cleanText(value?.next_action, 200) : "",
  };
}

export async function generateDeepSeekReply({
  config,
  goal,
  messages,
  fetchImpl = fetch,
}) {
  const response = await fetchImpl(`${config.deepseekBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.deepseekApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.deepseekModel,
      response_format: { type: "json_object" },
      temperature: 0.4,
      messages: [
        { role: "system", content: buildSystemPrompt(goal) },
        ...messages,
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek request failed (${response.status})`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("DeepSeek returned a non-JSON response");
  }

  return normalizeDeepSeekReply(
    parseJsonObject(payload?.choices?.[0]?.message?.content),
  );
}
