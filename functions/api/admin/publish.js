import { json, publishDraft, readJson } from "../../_lib/storage.js";

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body || !Number.isInteger(Number(body.revision))) {
    return json({ error: "请求必须包含revision。" }, { status: 400 });
  }

  try {
    const result = await publishDraft(env, body.revision);
    if (result.conflict) {
      return json({ error: "草稿版本已经变化，请重新加载。" }, { status: 409 });
    }
    return json({ publishedRevision: result.publishedRevision });
  } catch (error) {
    console.error(error);
    return json({ error: error.message }, { status: 500 });
  }
}
