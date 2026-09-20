import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JsonStore } from "../src/store.js";

test("store persists a goal and check-in result", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "aca-store-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const store = new JsonStore(path.join(directory, "state.json"));

  await store.setGoal("完成第一个可运行版本");
  const call = await store.createCall("manual");
  await store.updateCall(call.id, { twilioCallSid: "CA123", status: "ringing" });
  await store.linkOpenAICall("CA123", "rtc_123");
  await store.saveCheckin("rtc_123", {
    status: "partial",
    summary: "完成了基础结构",
    next_action: "补上测试",
  });

  const state = await store.read();
  assert.equal(state.goal.text, "完成第一个可运行版本");
  assert.equal(state.calls[0].checkin.next_action, "补上测试");
});
