import {
  discardDraft,
  json,
  readConfigState,
  readJson
} from "../../_lib/storage.js";

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body || !Number.isInteger(Number(body.revision))) {
    return json({ error: "请求必须包含revision。" }, { status: 400 });
  }

  try {
    const result = await discardDraft(env, body.revision);
    if (result.conflict) {
      return json({ error: "草稿版本已经变化，请重新加载。" }, { status: 409 });
    }
    const state = await readConfigState(env);
    return json({
      config: state.draft,
      revision: result.revision,
      publishedRevision: state.publishedRevision
    });
  } catch (error) {
    console.error(error);
    return json({ error: error.message }, { status: 500 });
  }
}
