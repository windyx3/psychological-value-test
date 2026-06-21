import { json, readConfigState } from "../_lib/storage.js";

export async function onRequestGet({ env }) {
  try {
    const state = await readConfigState(env);
    return json(state.published);
  } catch (error) {
    console.error(error);
    return json({ error: error.message }, { status: 500 });
  }
}
