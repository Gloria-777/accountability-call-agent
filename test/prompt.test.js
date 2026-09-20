import test from "node:test";
import assert from "node:assert/strict";
import { buildInstructions, recordCheckinTool } from "../src/prompt.js";

test("prompt includes the current goal and AI disclosure", () => {
  const prompt = buildInstructions("完成 README");
  assert.match(prompt, /完成 README/);
  assert.match(prompt, /AI 自动电话/);
  assert.match(prompt, /record_checkin/);
});

test("record tool requires a bounded status", () => {
  assert.equal(recordCheckinTool.name, "record_checkin");
  assert.deepEqual(recordCheckinTool.parameters.required, [
    "status",
    "summary",
    "next_action",
  ]);
});
