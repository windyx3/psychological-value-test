import { DEFAULT_CONFIG, cloneConfig, validateConfig } from "../../public/config-engine.js";

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS assessment_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    draft_json TEXT NOT NULL,
    published_json TEXT NOT NULL,
    draft_revision INTEGER NOT NULL DEFAULT 1,
    published_revision INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  )
`;

export function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export async function ensureConfig(env) {
  if (!env.DB) throw new Error("D1数据库绑定DB尚未配置。");
  await env.DB.prepare(CREATE_TABLE).run();
  const initial = JSON.stringify(DEFAULT_CONFIG);
  await env.DB.prepare(`
    INSERT OR IGNORE INTO assessment_config
      (id, draft_json, published_json, draft_revision, published_revision, updated_at)
    VALUES (1, ?, ?, 1, 1, ?)
  `).bind(initial, initial, new Date().toISOString()).run();
}

export async function readConfigState(env) {
  await ensureConfig(env);
  const row = await env.DB.prepare(`
    SELECT draft_json, published_json, draft_revision, published_revision, updated_at
    FROM assessment_config WHERE id = 1
  `).first();
  if (!row) throw new Error("配置记录不存在。");
  return {
    draft: JSON.parse(row.draft_json),
    published: JSON.parse(row.published_json),
    draftRevision: Number(row.draft_revision),
    publishedRevision: Number(row.published_revision),
    updatedAt: row.updated_at
  };
}

export async function saveDraft(env, config, expectedRevision) {
  const normalized = cloneConfig(config);
  const errors = validateConfig(normalized);
  if (errors.length) {
    return { ok: false, validationErrors: errors };
  }

  await ensureConfig(env);
  const nextRevision = Number(expectedRevision) + 1;
  const result = await env.DB.prepare(`
    UPDATE assessment_config
    SET draft_json = ?, draft_revision = ?, updated_at = ?
    WHERE id = 1 AND draft_revision = ?
  `).bind(
    JSON.stringify(normalized),
    nextRevision,
    new Date().toISOString(),
    Number(expectedRevision)
  ).run();

  if (!result.meta?.changes) return { ok: false, conflict: true };
  return { ok: true, config: normalized, revision: nextRevision };
}

export async function publishDraft(env, expectedRevision) {
  await ensureConfig(env);
  const result = await env.DB.prepare(`
    UPDATE assessment_config
    SET published_json = draft_json,
        published_revision = draft_revision,
        updated_at = ?
    WHERE id = 1 AND draft_revision = ?
  `).bind(new Date().toISOString(), Number(expectedRevision)).run();

  if (!result.meta?.changes) return { ok: false, conflict: true };
  return { ok: true, publishedRevision: Number(expectedRevision) };
}

export async function discardDraft(env, expectedRevision) {
  await ensureConfig(env);
  const nextRevision = Number(expectedRevision) + 1;
  const result = await env.DB.prepare(`
    UPDATE assessment_config
    SET draft_json = published_json,
        draft_revision = ?,
        updated_at = ?
    WHERE id = 1 AND draft_revision = ?
  `).bind(nextRevision, new Date().toISOString(), Number(expectedRevision)).run();

  if (!result.meta?.changes) return { ok: false, conflict: true };
  return { ok: true, revision: nextRevision };
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
