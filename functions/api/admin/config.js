import {
  json,
  readConfigState,
  readJson,
  saveDraft
} from "../../_lib/storage.js";

export async function onRequestGet({ env }) {
  try {
    const state = await readConfigState(env);
    return json({
      config: state.draft,
      revision: state.draftRevision,
      publishedRevision: state.publishedRevision,
      updatedAt: state.updatedAt
    });
  } catch (error) {
    console.error(error);
    return json({ error: error.message }, { status: 500 });
  }
}

export async function onRequestPut({ request, env }) {
  const body = await readJson(request);
  if (!body || !Number.isInteger(Number(body.revision)) || !body.config) {
    return json({ error: "请求必须包含config和revision。" }, { status: 400 });
  }

  try {
    const result = await saveDraft(env, body.config, body.revision);
    if (result.validationErrors) {
      return json(
        { error: "配置校验失败。", details: result.validationErrors },
        { status: 400 }
      );
    }
    if (result.conflict) {
      return json({ error: "草稿已被其他管理员修改。" }, { status: 409 });
    }
    return json({ config: result.config, revision: result.revision });
  } catch (error) {
    console.error(error);
    return json({ error: error.message }, { status: 500 });
  }
}
