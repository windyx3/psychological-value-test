let csrf;
export async function api(path, options = {}) {
  const method = options.method || 'GET';
  const headers = { ...(options.headers || {}) };
  if (!['GET', 'HEAD'].includes(method)) {
    csrf ||= await fetch('/api/auth/csrf', { cache: 'no-store' }).then(r => r.json());
    headers[csrf.headerName] = csrf.token;
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(path, { ...options, method, headers, cache: 'no-store', body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 403) csrf = null;
    if (response.status === 401 && !path.startsWith('/api/auth/')) location.href = '/auth/';
    throw Object.assign(new Error(data.error || '请求失败，请稍后重试。'), { status: response.status });
  }
  if (path === '/api/auth/login' || path === '/api/auth/logout') csrf = null;
  return data;
}
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const date = value => new Date(value).toLocaleString('zh-CN', { hour12: false });
export function notice(message, error = false) {
  const el = document.getElementById('notice');
  el.hidden = !message; el.textContent = message; el.className = `notice ${error ? 'error' : ''}`;
  if (message) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
export async function run(action) {
  try { await action(); } catch (e) { notice(e.message, true); }
}
export async function identity(admin = false) {
  const { user } = await api('/api/auth/me');
  if (!user) { location.replace('/auth/'); return null; }
  if (admin && user.role !== 'ADMIN') { location.replace('/'); return null; }
  const badge = document.getElementById('identity');
  if (badge) badge.textContent = `${user.username} · ${user.role === 'ADMIN' ? '管理员' : '使用者'}`;
  document.querySelectorAll('[data-admin-only]').forEach(e => e.hidden = user.role !== 'ADMIN');
  document.getElementById('logout')?.addEventListener('click', () => run(async () => { await api('/api/auth/logout', { method: 'POST' }); location.href = '/auth/'; }));
  return user;
}
export function pager(payload, change) {
  const el = document.createElement('div'); el.className = 'pager';
  el.innerHTML = `<button class="secondary" ${payload.page === 0 ? 'disabled' : ''}>上一页</button><span>第 ${payload.page + 1} / ${Math.max(1, payload.totalPages)} 页 · ${payload.total} 条</span><button class="secondary" ${payload.page + 1 >= payload.totalPages ? 'disabled' : ''}>下一页</button>`;
  el.firstElementChild.onclick = () => run(() => change(payload.page - 1));
  el.lastElementChild.onclick = () => run(() => change(payload.page + 1)); return el;
}
export async function allPages(path) {
  const items = []; let page = 0, payload;
  do { payload = await api(`${path}${path.includes('?') ? '&' : '?'}page=${page++}`); items.push(...payload.items); } while (page < payload.totalPages);
  return items;
}
export function resultCard(record) {
  const r = record.result;
  return `<section class="result-card" style="background:linear-gradient(135deg,${esc(r.colorStart)},${esc(r.colorEnd)})"><div class="result-topline"><div><p class="eyebrow">YOUR CURRENT PATTERN</p><h2>${esc(r.code)}级 · ${esc(r.name)}</h2></div><span class="seal">${esc(r.code)}</span></div><p>${esc(r.description)}</p><div class="score-pill">你的总分 <strong>${record.total}</strong> / ${record.maximum}</div><p class="advice">${esc(r.advice)}</p></section>`;
}
export function recordDetail(record) {
  return `<p class="muted">${esc(record.username)} · 版本 ${record.version} · ${date(record.submittedAt)}</p>${resultCard(record)}<section class="panel"><h2>本次作答</h2><p class="muted">以下为提交当时的题目及答案。</p><ol class="answer-list">${record.questions.map(q => `<li><span>${esc(q.text)}</span><strong>${record.answers[q.id]}</strong></li>`).join('')}</ol></section><p class="footnote">${esc(record.disclaimer)}</p>`;
}
