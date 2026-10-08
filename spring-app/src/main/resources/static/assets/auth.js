import { api, esc, notice, run } from './ui.js';
const root = document.getElementById('auth-content');
const action = new URLSearchParams(location.search).get('action');
const token = new URLSearchParams(location.hash.slice(1)).get('token');
if (token) history.replaceState(null, '', location.pathname + location.search);
const field = (label, name, type = 'text', attrs = '') => `<label>${label}<input name="${name}" type="${type}" required ${attrs}><span id="error-${name}" class="field-error" hidden></span></label>`;
const registrationRules = {
  username: value => /^[A-Za-z0-9_-]{3,64}$/.test(value) ? '' : '账号须为3–64位英文字母、数字、下划线或短横线，不含空格。',
  wechat: value => value.trim() && value.length <= 100 ? '' : '请输入微信号，不能只包含空格，最多100个字符。',
  phone: value => value.trim() && /^[+0-9() -]{6,32}$/.test(value) ? '' : '手机号须为6–32个字符，仅含数字、+、括号、空格或短横线，例如 +1 604 555 0123。',
  email: (value, form) => value && value.length <= 254 && form.elements.email.validity.valid ? '' : '请输入有效邮箱，例如 name@example.com，最多254个字符。',
  password: value => value.trim() && value.length >= 12 && new TextEncoder().encode(value).length <= 72 ? '' : '密码至少12个字符，UTF-8长度不超过72字节（中文等字符通常占多个字节）。',
  confirmPassword: (value, form) => value && value === form.elements.password.value ? '' : '请再次输入相同的密码，两次输入必须一致。'
};
function fieldError(form, name, message) {
  const input = form.elements.namedItem(name);
  const hint = document.getElementById(`error-${name}`);
  if (!input || !hint) return;
  hint.textContent = message; hint.hidden = !message;
  if (message) {
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', hint.id);
  } else {
    input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby');
  }
}
function focusInvalid(form) { form.querySelector('[aria-invalid="true"]')?.focus(); }
let mode = action || 'login';
function render() {
  const titles = { login: '欢迎回来', register: '创建你的账号', resend: '重新发送验证邮件', forgot: '找回密码', verify: '验证邮箱', reset: '设置新密码' };
  let fields = '';
  if (mode === 'login') fields = field('账号或邮箱', 'login', 'text', 'autocomplete="username" maxlength="254"') + field('密码', 'password', 'password', 'autocomplete="current-password" maxlength="72"');
  else if (mode === 'register') fields = `<div class="fields">${field('账号', 'username', 'text', 'pattern="[A-Za-z0-9_-]{3,64}" title="3–64位字母、数字、下划线或短横线" autocomplete="username"')}${field('微信号', 'wechat', 'text', 'maxlength="100"')}${field('手机号', 'phone', 'tel', 'maxlength="32" autocomplete="tel"')}${field('邮箱', 'email', 'email', 'maxlength="254" autocomplete="email"')}${field('密码（至少12个字符）', 'password', 'password', 'minlength="12" maxlength="72" autocomplete="new-password"')}${field('确认密码', 'confirmPassword', 'password', 'minlength="12" maxlength="72" autocomplete="new-password"')}</div>`;
  else if (['resend','forgot'].includes(mode)) fields = field('注册邮箱', 'email', 'email', 'autocomplete="email" maxlength="254"');
  else if (mode === 'reset') fields = field('新密码（至少12个字符）', 'password', 'password', 'minlength="12" maxlength="72" autocomplete="new-password"') + field('确认新密码', 'confirmPassword', 'password', 'minlength="12" maxlength="72" autocomplete="new-password"');
  else fields = '<p class="muted">点击下方按钮确认邮箱，完成后即可登录。</p>';
  root.innerHTML = `<h2>${esc(titles[mode] || titles.login)}</h2><form class="auth-form">${fields}<button type="submit">${({ login: '登录', register: '注册并验证邮箱', verify: '确认验证邮箱', reset: '保存新密码' })[mode] || '发送邮件'}</button></form><div class="auth-links">${mode !== 'login' ? '<button class="text-button" data-mode="login">返回登录</button>' : '<button class="text-button" data-mode="register">注册账号</button><button class="text-button" data-mode="forgot">忘记密码</button><button class="text-button" data-mode="resend">重发验证邮件</button>'}</div>`;
  root.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { mode = b.dataset.mode; notice(''); render(); });
  const form = root.querySelector('form');
  let attempted = false;
  // Registration uses accessible inline errors instead of the browser's first-error-only popup.
  form.noValidate = mode === 'register';
  form.addEventListener('input', event => {
    if (!attempted) return;
    const name = event.target.name;
    if (mode === 'register' && registrationRules[name]) {
      fieldError(form, name, registrationRules[name](event.target.value, form));
      if (name === 'password') fieldError(form, 'confirmPassword', registrationRules.confirmPassword(form.elements.confirmPassword.value, form));
    } else fieldError(form, name, '');
    if (!form.querySelector('[aria-invalid="true"]')) notice('');
  });
  form.onsubmit = async event => {
    event.preventDefault(); attempted = true;
    if (mode === 'register') {
      for (const [name, validate] of Object.entries(registrationRules)) fieldError(form, name, validate(form.elements[name].value, form));
      if (form.querySelector('[aria-invalid="true"]')) {
        notice('请检查标红的输入项，并按下方提示修改。', true); focusInvalid(form); return;
      }
    }
    const button = form.querySelector('[type=submit]'); button.disabled = true;
    try {
      const body = Object.fromEntries(new FormData(form));
      if (['verify','reset'].includes(mode)) { if (!token) throw new Error('验证链接缺失，请重新发送邮件。'); body.token = token; }
      const path = ({ forgot: 'forgot-password', reset: 'reset-password' })[mode] || mode;
      const result = await api(`/api/auth/${path}`, { method: 'POST', body });
      if (mode === 'login') { location.href = result.user.role === 'ADMIN' ? '/admin/' : '/'; return; }
      notice(result.message || (mode === 'verify' ? '邮箱验证成功，现在可以登录。' : '密码已更新，请使用新密码登录。'));
      mode = 'login'; render();
    } catch (e) {
      for (const [name, message] of Object.entries(e.fieldErrors || {})) {
        if (typeof message === 'string') fieldError(form, name, message);
      }
      notice(e.message, true); button.disabled = false; focusInvalid(form);
    }
  };
}
render();
run(async () => { const state = await api('/api/auth/me'); document.getElementById('mail-preview').hidden = !state.mailPreview; });
