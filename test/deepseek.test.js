import test from "node:test";
import assert from "node:assert/strict";
import {
  generateDeepSeekReply,
  normalizeDeepSeekReply,
} from "../src/deepseek.js";

const config = {
  deepseekApiKey: "sk-test-secret",
  deepseekBaseUrl: "https://api.deepseek.com",
  deepseekModel: "deepseek-flash",
};

test("DeepSeek request uses JSON mode and parses a valid reply", async () => {
  let request;
  const reply = await generateDeepSeekReply({
    config,
    goal: "完成测试",
    messages: [{ role: "user", content: "完成了" }],
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        async json() {
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  spoken_text: "很好，下一步是什么？",
                  done: false,
                  status: "",
                  summary: "",
                  next_action: "",
                }),
              },
            }],
          };
        },
      };
    },
  });

  assert.equal(request.url, "https://api.deepseek.com/chat/completions");
  assert.equal(request.options.headers.Authorization, "Bearer sk-test-secret");
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, "deepseek-flash");
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.match(body.messages[0].content, /完成测试/);
  assert.equal(reply.spokenText, "很好，下一步是什么？");
});

test("invalid final status falls back without accepting arbitrary values", () => {
  const reply = normalizeDeepSeekReply({
    spoken_text: "今天先到这里。",
    done: true,
    status: "anything",
    summary: "已聊完",
    next_action: "明天继续",
  });
  assert.equal(reply.status, "partial");
});

test("invalid JSON and provider errors are rejected safely", async () => {
  await assert.rejects(
    generateDeepSeekReply({
      config,
      goal: "测试",
      messages: [],
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return { choices: [{ message: { content: "not-json" } }] };
        },
      }),
    }),
    /invalid JSON/,
  );

  await assert.rejects(
    generateDeepSeekReply({
      config,
      goal: "测试",
      messages: [],
      fetchImpl: async () => ({ ok: false, status: 429 }),
    }),
    /DeepSeek request failed \(429\)/,
  );
});
