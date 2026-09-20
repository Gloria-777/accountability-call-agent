const elements = {
  loginView: document.querySelector("#login-view"),
  loginForm: document.querySelector("#login-form"),
  loginError: document.querySelector("#login-error"),
  token: document.querySelector("#token"),
  dashboard: document.querySelector("#dashboard"),
  logout: document.querySelector("#logout-button"),
  connection: document.querySelector("#connection-label"),
  goalForm: document.querySelector("#goal-form"),
  goal: document.querySelector("#goal"),
  goalCount: document.querySelector("#goal-count"),
  saveStatus: document.querySelector("#save-status"),
  setupList: document.querySelector("#setup-list"),
  readyBadge: document.querySelector("#ready-badge"),
  targetNumber: document.querySelector("#target-number"),
  scheduleState: document.querySelector("#schedule-state"),
  scheduleTimezone: document.querySelector("#schedule-timezone"),
  callButton: document.querySelector("#call-button"),
  refreshButton: document.querySelector("#refresh-button"),
  historyBody: document.querySelector("#history-body"),
  emptyHistory: document.querySelector("#empty-history"),
  toast: document.querySelector("#toast"),
};

const setupLabels = {
  publicUrl: "公网 HTTPS 地址",
  adminToken: "管理令牌",
  targetNumber: "目标手机号",
  twilio: "Twilio 账户",
  openai: "OpenAI 项目",
};

const callStatusLabels = {
  queued: "排队中",
  initiated: "正在发起",
  ringing: "正在响铃",
  answered: "已接听",
  "in-progress": "通话中",
  "connected-to-agent": "已连接 Agent",
  "checkin-recorded": "已记录结果",
  completed: "已结束",
  busy: "忙线",
  "no-answer": "无人接听",
  canceled: "已取消",
  failed: "失败",
};

const checkinStatusLabels = {
  completed: "已完成",
  partial: "部分完成",
  not_started: "尚未开始",
  reschedule: "改期",
  declined: "不便回访",
};

let token = sessionStorage.getItem("adminToken") || "";
let toastTimer;

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  toastTimer = window.setTimeout(
    () => elements.toast.classList.remove("visible"),
    2600,
  );
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `请求失败 (${response.status})`);
  return payload;
}

function setAuthenticated(authenticated) {
  elements.loginView.hidden = authenticated;
  elements.dashboard.hidden = !authenticated;
  elements.logout.hidden = !authenticated;
  elements.connection.textContent = authenticated ? "本地控制台已连接" : "等待连接";
}

function renderSetup(setup) {
  elements.setupList.replaceChildren();
  for (const [key, label] of Object.entries(setupLabels)) {
    const row = document.createElement("li");
    const name = document.createElement("span");
    const value = document.createElement("span");
    name.textContent = label;
    value.textContent = setup[key] ? "正常" : "缺失";
    value.className = setup[key] ? "check-ok" : "check-missing";
    row.append(name, value);
    elements.setupList.append(row);
  }

  elements.readyBadge.textContent = setup.readyToCall ? "可以呼叫" : "配置未完成";
  elements.readyBadge.classList.toggle("ready", setup.readyToCall);
  elements.callButton.disabled = !setup.readyToCall;
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function renderHistory(calls) {
  elements.historyBody.replaceChildren();
  elements.emptyHistory.hidden = calls.length > 0;

  for (const call of calls) {
    const row = document.createElement("tr");
    const values = [
      formatDate(call.createdAt),
      call.trigger === "schedule" ? "定时" : "手动",
      callStatusLabels[call.status] || call.status,
      call.checkin
        ? checkinStatusLabels[call.checkin.status] || call.checkin.status
        : "-",
      call.checkin?.next_action || "-",
    ];
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    elements.historyBody.append(row);
  }
}

async function loadState() {
  const data = await api("/api/state");
  elements.goal.value = data.goal.text;
  elements.goalCount.textContent = `${data.goal.text.length} / 500`;
  elements.targetNumber.textContent = data.targetNumberSuffix
    ? `尾号 ${data.targetNumberSuffix}`
    : "未配置";
  elements.scheduleState.textContent = data.schedule.enabled
    ? data.schedule.cron
    : "关闭";
  elements.scheduleTimezone.textContent = data.schedule.timeZone;
  renderSetup(data.setup);
  renderHistory(data.calls);
  setAuthenticated(true);
}

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  token = elements.token.value.trim();
  elements.loginError.textContent = "";
  try {
    await loadState();
    sessionStorage.setItem("adminToken", token);
    elements.token.value = "";
  } catch (error) {
    token = "";
    elements.loginError.textContent = error.message;
  }
});

elements.logout.addEventListener("click", () => {
  token = "";
  sessionStorage.removeItem("adminToken");
  setAuthenticated(false);
});

elements.goal.addEventListener("input", () => {
  elements.goalCount.textContent = `${elements.goal.value.length} / 500`;
});

elements.goalForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.saveStatus.textContent = "保存中";
  try {
    await api("/api/goal", {
      method: "PUT",
      body: JSON.stringify({ text: elements.goal.value }),
    });
    elements.saveStatus.textContent = "已保存";
    showToast("目标已更新");
  } catch (error) {
    elements.saveStatus.textContent = "保存失败";
    showToast(error.message);
  }
});

elements.callButton.addEventListener("click", async () => {
  const suffix = elements.targetNumber.textContent;
  const confirmed = window.confirm(`确认立即拨打${suffix}的号码吗？`);
  if (!confirmed) return;

  elements.callButton.disabled = true;
  elements.callButton.textContent = "正在发起";
  try {
    await api("/api/calls", { method: "POST", body: "{}" });
    showToast("电话请求已提交");
    await loadState();
  } catch (error) {
    showToast(error.message);
  } finally {
    elements.callButton.textContent = "立即呼叫";
    await loadState().catch(() => {});
  }
});

elements.refreshButton.addEventListener("click", async () => {
  try {
    await loadState();
    showToast("记录已刷新");
  } catch (error) {
    showToast(error.message);
  }
});

if (token) {
  loadState().catch(() => {
    token = "";
    sessionStorage.removeItem("adminToken");
    setAuthenticated(false);
  });
} else {
  setAuthenticated(false);
}
