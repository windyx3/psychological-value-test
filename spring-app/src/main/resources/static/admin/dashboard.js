import {api,esc,date,notice,run,identity,pager,allPages,recordDetail} from '/assets/ui.js';
const root=document.getElementById('content');let user,search='';
const empty=text=>`<div class="empty">${text}</div>`;
function createSetForm(origin,source){
  document.getElementById('set-create-panel')?.remove();notice('');
  const panel=document.createElement('section');panel.id='set-create-panel';panel.className='panel';panel.setAttribute('aria-labelledby','set-create-title');
  panel.innerHTML=`<h2 id="set-create-title">${source?'复制套题':'新建套题'}</h2><form class="set-create-form" novalidate><label>套题名称<input name="title" required maxlength="200" autocomplete="off"><span id="set-title-error" class="field-error" hidden></span></label><div class="actions"><button type="submit">${source?'创建副本':'创建套题'}</button><button type="button" class="secondary" data-cancel>取消</button></div></form>`;
  root.querySelector('.section-heading').after(panel);
  const form=panel.querySelector('form'),input=form.elements.title,hint=panel.querySelector('#set-title-error'),submit=form.querySelector('[type=submit]'),cancel=form.querySelector('[data-cancel]');
  input.value=source?(source.title+' · 副本').slice(0,200):'';
  const error=message=>{hint.textContent=message;hint.hidden=!message;if(message){input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby',hint.id);}else{input.removeAttribute('aria-invalid');input.removeAttribute('aria-describedby');}};
  input.oninput=()=>error('');
  cancel.onclick=()=>{panel.remove();notice('');origin.focus();};
  form.onsubmit=async event=>{
    event.preventDefault();if(submit.disabled)return;
    const title=input.value.trim();
    if(!title||title.length>200){error('请输入1–200字的套题名称，不能只包含空格。');input.focus();return;}
    error('');notice('');submit.disabled=true;cancel.disabled=true;
    const triggers=root.querySelectorAll('#new-set,[data-copy]');triggers.forEach(b=>b.disabled=true);
    try{const created=await api('/api/admin/assessments',{method:'POST',body:{title,...(source?{copyFrom:source.id}:{})}});location.href=`/admin/editor?id=${created.id}`;}
    catch(e){notice(e.message,true);input.focus();}
    finally{submit.disabled=false;cancel.disabled=false;triggers.forEach(b=>b.disabled=false);}
  };
  input.focus();
}
async function sets(page=0){
  const data=await api(`/api/admin/assessments?page=${page}`);
  root.innerHTML=`<section class="hero"><p class="eyebrow">ASSESSMENT STUDIO</p><h1>每一套测验，独立管理。</h1><p class="muted">编辑草稿、发布版本，再分配给指定用户。历史作答始终保留原来的题目与结果。</p></section><div class="section-heading"><h2>套题库 <span class="muted">${data.total}</span></h2><button id="new-set">＋ 新建套题</button></div><div class="grid">${data.items.map(a=>`<article class="card"><span class="tag">${a.archived?'已归档':a.publishedVersion?'已发布 · v'+a.publishedVersion:'尚未发布'}</span><h3>${esc(a.title)}</h3><p class="muted">更新于 ${date(a.updatedAt)}</p><div class="actions"><a class="button small" href="/admin/editor?id=${a.id}">编辑</a><button class="secondary small" data-copy="${a.id}">复制</button><button class="secondary small" data-assign="${a.id}" ${a.archived||!a.publishedVersion?'disabled':''}>分配用户</button><button class="secondary small" data-archive="${a.id}">${a.archived?'恢复':'归档'}</button></div></article>`).join('')}</div>${!data.items.length?empty('点击“新建套题”开始。'):''}`;
  document.getElementById('new-set').onclick=e=>createSetForm(e.currentTarget);
  root.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>createSetForm(b,data.items.find(x=>x.id===b.dataset.copy)));
  root.querySelectorAll('[data-archive]').forEach(b=>b.onclick=()=>run(async()=>{const a=data.items.find(x=>x.id===b.dataset.archive);if(!a.archived&&!confirm('归档后将停止分配和提交，历史记录保留。是否继续？'))return;await api(`/api/admin/assessments/${a.id}`,{method:'PATCH',body:{revision:a.revision,archived:!a.archived}});await sets(page);}));
  root.querySelectorAll('[data-assign]').forEach(b=>b.onclick=()=>{location.hash='assign='+b.dataset.assign;});
  if(data.totalPages>1)root.append(pager(data,sets));
}
async function users(page=0){
  const data=await api(`/api/admin/users?q=${encodeURIComponent(search)}&page=${page}`);
  root.innerHTML=`<div class="section-heading"><div><p class="eyebrow">PEOPLE & ACCESS</p><h1>用户管理</h1></div><span class="tag">${data.total} 位用户</span></div><form id="search" class="searchbar panel"><label>搜索账号、邮箱、电话或微信<input name="q" value="${esc(search)}" placeholder="输入关键词"></label><button>搜索</button></form><div class="list">${data.items.map(u=>`<article class="row-card"><div><h3>${esc(u.username)} <span class="tag">${u.role==='ADMIN'?'管理员':'普通用户'}</span></h3><p class="muted">${esc(u.email)} · ${!u.enabled?'已停用':u.verified?'已验证':'待验证'}</p></div><a class="button secondary small" href="#user=${u.id}">管理与查看记录</a></article>`).join('')}</div>${!data.items.length?empty('没有符合条件的用户。'):''}`;
  document.getElementById('search').onsubmit=e=>{e.preventDefault();search=new FormData(e.currentTarget).get('q');run(()=>users());};if(data.totalPages>1)root.append(pager(data,users));
}
async function person(id){
  const u=await api(`/api/admin/users/${id}`);
  root.innerHTML=`<a class="back" href="#users">← 返回用户列表</a><section class="panel"><div class="section-heading"><h1>${esc(u.username)}</h1><span class="tag">${u.role==='ADMIN'?'管理员':'普通用户'}</span></div><dl class="detail-info"><dt>邮箱</dt><dd>${esc(u.email)} · ${u.verified?'已验证':'待验证'}</dd><dt>微信号</dt><dd>${esc(u.wechat)}</dd><dt>手机号</dt><dd>${esc(u.phone)}</dd><dt>注册时间</dt><dd>${date(u.createdAt)}</dd></dl><div class="actions"><button id="assign-user" ${!u.verified||!u.enabled?'disabled':''}>分配套题</button><button id="toggle-role" class="secondary" ${!u.verified?'disabled':''}>${u.role==='ADMIN'?'设为普通用户':'设为管理员'}</button><button id="toggle-enabled" class="${u.enabled?'danger':'secondary'}">${u.enabled?'停用账号':'启用账号'}</button></div></section><section class="panel"><h2>测验分配</h2><div id="user-assignments"></div></section><section class="panel"><h2>该用户的答题记录</h2><div id="user-records"></div></section>`;
  const update=async changes=>{if(!confirm('确认更新该用户的账号状态？已有登录会失效。'))return;await api(`/api/admin/users/${id}`,{method:'PATCH',body:{role:u.role,enabled:u.enabled,...changes}});if(id===user.id){location.href='/auth/';return;}await person(id);};
  document.getElementById('toggle-role').onclick=()=>run(()=>update({role:u.role==='ADMIN'?'USER':'ADMIN'}));document.getElementById('toggle-enabled').onclick=()=>run(()=>update({enabled:!u.enabled}));
  document.getElementById('assign-user').onclick=()=>run(()=>assignmentForm(null,id));
  async function loadAssignments(page=0){const data=await api(`/api/admin/assignments?userId=${id}&page=${page}`),el=document.getElementById('user-assignments');el.innerHTML=data.items.map(a=>`<div class="row-card"><div><h3>${esc(a.title)}</h3><p class="muted">v${a.version} · ${a.active?'有效':'已撤回或归档'}</p></div><button class="secondary small" data-revoke="${a.id}" ${!a.active?'disabled':''}>撤销分配</button></div>`).join('')||empty('尚未分配测验。');el.querySelectorAll('[data-revoke]').forEach(b=>b.onclick=()=>run(async()=>{if(!confirm('撤销后该用户不能继续提交，历史记录保留。'))return;await api(`/api/admin/assignments/${b.dataset.revoke}`,{method:'DELETE'});await loadAssignments(page);}));if(data.totalPages>1)el.append(pager(data,loadAssignments));}
  await loadAssignments();await recordsInto(document.getElementById('user-records'),{userId:id});
}
async function assignmentForm(setId,userId){
  const sets=await allPages('/api/admin/assessments'),people=userId?[await api(`/api/admin/users/${userId}`)]:await allPages('/api/admin/users');const available=sets.filter(a=>!a.archived&&a.publishedVersion);
  root.innerHTML=`<a class="back" href="${userId?'#user='+userId:'#sets'}">← 返回</a><section class="panel"><p class="eyebrow">ASSIGN AN ASSESSMENT</p><h1>${userId?'分配套题':'分配给指定用户'}</h1><p class="muted">分配固定的发布版本。今后改题不会改变这次分配。</p><form id="assignment-form"><div class="fields"><label>套题<select id="set-choice">${available.map(a=>`<option value="${a.id}" ${a.id===setId?'selected':''}>${esc(a.title)}</option>`).join('')}</select></label><label>发布版本<select id="version-choice"></select></label></div><h3 style="margin-top:24px">选择用户</h3><input id="filter-users" placeholder="筛选账号或邮箱" aria-label="筛选用户"><div class="checkbox-list">${people.filter(u=>u.enabled&&u.verified).map(u=>`<label data-search="${esc((u.username+' '+u.email).toLowerCase())}"><input type="checkbox" name="userId" value="${u.id}" ${userId?'checked':''}>${esc(u.username)} · ${esc(u.email)}</label>`).join('')}</div><button type="submit" ${!available.length?'disabled':''}>确认分配</button></form>${!available.length?empty('请先创建并发布一套测验。'):''}</section>`;
  const setChoice=document.getElementById('set-choice'),versionChoice=document.getElementById('version-choice');
  async function versions(){if(!setChoice.value)return;const data=await api(`/api/admin/assessments/${setChoice.value}`);versionChoice.innerHTML=data.versions.map(v=>`<option value="${v.id}">版本 ${v.number} · ${date(v.publishedAt)}</option>`).join('');}
  setChoice.onchange=()=>run(versions);await versions();document.getElementById('filter-users').oninput=e=>root.querySelectorAll('[data-search]').forEach(l=>l.hidden=!l.dataset.search.includes(e.target.value.toLowerCase()));
  document.getElementById('assignment-form').onsubmit=e=>{e.preventDefault();const userIds=new FormData(e.currentTarget).getAll('userId'),button=e.currentTarget.querySelector('[type=submit]');if(!userIds.length){notice('请选择至少一位用户。',true);return;}button.disabled=true;run(async()=>{try{await api('/api/admin/assignments',{method:'POST',body:{versionId:versionChoice.value,userIds}});notice(`已为 ${userIds.length} 位用户分配测验。`);}finally{button.disabled=false;}});};
}
async function recordsInto(el,filters={},page=0){
  const query=new URLSearchParams({...filters,page}),data=await api('/api/admin/submissions?'+query);
  el.innerHTML=`<div class="list">${data.items.map(r=>`<article class="row-card"><div><h3>${esc(r.title)}</h3><p class="muted">${esc(r.username)} · v${r.version} · ${date(r.submittedAt)}</p></div><div class="actions"><span class="tag">${esc(r.result.code)} · ${r.total}分</span><a class="button secondary small" href="#record=${r.id}">查看答案</a></div></article>`).join('')}</div>${!data.items.length?empty('暂无提交记录。'):''}`;if(data.totalPages>1)el.append(pager(data,p=>recordsInto(el,filters,p)));
}
async function records(){
  const [sets,people]=await Promise.all([allPages('/api/admin/assessments'),allPages('/api/admin/users')]);
  root.innerHTML=`<p class="eyebrow">SUBMISSION HISTORY</p><h1>答题记录</h1><form id="filters" class="searchbar panel"><label>用户<select name="userId"><option value="">全部用户</option>${people.map(u=>`<option value="${u.id}">${esc(u.username)}</option>`).join('')}</select></label><label>套题<select name="assessmentId"><option value="">全部套题</option>${sets.map(s=>`<option value="${s.id}">${esc(s.title)}</option>`).join('')}</select></label><label>开始日期（UTC）<input type="date" name="from"></label><label>结束日期（UTC）<input type="date" name="to"></label><button>筛选</button></form><div id="records"></div>`;
  document.getElementById('filters').onsubmit=e=>{e.preventDefault();const filters=Object.fromEntries([...new FormData(e.currentTarget)].filter(([,v])=>v));run(()=>recordsInto(document.getElementById('records'),filters));};await recordsInto(document.getElementById('records'));
}
async function route(){notice('');const hash=location.hash.slice(1)||'sets';document.querySelectorAll('#tabs a').forEach(a=>a.classList.toggle('active',a.hash==='#'+hash));if(hash==='users')await users();else if(hash.startsWith('user='))await person(hash.slice(5));else if(hash.startsWith('assign='))await assignmentForm(hash.slice(7),null);else if(hash==='records')await records();else if(hash.startsWith('record=')){const record=await api('/api/admin/submissions/'+encodeURIComponent(hash.slice(7)));root.innerHTML=`<a class="back" href="#user=${record.userId}">← 返回该用户</a><h1>${esc(record.title)}</h1>${recordDetail(record)}`;}else await sets();window.scrollTo({top:0,behavior:'instant'});}
window.addEventListener('hashchange',()=>run(route));run(async()=>{user=await identity(true);if(user)await route();});
