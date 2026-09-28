const OPERATORS = new Set([">", ">=", "<", "<=", "="]);

export function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config));
}

export function createId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function validateConfig(config) {
  const errors = [];
  if (!config || typeof config !== "object") return ["配置格式无效。"];

  const requiredSiteFields = [
    ["title", "测验名称"],
    ["description", "测验简介"],
    ["questionTitle", "题目区标题"],
    ["inputInstruction", "输入提示"],
    ["resultTotalLabel", "结果总分标签"],
    ["disclaimer", "免责声明"]
  ];
  requiredSiteFields.forEach(([key, label]) => {
    if (!String(config.site?.[key] || "").trim()) errors.push(`${label}不能为空。`);
  });

  if (!Array.isArray(config.questions) || config.questions.length === 0) {
    errors.push("至少需要一道题目。");
  }

  const questionIds = new Set();
  (config.questions || []).forEach((question, index) => {
    if (!question.id || questionIds.has(question.id)) {
      errors.push(`第${index + 1}题的ID缺失或重复。`);
    }
    questionIds.add(question.id);
    if (!String(question.text || "").trim()) errors.push(`第${index + 1}题内容不能为空。`);
  });

  if (!Array.isArray(config.results) || config.results.length < 2) {
    errors.push("至少需要一个条件结果和一个兜底结果。");
  }

  const resultIds = new Set();
  const resultCodes = new Set();
  const fallbacks = (config.results || []).filter((result) => result.fallback);
  if (fallbacks.length !== 1) errors.push("必须且只能设置一个兜底结果。");

  (config.results || []).forEach((result, resultIndex) => {
    const label = `第${resultIndex + 1}个结果`;
    if (!result.id || resultIds.has(result.id)) errors.push(`${label}的ID缺失或重复。`);
    resultIds.add(result.id);
    const code = String(result.code || "").trim();
    if (!code || resultCodes.has(code)) errors.push(`${label}的代码不能为空或重复。`);
    resultCodes.add(code);
    if (!String(result.name || "").trim()) errors.push(`${label}的名称不能为空。`);
    if (!String(result.description || "").trim()) errors.push(`${label}的解释不能为空。`);
    if (!String(result.advice || "").trim()) errors.push(`${label}的建议不能为空。`);

    if (result.fallback) return;
    if (!Array.isArray(result.groups) || result.groups.length === 0) {
      errors.push(`${label}至少需要一个条件组。`);
      return;
    }

    result.groups.forEach((group, groupIndex) => {
      if (!["AND", "OR"].includes(group.logic)) {
        errors.push(`${label}的第${groupIndex + 1}组逻辑无效。`);
      }
      if (!Array.isArray(group.conditions) || group.conditions.length === 0) {
        errors.push(`${label}的第${groupIndex + 1}组至少需要一个条件。`);
        return;
      }
      group.conditions.forEach((condition, conditionIndex) => {
        const conditionLabel = `${label}第${groupIndex + 1}组第${conditionIndex + 1}项`;
        if (!["total", "question"].includes(condition.metric)) {
          errors.push(`${conditionLabel}的指标无效。`);
        }
        if (
          condition.metric === "question" &&
          (!condition.questionId || !questionIds.has(condition.questionId))
        ) {
          errors.push(`${conditionLabel}引用了不存在的题目。`);
        }
        if (!OPERATORS.has(condition.operator)) {
          errors.push(`${conditionLabel}的运算符无效。`);
        }
        if (!Number.isFinite(Number(condition.value))) {
          errors.push(`${conditionLabel}的阈值必须是数字。`);
        }
        if (
          condition.metric === "question" &&
          (Number(condition.value) < 1 || Number(condition.value) > 10)
        ) {
          errors.push(`${conditionLabel}的题目阈值必须在1–10之间。`);
        }
      });
    });
  });

  return errors;
}
