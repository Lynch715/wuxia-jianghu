// 端到端自测：无需真实模型，用假接口跑完一局，核对引擎各系统
// 用法：npm i playwright && node test/run.js（本机）
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs');
const {pickBody,sse}=require('./mock');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'));
const srv=http.createServer((q,r)=>{ r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); r.end(html); });
const fails=[]; const oks=[];
const ok=(n,c)=>{ (c?oks:fails).push(n); console.log((c?'  ✓ ':'  ✗ ')+n); };
(async()=>{
srv.listen(8931);
const exe=process.env.PW_CHROME||undefined;   // 容器里用 PW_CHROME 指定，本机留空走 playwright 自带
const br=await chromium.launch(exe?{executablePath:exe}:{});
const ctx=await br.newContext({viewport:{width:1400,height:900}});
const page=await ctx.newPage();
const errs=global.__errs=[]; page.on('pageerror',e=>errs.push(String(e)));
page.on('console',m=>{ if(m.type()==='error') errs.push('console:'+m.text()); });
await page.route('**/chat/completions',async route=>{
  const body=JSON.parse(route.request().postData());
  const prompt=body.messages[body.messages.length-1].content;
  global.__lastPrompt=prompt; global.__msgs=body.messages;
  if(prompt.includes('你现在扮演武侠世界中的人物')) await new Promise(r=>setTimeout(r,1500));
  await route.fulfill({status:200,headers:{'Content-Type':'text/event-stream'},body:sse(pickBody(prompt))});
});
await page.addInitScript(()=>{ localStorage.setItem('wuxia_cfg',JSON.stringify({base:'https://api.deepseek.com',key:'sk-test',model:'deepseek-v4-flash',think:false})); });
await page.goto('http://localhost:8931/');
console.log('\n【开局：自由度选择】');
ok('捏人有自由度三档', (await page.$$('#crFree button')).length===3);
ok('默认选中江湖传奇', (await page.getAttribute('#crFree button[data-v="mid"]','class')||'').includes('sel'));
await page.click('#crFree button[data-v="free"]');
const note=await page.textContent('#crFreeNote');
ok('自由度说明：'+note.replace(/\s+/g,' ').slice(0,80), note.includes('不会落终身伤残'));
await page.click('#crFree button[data-v="mid"]');
await page.click('#crStart');
await page.waitForSelector('#choices .opt',{timeout:15000});
ok('system 角色已发送', (global.__msgs||[]).length===2 && global.__msgs[0].role==='system');
ok('开局剧情已渲染', (await page.textContent('#story')).includes('雨下了整宿'));
const money=await page.textContent('#pMoney');
ok('家财显示月耗与可撑月数：'+money.replace(/\s+/g,' ').trim().slice(0,40), /月耗约 \d+ 两/.test(money));
ok('师门卡片：'+(await page.textContent('#pSect')).replace(/\s+/g,' ').trim().slice(0,30), (await page.textContent('#pSect')).includes('华山派'));
ok('武学显示路数熟练度', (await page.textContent('#pArts')).includes('刚猛'));
const opts=await page.$$eval('#choices .opt',es=>es.map(e=>e.textContent));
ok('选项标出耗时：'+(opts[1]||'').replace(/\s+/g,' ').trim().slice(0,40), opts.some(t=>t.includes('耗时 3 月')));

console.log('\n【闭关三月：时间与开销】');
const d0=await page.textContent('#gameDate');
await page.click('#choices .opt >> nth=1');
await page.waitForSelector('#choices .opt',{timeout:15000});
const d1=await page.textContent('#gameDate');
ok(`时间推进 ${d0.trim()} → ${d1.trim()}`, d0!==d1);
const story=await page.textContent('#story');
ok('起居注记了光阴与食宿', story.includes('光阴 过去 3 个月')&&story.includes('食宿汤药'));
ok('门派贡献入账', story.includes('门派贡献 +12'));
ok('武学熟练度增长', story.includes('伏虎拳 熟练 +'));

console.log('\n【参悟秘籍】');
await page.click('#tabs button[data-tab="bag"]');
const man=await page.textContent('#bagManuals');
ok('秘籍显示参悟参数：'+man.replace(/\s+/g,' ').trim().slice(0,70), /参悟需 \d+ 个月/.test(man)&&/约 \d+% 成算/.test(man));
await page.click('#bagManuals button[data-mi="0"]');
await page.waitForSelector('#choices .opt',{timeout:15000});
const st2=await page.textContent('#story');
ok('参悟结果进了剧情', st2.includes('参悟'));

console.log('\n【比武：战术与仇家】');
const duelBtn=await page.$('#choices .opt:has-text("秃鹰")');
if(duelBtn){ await duelBtn.click(); await page.waitForSelector('#duelMask.on',{timeout:8000}); }
ok('比武弹窗打开', !!(await page.$('#duelMask.on')));
const stances=await page.$$eval('#duelActions .stance',es=>es.map(e=>e.textContent.replace(/\s+/g,' ').trim()));
ok('八个动作（五架势+三手段）：'+stances.join(' | ').slice(0,120), stances.length===8);
ok('架势上标了对路武学与熟练度', stances.some(t=>/熟\d+/.test(t)));
ok('暗器可用（有蚀骨散）', stances.some(t=>t.includes('蚀骨散')));
// 打到结束
for(let i=0;i<30;i++){
  const btns=await page.$$('#duelActions .stance:not([disabled])');
  if(!btns.length) break;
  const x=await page.$('#duelActions .stance[data-k="X"]:not([disabled])');
  await (x||btns[0]).click();
  await page.waitForTimeout(60);
  if(await page.$('#duelGo')) break;
  if(await page.$('#dSpare')) break;
}
const dlog=await page.textContent('#duelLog');
ok('战报含毒发', dlog.includes('毒性'));
if(await page.$('#dKill')){ await page.click('#dKill'); }
if(await page.$('#duelGo')){ await page.click('#duelGo'); await page.waitForSelector('#choices .opt',{timeout:15000}); }
ok('比武后续写完成', (await page.textContent('#story')).includes('刀光闪过'));

console.log('\n【自由度：随时切换与提示词口径】');
ok('面板标出凶险/自由度：'+(await page.textContent('#pMeta')).split('·').pop().trim(), (await page.textContent('#pMeta')).includes('江湖传奇'));
ok('提示词带自由度口径', /本局自由度：江湖传奇/.test(global.__lastPrompt||''));
await page.click('#btnSettings');
await page.selectOption('#cfgFreedom','free');
ok('设置里可改自由度', await page.evaluate(()=>S.freedom)==='free');
await page.click('#cfgCancel');
await page.click('#choices .opt >> nth=0');
await page.waitForSelector('#choices .opt',{timeout:15000});
ok('切换后提示词换成随心所欲', /本局自由度：随心所欲/.test(global.__lastPrompt||'')&&/一律当作做成了/.test(global.__lastPrompt||''));

console.log('\n【剧情杀闸门】');
await page.evaluate(()=>{ S.freedom='mid'; S.player.hp=90; });
await page.fill('#freeInput','去黑风口打听消息');
await page.click('#sendBtn');
await page.waitForSelector('#choices .opt',{timeout:15000});
const st=await page.evaluate(()=>({over:S.over,hp:S.player.hp,status:S.player.status.slice()}));
ok('江湖传奇下模型写死主角被引擎驳回（over='+st.over+' 气血='+st.hp+' 状态='+st.status+'）', st.over===false&&st.hp<=22&&st.status.includes('重伤'));
ok('章节里写明引擎裁定', (await page.textContent('#story')).includes('引擎裁定'));
ok('模型交白卷时引擎补上选项（'+(await page.$$('#choices .opt')).length+' 个）', (await page.$$('#choices .opt')).length>=3);
const strictAllows=await page.evaluate(()=>{ const f=FREEDOM['strict']; return f.storyDeath>=1; });
ok('写实江湖仍允许剧情杀', strictAllows);

console.log('\n【对话退得出去】');
await page.evaluate(()=>{ S.freedom='mid'; });
await page.click('#tabs button[data-tab="people"]');
await page.click('#npcList .npc >> nth=0');
await page.click('#npcTalkBtn');
await page.waitForSelector('#convoMask.on');
await page.fill('#convoText','你怎么看这件事');
await page.click('#convoSend');
await page.waitForTimeout(250);
const btnState=await page.evaluate(()=>({end:$('convoEnd').disabled,send:$('convoSend').disabled}));
ok('等回复时「告辞」仍可点（送出被禁用）', btnState.end===false&&btnState.send===true);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
ok('Esc 能退出对话', !(await page.$('#convoMask.on')));
await page.waitForTimeout(2000);
ok('迟到的回复不会把人拽回对话框', !(await page.$('#convoMask.on')));
await page.click('#npcList .npc >> nth=0');
await page.click('#npcTalkBtn');
await page.waitForSelector('#convoMask.on');
await page.click('#convoMask',{position:{x:8,y:8}});
await page.waitForTimeout(200);
ok('点空白处也能退出对话', !(await page.$('#convoMask.on')));
await page.click('#tabs button[data-tab="world"]');

console.log('\n【桌面图标】');
const ic=await page.evaluate(()=>{
  const a=document.querySelector('link[rel="apple-touch-icon"]');
  const f=document.querySelector('link[rel="icon"]');
  const m=document.querySelector('link[rel="manifest"]');
  return {apple:a?a.href.slice(0,30):null, len:a?a.href.length:0, fav:!!f, mf:m?m.href.slice(0,5):null};
});
ok('apple-touch-icon 已内嵌（'+Math.round(ic.len/1024)+'KB data URI）', ic.apple&&ic.apple.startsWith('data:image/png'));
ok('favicon 与 manifest 已注入（'+ic.mf+'）', ic.fav&&ic.mf==='blob:');
const mfJson=await page.evaluate(async()=>{ const m=document.querySelector('link[rel=manifest]'); return await (await fetch(m.href)).json(); });
ok('manifest 名称与图标：'+mfJson.name+' / '+mfJson.icons[0].sizes, mfJson.name.includes('武侠')&&mfJson.icons[0].sizes==='384x384'&&mfJson.display==='standalone');

await page.evaluate(()=>{ S.freedom='strict'; });

console.log('\n【大凶：引擎定死的实损】');
await page.evaluate(()=>{ S.player.hp=80; S.player.money=500; window.__realRandom=Math.random; Math.random=()=>0.0001; });
const moneyBefore=await page.evaluate(()=>S.player.money);
const hpBefore=await page.evaluate(()=>S.player.hp);
const itemsBefore=await page.evaluate(()=>JSON.stringify(S.player.items));
await page.click('#choices .opt >> nth=0');
await page.waitForSelector('#choices .opt',{timeout:15000});
const doomPrompt=global.__lastPrompt||'';
ok('大凶时提示词写明实损：'+(doomPrompt.match(/引擎已定死的实损：[^。]*。/)||[''])[0], /引擎已定死的实损/.test(doomPrompt));
const after=await page.evaluate(()=>({m:S.player.money,h:S.player.hp,i:JSON.stringify(S.player.items)}));
ok(`实损已落账（银 ${moneyBefore}→${after.m}，气血 ${hpBefore}→${after.h}）`, after.m<moneyBefore||after.h<hpBefore||after.i!==itemsBefore);
await page.evaluate(()=>{ Math.random=window.__realRandom; });

console.log('\n【世界页：江湖榜与仇家】');
await page.click('#tabs button[data-tab="world"]');
const rk=await page.textContent('#wRanking');
ok('榜单状态：'+(rk.includes('你已在榜')?'击败榜上人物后已入榜':'尚未入榜'), rk.includes('你已在榜')||rk.includes('尚未入榜'));
ok(rk.includes('你已在榜')?'入榜后榜单出现自己':'未入榜时榜单不列自己', rk.includes('你已在榜')?rk.includes('李昭'):!rk.includes('李昭'));
ok('榜上有挑战按钮', (await page.$$('#wRanking button[data-ch]')).length>0);
const vd=await page.textContent('#wVendetta');
ok('仇家面板：'+vd.replace(/\s+/g,' ').trim().slice(0,50), true);

console.log('\n【存档阁与导出全本】');
await page.click('#btnExport');
await page.waitForSelector('#saveMask.on');
ok('三个存档位', (await page.$$('#slotList button[data-sv]')).length===3);
await page.click('#slotList button[data-sv="1"]');
ok('存档位1已写入', (await page.textContent('#slotList')).includes('李昭'));
const [dl]=await Promise.all([page.waitForEvent('download',{timeout:8000}),page.click('#svExportBook')]);
const path=await dl.path(); const book=fs.readFileSync(path,'utf8');
ok('全本导出 '+book.length+' 字，文件名 '+dl.suggestedFilename(), book.includes('# 李昭传')&&book.includes('雨下了整宿'));
fs.writeFileSync('/tmp/book.md',book);

console.log('\n【IndexedDB 与重载】');
const idbCount=await page.evaluate(()=>new Promise(r=>{
  const q=indexedDB.open('wuxia_book',1);
  q.onsuccess=()=>{ const db=q.result; const tx=db.transaction('chapters','readonly');
    const g=tx.objectStore('chapters').getAll(); g.onsuccess=()=>r(g.result.length); };
  q.onerror=()=>r(-1);
}));
ok('IndexedDB 存了 '+idbCount+' 章', idbCount>=4);
const lsSize=await page.evaluate(()=>(localStorage.getItem('wuxia_save_v1')||'').length);
ok('localStorage 存档 '+lsSize+' 字节（章节已挪走）', lsSize>0);
await page.reload();
await page.waitForTimeout(1200);
ok('重载后剧情还在', (await page.textContent('#story')).includes('雨下了整宿'));
ok('重载后面板还在', (await page.textContent('#pName')).includes('李昭'));

console.log('\n【无密钥样张】');
const p2=await ctx.newPage();
await p2.addInitScript(()=>{ localStorage.clear(); });
await p2.goto('http://localhost:8931/');
await p2.waitForTimeout(400);
ok('样张已显示', (await p2.textContent('#story')).includes('样张'));
ok('样张有引导按钮', (await p2.textContent('#choices')).includes('填入 API 密钥'));

console.log('\n页面错误：', errs.length?errs.slice(0,5):'无');
console.log(`\n结果：${oks.length} 通过，${fails.length} 失败`);
if(fails.length) console.log('失败项：',fails.join('；'));
await br.close(); srv.close(); process.exit(fails.length||errs.length?1:0);
})().catch(e=>{console.error('FAILED:',e.message);console.error('page errors:',(global.__errs||[]).slice(0,6));process.exit(1)});
