import { api, esc, notice, run } from './ui.js';
const root = document.getElementById('auth-content');
const action = new URLSearchParams(location.search).get('action');
const token = new URLSearchParams(location.hash.slice(1)).get('token');
if (token) history.replaceState(null, '', location.pathname + location.search);
const field = (label, name, type = 'text', attrs = '') => `<label>${label}<input name="${name}" type="${type}" required ${attrs}></label>`;
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
  root.querySelector('form').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('[type=submit]'); button.disabled = true;
    try {
      const body = Object.fromEntries(new FormData(form));
      if (['verify','reset'].includes(mode)) { if (!token) throw new Error('验证链接缺失，请重新发送邮件。'); body.token = token; }
      const path = ({ forgot: 'forgot-password', reset: 'reset-password' })[mode] || mode;
      const result = await api(`/api/auth/${path}`, { method: 'POST', body });
      if (mode === 'login') { location.href = result.user.role === 'ADMIN' ? '/admin/' : '/'; return; }
      notice(result.message || (mode === 'verify' ? '邮箱验证成功，现在可以登录。' : '密码已更新，请使用新密码登录。'));
      mode = 'login'; render();
    } catch (e) { notice(e.message, true); button.disabled = false; }
  };
}
render();
run(async () => { const state = await api('/api/auth/me'); document.getElementById('mail-preview').hidden = !state.mailPreview; });
