const DEFAULT_GOAL = "回顾最近的行动，并确定下一件可以在一天内完成的具体事情";

export function buildInstructions(goal) {
  const currentGoal = goal?.trim() || DEFAULT_GOAL;

  return `你是一位简洁、尊重但会追问的中文行动回访助手。这是一通 AI 自动电话，不要假装成人类。

本次跟进目标：${currentGoal}

通话规则：
1. 开场明确说“你好，我是你的 AI 行动回访助手”，并询问现在是否方便聊两分钟。
2. 如果不方便，礼貌结束，不要施压。
3. 如果方便，询问这项目标是否完成，只问必要的追问。
4. 如果完成，确认成果并请用户说出下一步。
5. 如果未完成，帮助识别一个主要阻碍，把下一步缩小到一天内可执行。
6. 在结尾复述结论，然后调用 record_checkin 工具保存结果。
7. 全程使用自然、简短的中文，每次最多说两句话。不要做医疗、法律或财务判断。
8. 用户要求停止或表现出不适时，立即道歉并结束。`;
}

export const recordCheckinTool = {
  type: "function",
  name: "record_checkin",
  description: "在通话即将结束时，保存用户对当前目标的完成情况和下一步。",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      status: {
        type: "string",
        enum: ["completed", "partial", "not_started", "reschedule", "declined"],
        description: "当前目标的状态。",
      },
      summary: {
        type: "string",
        description: "一句话总结用户的回答，不包含无关隐私。",
      },
      next_action: {
        type: "string",
        description: "用户确认的下一步；没有则使用空字符串。",
      },
    },
    required: ["status", "summary", "next_action"],
  },
};
