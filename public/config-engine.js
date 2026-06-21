export const DEFAULT_CONFIG = {
  version: 1,
  site: {
    title: "心理价值测验",
    eyebrow: "Value Orientation Check-in",
    description:
      "从长期投入、关系稳定和短期诱惑等角度，完成一次轻量的自我观察。请根据你最近三个月的真实状态作答，而不是理想中的自己。",
    questionTitle: "此刻，你更接近哪一种状态？",
    inputInstruction: "每题请输入1–10的整数，最高10分。",
    resultTotalLabel: "你的总分",
    disclaimer:
      "本测验仅供自我观察与交流，不是经临床验证的心理量表，也不构成心理、医疗或职业诊断。"
  },
  questions: [
    { id: "q1", text: "我愿意为重要目标持续投入，即使短期内看不到明显回报。" },
    { id: "q2", text: "遇到复杂问题时，我会主动识别并处理真正的核心困难。" },
    { id: "q3", text: "我对自己的职业方向有较清晰的判断，并在持续采取行动。" },
    { id: "q4", text: "我愿意提供资源、反馈或机会，支持他人获得长期职业发展。" },
    { id: "q5", text: "面对压力和变化时，我仍能守住重要目标和基本节奏。" },
    { id: "q6", text: "我能区分当下想要的东西与真正对自己有长期价值的东西。" },
    { id: "q7", text: "我能够设定清晰边界，同时尊重他人的需要和选择。" },
    { id: "q8", text: "做出承诺后，我通常能够稳定、可靠地履行。" },
    { id: "q9", text: "发生分歧时，我愿意沟通问题，而不是只追求立刻舒服。" },
    { id: "q10", text: "我会从挫折中复盘，并把经验转化为下一步行动。" },
    { id: "q11", text: "我能在个人需要、关系责任和长期目标之间保持平衡。" },
    { id: "q12", text: "我愿意经营少数重要关系，并为信任付出持续努力。" },
    { id: "q13", text: "面对重要选择时，我通常会优先考虑长期价值而非即时满足。" },
    { id: "q14", text: "我有能力建立并维持稳定、互相尊重且有边界的关系。" },
    { id: "q15", text: "面对强烈吸引、冲动消费或短期刺激时，我通常能保持判断和节制。" }
  ],
  results: [
    {
      id: "result-b",
      code: "B",
      name: "体验型",
      colorStart: "#8a4c57",
      colorEnd: "#d27172",
      description: "当前更容易受到即时体验或短期吸引的影响。",
      advice:
        "建议：重要决定先设置24小时缓冲期，并明确写下短期收益、长期成本和不可接受的底线，再决定是否投入。",
      fallback: false,
      groups: [
        {
          id: "group-b-1",
          logic: "AND",
          conditions: [
            { id: "condition-b-1", metric: "question", questionId: "q13", operator: "<", value: 5 },
            { id: "condition-b-2", metric: "question", questionId: "q15", operator: "<", value: 5 }
          ]
        }
      ]
    },
    {
      id: "result-s",
      code: "S",
      name: "核心型",
      colorStart: "#213c68",
      colorEnd: "#4d6fb3",
      description:
        "你的当前状态显示出较均衡的长期投入、问题解决与关系能力，也具备支持共同发展的倾向。",
      advice:
        "建议：继续保持长期投入，同时留意高标准带来的负担。稳定并不意味着永远独自解决问题，适时寻求协作也很重要。",
      fallback: false,
      groups: [
        {
          id: "group-s-1",
          logic: "AND",
          conditions: [
            { id: "condition-s-1", metric: "total", questionId: null, operator: ">", value: 100 },
            { id: "condition-s-2", metric: "question", questionId: "q4", operator: ">=", value: 7 },
            { id: "condition-s-3", metric: "question", questionId: "q13", operator: ">=", value: 7 },
            { id: "condition-s-4", metric: "question", questionId: "q14", operator: ">=", value: 7 },
            { id: "condition-s-5", metric: "question", questionId: "q15", operator: ">=", value: 7 }
          ]
        }
      ]
    },
    {
      id: "result-a",
      code: "A",
      name: "功能型",
      colorStart: "#355665",
      colorEnd: "#5d8795",
      description: "你展现出较好的长期判断、边界意识和稳定关系能力，能够建立具有持续性的连接。",
      advice:
        "建议：在稳定关系能力之外，继续加强核心困难处理或职业支持行动，有助于让长期价值更完整地落到现实中。",
      fallback: false,
      groups: [
        {
          id: "group-a-1",
          logic: "AND",
          conditions: [
            { id: "condition-a-1", metric: "total", questionId: null, operator: ">", value: 80 },
            { id: "condition-a-2", metric: "question", questionId: "q13", operator: ">=", value: 7 },
            { id: "condition-a-3", metric: "question", questionId: "q14", operator: ">=", value: 7 },
            { id: "condition-a-4", metric: "question", questionId: "q15", operator: ">=", value: 7 }
          ]
        }
      ]
    },
    {
      id: "result-c",
      code: "C",
      name: "成长型",
      colorStart: "#5a527b",
      colorEnd: "#8a79ad",
      description: "当前状态尚未满足其他结果的完整条件，这也可以作为下一步观察和成长的起点。",
      advice:
        "建议：一次只选择一个想提升的关键维度练习。把它变成可观察的小行动，比笼统要求自己“全面提升”更有效。",
      fallback: true,
      groups: []
    }
  ]
};

const OPERATORS = new Set([">", ">=", "<", "<=", "="]);

export function cloneConfig(config = DEFAULT_CONFIG) {
  return JSON.parse(JSON.stringify(config));
}

export function createId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function isValidScore(value) {
  return /^(?:[1-9]|10)$/.test(String(value).trim());
}

function compare(actual, operator, expected) {
  if (operator === ">") return actual > expected;
  if (operator === ">=") return actual >= expected;
  if (operator === "<") return actual < expected;
  if (operator === "<=") return actual <= expected;
  return actual === expected;
}

function conditionMatches(condition, scoresById, total) {
  const actual =
    condition.metric === "total" ? total : Number(scoresById[condition.questionId]);
  return Number.isFinite(actual) && compare(actual, condition.operator, Number(condition.value));
}

function groupMatches(group, scoresById, total) {
  if (!Array.isArray(group.conditions) || group.conditions.length === 0) return false;
  const matches = group.conditions.map((condition) =>
    conditionMatches(condition, scoresById, total)
  );
  return group.logic === "OR" ? matches.some(Boolean) : matches.every(Boolean);
}

export function evaluateConfig(config, scoresById) {
  const scores = config.questions.map((question) => Number(scoresById[question.id]));
  if (scores.some((score) => !Number.isInteger(score) || score < 1 || score > 10)) {
    throw new Error("每道题都必须是1–10的整数。");
  }

  const total = scores.reduce((sum, score) => sum + score, 0);
  const fallback = config.results.find((result) => result.fallback);
  const matched = config.results
    .filter((result) => !result.fallback)
    .find((result) =>
      Array.isArray(result.groups) &&
      result.groups.some((group) => groupMatches(group, scoresById, total))
    );

  if (!matched && !fallback) {
    throw new Error("配置中缺少兜底结果。");
  }

  return { result: matched || fallback, total };
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
