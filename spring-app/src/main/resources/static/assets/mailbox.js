import {api,esc,date,run} from './ui.js';
async function load(){const messages=await api('/dev/mail');document.getElementById('messages').innerHTML=messages.length?messages.map(m=>`<article class="panel"><h3>${esc(m.subject)}</h3><p>收件人：${esc(m.to)}</p><p class="muted">${date(m.sentAt)}</p><a class="button" href="${esc(m.link)}" target="_blank" rel="noopener">打开验证链接 ↗</a></article>`).join(''):'<div class="empty">暂无邮件。先注册账号或重新发送验证邮件，然后刷新。</div>';}
document.getElementById('reload').onclick=()=>run(load);run(load);
