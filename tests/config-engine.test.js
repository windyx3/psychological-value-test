import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CONFIG,
  cloneConfig,
  evaluateConfig,
  isValidScore,
  validateConfig
} from "../public/config-engine.js";

function scores(values) {
  return Object.fromEntries(
    DEFAULT_CONFIG.questions.map((question, index) => [
      question.id,
      Array.isArray(values) ? values[index] : values
    ])
  );
}

test("1和10是有效分数，空值、0、11和小数无效", () => {
  assert.equal(isValidScore("1"), true);
  assert.equal(isValidScore("10"), true);
  assert.equal(isValidScore(""), false);
  assert.equal(isValidScore("0"), false);
  assert.equal(isValidScore("11"), false);
  assert.equal(isValidScore("7.5"), false);
});

test("15题均为7分时判为S级", () => {
  const evaluation = evaluateConfig(DEFAULT_CONFIG, scores(7));
  assert.equal(evaluation.total, 105);
  assert.equal(evaluation.result.code, "S");
});

test("总分恰好100不能判S，符合A级关键题时判A", () => {
  const values = Array(15).fill(7);
  values[0] = 2;
  const evaluation = evaluateConfig(DEFAULT_CONFIG, scores(values));
  assert.equal(evaluation.total, 100);
  assert.equal(evaluation.result.code, "A");
});

test("总分恰好80不能判A", () => {
  const values = Array(15).fill(5);
  values[0] = 4;
  values[12] = 7;
  values[13] = 7;
  values[14] = 7;
  const evaluation = evaluateConfig(DEFAULT_CONFIG, scores(values));
  assert.equal(evaluation.total, 80);
  assert.equal(evaluation.result.code, "C");
});

test("高总分也不能越过B级红线", () => {
  const values = Array(15).fill(10);
  values[12] = 4;
  values[14] = 4;
  const evaluation = evaluateConfig(DEFAULT_CONFIG, scores(values));
  assert.equal(evaluation.result.code, "B");
});

test("第13题4分、第15题5分不触发红线", () => {
  const values = Array(15).fill(6);
  values[12] = 4;
  values[14] = 5;
  const evaluation = evaluateConfig(DEFAULT_CONFIG, scores(values));
  assert.notEqual(evaluation.result.code, "B");
});

test("删除被规则引用的题目会导致配置校验失败", () => {
  const config = cloneConfig(DEFAULT_CONFIG);
  config.questions = config.questions.filter((question) => question.id !== "q13");
  assert.ok(validateConfig(config).some((error) => error.includes("不存在的题目")));
});

test("配置必须且只能包含一个兜底结果", () => {
  const config = cloneConfig(DEFAULT_CONFIG);
  config.results.forEach((result) => {
    result.fallback = false;
  });
  assert.ok(validateConfig(config).some((error) => error.includes("兜底结果")));
});
