import {api,esc,notice,run,identity,resultCard} from '/assets/ui.js';
run(async()=>{
  if(!await identity(true))return;
  const params=new URLSearchParams(location.search),id=params.get('id');
  document.getElementById('back').href='/admin/editor?id='+encodeURIComponent(id);
  const state=await api('/api/admin/assessments/'+encodeURIComponent(id)),config=state.config;
  if(params.get('revision')&&Number(params.get('revision'))!==state.revision)throw new Error('草稿已更新，请从编辑页面重新打开预览。');
  const root=document.getElementById('preview');
  root.innerHTML=`<section class="hero"><p class="eyebrow">${esc(config.site.eyebrow)}</p><h1>${esc(config.site.title)}</h1><p class="muted">${esc(config.site.description)}</p></section><h2>${esc(config.site.questionTitle)}</h2><p class="muted">${esc(config.site.inputInstruction)}</p><form id="preview-form" novalidate>${config.questions.map((q,i)=>`<div class="question-card"><span class="question-index">${i+1}</span><label for="p-${esc(q.id)}">${esc(q.text)}</label><input class="score-input" id="p-${esc(q.id)}" name="${esc(q.id)}" inputmode="numeric" maxlength="4" aria-label="第${i+1}题分数"></div>`).join('')}<div class="sticky-actions"><button type="reset" class="secondary">重新测验</button><button type="submit">预览结果</button></div></form><div id="result"></div><p class="footnote">${esc(config.site.disclaimer)}</p>`;
  const form=document.getElementById('preview-form'),inputs=[...form.querySelectorAll('input')];
  form.onreset=()=>{notice('');inputs.forEach(i=>{i.removeAttribute('aria-invalid');i.closest('.question-card').classList.remove('is-invalid');});document.getElementById('result').innerHTML='';};
  form.oninput=e=>{e.target.removeAttribute('aria-invalid');e.target.closest('.question-card').classList.remove('is-invalid');notice('');};
  form.onsubmit=e=>{e.preventDefault();const bad=inputs.filter(i=>!/^(?:[1-9]|10)$/.test(i.value.trim()));if(bad.length){notice('请完成所有题目，并确保每题都是1–10的整数。',true);bad.forEach(i=>{i.setAttribute('aria-invalid','true');i.closest('.question-card').classList.add('is-invalid');});bad[0].focus();return;}const button=form.querySelector('[type=submit]');button.disabled=true;run(async()=>{try{const result=await api('/api/admin/preview',{method:'POST',body:{config,answers:Object.fromEntries(inputs.map(i=>[i.name,Number(i.value)]))}});document.getElementById('result').innerHTML=resultCard({...result,maximum:inputs.length*10});document.getElementById('result').scrollIntoView({behavior:'smooth'});}finally{button.disabled=false;}});};
});
