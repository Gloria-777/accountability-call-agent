import test from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt, CHECKIN_STATUSES } from "../src/prompt.js";

test("prompt includes the current goal and AI disclosure", () => {
  const prompt = buildSystemPrompt("完成 README");
  assert.match(prompt, /完成 README/);
  assert.match(prompt, /AI 身份/);
  assert.match(prompt, /JSON/);
  assert.match(prompt, /spoken_text/);
});

test("prompt uses a bounded set of final statuses", () => {
  assert.deepEqual(CHECKIN_STATUSES, [
    "completed",
    "partial",
    "not_started",
    "reschedule",
    "declined",
  ]);
});
