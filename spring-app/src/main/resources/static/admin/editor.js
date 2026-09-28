import { cloneConfig, createId, validateConfig } from "./config-utils.js";
import { api, identity } from "/assets/ui.js";
const assessmentId = new URLSearchParams(location.search).get("id");
const base = "/api/admin/assessments/" + encodeURIComponent(assessmentId);

let config = null;
let revision = 0;
let publishedRevision = 0;
let dirty = false;
let busy = false;

const editor = document.getElementById("editor");
const questionEditor = document.getElementById("question-editor");
const resultEditor = document.getElementById("result-editor");
const message = document.getElementById("message");

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = value ?? "";
  return element.innerHTML;
}

function setMessage(text, type = "success") {
  message.hidden = !text;
  message.className = `message ${type}`;
  message.textContent = text;
  if (text) message.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function setDirty(value = true) {
  dirty = value;
  const state = document.getElementById("save-state");
  state.textContent = dirty ? "有尚未保存的修改" : "草稿已保存";
  state.className = `save-state ${dirty ? "dirty" : "saved"}`;
}

function updateRevisionStatus() {
  document.getElementById("revision-status").textContent =
    `草稿版本 ${revision} · 已发布版本 ${publishedRevision}`;
}

async function loadAdminConfig() {
  setMessage("");
  try {
    const payload = await api(base);
    config = cloneConfig(payload.config);
    revision = payload.revision;
    publishedRevision = payload.publishedVersion;
    renderAll();
    editor.hidden = false;
    updateRevisionStatus();
    setDirty(false);
  } catch (error) {
    setMessage(`配置加载失败：${error.message}`, "error");
  }
}

function renderAll() {
  Object.entries(config.site).forEach(([key, value]) => {
    const input = document.querySelector(`[data-site-field="${key}"]`);
    if (input) input.value = value ?? "";
  });
  renderQuestions();
  renderResults();
}

function renderQuestions() {
  questionEditor.innerHTML = config.questions.map((question, index) => `
    <div class="question-row" data-question-id="${question.id}">
      <span class="row-number">${String(index + 1).padStart(2, "0")}</span>
      <input
        aria-label="第${index + 1}题内容"
        data-kind="question-text"
        data-question-id="${question.id}"
        value="${escapeHtml(question.text)}"
      >
      <div class="row-actions">
        <button class="icon-button" type="button" title="上移" data-action="move-question-up" data-question-id="${question.id}" ${index === 0 ? "disabled" : ""}>↑</button>
        <button class="icon-button" type="button" title="下移" data-action="move-question-down" data-question-id="${question.id}" ${index === config.questions.length - 1 ? "disabled" : ""}>↓</button>
        <button class="icon-button danger" type="button" title="删除" data-action="delete-question" data-question-id="${question.id}">×</button>
      </div>
    </div>
  `).join("");
}

function questionOptions(selectedId) {
  return config.questions.map((question, index) =>
    `<option value="${question.id}" ${question.id === selectedId ? "selected" : ""}>第${index + 1}题 · ${escapeHtml(question.text.slice(0, 24))}</option>`
  ).join("");
}

function renderCondition(result, group, condition) {
  return `
    <div class="condition-row">
      <select data-kind="condition-metric" data-result-id="${result.id}" data-group-id="${group.id}" data-condition-id="${condition.id}">
        <option value="total" ${condition.metric === "total" ? "selected" : ""}>总分</option>
        <option value="question" ${condition.metric === "question" ? "selected" : ""}>指定题目</option>
      </select>
      ${condition.metric === "question" ? `
        <select data-kind="condition-question" data-result-id="${result.id}" data-group-id="${group.id}" data-condition-id="${condition.id}">
          ${questionOptions(condition.questionId)}
        </select>
      ` : `<span></span>`}
      <select data-kind="condition-operator" data-result-id="${result.id}" data-group-id="${group.id}" data-condition-id="${condition.id}">
        ${[">", ">=", "<", "<=", "="].map((operator) =>
          `<option value="${operator}" ${operator === condition.operator ? "selected" : ""}>${operator}</option>`
        ).join("")}
      </select>
      <input type="number" step="1" data-kind="condition-value" data-result-id="${result.id}" data-group-id="${group.id}" data-condition-id="${condition.id}" value="${condition.value}">
      <button class="icon-button danger" type="button" title="删除条件" data-action="delete-condition" data-result-id="${result.id}" data-group-id="${group.id}" data-condition-id="${condition.id}">×</button>
    </div>
  `;
}

function renderGroups(result) {
  if (result.fallback) {
    return `<p class="hint">兜底结果不需要条件；当前面所有结果都未命中时自动使用它。</p>`;
  }
  return `
    <div class="groups">
      ${result.groups.map((group, groupIndex) => `
        <div class="group">
          <div class="group-head">
            <div class="group-title">
              <span>条件组 ${groupIndex + 1}：组内</span>
              <select data-kind="group-logic" data-result-id="${result.id}" data-group-id="${group.id}">
                <option value="AND" ${group.logic === "AND" ? "selected" : ""}>全部满足（且）</option>
                <option value="OR" ${group.logic === "OR" ? "selected" : ""}>任一满足（或）</option>
              </select>
            </div>
            <button class="icon-button danger" type="button" title="删除条件组" data-action="delete-group" data-result-id="${result.id}" data-group-id="${group.id}">×</button>
          </div>
          <div class="condition-list">
            ${group.conditions.map((condition) => renderCondition(result, group, condition)).join("")}
          </div>
          <div class="group-actions">
            <button class="button button-light button-small" type="button" data-action="add-condition" data-result-id="${result.id}" data-group-id="${group.id}">＋ 添加条件</button>
          </div>
        </div>
      `).join("")}
      <button class="button button-light button-small" type="button" data-action="add-group" data-result-id="${result.id}">＋ 添加“或”条件组</button>
    </div>
  `;
}

function renderResults() {
  resultEditor.innerHTML = config.results.map((result, index) => `
    <article class="result-block" data-result-id="${result.id}">
      <div class="result-top">
        <div class="result-title">
          <span class="priority">${index + 1}</span>
          <span>${escapeHtml(result.code)}级 · ${escapeHtml(result.name)}</span>
          ${result.fallback ? "<small>兜底</small>" : ""}
        </div>
        <div class="row-actions">
          <button class="icon-button" type="button" title="提高优先级" data-action="move-result-up" data-result-id="${result.id}" ${index === 0 ? "disabled" : ""}>↑</button>
          <button class="icon-button" type="button" title="降低优先级" data-action="move-result-down" data-result-id="${result.id}" ${index === config.results.length - 1 ? "disabled" : ""}>↓</button>
          <button class="icon-button danger" type="button" title="删除结果" data-action="delete-result" data-result-id="${result.id}">×</button>
        </div>
      </div>
      <div class="result-body">
        <div class="result-fields">
          <label>结果代码<input maxlength="8" data-kind="result-field" data-field="code" data-result-id="${result.id}" value="${escapeHtml(result.code)}"></label>
          <label>结果名称<input data-kind="result-field" data-field="name" data-result-id="${result.id}" value="${escapeHtml(result.name)}"></label>
          <label>渐变起色<input type="color" data-kind="result-field" data-field="colorStart" data-result-id="${result.id}" value="${escapeHtml(result.colorStart)}"></label>
          <label>渐变止色<input type="color" data-kind="result-field" data-field="colorEnd" data-result-id="${result.id}" value="${escapeHtml(result.colorEnd)}"></label>
          <label class="wide">结果解释<textarea rows="3" data-kind="result-field" data-field="description" data-result-id="${result.id}">${escapeHtml(result.description)}</textarea></label>
          <label class="wide">结果建议<textarea rows="3" data-kind="result-field" data-field="advice" data-result-id="${result.id}">${escapeHtml(result.advice)}</textarea></label>
        </div>
        <label class="fallback-row">
          <input type="radio" name="fallback-result" data-kind="result-fallback" data-result-id="${result.id}" ${result.fallback ? "checked" : ""}>
          设为最终兜底结果
        </label>
        ${renderGroups(result)}
      </div>
    </article>
  `).join("");
}

function findResult(resultId) {
  return config.results.find((result) => result.id === resultId);
}

function findGroup(resultId, groupId) {
  return findResult(resultId)?.groups.find((group) => group.id === groupId);
}

function findCondition(resultId, groupId, conditionId) {
  return findGroup(resultId, groupId)?.conditions.find(
    (condition) => condition.id === conditionId
  );
}

function moveItem(items, id, direction) {
  const index = items.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return;
  [items[index], items[target]] = [items[target], items[index]];
}

function questionIsReferenced(questionId) {
  return config.results.some((result) =>
    result.groups.some((group) =>
      group.conditions.some(
        (condition) => condition.metric === "question" && condition.questionId === questionId
      )
    )
  );
}

function addQuestion() {
  config.questions.push({ id: createId("question"), text: "请输入新题目内容" });
  renderQuestions();
  renderResults();
  setDirty();
}

function addResult() {
  config.results.splice(Math.max(0, config.results.length - 1), 0, {
    id: createId("result"),
    code: `R${config.results.length}`,
    name: "新结果",
    colorStart: "#4f5fa8",
    colorEnd: "#7c88d9",
    description: "请输入结果解释。",
    advice: "请输入结果建议。",
    fallback: false,
    groups: [
      {
        id: createId("group"),
        logic: "AND",
        conditions: [
          {
            id: createId("condition"),
            metric: "total",
            questionId: null,
            operator: ">",
            value: 0
          }
        ]
      }
    ]
  });
  renderResults();
  setDirty();
}

function addGroup(resultId) {
  findResult(resultId).groups.push({
    id: createId("group"),
    logic: "AND",
    conditions: [{
      id: createId("condition"),
      metric: "total",
      questionId: null,
      operator: ">",
      value: 0
    }]
  });
  renderResults();
  setDirty();
}

function addCondition(resultId, groupId) {
  findGroup(resultId, groupId).conditions.push({
    id: createId("condition"),
    metric: "question",
    questionId: config.questions[0]?.id || null,
    operator: ">=",
    value: 7
  });
  renderResults();
  setDirty();
}

function validationErrors() {
  return validateConfig(config);
}

async function saveDraft() {
  if (busy) return false;
  const errors = validationErrors();
  if (errors.length) {
    setMessage(`无法保存：${errors.join("；")}`, "error");
    return false;
  }

  busy = true;
  try {
    const payload = await api(base + "/draft", {
      method: "PUT",
      body: JSON.stringify({ config, revision })
    });
    revision = payload.revision;
    config = cloneConfig(payload.config);
    updateRevisionStatus();
    setDirty(false);
    setMessage("草稿已保存，已分配的测验保持不变。");
    return true;
  } catch (error) {
    if (error.status === 409) {
      setMessage("其他管理员已经更新了草稿。请刷新页面重新加载后再修改。", "error");
    } else {
      setMessage(`保存失败：${error.message}`, "error");
    }
    return false;
  } finally {
    busy = false;
  }
}

async function publishDraft() {
  if (!(await saveDraft())) return;
  busy = true;
  try {
    const payload = await api(base + "/publish", {
      method: "POST",
      body: JSON.stringify({ revision })
    });
    publishedRevision = payload.publishedVersion;
    revision = payload.revision;
    updateRevisionStatus();
    setMessage("发布成功。新版本已发布；现有分配保持原版本，请到工作台分配新版本。");
  } catch (error) {
    setMessage(`发布失败：${error.message}`, "error");
  } finally {
    busy = false;
  }
}

async function discardDraft() {
  if (!confirm("确定放弃当前草稿，并恢复到已发布版本吗？")) return;
  busy = true;
  try {
    const payload = await api(base + "/discard", {
      method: "POST",
      body: JSON.stringify({ revision })
    });
    config = cloneConfig(payload.config);
    revision = payload.revision;
    publishedRevision = payload.publishedVersion;
    renderAll();
    updateRevisionStatus();
    setDirty(false);
    setMessage("草稿已恢复为当前发布版本。");
  } catch (error) {
    setMessage(`恢复失败：${error.message}`, "error");
  } finally {
    busy = false;
  }
}

async function previewDraft() {
  if (!(await saveDraft())) return;
  window.open("/admin/preview.html?id=" + encodeURIComponent(assessmentId) + "&revision=" + revision, "_blank", "noopener");
}

editor.addEventListener("input", (event) => {
  const target = event.target;
  const siteField = target.dataset.siteField;
  if (siteField) config.site[siteField] = target.value;

  if (target.dataset.kind === "question-text") {
    config.questions.find((question) => question.id === target.dataset.questionId).text =
      target.value;
  }
  if (target.dataset.kind === "result-field") {
    findResult(target.dataset.resultId)[target.dataset.field] = target.value;
  }
  if (target.dataset.kind === "condition-value") {
    findCondition(target.dataset.resultId, target.dataset.groupId, target.dataset.conditionId).value =
      Number(target.value);
  }
  setDirty();
});

editor.addEventListener("change", (event) => {
  const target = event.target;
  if (target.dataset.kind === "result-fallback") {
    config.results.forEach((result) => {
      const wasFallback = result.fallback;
      result.fallback = result.id === target.dataset.resultId;
      if (wasFallback && !result.fallback && result.groups.length === 0) {
        result.groups.push({
          id: createId("group"),
          logic: "AND",
          conditions: [{
            id: createId("condition"),
            metric: "total",
            questionId: null,
            operator: ">",
            value: 0
          }]
        });
      }
    });
    renderResults();
  }
  if (target.dataset.kind === "group-logic") {
    findGroup(target.dataset.resultId, target.dataset.groupId).logic = target.value;
  }
  if (target.dataset.kind?.startsWith("condition-")) {
    const condition = findCondition(
      target.dataset.resultId,
      target.dataset.groupId,
      target.dataset.conditionId
    );
    if (target.dataset.kind === "condition-metric") {
      condition.metric = target.value;
      condition.questionId = target.value === "question" ? config.questions[0]?.id || null : null;
      renderResults();
    }
    if (target.dataset.kind === "condition-question") condition.questionId = target.value;
    if (target.dataset.kind === "condition-operator") condition.operator = target.value;
  }
  setDirty();
});

editor.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, questionId, resultId, groupId, conditionId } = button.dataset;

  if (action === "add-question") addQuestion();
  if (action === "add-result") addResult();
  if (action === "move-question-up" || action === "move-question-down") {
    moveItem(config.questions, questionId, action.endsWith("up") ? -1 : 1);
    renderQuestions();
    renderResults();
    setDirty();
  }
  if (action === "delete-question") {
    if (questionIsReferenced(questionId)) {
      setMessage("该题目仍被评级条件引用，请先删除或修改相关条件。", "error");
      return;
    }
    config.questions = config.questions.filter((question) => question.id !== questionId);
    renderQuestions();
    renderResults();
    setDirty();
  }
  if (action === "move-result-up" || action === "move-result-down") {
    moveItem(config.results, resultId, action.endsWith("up") ? -1 : 1);
    renderResults();
    setDirty();
  }
  if (action === "delete-result") {
    if (config.results.length <= 2) {
      setMessage("至少需要一个条件结果和一个兜底结果。", "error");
      return;
    }
    config.results = config.results.filter((result) => result.id !== resultId);
    renderResults();
    setDirty();
  }
  if (action === "add-group") addGroup(resultId);
  if (action === "delete-group") {
    const result = findResult(resultId);
    result.groups = result.groups.filter((group) => group.id !== groupId);
    renderResults();
    setDirty();
  }
  if (action === "add-condition") addCondition(resultId, groupId);
  if (action === "delete-condition") {
    const group = findGroup(resultId, groupId);
    group.conditions = group.conditions.filter((condition) => condition.id !== conditionId);
    renderResults();
    setDirty();
  }
  if (action === "save") saveDraft();
  if (action === "publish") publishDraft();
  if (action === "discard") discardDraft();
  if (action === "preview") previewDraft();
});

window.addEventListener("beforeunload", (event) => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

identity(true).then(user => { if (user) loadAdminConfig(); });

