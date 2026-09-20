import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const initialState = {
  goal: {
    text: "完成今天最重要的一件事",
    updatedAt: null,
  },
  calls: [],
};

function cloneInitialState() {
  return structuredClone(initialState);
}

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.writeQueue = Promise.resolve();
  }

  async read() {
    try {
      const data = JSON.parse(await readFile(this.filePath, "utf8"));
      return {
        goal: data.goal ?? cloneInitialState().goal,
        calls: Array.isArray(data.calls) ? data.calls : [],
      };
    } catch (error) {
      if (error.code === "ENOENT") return cloneInitialState();
      throw error;
    }
  }

  async mutate(mutator) {
    const operation = this.writeQueue.then(async () => {
      const state = await this.read();
      const result = await mutator(state);
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
      return result;
    });
    this.writeQueue = operation.catch(() => {});
    return operation;
  }

  async setGoal(text) {
    const clean = text.trim();
    if (clean.length < 2 || clean.length > 500) {
      throw new Error("目标长度必须在 2 到 500 个字符之间");
    }

    return this.mutate((state) => {
      state.goal = { text: clean, updatedAt: new Date().toISOString() };
      return state.goal;
    });
  }

  async createCall(trigger) {
    const call = {
      id: randomUUID(),
      trigger,
      status: "queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      twilioCallSid: null,
      openaiCallId: null,
      checkin: null,
      error: null,
    };

    await this.mutate((state) => {
      state.calls.unshift(call);
      state.calls = state.calls.slice(0, 100);
    });
    return call;
  }

  async updateCall(id, changes) {
    return this.mutate((state) => {
      const call = state.calls.find((item) => item.id === id);
      if (!call) return null;
      Object.assign(call, changes, { updatedAt: new Date().toISOString() });
      return call;
    });
  }

  async updateByTwilioSid(twilioCallSid, changes) {
    return this.mutate((state) => {
      const call = state.calls.find(
        (item) => item.twilioCallSid === twilioCallSid,
      );
      if (!call) return null;
      Object.assign(call, changes, { updatedAt: new Date().toISOString() });
      return call;
    });
  }

  async linkOpenAICall(twilioCallSid, openaiCallId) {
    return this.mutate((state) => {
      const call = twilioCallSid
        ? state.calls.find((item) => item.twilioCallSid === twilioCallSid)
        : state.calls.find((item) =>
            ["queued", "initiated", "ringing", "in-progress"].includes(
              item.status,
            ),
          );
      if (!call) return null;
      Object.assign(call, {
        openaiCallId,
        status: "connected-to-agent",
        updatedAt: new Date().toISOString(),
      });
      return call;
    });
  }

  async saveCheckin(openaiCallId, checkin) {
    return this.mutate((state) => {
      const call = state.calls.find((item) => item.openaiCallId === openaiCallId);
      if (!call) return null;
      call.checkin = checkin;
      call.status = "checkin-recorded";
      call.updatedAt = new Date().toISOString();
      return call;
    });
  }
}
