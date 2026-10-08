// Run only against BrowserFixture's isolated in-memory server on port 8081.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const base = 'http://127.0.0.1:8081';
const password = 'Synthetic-browser-password-2026';
async function main() {
  await fs.mkdir('.qa', { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const userContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const admin = await adminContext.newPage(), user = await userContext.newPage();
  // Codex's embedded browser rejects native prompt(); exercise the same constraint.
  await adminContext.addInitScript(() => { window.prompt = () => { throw new Error('prompt() is not supported.'); }; });
  for (const p of [admin, user]) p.on('pageerror', e => errors.push(e.message));
  const login = async (page, name) => {
    await page.goto(base + '/auth/');
    await page.locator('[name=login]').fill(name);
    await page.locator('[name=password]').fill(password);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.waitForURL(url => !url.pathname.startsWith('/auth'));
  };
  try {
    // Real UI registration, local mail preview, one-time activation, and login.
    const name = 'browser_user_' + Date.now();
    await user.goto(base + '/auth/');
    await user.getByRole('button', { name: '注册账号', exact: true }).click();
    await user.getByRole('button', { name: '注册并验证邮箱' }).click();
    assert.equal(await user.locator('input[aria-invalid=true]').count(),6);
    assert.equal(await user.evaluate(()=>document.activeElement.name),'username');
    assert.equal(await user.locator('#error-phone').isVisible(),true);
    for (const [key, value] of Object.entries({username:name,email:name+'@example.test',wechat:'qa-contact',phone:'+16045550123',password,confirmPassword:password})) await user.locator(`[name=${key}]`).fill(value);
    assert.equal(await user.locator('input[aria-invalid=true]').count(),0);
    await user.locator('[name=phone]').fill('123');
    await user.getByRole('button', { name: '注册并验证邮箱' }).click();
    assert.equal(await user.locator('input[aria-invalid=true]').count(),1);
    assert.equal(await user.evaluate(()=>document.activeElement.name),'phone');
    assert.match(await user.locator('#error-phone').textContent(),/6–32/);
    assert.equal(await user.locator('[name=username]').inputValue(),name);
    for (const width of [390,768,1440]) {
      await user.setViewportSize({width,height:900});
      assert(await user.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`registration overflow at ${width}`);
    }
    await user.screenshot({path:'.qa/registration-errors.png',fullPage:true});
    await user.setViewportSize({width:390,height:844});
    await user.locator('[name=phone]').fill('+16045550123');
    await user.locator('[name=confirmPassword]').fill(password+'!');
    await user.getByRole('button', { name: '注册并验证邮箱' }).click();
    assert.equal(await user.locator('[name=confirmPassword]').getAttribute('aria-invalid'),'true');
    await user.locator('[name=confirmPassword]').fill(password);
    await user.locator('[name=password]').fill('密'.repeat(25));
    assert.equal(await user.locator('[name=password]').getAttribute('aria-invalid'),'true');
    await user.locator('[name=password]').fill(password);
    // Field-specific server responses must remain visible even if client validation passes.
    await user.route('**/api/auth/register',route=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'请检查标红的输入项。',fieldErrors:{phone:'服务端格式提示：手机号须为6–32个字符。'}})}),{times:1});
    await user.getByRole('button', { name: '注册并验证邮箱' }).click();
    await user.getByText('服务端格式提示：手机号须为6–32个字符。',{exact:true}).waitFor();
    assert.equal(await user.locator('[name=phone]').getAttribute('aria-invalid'),'true');
    await user.locator('[name=phone]').fill('+1 604 555 0123');
    assert.equal(await user.locator('input[aria-invalid=true]').count(),0);
    await user.getByRole('button', { name: '注册并验证邮箱' }).click();
    await user.getByText('注册成功，请验证邮箱后登录。', { exact:true }).waitFor();
    const mails = await userContext.request.get(base + '/dev/mail').then(r => r.json());
    await user.goto(mails.find(m => m.to === name + '@example.test').link);
    await user.getByRole('button', { name: '确认验证邮箱' }).click();
    await user.getByText('邮箱验证成功，现在可以登录。', { exact:true }).waitFor();
    await login(user, name);
    await user.getByText('还没有分配的测验', { exact:true }).waitFor();
    assert.equal((await userContext.request.get(base+'/api/admin/users')).status(),403);
    await login(admin, 'browser_admin');
    await admin.getByText('每一套测验，独立管理。', {exact:true}).waitFor();
    await admin.screenshot({path:'.qa/admin-desktop.png',fullPage:true});

    // New/copy assessment forms must work without native browser input dialogs.
    const originalEdit = await admin.getByRole('link',{name:'编辑',exact:true}).first().getAttribute('href');
    const originalId = new URL(originalEdit,base).searchParams.get('id');
    const beforeCreate = await adminContext.request.get(base+'/api/admin/assessments').then(r=>r.json());
    const createRequests=[];
    admin.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/admin/assessments')createRequests.push(request.postDataJSON());});
    await admin.getByRole('button',{name:'＋ 新建套题',exact:true}).click();
    const titleInput=admin.locator('#set-create-panel input[name=title]');
    assert.equal(await titleInput.inputValue(),'');
    assert.equal(await titleInput.getAttribute('maxlength'),'200');
    assert.equal(await admin.evaluate(()=>document.activeElement.name),'title');
    await admin.getByRole('button',{name:'创建套题',exact:true}).click();
    assert.equal(await titleInput.getAttribute('aria-invalid'),'true');
    await titleInput.fill('   ');
    await admin.getByRole('button',{name:'创建套题',exact:true}).click();
    assert.equal(createRequests.length,0);
    await admin.getByRole('button',{name:'取消',exact:true}).click();
    assert.equal(await admin.locator('#set-create-panel').count(),0);
    assert.equal(await admin.evaluate(()=>document.activeElement.id),'new-set');
    assert.equal((await adminContext.request.get(base+'/api/admin/assessments').then(r=>r.json())).total,beforeCreate.total);
    await admin.getByRole('button',{name:'＋ 新建套题',exact:true}).click();
    const title='浏览器兼容性测验 '+Date.now();
    await titleInput.fill('  '+title+'  ');
    for(const width of [390,768,1440]){
      await admin.setViewportSize({width,height:1000});
      assert(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`create form overflow at ${width}`);
    }
    await admin.screenshot({path:'.qa/create-assessment-form.png',fullPage:true});
    await admin.route('**/api/admin/assessments',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'测试保存失败，请重试。'})}),{times:1});
    await admin.getByRole('button',{name:'创建套题',exact:true}).click();
    await admin.getByText('测试保存失败，请重试。',{exact:true}).waitFor();
    assert.equal(await titleInput.inputValue(),'  '+title+'  ');
    assert.equal(await admin.getByRole('button',{name:'创建套题',exact:true}).isEnabled(),true);
    await admin.getByRole('button',{name:'创建套题',exact:true}).evaluate(button=>{button.click();button.click();});
    await admin.waitForURL(url=>url.pathname==='/admin/editor');
    await admin.locator('#editor').waitFor({state:'visible'});
    assert.equal(createRequests.length,2,'failed attempt plus one successful request, even on double-click');
    const createdId=new URL(admin.url()).searchParams.get('id');
    const created=await adminContext.request.get(base+'/api/admin/assessments/'+createdId).then(r=>r.json());
    assert.equal(created.title,title);
    await admin.goto(base+'/admin/');
    await admin.locator(`[data-copy="${originalId}"]`).click();
    assert.match(await titleInput.inputValue(),/ · 副本$/);
    const copyTitle='独立副本 '+Date.now();
    await titleInput.fill(copyTitle);
    await titleInput.press('Enter');
    await admin.waitForURL(url=>url.pathname==='/admin/editor');
    await admin.locator('#editor').waitFor({state:'visible'});
    const copyId=new URL(admin.url()).searchParams.get('id');
    assert.notEqual(copyId,originalId);
    assert.deepEqual(createRequests.at(-1),{title:copyTitle,copyFrom:originalId});
    const copy=await adminContext.request.get(base+'/api/admin/assessments/'+copyId).then(r=>r.json());
    assert.equal(copy.title,copyTitle);

    // Edit the first assessment and add the user's earlier D: total > 0 scenario.
    await admin.goto(base+originalEdit);
    await admin.locator('#editor').waitFor({state:'visible'});
    await admin.locator('[data-action=add-result]').click();
    const d = admin.locator('.result-block').nth(3);
    await d.locator('[data-field=code]').fill('D');
    await d.locator('[data-field=name]').fill('普通型');
    await d.locator('[data-kind=condition-value]').fill('0');
    const popupPromise = admin.waitForEvent('popup');
    await admin.locator('[data-action=preview]').click();
    const preview = await popupPromise;
    await preview.locator('.score-input').first().waitFor();
    for (const i of await preview.locator('.score-input').all()) await i.fill('5');
    await preview.getByRole('button',{name:'预览结果',exact:true}).click();
    await preview.getByRole('heading',{name:'D级 · 普通型'}).waitFor();
    await preview.close();
    await admin.locator('[data-action=publish]').click();
    await admin.getByText('发布成功。新版本已发布；现有分配保持原版本，请到工作台分配新版本。',{exact:true}).waitFor();
    await admin.goto(base+'/admin/');
    await admin.locator(`[data-assign="${originalId}"]`).click();
    const checkbox=admin.locator('.checkbox-list label').filter({hasText:name}).locator('input');
    await checkbox.check();
    await admin.getByRole('button',{name:'确认分配',exact:true}).click();
    await admin.getByText('已为 1 位用户分配测验。',{exact:true}).waitFor();

    await user.reload();
    await user.getByRole('link',{name:'开始测验 →'}).click();
    const inputs=user.locator('.score-input'); await inputs.first().waitFor();
    assert.equal(await inputs.count(),15);
    assert.equal(await user.locator('#live-total').textContent(),'0');
    assert.equal(await inputs.first().inputValue(),'');
    await user.getByRole('button',{name:'提交并查看结果'}).click();
    assert.equal(await user.locator('[aria-invalid=true]').count(),15);
    assert.equal(await user.locator('#notice').textContent(),'请完成所有题目，并确保每题都是1–10的整数。');
    assert.equal(await user.evaluate(()=>document.activeElement.name),'q1');
    for (const input of await inputs.all()) await input.fill('7');
    await inputs.first().fill('1.5');
    await user.getByRole('button',{name:'提交并查看结果'}).click();
    assert.equal(await user.locator('[aria-invalid=true]').count(),1);
    await inputs.first().fill('7');
    for (const width of [390,768,1440]) {
      await user.setViewportSize({width,height:900});
      assert(await user.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`horizontal overflow at ${width}`);
    }
    await user.setViewportSize({width:390,height:844});
    await user.screenshot({path:'.qa/questionnaire-mobile.png',fullPage:true});
    await user.getByRole('button',{name:'提交并查看结果'}).click();
    await user.getByRole('heading',{name:'S级 · 核心型'}).waitFor();
    await user.getByRole('link',{name:'查看本次答案',exact:true}).click();
    await user.getByRole('heading',{name:'本次作答',exact:true}).waitFor();
    assert.equal(await user.locator('.answer-list li').count(),15);
    await user.screenshot({path:'.qa/history-mobile.png',fullPage:true});
    await admin.goto(base+'/admin/#records');
    await admin.getByRole('link',{name:'查看答案',exact:true}).first().click();
    await admin.getByRole('heading',{name:'本次作答',exact:true}).waitFor();
    assert.equal(await admin.locator('.answer-list li').count(),15);
    for (const width of [390,768,1440]) {await admin.setViewportSize({width,height:900});assert(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`admin overflow at ${width}`);}
    await user.goto(base+'/#assignments');await user.getByRole('link',{name:'开始测验 →'}).click();await user.locator('.score-input').first().fill('10');await user.getByRole('button',{name:'重新测验',exact:true}).click();assert.equal(await user.locator('.score-input').first().inputValue(),'');
    assert.deepEqual(errors,[]);
    console.log('Browser smoke passed: registration, email activation, native-prompt-free creation/copy/cancel/retry, admin editor/D preview, assignment, submission, history, reset, and 3 responsive widths.');
  } finally { await browser.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
