import assert from "node:assert/strict";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:8788";

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json();
  return { response, payload };
}

const publicBefore = await request("/api/config");
assert.equal(publicBefore.response.status, 200);
assert.equal(publicBefore.payload.questions.length, 15);

const admin = await request("/api/admin/config");
assert.equal(admin.response.status, 200);
const originalTitle = admin.payload.config.site.title;
admin.payload.config.site.title = `${originalTitle}（草稿测试）`;

const saved = await request("/api/admin/config", {
  method: "PUT",
  body: JSON.stringify({
    config: admin.payload.config,
    revision: admin.payload.revision
  })
});
assert.equal(saved.response.status, 200);
assert.equal(saved.payload.revision, admin.payload.revision + 1);

const publicAfterSave = await request("/api/config");
assert.equal(publicAfterSave.payload.site.title, originalTitle);

const conflict = await request("/api/admin/config", {
  method: "PUT",
  body: JSON.stringify({
    config: admin.payload.config,
    revision: admin.payload.revision
  })
});
assert.equal(conflict.response.status, 409);

const published = await request("/api/admin/publish", {
  method: "POST",
  body: JSON.stringify({ revision: saved.payload.revision })
});
assert.equal(published.response.status, 200);

const publicAfterPublish = await request("/api/config");
assert.equal(publicAfterPublish.payload.site.title, `${originalTitle}（草稿测试）`);

console.log(JSON.stringify({
  questions: publicBefore.payload.questions.length,
  draftRevision: saved.payload.revision,
  publicUnchangedBeforePublish: true,
  conflictStatus: conflict.response.status,
  publishedRevision: published.payload.publishedRevision,
  publicChangedAfterPublish: true
}));
