import {api,esc,date,notice,run,identity,pager,resultCard,recordDetail} from './ui.js';
const root=document.getElementById('content');
let user, activeForm=false;
const empty=(title,text)=>`<div class="empty"><strong>${title}</strong>${text}</div>`;
async function assignments(page=0){
  const data=await api(`/api/me/assignments?page=${page}`);
  root.innerHTML=`<section class="hero"><p class="eyebrow">YOUR PERSONAL CHECK-IN</p><h1>留一点时间，了解自己。</h1><p class="muted">${esc(user.username)}，这里是为你安排的测验。选择一套题，从此刻的真实感受开始。</p></section><div class="section-heading"><h2>待你探索的测验</h2><span class="muted">${data.total} 项分配</span></div><div class="grid">${data.items.map(a=>`<article class="card"><span class="tag">版本 ${a.version} · ${a.questionCount} 道题</span><h3>${esc(a.title)}</h3><p class="muted">分配于 ${date(a.assignedAt)}</p><div class="actions"><a class="button" href="#take=${a.id}">开始测验 →</a></div></article>`).join('')}</div>${!data.items.length?empty('还没有分配的测验','管理员分配后，测验会出现在这里。'):''}`;
  if(data.totalPages>1)root.append(pager(data,assignments));
}
async function history(page=0){
  const data=await api(`/api/me/submissions?page=${page}`);
  root.innerHTML=`<div class="section-heading"><div><p class="eyebrow">YOUR REFLECTION JOURNAL</p><h1>我的作答记录</h1></div><span class="tag">${data.total} 次提交</span></div><div class="list">${data.items.map(r=>`<article class="row-card"><div><h3>${esc(r.title)}</h3><p class="muted">版本 ${r.version} · ${date(r.submittedAt)}</p></div><div class="actions"><span class="tag">${esc(r.result.code)} · ${r.total} 分</span><a class="button secondary small" href="#record=${r.id}">查看详情</a></div></article>`).join('')}</div>${!data.items.length?empty('还没有作答记录','完成并提交一套测验后，就可以在这里回顾。'):''}`;
  if(data.totalPages>1)root.append(pager(data,history));
}
async function record(id){const data=await api(`/api/me/submissions/${encodeURIComponent(id)}`);root.innerHTML=`<a class="back" href="#history">← 返回我的记录</a><h1>${esc(data.title)}</h1>${recordDetail(data)}`;}
function profile(){root.innerHTML=`<section class="panel"><p class="eyebrow">ACCOUNT DETAILS</p><h1>账号资料</h1><dl class="detail-info"><dt>账号</dt><dd>${esc(user.username)}</dd><dt>邮箱</dt><dd>${esc(user.email)} <span class="tag">已验证</span></dd><dt>微信号</dt><dd>${esc(user.wechat)}</dd><dt>手机号</dt><dd>${esc(user.phone)}</dd><dt>身份</dt><dd>${user.role==='ADMIN'?'管理员':'普通使用者'}</dd></dl><a href="/auth/?action=forgot">通过邮箱重置密码 →</a></section>`;}
async function take(id){
  const data=await api(`/api/me/assignments/${encodeURIComponent(id)}`);const site=data.site;
  let key=crypto.randomUUID(),lastPayload='',submitted=false;
  root.innerHTML=`<a class="back" href="#assignments">← 返回我的测验</a><section class="hero"><p class="eyebrow">${esc(site.eyebrow)}</p><h1>${esc(site.title)}</h1><p class="muted">${esc(site.description)}</p><span class="tag">版本 ${data.version} · ${data.questions.length} 道题</span><div class="scoreboard"><div><span class="muted">当前总分</span><div><span class="live-score" id="live-total">0</span> <span class="muted">/ ${data.questions.length*10}</span></div></div><div class="progress-info"><span id="progress">已完成 0 / ${data.questions.length}</span><div class="progress-track"><div id="progress-bar"></div></div></div></div></section><div class="section-heading"><div><h2>${esc(site.questionTitle)}</h2><p class="muted">${esc(site.inputInstruction)}</p></div></div><form id="answers" novalidate>${data.questions.map((q,i)=>`<article class="question-card"><span class="question-index">${String(i+1).padStart(2,'0')}</span><label for="q-${esc(q.id)}">${esc(q.text)}</label><input class="score-input" id="q-${esc(q.id)}" name="${esc(q.id)}" type="text" inputmode="numeric" autocomplete="off" maxlength="4" aria-label="第${i+1}题分数"></article>`).join('')}<div class="sticky-actions"><button type="reset" class="secondary">重新测验</button><button type="submit">提交并查看结果</button></div></form><div id="result" tabindex="-1"></div><p class="footnote">${esc(site.disclaimer)}</p>`;
  const form=document.getElementById('answers'),inputs=[...form.querySelectorAll('input')];
  const valid=i=>/^(?:[1-9]|10)$/.test(i.value.trim());
  const refresh=()=>{const filled=inputs.filter(valid);document.getElementById('live-total').textContent=filled.reduce((n,i)=>n+Number(i.value),0);document.getElementById('progress').textContent=`已完成 ${filled.length} / ${inputs.length}`;document.getElementById('progress-bar').style.width=`${filled.length/inputs.length*100}%`;};
  form.oninput=e=>{activeForm=true;e.target.removeAttribute('aria-invalid');e.target.closest('.question-card')?.classList.remove('is-invalid');notice('');refresh();};
  form.onreset=()=>{inputs.forEach(i=>{i.disabled=false;i.removeAttribute('aria-invalid');i.closest('.question-card').classList.remove('is-invalid');});form.querySelector('[type=submit]').disabled=false;submitted=false;key=crypto.randomUUID();lastPayload='';activeForm=false;notice('');document.getElementById('result').innerHTML='';setTimeout(refresh);};
  form.onsubmit=async event=>{
    event.preventDefault();if(submitted)return;
    const bad=inputs.filter(i=>!valid(i));
    if(bad.length){notice('请完成所有题目，并确保每题都是1–10的整数。',true);bad.forEach(i=>{i.setAttribute('aria-invalid','true');i.closest('.question-card').classList.add('is-invalid');});bad[0].focus({preventScroll:true});bad[0].scrollIntoView({block:'center',behavior:'smooth'});return;}
    const answers=Object.fromEntries(inputs.map(i=>[i.name,Number(i.value)])),serialized=JSON.stringify(answers);
    if(lastPayload&&serialized!==lastPayload)key=crypto.randomUUID();lastPayload=serialized;
    form.querySelectorAll('button,input').forEach(e=>e.disabled=true);notice('');
    try{const record=await api('/api/me/submissions',{method:'POST',body:{assignmentId:id,idempotencyKey:key,answers}});submitted=true;activeForm=false;document.getElementById('result').innerHTML=`<div class="notice">已保存本次作答，可在“我的记录”中回顾。</div>${resultCard(record)}<a class="button secondary" href="#record=${record.id}">查看本次答案</a>`;document.getElementById('result').scrollIntoView({block:'start',behavior:'smooth'});}
    catch(e){notice(`${e.message} 答案仍在此页面；网络异常时请先重试提交。`,true);}
    finally{form.querySelector('[type=reset]').disabled=false;if(!submitted)form.querySelectorAll('button,input').forEach(e=>e.disabled=false);}
  };
}
async function route(){
  const hash=location.hash.slice(1)||'assignments';activeForm=false;notice('');
  document.querySelectorAll('#tabs a').forEach(a=>a.classList.toggle('active',a.hash===`#${hash}`));
  if(hash.startsWith('take='))await take(hash.slice(5));else if(hash.startsWith('record='))await record(hash.slice(7));else if(hash==='history')await history();else if(hash==='profile')profile();else await assignments();
  window.scrollTo({top:0,behavior:'instant'});
}
window.addEventListener('beforeunload',e=>{if(activeForm){e.preventDefault();e.returnValue='';}});
window.addEventListener('hashchange',()=>run(route));
run(async()=>{user=await identity();if(user)await route();});
