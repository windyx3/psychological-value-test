import { evaluateConfig, isValidScore, validateConfig } from "./config-engine.js";

let config = null;
const form = document.getElementById("assessment-form");
const questionsContainer = document.getElementById("questions");
const resultSection = document.getElementById("result");
const formError = document.getElementById("form-error");
const loadError = document.getElementById("load-error");
const submitButton = document.getElementById("submit-button");

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function getPreviewConfig() {
  if (new URLSearchParams(location.search).get("preview") !== "draft") return null;
  try {
    return JSON.parse(localStorage.getItem("assessmentPreviewConfig"));
  } catch {
    return null;
  }
}

async function loadConfig() {
  submitButton.disabled = true;
  loadError.hidden = true;
  const preview = getPreviewConfig();

  try {
    const nextConfig =
      preview ||
      (await fetch("/api/config", { cache: "no-store" }).then((response) => {
        if (!response.ok) throw new Error("配置加载失败");
        return response.json();
      }));
    const errors = validateConfig(nextConfig);
    if (errors.length) throw new Error(errors.join(" "));
    config = nextConfig;
    renderPage();
    submitButton.disabled = false;
  } catch (error) {
    console.error(error);
    loadError.hidden = false;
    questionsContainer.innerHTML = "";
  }
}

function renderPage() {
  document.title = config.site.title;
  setText("page-title", config.site.title);
  setText("eyebrow", config.site.eyebrow || "");
  setText("page-description", config.site.description);
  setText("questions-title", config.site.questionTitle);
  setText("input-instruction", config.site.inputInstruction);
  setText("result-total-label", config.site.resultTotalLabel);
  setText("disclaimer", config.site.disclaimer);
  setText("question-count", `${config.questions.length} 道题`);
  setText("time-estimate", `约 ${Math.max(1, Math.ceil(config.questions.length / 5))} 分钟`);
  setText("max-total", `/ ${config.questions.length * 10}`);

  questionsContainer.innerHTML = "";
  const fragment = document.createDocumentFragment();
  config.questions.forEach((question, index) => {
    const card = document.createElement("article");
    card.className = "question-card";
    card.dataset.questionId = question.id;
    card.innerHTML = `
      <span class="question-index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
      <div class="question-main">
        <label for="question-${question.id}">${escapeHtml(question.text)}</label>
      </div>
      <input
        class="score-input"
        id="question-${question.id}"
        name="question-${question.id}"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        maxlength="2"
        aria-label="第${index + 1}题分数"
      >
    `;
    const input = card.querySelector("input");
    input.addEventListener("input", () => {
      input.value = input.value.replace(/[^\d]/g, "").slice(0, 2);
      clearFieldError(input);
      hideFormError();
      updateDashboard();
    });
    fragment.appendChild(card);
  });
  questionsContainer.appendChild(fragment);
  resetAssessment(false);
}

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = value;
  return element.innerHTML;
}

function readAnswers() {
  const scoresById = {};
  const invalidInputs = [];
  config.questions.forEach((question) => {
    const input = document.getElementById(`question-${question.id}`);
    const raw = input.value.trim();
    if (!isValidScore(raw)) {
      invalidInputs.push(input);
    } else {
      scoresById[question.id] = Number(raw);
    }
  });
  return { scoresById, invalidInputs };
}

function updateDashboard() {
  if (!config) return;
  const { scoresById } = readAnswers();
  const validScores = Object.values(scoresById);
  const completed = validScores.length;
  const total = validScores.reduce((sum, score) => sum + score, 0);
  const percentage = Math.round((completed / config.questions.length) * 100);
  setText("live-total", total);
  setText("progress-text", `已完成 ${completed} / ${config.questions.length}`);
  setText("progress-percent", `${percentage}%`);
  document.getElementById("progress-bar").style.width = `${percentage}%`;
}

function markInvalid(input) {
  input.setAttribute("aria-invalid", "true");
  input.closest(".question-card").classList.add("is-invalid");
}

function clearFieldError(input) {
  input.removeAttribute("aria-invalid");
  input.closest(".question-card").classList.remove("is-invalid");
}

function hideFormError() {
  formError.hidden = true;
}

function showValidationError(invalidInputs) {
  formError.hidden = false;
  invalidInputs.forEach(markInvalid);
  formError.focus({ preventScroll: true });
  invalidInputs[0].scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => invalidInputs[0].focus({ preventScroll: true }), 350);
}

function displayResult(evaluation) {
  const result = evaluation.result;
  setText("result-title", `${result.code}级 · ${result.name}`);
  setText("result-description", result.description);
  setText("grade-seal", result.code);
  setText("result-total", `${evaluation.total} / ${config.questions.length * 10}`);
  setText("result-advice", result.advice);
  document.getElementById("result-card").style.background =
    `linear-gradient(135deg, ${result.colorStart}, ${result.colorEnd})`;
  resultSection.classList.add("is-visible");
  requestAnimationFrame(() =>
    resultSection.scrollIntoView({ behavior: "smooth", block: "start" })
  );
}

function resetAssessment(scroll = true) {
  if (!config) return;
  config.questions.forEach((question) => {
    const input = document.getElementById(`question-${question.id}`);
    input.value = "";
    clearFieldError(input);
  });
  hideFormError();
  resultSection.classList.remove("is-visible");
  updateDashboard();
  if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const { scoresById, invalidInputs } = readAnswers();
  if (invalidInputs.length) {
    showValidationError(invalidInputs);
    return;
  }
  hideFormError();
  displayResult(evaluateConfig(config, scoresById));
});

document.getElementById("reset-button").addEventListener("click", () => resetAssessment());
document.getElementById("retry-button").addEventListener("click", loadConfig);

loadConfig();
