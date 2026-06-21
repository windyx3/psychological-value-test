import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("公开页面只保留一次统一分数提示且不包含评级规则", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.equal((html.match(/每题请输入1–10的整数，最高10分。/g) || []).length, 1);
  assert.equal(html.includes("评级规则"), false);
  assert.equal(html.includes("规则分析"), false);
  assert.equal(html.includes('type="range"'), false);
});

test("公开题目输入没有默认value", async () => {
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.equal(script.includes('class="score-input"'), true);
  assert.equal(script.includes('value="5"'), false);
});
