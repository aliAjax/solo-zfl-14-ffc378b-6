import "./styles.css";

const STORAGE_KEY = "zfl-14-repairs";
const statuses = {
  all: "全部",
  todo: "待处理",
  doing: "处理中",
  done: "已完成"
};

const priorities = {
  high: "高优先级",
  medium: "中优先级",
  low: "低优先级"
};

let state = loadState();
let editingRecordId = null;
const app = document.querySelector("#app");

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const data = JSON.parse(saved);
    data.repairs = (data.repairs || []).map((repair) => ({
      ...repair,
      records: Array.isArray(repair.records) ? repair.records : []
    }));
    return data;
  }
  return {
    filter: "all",
    repairs: [
      {
        id: crypto.randomUUID(),
        location: "厨房",
        title: "水槽下方渗水",
        priority: "high",
        cost: 260,
        status: "todo",
        photo: "",
        note: "先检查软管接口",
        records: []
      }
    ]
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function render() {
  const repairs = filteredRepairs();
  const unfinished = state.repairs.filter((repair) => repair.status !== "done");
  const totalCost = unfinished.reduce((total, repair) => total + Number(repair.cost || 0), 0);
  const doing = state.repairs.filter((repair) => repair.status === "doing").length;

  app.innerHTML = `
    <main class="shell">
      <header class="header">
        <div>
          <p class="eyebrow">本地家庭维护台</p>
          <h1>家庭维修事项</h1>
        </div>
        <section class="stats">
          <div class="stat"><span>未完成</span><strong>${unfinished.length}</strong></div>
          <div class="stat"><span>处理中</span><strong>${doing}</strong></div>
          <div class="stat"><span>预计费用</span><strong>¥${totalCost}</strong></div>
        </section>
      </header>

      <section class="layout">
        <aside class="panel">
          <h2>新增维修事项</h2>
          <form class="form" id="repair-form">
            <label>位置<input name="location" required placeholder="例如卫生间"></label>
            <label>问题描述<textarea name="title" required placeholder="例如门锁松动"></textarea></label>
            <label>优先级<select name="priority">${renderPriorityOptions("medium")}</select></label>
            <label>预计费用<input name="cost" type="number" min="0" step="1" value="0"></label>
            <label>处理状态<select name="status">${renderStatusOptions("todo")}</select></label>
            <label>照片链接<input name="photo" type="url" placeholder="可选，粘贴图片地址"></label>
            <label>备注<textarea name="note" placeholder="师傅电话、材料或注意事项"></textarea></label>
            <button class="primary" type="submit">保存事项</button>
          </form>
        </aside>

        <section>
          <div class="toolbar">
            ${Object.entries(statuses).map(([value, label]) => `<button class="seg ${state.filter === value ? "active" : ""}" data-filter="${value}">${label}</button>`).join("")}
          </div>
          <div class="repairs">
            ${repairs.length ? repairs.map(renderRepair).join("") : `<div class="empty">当前状态下没有维修事项</div>`}
          </div>
        </section>
      </section>
    </main>
  `;

  bindEvents();
}

function renderRepair(repair) {
  const records = sortedRecords(repair);
  const latest = records[0];
  return `
    <article class="repair" data-repair="${repair.id}">
      <div class="photo">${repair.photo ? `<img src="${escapeHtml(repair.photo)}" alt="${escapeHtml(repair.location)}维修照片">` : "未添加照片"}</div>
      <div class="content">
        <div class="row">
          <h3>${escapeHtml(repair.location)}</h3>
          <span class="priority ${repair.priority}">${priorities[repair.priority]}</span>
          <span class="status ${repair.status}">${statuses[repair.status]}</span>
        </div>
        <p>${escapeHtml(repair.title)}</p>
        <div class="row">
          <span class="chip">预计 ¥${Number(repair.cost || 0)}</span>
          <span class="chip">${escapeHtml(repair.note || "暂无备注")}</span>
          <span class="chip ${latest ? "last-time" : "no-record"}">${latest ? `最近处理：${formatTime(latest.time)}` : "暂无处理记录"}</span>
        </div>
        <section class="records">
          <h4>维修记录${records.length ? `（${records.length}）` : ""}</h4>
          ${records.length ? `
            <ul class="record-list">
              ${records.map((record) => renderRecord(repair, record)).join("")}
            </ul>` : `<p class="record-empty">还没有处理记录，下方可添加第一次处理。</p>`}
          <form class="record-form" data-record-form="${repair.id}">
            <label>处理内容<textarea name="content" required placeholder="例如：拆开软管接口，发现密封圈老化"></textarea></label>
            <label>处理结果<input name="result" required placeholder="例如：更换密封圈，已不再渗水"></label>
            <button class="ghost" type="submit">添加记录</button>
          </form>
        </section>
        <div class="actions">
          <select data-status="${repair.id}">${renderStatusOptions(repair.status)}</select>
          <button class="ghost" data-delete="${repair.id}">删除</button>
        </div>
      </div>
    </article>
  `;
}

function renderRecord(repair, record) {
  if (editingRecordId === record.id) {
    return `
    <li class="record-entry editing" data-record-id="${record.id}" data-time="${record.time}">
      <form class="record-edit" data-record-edit="${repair.id}" data-record-id="${record.id}">
        <label>处理时间<input name="time" type="datetime-local" required value="${escapeHtml(toInputValue(record.time))}"></label>
        <label>处理内容<textarea name="content" required>${escapeHtml(record.content)}</textarea></label>
        <label>处理结果<input name="result" required value="${escapeHtml(record.result)}"></label>
        <div class="edit-actions">
          <button class="primary" type="submit">保存修改</button>
          <button class="ghost" type="button" data-record-cancel="${record.id}">取消</button>
        </div>
      </form>
    </li>
  `;
  }
  return `
    <li class="record-entry" data-record-id="${record.id}" data-time="${record.time}">
      <div class="record-head">
        <time class="record-time" datetime="${new Date(record.time).toISOString()}">${formatTime(record.time)}</time>
        <span class="record-ops">
          <button class="link" type="button" data-record-edit-btn="${record.id}">编辑</button>
          <button class="link danger" type="button" data-record-remove="${repair.id}" data-record-id="${record.id}">移除</button>
        </span>
      </div>
      <p class="record-content">${escapeHtml(record.content)}</p>
      <p class="record-result"><span>处理结果：</span>${escapeHtml(record.result)}</p>
    </li>
  `;
}

function toInputValue(timestamp) {
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromInputValue(value) {
  return new Date(value).getTime();
}

function sortedRecords(repair) {
  return (repair.records || []).slice().sort((a, b) => b.time - a.time);
}

function latestRecordTime(repair) {
  return repair.records.length ? Math.max(...repair.records.map((record) => record.time)) : null;
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function renderStatusOptions(selected) {
  return Object.entries(statuses)
    .filter(([value]) => value !== "all")
    .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

function renderPriorityOptions(selected) {
  return Object.entries(priorities)
    .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

function bindEvents() {
  document.querySelector("#repair-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    state.repairs.unshift({
      id: crypto.randomUUID(),
      location: data.location.trim(),
      title: data.title.trim(),
      priority: data.priority,
      cost: Number(data.cost || 0),
      status: data.status,
      photo: data.photo.trim(),
      note: data.note.trim(),
      records: []
    });
    saveState();
    render();
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-status]").forEach((select) => {
    select.addEventListener("change", () => {
      const repair = state.repairs.find((item) => item.id === select.dataset.status);
      repair.status = select.value;
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      state.repairs = state.repairs.filter((repair) => repair.id !== button.dataset.delete);
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-record-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const repair = state.repairs.find((item) => item.id === form.dataset.recordForm);
      const data = Object.fromEntries(new FormData(form));
      repair.records.unshift({
        id: crypto.randomUUID(),
        content: data.content.trim(),
        result: data.result.trim(),
        time: Date.now()
      });
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-record-edit-btn]").forEach((button) => {
    button.addEventListener("click", () => {
      editingRecordId = button.dataset.recordEditBtn;
      render();
    });
  });

  document.querySelectorAll("[data-record-cancel]").forEach((button) => {
    button.addEventListener("click", () => {
      editingRecordId = null;
      render();
    });
  });

  document.querySelectorAll("[data-record-edit]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const repair = state.repairs.find((item) => item.id === form.dataset.recordEdit);
      const record = repair.records.find((item) => item.id === form.dataset.recordId);
      const data = Object.fromEntries(new FormData(form));
      record.content = data.content.trim();
      record.result = data.result.trim();
      const nextTime = fromInputValue(data.time);
      if (Number.isFinite(nextTime)) record.time = nextTime;
      editingRecordId = null;
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-record-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      const repair = state.repairs.find((item) => item.id === button.dataset.recordRemove);
      repair.records = repair.records.filter((record) => record.id !== button.dataset.recordId);
      if (editingRecordId === button.dataset.recordId) editingRecordId = null;
      saveState();
      render();
    });
  });
}

function filteredRepairs() {
  const list = state.filter === "all"
    ? state.repairs.slice()
    : state.repairs.filter((repair) => repair.status === state.filter);
  // 有记录的事项按最近处理时间倒序在前，没有任何记录的排在后面
  return list.sort((a, b) => {
    const aTime = latestRecordTime(a);
    const bTime = latestRecordTime(b);
    if (aTime === null && bTime === null) return 0;
    if (aTime === null) return 1;
    if (bTime === null) return -1;
    return bTime - aTime;
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

render();
