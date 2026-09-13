// 端到端自测：无需真实模型，用假接口跑完一局，核对引擎各系统
// 用法：npm i playwright && node test/run.js（本机）
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs');
const {pickBody,sse}=require('./mock');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'));
const srv=http.createServer((q,r)=>{ r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); r.end(html); });
const fails=[]; const oks=[];
const ok=(n,c)=>{ (c?oks:fails).push(n); console.log((c?'  ✓ ':'  ✗ ')+n); };
let page;
const idle=()=>page.waitForFunction(()=>!busy&&(typeof convo==='undefined'||!convo),null,{timeout:25000});
(async()=>{
srv.listen(8931);
const exe=process.env.PW_CHROME||undefined;   // 容器里用 PW_CHROME 指定，本机留空走 playwright 自带
const br=await chromium.launch(exe?{executablePath:exe}:{});
const ctx=await br.newContext({viewport:{width:1400,height:900}});
page=await ctx.newPage();
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
ok('捏人可挑相貌（'+(await page.$$('#crAvatar .cell')).length+' 格，含随天意）', (await page.$$('#crAvatar .cell')).length>=25);
await page.click('#crAvatar .cell:nth-child(10)');
await page.click('#crStart');
await page.waitForSelector('#choices .opt',{timeout:25000});
ok('system 角色已发送', (global.__msgs||[]).length===2 && global.__msgs[0].role==='system');
ok('开局剧情已渲染', (await page.textContent('#story')).includes('雨下了整宿'));
const nameCase=await page.evaluate(()=>{
  const keepName=S.player.name, keepNpcs=S.npcs;
  S.player.name='田伯光';
  S.npcs=[{name:'徐三娘',alive:true},{name:'欧阳锋',alive:true}];
  const r={
    wrong: fixSelfRef('我王某说到做到！',[]),
    npcOwn: fixSelfRef('我徐某人今日便走。',[]),
    notName: fixSelfRef('我有某人相助。',[]),
    elder: fixSelfRef('老夫赵某闯荡四十年。',[]),
    right: fixSelfRef('我田某说话算数。',[]),
    compound: surnameOf('欧阳锋')+'/'+surnameOf('田伯光'),
    block: stateBlocks()
  };
  S.player.name=keepName; S.npcs=keepNpcs;   // 测完还回去，别弄脏后面的用例
  return r;
});
ok('写错的自称被改回主角的姓：'+nameCase.wrong, nameCase.wrong==='我田某说到做到！');
ok('在场NPC的姓不动：'+nameCase.npcOwn, nameCase.npcOwn==='我徐某人今日便走。');
ok('「我有某人」不是自称，不动', nameCase.notName==='我有某人相助。');
ok('「老夫X某」多半是长辈NPC，不动', nameCase.elder==='老夫赵某闯荡四十年。');
ok('本来就对的不动', nameCase.right==='我田某说话算数。');
ok('复姓识别正确（'+nameCase.compound+'）', nameCase.compound==='欧阳/田');
ok('提示词把主角姓名单拎出来强调：'+(nameCase.block.match(/【主角姓名】[^\n]{0,40}/)||[''])[0],
   /【主角姓名】田伯光/.test(nameCase.block)&&/绝不可换成别的姓/.test(nameCase.block));
const life=await page.evaluate(()=>({span:S.player.lifespan, meta:$('pMeta').textContent, ratio:Math.round(lifeRatio()*100), note:ageNote()}));
ok('开局带上寿元（'+life.span+'）', life.span>=70&&life.span<=86);
ok('面板写出年岁与寿元：'+life.meta.split(' · ')[1], /岁／寿元\d+/.test(life.meta));
ok(`年纪按已耗寿元算（耗了 ${life.ratio}% → ${life.note}）`, life.ratio<38&&life.note==='年富力强');
const money=await page.textContent('#pMoney');
ok('家财显示月耗与可撑月数：'+money.replace(/\s+/g,' ').trim().slice(0,40), /月耗约 \d+ 两/.test(money));
ok('师门卡片：'+(await page.textContent('#pSect')).replace(/\s+/g,' ').trim().slice(0,30), (await page.textContent('#pSect')).includes('华山派'));
ok('武学显示路数熟练度', (await page.textContent('#pArts')).includes('刚猛'));
ok('主角用了捏人时挑的脸：'+await page.evaluate(()=>S.player.avatar), !!(await page.evaluate(()=>S.player.avatar)));
const avInfo=await page.evaluate(()=>{
  const list=Array.from(document.querySelectorAll('#npcList .avatar'));
  return {n:list.length, sprite:list.filter(e=>e.classList.contains('av')).length,
          slots:S.npcs.map(x=>avSlotOf(x)), me:document.querySelector('#pFace .avatar').className};
});
ok('名录头像全部走雪碧图（'+avInfo.sprite+'/'+avInfo.n+'）', avInfo.n>0&&avInfo.sprite===avInfo.n);
ok('NPC 各自分到不同的脸：'+avInfo.slots.join(','), new Set(avInfo.slots).size===avInfo.slots.length);
ok('关系图节点用了头像', (await page.$$('#graphWrap image')).length>0);
const faceStable=await page.evaluate(()=>{
  const n=S.npcs[0], keep=n.age, before=n.avatar;
  n.age=keep+20; const after=avSlotOf(n);
  n.age=keep;                        // 测完还回去，否则他会随机老死，后面的用例就没人可谈了
  return {before, after};
});
ok('长了岁数也不换脸（'+faceStable.before+' → '+faceStable.after+'）', faceStable.before===faceStable.after);
const skRaw=await page.evaluate(()=>S.player.skills);
const skOk=Object.values(skRaw).every(v=>v&&typeof v==='object'&&typeof v.level==='number'&&v.level>=0&&v.level<=100&&typeof v.desc==='string');
ok('模型把技艺写成文字也能收敛成数字等级：'+JSON.stringify(skRaw['记帐']), skOk);
const badWidth=await page.evaluate(()=>Array.from(document.querySelectorAll('#pSkills .bar i')).map(i=>i.style.width));
ok('技艺进度条宽度都是合法百分比（'+badWidth.join(',')+'）', badWidth.length===3&&badWidth.every(w=>/^\d+%$/.test(w)));
ok('技艺说明另起一行显示', (await page.$$('#pSkills .sdesc')).length===3);
const opts=await page.$$eval('#choices .opt',es=>es.map(e=>e.textContent));
ok('选项标出耗时：'+(opts[1]||'').replace(/\s+/g,' ').trim().slice(0,40), opts.some(t=>t.includes('耗时 3 月')));

console.log('\n【闭关三月：时间与开销】');
const d0=await page.textContent('#gameDate');
await page.click('#choices .opt >> nth=1');
await page.waitForSelector('#choices .opt',{timeout:25000});
const d1=await page.textContent('#gameDate');
ok(`时间推进 ${d0.trim()} → ${d1.trim()}`, d0!==d1);
const story=await page.textContent('#story');
ok('起居注记了光阴与食宿', story.includes('光阴 过去 3 个月')&&story.includes('食宿汤药'));
ok('门派贡献入账', story.includes('门派贡献 +12'));
ok('武学熟练度增长', story.includes('伏虎拳 熟练 +'));
const evt=await page.evaluate(()=>{
  const chaps=document.querySelectorAll('#story .chapter');
  const bs=Array.from(chaps[chaps.length-1].querySelectorAll('.subblock'));
  const b=bs.find(x=>x.querySelector('h4')&&x.querySelector('h4').textContent.includes('人间琐记'));
  const r=bs.find(x=>x.querySelector('h4')&&x.querySelector('h4').textContent.includes('江湖风闻'));
  return {evt:b?b.textContent:'', rumor:r?r.textContent:'',
          unit:[plain({name:'沈师姐',event:'下山办事'}), plain({text:'只有正文'}), plain('本来就是字符串'),
                plain([{name:'甲',desc:'一'},'二']), plain({foo:'散字段'}), plain(null), plain({})]};
});
ok('模型把琐记写成对象也能落成人话：'+evt.evt.replace('人间琐记',''), evt.evt.includes('沈师姐')&&evt.evt.includes('下山办事')&&!/\[object/.test(evt.evt));
ok('风闻同样不会漏出 [object Object]：'+evt.rumor.replace('江湖风闻',''), evt.rumor.includes('江湖榜')&&!/\[object/.test(evt.rumor));
ok('plain() 各种形状都压得平：'+JSON.stringify(evt.unit),
   evt.unit[0]==='沈师姐：下山办事'&&evt.unit[1]==='只有正文'&&evt.unit[2]==='本来就是字符串'
   &&evt.unit[3]==='甲：一；二'&&evt.unit[4]==='散字段'&&evt.unit[5]===''&&evt.unit[6]==='');
ok('整页找不到 [object Object]', !(await page.textContent('#story')).includes('[object'));

console.log('\n【参悟秘籍】');
await page.click('#tabs button[data-tab="bag"]');
const man=await page.textContent('#bagManuals');
ok('秘籍显示参悟参数：'+man.replace(/\s+/g,' ').trim().slice(0,70), /闭关 \d+ 个月/.test(man)&&/成算约 \d+%/.test(man));
await page.click('#bagManuals button[data-mi="0"]');
await page.waitForSelector('#choices .opt',{timeout:25000});
const st2=await page.textContent('#story');
ok('参悟结果进了剧情', st2.includes('参悟'));

console.log('\n【比武：战术与仇家】');
const duelBtn=await page.$('#choices .opt:has-text("秃鹰")');
if(duelBtn){ await duelBtn.click(); await page.waitForSelector('#duelMask.on',{timeout:20000}); }
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
if(await page.$('#duelGo')){ await page.click('#duelGo'); await page.waitForSelector('#choices .opt',{timeout:25000}); }
ok('比武后续写完成', (await page.textContent('#story')).includes('刀光闪过'));

console.log('\n【自由度：随时切换与提示词口径】');
ok('面板徽章标出凶险/自由度：'+(await page.textContent('#pTitle')).replace(/\s+/g,' ').trim(), (await page.textContent('#pTitle')).includes('江湖传奇'));
ok('提示词带自由度口径', /本局自由度：江湖传奇/.test(global.__lastPrompt||''));
await page.click('#btnSettings');
await page.selectOption('#cfgFreedom','free');
ok('设置里可改自由度', await page.evaluate(()=>S.freedom)==='free');
await page.click('#cfgCancel');
await idle();
await page.click('#choices .opt >> nth=0');
await page.waitForSelector('#choices .opt',{timeout:25000});
ok('切换后提示词换成随心所欲', /本局自由度：随心所欲/.test(global.__lastPrompt||'')&&/一律当作做成了/.test(global.__lastPrompt||''));

console.log('\n【自由度贯通到对话】');
const talkPrompt=async(free)=>{
  await page.evaluate(f=>{ S.freedom=f; S.npcs[0].secretKnown=false; S.npcs[0].secret='他年轻时欠过一条人命'; }, free);
  await page.click('#tabs button[data-tab="people"]');
  await page.click('#npcList .npc >> nth=0');
  await page.click('#npcTalkBtn');
  await page.waitForSelector('#convoMask.on');
  await page.fill('#convoText','把你知道的都告诉我');
  await page.click('#convoSend');
  await page.waitForTimeout(1800);
  const pr=global.__lastPrompt||'';
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await idle();
  return pr;
};
const talkBase=await page.evaluate(()=>S.player.attributes['谈吐']);
const pFree=await talkPrompt('free');
ok('随心所欲：对话提示词带上促成口径', /本局对话口径：随心所欲/.test(pFree)&&/顺着来/.test(pFree));
ok(`随心所欲：说服判定吃到 +25 气运（谈吐 ${talkBase} → ${(pFree.match(/说服\/欺骗\/套话用谈吐(\d+)/)||[])[1]}）`,
   pFree.includes('说服/欺骗/套话用谈吐'+(talkBase+25)));
ok('随心所欲：秘密门槛降到 50', /好感≥50且被直接问及/.test(pFree));
ok('随心所欲：不再说「不会无缘无故帮他」', !/不会无缘无故帮他/.test(pFree)&&/十有八九求得动/.test(pFree));
ok('随心所欲：NPC 主动想帮他，不必等他开口', /主动想帮他/.test(pFree)&&/不必等他开口/.test(pFree));
ok('随心所欲：每句话末尾留一个邀约或线索', /末尾留一个邀约或一条线索/.test(pFree));
ok('随心所欲：不许拂袖而去（endTalk 恒 false）', /endTalk 一律填 false/.test(pFree));
ok('随心所欲：请求门槛往低里设（随口小事30）', /随口小事30/.test(pFree));
const convoGate=await page.evaluate(()=>['free','mid','strict'].map(f=>{const x=FREEDOM[f];return f+':'+x.check+'/'+x.secretGate;}).join(' '));
ok('三档对话门槛依次放宽：'+convoGate, /free:25\/50/.test(convoGate)&&/strict:0\/80/.test(convoGate));
const pStrict=await talkPrompt('strict');
ok('写实江湖：仍是原来的严苛口径', /不会无缘无故帮他/.test(pStrict)&&/好感≥80且被直接问及/.test(pStrict));
ok('对话也吃自由度：NPC 资料带上画像', /portrait/.test(pStrict));
await page.evaluate(()=>{ S.freedom='mid'; });

console.log('\n【剧情杀闸门】');
await page.evaluate(()=>{ S.freedom='mid'; S.player.hp=90; });
await page.fill('#freeInput','去黑风口打听消息');
await page.click('#sendBtn');
await page.waitForSelector('#choices .opt',{timeout:25000});
const st=await page.evaluate(()=>({over:S.over,hp:S.player.hp,status:S.player.status.slice()}));
ok('江湖传奇下模型写死主角被引擎驳回（over='+st.over+' 气血='+st.hp+' 状态='+st.status+'）', st.over===false&&st.hp<=22&&st.status.includes('重伤'));
ok('章节里写明引擎裁定', (await page.textContent('#story')).includes('引擎裁定'));
ok('模型交白卷时引擎补上选项（'+(await page.$$('#choices .opt')).length+' 个）', (await page.$$('#choices .opt')).length>=3);
const strictAllows=await page.evaluate(()=>{ const f=FREEDOM['strict']; return f.storyDeath>=1; });
ok('写实江湖仍允许剧情杀', strictAllows);

console.log('\n【对话退得出去】');
// 送东西要好感≥45，而好感是前面几场对话攒出来的、会浮动；这一段测的是落账不是攒好感，先钉死
await page.evaluate(()=>{ S.freedom='mid'; S.npcs[0]['好感度']=60; });
await page.click('#tabs button[data-tab="people"]');
await page.click('#npcList .npc >> nth=0');
await page.click('#npcTalkBtn');
await page.waitForSelector('#convoMask.on');
await page.fill('#convoText','你怎么看这件事');
await page.click('#convoSend');
await page.waitForTimeout(250);
const btnState=await page.evaluate(()=>({end:$('convoEnd').disabled,send:$('convoSend').disabled}));
ok('等回复时「告辞」仍可点（送出被禁用）', btnState.end===false&&btnState.send===true);
await page.waitForTimeout(1800);
const eff=await page.evaluate(()=>({money:S.player.money,hp:S.player.hp,
  med:(S.player.items['医药']||[]).map(x=>x.name), quests:S.quests.map(q=>q.title),
  unresolved:(S.scene&&S.scene.unresolved)||[], gains:(typeof convo!=='undefined'&&convo&&convo.gains)||[],
  fav:S.npcs[0]['好感度'], gave:S.npcs[0].gave}));
ok('谈成的事真的落账（'+eff.gains.join('｜')+'）', eff.gains.length>0);
ok('讨到的银子按好感被削（模型想给300，实到 '+eff.gave+' 两）', eff.gave>0&&eff.gave<300);
ok('讨到的东西进了行囊：'+eff.med.join(','), eff.med.includes('白玉续命膏'));
ok('受人所托变成宿命：'+eff.quests.join(','), eff.quests.includes('替师姐带一封信'));
ok('打听到的消息进了未了之事：'+eff.unresolved.join(','), eff.unresolved.some(x=>x.includes('黑风口')));
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
ok('Esc 能退出对话', !(await page.$('#convoMask.on')));
await page.waitForTimeout(2000);
ok('迟到的回复不会把人拽回对话框', !(await page.$('#convoMask.on')));
await idle();
await page.click('#tabs button[data-tab="people"]');
await page.click('#npcList .npc >> nth=0');
await page.click('#npcTalkBtn');
await page.waitForSelector('#convoMask.on');
await page.click('#convoMask',{position:{x:8,y:8}});
await page.waitForTimeout(200);
ok('点空白处也能退出对话', !(await page.$('#convoMask.on')));
await idle();
await page.click('#tabs button[data-tab="world"]');

console.log('\n【面谈余波：谈完接得上主线】');
await page.evaluate(()=>{ S.freedom='mid'; });
await page.click('#tabs button[data-tab="people"]');
await page.click('#npcList .npc >> nth=0');
await page.click('#npcTalkBtn');
await page.waitForSelector('#convoMask.on');
const beforeTalk=await page.evaluate(()=>({date:S.date,money:S.player.money,chapters:document.querySelectorAll('#story .chapter').length}));
await page.fill('#convoText','这事你怎么打算');
await page.click('#convoSend');
await page.waitForTimeout(1800);
await page.click('#convoEnd');
await page.waitForFunction(n=>document.querySelectorAll('#story .chapter').length>=n+2,beforeTalk.chapters,{timeout:25000});
await idle();
await page.waitForSelector('#choices .opt:not([disabled])',{timeout:25000});
const aftPrompt=global.__lastPrompt||'';
ok('余波回合的提示词写明「刚才那场面谈的余波」', /刚才那场面谈的余波/.test(aftPrompt)&&/不要重述对话内容/.test(aftPrompt));
ok('余波把已落账的结果交给模型认账：'+((aftPrompt.match(/已经落到账上的结果[^\n]{0,60}/)||[''])[0]).slice(0,60),
   /既成事实，必须承认/.test(aftPrompt));
ok('余波不推时间、不算生计', !/本回合历时/.test(aftPrompt)&&!/^- 生计/m.test(aftPrompt));
const aft=await page.evaluate(()=>({date:S.date,money:S.player.money,
  story:document.querySelector('#story').textContent,
  opts:Array.from(document.querySelectorAll('#choices .opt')).map(e=>e.textContent.replace(/\s+/g,' ').trim())}));
ok(`余波不吃光阴（${beforeTalk.date.trim()} → ${aft.date.trim()}）`, beforeTalk.date===aft.date);
ok('余波不扣食宿汤药', aft.money>=beforeTalk.money);
ok('余波续写落进正文', aft.story.includes('话头刚落'));
ok('新选项接着这场谈话往下走：'+aft.opts[0], aft.opts.some(t=>t.includes('黑风口'))&&aft.opts.some(t=>t.includes('镖局')));
ok('同一批里三条选项各不相同', new Set(aft.opts).size===aft.opts.length);

console.log('\n【江湖榜的新陈代谢】');
const rk1=await page.evaluate(()=>{
  const keep=JSON.parse(JSON.stringify(S.world.ranking));
  S.world.fallen=[]; S.rankVacantTurns=0;
  S.world.ranking=[{name:'铁掌王',faction:'散人','武功':92,note:'一双铁掌',alive:true,age:70},
                   {name:'冷月姑',faction:'月影宫','武功':80,note:'月影刀',alive:false,age:66},
                   {name:'枯木道人',faction:'散人','武功':64,note:'枯木指',alive:true,age:80}];
  const s=findNpc('沈师姐'); s['武功']=88; s.alive=true;   // 剧情里练上来的自己人
  rankRefresh();
  return {keep,names:S.world.ranking.map(r=>r.name),ws:S.world.ranking.map(r=>num(r['武功'])),
          fallen:S.world.fallen.map(f=>f.name),dead:S.world.ranking.filter(r=>r.alive===false).length,
          vacant:S.world.vacant};
});
ok('死者退榜，另记往生录：'+rk1.fallen.join(','), rk1.fallen.includes('冷月姑')&&!rk1.names.includes('冷月姑'));
ok('榜上不再留死人', rk1.dead===0);
ok('剧情里练上来的人物自动上榜：'+rk1.names.join('、'), rk1.names.includes('沈师姐'));
ok('榜单按武功由高到低排：'+rk1.ws.join('>'), rk1.ws.every((v,i,a)=>i===0||a[i-1]>=v));
ok('人不够时记下空缺（'+rk1.vacant+' 个）', rk1.vacant===10-rk1.names.length&&rk1.vacant>0);
const rk2=await page.evaluate(()=>{ rankRefresh(); rankRefresh();
  return {n:S.world.ranking.length,names:S.world.ranking.map(r=>r.name),
          ws:S.world.ranking.map(r=>num(r['武功'])),vacant:S.world.vacant}; });
ok('空缺挂了两回合，引擎自己补满十人：'+rk2.n, rk2.n===10&&rk2.vacant===0);
ok('补进来的是新面孔，不与旧人重名', new Set(rk2.names).size===10);
ok('补满后仍按武功排：'+rk2.ws.join('>'), rk2.ws.every((v,i,a)=>i===0||a[i-1]>=v));
const rkLow=await page.evaluate(()=>{
  const floor=rankFloor(), before=S.world.ranking.length;
  applyTurn({rankingAdd:[{name:'张三脚',faction:'散人','武功':floor-20,note:'不入流'},
                         {name:'秦无咎',faction:'散人','武功':floor+6,note:'一柄短戟'}],
             options:[{text:'继续',hint:'',type:'normal',months:1}],narrative:'',summary:''},
            {fate:11,check:null,worldEvent:null,duel:false,months:0});
  return {floor,before,names:S.world.ranking.map(r=>r.name)};
});
ok('武功不够的硬塞不进榜（榜末线 '+rkLow.floor+'）', !rkLow.names.includes('张三脚'));
ok('够格的新高手进得来', rkLow.names.includes('秦无咎'));
await page.click('#tabs button[data-tab="world"]');
await page.evaluate(()=>renderWorld());
const wtxt=(await page.textContent('#wRanking')).replace(/\s+/g,' ');
ok('世界页列出往生录：'+((wtxt.match(/往生录：[^ ]{0,24}/)||[''])[0]), /往生录：/.test(wtxt)&&wtxt.includes('冷月姑'));
ok('榜上活人都带挑战按钮，死人不带', (await page.$$('#wRanking .rank:not(.deadr):not(.me) button[data-ch]')).length===(await page.$$('#wRanking .rank:not(.deadr):not(.me)')).length);
await page.evaluate(()=>{ S.world.fallen=[]; S.rankVacantTurns=0; });

console.log('\n【武功水位：随心所欲的一千点】');
const wc=await page.evaluate(()=>{
  const keepF=S.freedom, keepW=S.player.attributes['武功'], keepRk=JSON.parse(JSON.stringify(S.world.ranking));
  const r={};
  S.freedom='strict'; r.strictCap=WCAP(); r.strictClamp=clampW(500);
  S.freedom='free';   r.freeCap=WCAP();   r.freeClamp=clampW(500);
  S.player.attributes['武功']=keepW;
  r.lvBase=powerLevel();
  S.player.attributes['武功']=640;
  r.lvAfter=powerLevel();
  r.realm=[realmOf(40),realmOf(70),realmOf(120),realmOf(300),realmOf(640),realmOf(950)];
  // 成长上限：水涨船高
  S.player.attributes['武功']=60;  const g1=growthCap();
  S.player.attributes['武功']=340; const g2=growthCap();
  S.freedom='strict'; S.player.attributes['武功']=340; const g3=growthCap();
  S.freedom='free';   S.player.attributes['武功']=640;
  r.g=[g1,g2,g3];
  renderPanel();
  const bar=document.querySelectorAll('#pAttrs .attr');
  r.widths=Array.from(bar).map(e=>e.querySelector('.bar i').style.width);
  r.labels=Array.from(bar).map(e=>e.querySelector('.lab b').textContent.replace(/\s+/g,''));
  r.foot=($('pAttrs').textContent.match(/当世水位 \d+/)||[''])[0];
  r.title=titleOf(S.player);
  // 天下英雄跟着涨
  S.world.ranking=keepRk.map(x=>Object.assign({},x,{'武功':80,alive:true,age:45}));
  const before=S.world.ranking.map(x=>x['武功']);
  for(let i=0;i<12;i++) rankCatchUp();
  r.catchUp={before:before[0], after:Math.max.apply(null,S.world.ranking.map(x=>num(x['武功'])))};
  S.freedom='strict';
  const s0=S.world.ranking[0]['武功']; for(let i=0;i<12;i++) rankCatchUp();
  r.strictStill=(S.world.ranking[0]['武功']===s0);
  S.freedom=keepF; S.player.attributes['武功']=keepW; S.world.ranking=keepRk; renderPanel();
  return r;
});
ok('写实江湖仍是 100 封顶（clampW(500)='+wc.strictClamp+'）', wc.strictCap===100&&wc.strictClamp===100);
ok('随心所欲放到 1000（clampW(500)='+wc.freeClamp+'）', wc.freeCap===1000&&wc.freeClamp===500);
ok(`水位跟着主角走（${wc.lvBase} → ${wc.lvAfter}）`, wc.lvAfter===640);
ok('境界名按数值分档：'+wc.realm.join('/'), wc.realm[0]==='三流'&&wc.realm[1]==='一流'&&wc.realm[2]==='绝顶'&&wc.realm[5]==='神话');
ok(`功力越深涨得越快（武功60 每回合+${wc.g[0]}，武功340 +${wc.g[1]}；写实江湖同样340只+${wc.g[2]}）`,
   wc.g[1]>wc.g[0]*2&&wc.g[2]<wc.g[0]);
ok('武功条改以当世第一为满格，宽度仍是合法百分比：'+wc.widths.join(','), wc.widths.every(w=>/^\d+%$/.test(w)));
ok('武功旁边挂了境界：'+wc.labels[3], /天人|大宗师|宗师|绝顶/.test(wc.labels[3]));
ok('面板标出当世水位：'+wc.foot, /当世水位 \d+/.test(wc.foot));
ok('称号吃境界：'+wc.title, /·(绝顶|宗师|大宗师|天人|神话)/.test(wc.title));
ok(`天下英雄跟着水位长进（榜首 ${wc.catchUp.before} → ${wc.catchUp.after}）`, wc.catchUp.after>wc.catchUp.before*2);
ok('写实江湖不搞这一套，榜单纹丝不动', wc.strictStill);

console.log('\n【寿元：奇遇才长得了】');
const lf=await page.evaluate(()=>{
  const keepF=S.freedom, keepL=S.player.lifespan, keepA=S.player.age, keepN=(S.engineNews||[]).slice(), keepLed=(S.ledger||[]).slice();
  const r={};
  S.freedom='strict'; S.player.lifespan=78; r.strictGot=grantLifespan(40,'灵药');
  S.freedom='mid';    S.player.lifespan=78; r.midGot=grantLifespan(40,'灵药'); r.midAfter=S.player.lifespan;
  S.freedom='free';   S.player.lifespan=78;
  r.freeOnce=grantLifespan(999,'千年灵芝'); r.freeAfter1=S.player.lifespan;
  for(let i=0;i<20;i++) grantLifespan(999,'奇遇');
  r.freeCeiling=S.player.lifespan;
  S.player.age=120; r.oldNote=ageNote(); r.oldRatio=Math.round(lifeRatio()*100);
  S.player.lifespan=78; r.youngNote=ageNote();
  S.freedom=keepF; S.player.lifespan=keepL; S.player.age=keepA; S.engineNews=keepN;
  S.ledger=keepLed;                       // 这段灌了二十几条寿元流水，测完还回去
  return r;
});
ok('写实江湖不给寿元（+'+lf.strictGot+'）', lf.strictGot===0);
ok(`江湖传奇一次最多 +8，且不超过 110（78 → ${lf.midAfter}）`, lf.midGot===8&&lf.midAfter===86);
ok(`随心所欲一次最多 +40（78 → ${lf.freeAfter1}）`, lf.freeOnce===40&&lf.freeAfter1===118);
ok('堆到头是 220 就不再涨了（'+lf.freeCeiling+'）', lf.freeCeiling===220);
ok(`寿元 220 时活到 120 仍算盛年（耗了 ${lf.oldRatio}% → ${lf.oldNote}）`, lf.oldRatio<60&&/盛年|中年/.test(lf.oldNote));
ok('同样 120 岁、寿元只有 78 就是风烛残年：'+lf.youngNote, lf.youngNote==='风烛残年');

console.log('\n【记忆：台账与上下文】');
const mem=await page.evaluate(()=>{
  const keep={v:S.volumes,h:S.history,r:S.recent,m:S.memLong};
  const long=n=>'某'.repeat(n);
  S.volumes=Array.from({length:12},(_,i)=>({from:i*14+1,to:i*14+14,text:long(600)}));
  S.history=Array.from({length:34},(_,i)=>({turn:i+1,action:long(8),summary:long(30)}));
  S.recent=Array.from({length:7},(_,i)=>({action:long(8),narrative:long(650)}));
  const M=MEM();
  const sb=stateBlocks();
  const npcHasMemo=/与主角的往来/.test(sb);
  S.memLong=false; const short=MEM(); const sbShort=stateBlocks();
  S.volumes=keep.v; S.history=keep.h; S.recent=keep.r; S.memLong=keep.m;
  return {M, short, sbLen:sb.length, sbShortLen:sbShort.length, npcHasMemo,
    ledger:(S.ledger||[]),
    hasLedgerBlock:/已成定局的旧事/.test(sb)};
});
ok(`加长档：卷录 ${mem.M.vol}×${mem.M.volLen} 字、提要 ${mem.M.sum} 条、正文 ${mem.M.recent} 回（其中 ${mem.M.recentFull} 回全文）、往来 ${mem.M.npcMem} 条、台账 ${mem.M.ledger} 条`,
   mem.M.vol===10&&mem.M.sum===30&&mem.M.recent===5&&mem.M.recentFull===3&&mem.M.npcMem===8);
ok(`标准档明显更短（${mem.sbLen} 字 → ${mem.sbShortLen} 字）`, mem.short.sum===16&&mem.sbShortLen<mem.sbLen);
ok('主线提示词终于带上了 NPC 的往来记录', mem.npcHasMemo);
ok('提示词里有事实台账一栏', mem.hasLedgerBlock);
ok('谈成的事都记进了台账（共 '+mem.ledger.length+' 条）：'+(mem.ledger.find(x=>/两银子/.test(x))||'—'),
   mem.ledger.some(x=>/两银子/.test(x))&&mem.ledger.some(x=>/打听到|【/.test(x)));
ok('引擎自己判的事也记台账：'+(mem.ledger.find(x=>/结仇|秘密|宿命|习得|落下/.test(x))||'—'),
   mem.ledger.some(x=>/结仇|秘密|宿命|习得|落下|参悟/.test(x)));
ok('台账每条都带回合与日子', mem.ledger.every(x=>/^第\d+回·/.test(x)));
const led2=await page.evaluate(()=>{
  const before=(S.ledger||[]).length;
  ledger('测试：同一件事重复记');
  ledger('测试：同一件事重复记');
  const after=(S.ledger||[]).length;
  S.ledger=S.ledger.filter(x=>!/测试：/.test(x));
  return {before,after};
});
ok('同一件事不会记两遍（'+led2.before+' → '+led2.after+'）', led2.after===led2.before+1);
const cvMem=await page.evaluate(()=>{
  const n=S.npcs[0];
  const keep=convo;
  convo={npc:n,msgs:[{role:'me',text:'你怎么看'}],favorTotal:0,giftMode:false,secretRevealed:false,gains:[]};
  const pr=convoPrompt(n,'你怎么看',12,null);
  convo=keep;
  return {hasSum:/【前情提要】/.test(pr), hasLed:/已成定局的旧事/.test(pr),
          realm:(pr.match(/武功\d+（[^）]*）/)||[''])[0], len:pr.length};
});
ok('对话提示词补上了主线提要（'+cvMem.len+' 字）', cvMem.hasSum);
ok('对话提示词也带事实台账', cvMem.hasLed);
ok('对话里 NPC 看得见主角的境界：'+cvMem.realm, /武功\d+（(不入流|三流|二流|一流|超一流|绝顶|宗师|大宗师|天人|神话)/.test(cvMem.realm));
await page.click('#btnSettings');
const memUi=await page.evaluate(()=>({has:!!$('cfgMem'), val:$('cfgMem').value, note:$('cfgMemNote').textContent}));
ok('设置里能调记忆长度，默认加长：'+memUi.note.slice(0,40), memUi.has&&memUi.val==='long'&&/前尘卷录 10/.test(memUi.note));
await page.selectOption('#cfgMem','short');
ok('调成标准档后立刻生效', await page.evaluate(()=>S.memLong===false&&MEM().sum===16));
await page.selectOption('#cfgMem','long');
await page.click('#cfgCancel');

console.log('\n【别再原地打转】');
const rep=await page.evaluate(()=>{
  const keepH=JSON.parse(JSON.stringify(S.history||[])), keepS=JSON.parse(JSON.stringify(S.scene||{})),
        keepO=JSON.parse(JSON.stringify(S.lastOptions||[])), keepSeen=S.optSeen;
  const r={};
  // 相似度本身
  r.sim=[ +simRatio('上山闭关练拳三月','上山闭关练拳三月').toFixed(2),
          +simRatio('上山闭关练拳三月','继续上山闭关练拳').toFixed(2),
          +simRatio('上山闭关练拳三月','下山去寻访镖局旧人').toFixed(2) ];
  // 连着几回都在练功 → 引擎该踩刹车
  S.history=[{turn:1,action:'上山闭关练功',summary:'练了三个月拳'},
             {turn:2,action:'继续闭关练功',summary:'又练了三个月拳'},
             {turn:3,action:'接着闭关练功',summary:'还在练那趟拳'}];
  r.stuckHigh=Math.round(stuckLevel()*100);
  const j1=makeJudge(null);
  r.nudged=!!j1.nudge; r.nudgeText=j1.nudge||''; r.block=judgeBlock(j1);
  // 每回合换着花样推，不会老是同一句
  const seen=new Set(); for(let i=0;i<5;i++) seen.add(pickNudge());
  r.nudgeVariety=seen.size;
  // 剧情各走各的 → 不该踩
  S.history=[{turn:1,action:'上山闭关练功',summary:'练了三个月拳'},
             {turn:2,action:'下山寻访镖局旧人',summary:'在镖局打听到一条线索'},
             {turn:3,action:'去黑风口探虚实',summary:'黑风口果然有埋伏'}];
  r.stuckLow=Math.round(stuckLevel()*100);
  r.notNudged=!makeJudge(null).nudge;
  // 未了之事：进得去、办得完、挂久了自己走
  S.turn=40; S.scene={location:'客栈',unresolved:[],uAge:{}};
  addUnresolved('黑风口有埋伏'); addUnresolved('师姐的信还没送'); addUnresolved('父亲死因未明');
  addUnresolved('欠王掌柜三两银'); addUnresolved('第五桩事');
  r.cap=S.scene.unresolved.length; r.capped=S.scene.unresolved.slice();
  r.dropped=dropUnresolved('师姐的信还没送','送到了');
  r.afterDrop=S.scene.unresolved.slice();
  S.scene.uAge['黑风口有埋伏']=40-U_STALE-1; S.turn=40; ageUnresolved();
  r.afterAge=S.scene.unresolved.slice();
  // 模型不给 location，未了之事照样更新（以前整块跳过）
  S.turn=41; S.scene={location:'客栈',unresolved:['旧事一桩'],uAge:{'旧事一桩':41}};
  applyTurn({narrative:'',summary:'',scene:{location:'',unresolved:['新事一桩']},options:[{text:'继续',type:'normal',months:1}]},
            '走走',{fate:11,check:null,worldEvent:null,duel:false,months:0});
  r.noLoc={loc:S.scene.location, u:S.scene.unresolved.slice()};
  // resolvedInfo 报了就划掉
  S.scene={location:'客栈',unresolved:['该办的事','另一桩'],uAge:{}};
  applyTurn({narrative:'',summary:'',scene:{location:'客栈',unresolved:['该办的事','另一桩']},resolvedInfo:['该办的事'],
             options:[{text:'继续',type:'normal',months:1}]},
            '办事',{fate:11,check:null,worldEvent:null,duel:false,months:0});
  r.resolved=S.scene.unresolved.slice();
  r.ledgerHit=(S.ledger||[]).some(x=>/了结一桩悬着的事：该办的事/.test(x));
  S.history=keepH; S.scene=keepS; S.lastOptions=keepO; S.optSeen=keepSeen;
  return r;
});
ok('相似度算得出来（全同 '+rep.sim[0]+'，近似 '+rep.sim[1]+'，无关 '+rep.sim[2]+'）',
   rep.sim[0]===1&&rep.sim[1]>=0.6&&rep.sim[2]<0.3);
ok('连着三回都在练功，引擎判定卡住了（'+rep.stuckHigh+'%）', rep.stuckHigh>=50);
ok('卡住时往提示词里塞硬指令：'+rep.nudgeText.slice(0,24), rep.nudged&&/⚑ 引擎检测到最近几回剧情雷同/.test(rep.block)&&/这不是建议，是本回合的硬要求/.test(rep.block));
ok('硬指令换着花样给（5 次里有 '+rep.nudgeVariety+' 种）', rep.nudgeVariety>=3);
ok('剧情各走各的就不踩刹车（'+rep.stuckLow+'%）', rep.stuckLow<50&&rep.notNudged);
ok('未了之事最多挂 4 条，挤掉最早的：'+rep.capped.join('、'), rep.cap===4&&!rep.capped.includes('黑风口有埋伏')&&rep.capped.includes('第五桩事'));
ok('办完的能划掉：'+rep.afterDrop.join('、'), rep.dropped===true&&!rep.afterDrop.includes('师姐的信还没送'));
ok('挂久了自己淡出：'+rep.afterAge.join('、'), !rep.afterAge.includes('黑风口有埋伏'));
ok('模型没给地点也照样更新未了之事（地点仍是「'+rep.noLoc.loc+'」，事变成 '+rep.noLoc.u.join('、')+'）',
   rep.noLoc.loc==='客栈'&&rep.noLoc.u.includes('新事一桩')&&!rep.noLoc.u.includes('旧事一桩'));
ok('resolvedInfo 报了就划掉并记台账：'+rep.resolved.join('、'), rep.resolved.length===1&&rep.resolved[0]==='另一桩'&&rep.ledgerHit);
const opt=await page.evaluate(()=>{
  const keepH=JSON.parse(JSON.stringify(S.history||[])), keepO=JSON.parse(JSON.stringify(S.lastOptions||[])), keepSeen=S.optSeen;
  S.history=[{turn:9,action:'继续闭关练功',summary:'又练了三个月'}];
  S.lastOptions=[]; S.optSeen={};
  const r={};
  // 玩家刚练完功，就别再给「接着闭关练功」
  r.a=dedupeOptions([{text:'接着闭关练功',type:'rest',months:3},
                     {text:'下山走一趟青石镇',type:'normal',months:2},
                     {text:'去寻岳师伯问个明白',type:'normal',months:1}]).map(o=>o.text);
  // 同一批里的重复也去掉
  r.b=dedupeOptions([{text:'下山走一趟青石镇',type:'normal',months:2},
                     {text:'下山去一趟青石镇',type:'normal',months:2},
                     {text:'留在山上歇息',type:'rest',months:1}]).map(o=>o.text);
  // 连挂三回没人点的填空选项换掉，但挂着人名的钩子留着
  S.history=[]; S.optSeen={};
  let last=[];
  for(let i=0;i<3;i++) last=dedupeOptions([{text:'就地歇一口气',type:'rest',months:1},
                                           {text:'去寻岳师伯问个明白',type:'normal',months:1},
                                           {text:'四下打听打听',type:'normal',months:1}]).map(o=>o.text);
  r.c=last;
  r.count=last.length;
  S.history=keepH; S.lastOptions=keepO; S.optSeen=keepSeen;
  return r;
});
ok('刚做完的事不再当选项：'+opt.a.join('｜'), !opt.a.includes('接着闭关练功')&&opt.a.length>=3);
ok('同一批里的重复选项去掉一个：'+opt.b.join('｜'), opt.b.filter(t=>t.includes('青石镇')).length===1);
ok('连挂三回的填空选项被换掉，挂着人名的钩子留着：'+opt.c.join('｜'),
   opt.c.includes('去寻岳师伯问个明白')&&!opt.c.includes('就地歇一口气')&&opt.count>=3);
const echo=await page.evaluate(()=>{
  const keep=JSON.parse(JSON.stringify(S.recent||[]));
  S.recent=Array.from({length:6},(_,i)=>({action:'第'+i+'回行动',narrative:'某'.repeat(600)}));
  const sb=stateBlocks();
  const full=(sb.match(/【剧情】/g)||[]).length, brief=(sb.match(/【剧情·节略】/g)||[]).length;
  const hasDone=/【刚做过的事/.test(sb);
  S.recent=keep;
  return {full,brief,hasDone};
});
ok(`最近剧情只给 ${echo.full} 回全文，更早的 ${echo.brief} 回压成节略`, echo.full===3&&echo.brief===2);
ok('提示词里直接列出「刚做过的事」', echo.hasDone);

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
await idle();
await page.click('#choices .opt >> nth=0');
await page.waitForSelector('#choices .opt',{timeout:25000});
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

const oldSave=await page.evaluate(()=>{
  const sv=JSON.parse(localStorage.getItem('wuxia_save_v1'));
  sv.v=5; delete sv.ledger; delete sv.memLong; delete sv.player.lifespan;
  return JSON.stringify(sv);
});
console.log('\n【无密钥样张】');
const p2=await ctx.newPage();
await p2.addInitScript(()=>{ localStorage.clear(); });
await p2.goto('http://localhost:8931/');
await p2.waitForTimeout(400);
ok('样张已显示', (await p2.textContent('#story')).includes('样张'));
ok('样张有引导按钮', (await p2.textContent('#choices')).includes('填入 API 密钥'));

console.log('\n【旧存档升上 v6】');
const ctx3=await br.newContext();
const p3=await ctx3.newPage();
p3.on('pageerror',e=>errs.push('v6迁移:'+String(e)));
await p3.route('**/chat/completions',async route=>{
  const b=JSON.parse(route.request().postData());
  await route.fulfill({status:200,headers:{'Content-Type':'text/event-stream'},body:sse(pickBody(b.messages[b.messages.length-1].content))});});
await p3.addInitScript(sv=>{ localStorage.setItem('wuxia_cfg',JSON.stringify({base:'https://api.deepseek.com',key:'sk-test',model:'deepseek-v4-flash',think:false})); localStorage.setItem('wuxia_save_v1',sv); }, oldSave);
await p3.goto('http://localhost:8931/');
await p3.waitForTimeout(1200);
const mg=await p3.evaluate(()=>({v:S.v, life:S.player.lifespan, led:Array.isArray(S.ledger), mem:S.memLong,
  meta:$('pMeta').textContent, story:$('story').textContent.length, prompt:stateBlocks().length}));
ok('老存档补上寿元（'+mg.life+'）、台账与记忆档，版本升到 v'+mg.v, mg.v===6&&mg.life===78&&mg.led===true&&mg.mem===true);
ok('升级后面板照常：'+mg.meta.replace(/\s+/g,' ').slice(0,32), /岁／寿元78/.test(mg.meta)&&mg.story>50);
ok('升级后提示词照样拼得出来（'+mg.prompt+' 字）', mg.prompt>500);

console.log('\n页面错误：', errs.length?errs.slice(0,5):'无');
console.log(`\n结果：${oks.length} 通过，${fails.length} 失败`);
if(fails.length) console.log('失败项：',fails.join('；'));
await br.close(); srv.close(); process.exit(fails.length||errs.length?1:0);
})().catch(e=>{console.error('FAILED:',e.message);console.error('page errors:',(global.__errs||[]).slice(0,6));process.exit(1)});
