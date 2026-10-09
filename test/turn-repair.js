// 回合校验自测：小毛病引擎就地纠正；正文与引擎对不上走局部修复；结算坏了只补账；只有没正文才整回重写
// 用法：node test/turn-repair.js（本机）
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const {pickBody,sse}=require('./mock');
const fails=[],oks=[];
const ok=(n,c)=>{ (c?oks:fails).push(n); console.log((c?'  ✓ ':'  ✗ ')+n); };
const rawSSE=s=>{ const out=[]; for(let i=0;i<s.length;i+=300) out.push('data: '+JSON.stringify({choices:[{delta:{content:s.slice(i,i+300)}}]})+'\n\n'); return out.join('')+'data: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n'; };
(async()=>{
const html=fs.readFileSync(path.join(__dirname,'..','index.html'));
const srv=http.createServer((q,r)=>{ r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); r.end(html); }).listen(8951);
const exe=process.env.PW_CHROME||undefined;
const br=await chromium.launch(exe?{executablePath:exe}:{});
const page=await (await br.newContext({viewport:{width:1300,height:850}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
let mode=null, turnCalls=0, convoCalls=0, prompts=[];
const SSE=body=>({status:200,headers:{'Content-Type':'text/event-stream'},body});
await page.route('**/chat/completions',async route=>{
  const b=JSON.parse(route.request().postData()); const prompt=b.messages[b.messages.length-1].content;
  const isConvo=prompt.includes('你现在扮演武侠世界中的人物');
  const isTurn=!isConvo&&!prompt.includes('现在请生成一位主角并开局')&&!prompt.includes('请为这个武侠世界铸造当世格局')&&!prompt.includes('经历流水账');
  if(isConvo){ convoCalls++; if(mode==='chat') return route.fulfill(SSE(sse({reply:'（他笑了笑）「今天天气不坏。」',mood:'平静',favor:1,attempt:null,effects:null,summary:'闲聊了几句'}))); }
  if(isTurn&&mode){ turnCalls++; prompts.push(prompt);
    if(mode==='fill'){
      if(turnCalls===1) return route.fulfill(SSE(rawSSE('{"narrative":"第一版：李昭在渡口坐了半日，看船来船往。傍晚有个老艄公递给他一包碎银，说是故人托付的，足有二十两。","options":[}}}')));
      const body=pickBody(prompt); body.narrative=''; body.playerChanges=Object.assign({},body.playerChanges,{money:20}); return route.fulfill(SSE(sse(body)));
    }
    if(mode==='repair'){
      if(turnCalls===1){ const body=pickBody(prompt); body.narrative='第一版：李昭身中数刀，倒在血泊里，再没起来。'; body.gameOver=true; body.ending='死于乱刀'; return route.fulfill(SSE(sse(body))); }
      return route.fulfill(SSE(sse({narrative:'改好的：李昭身中数刀倒地，被路过的郎中拖回草庐，捡回一条命。'})));
    }
    if(mode==='checkhard'){ const body=pickBody(prompt); body.narrative=turnCalls===2?'改了一半：掌柜还是被他说动了。':'掌柜被他三言两语说动，当场拿出五十两。'; body.check={attr:'谈吐',success:true}; body.playerChanges=Object.assign({},body.playerChanges,{money:50}); return route.fulfill(SSE(sse(body))); }
    if(mode==='nonarr') return route.fulfill(SSE(rawSSE('{"summary":"啥也没写"}')));
  }
  await route.fulfill(SSE(sse(pickBody(prompt))));
});
await page.addInitScript(()=>{ localStorage.setItem('wuxia_cfg',JSON.stringify({base:'https://api.deepseek.com',key:'sk-test',model:'deepseek-v4-flash',think:false})); });
await page.goto('http://localhost:8951/');
await page.click('#crStart');
await page.waitForSelector('#choices .opt',{timeout:25000});

console.log('\n【小毛病就地纠正】');
const r=await page.evaluate(()=>{
  const st=JSON.parse(JSON.stringify(S)); const out={};
  const base=()=>({narrative:'李昭一路往东，走了七八日，到了孟津渡口。',summary:'赶路',playerChanges:{},options:[{text:'歇脚',type:'normal'}]});
  const run=(d,judge,vo)=>{ try{ const x=validateTurn(d,'即日动身回孟津渡口',judge||{fate:10},st,vo); return {ok:true,d:x,fixes:x._fixes||[]}; }catch(e){ return {ok:false,msg:e.message,repair:!!e.repair,conflicts:e.conflicts||[],hard:!!e.hard}; } };
  let x=run(Object.assign(base(),{scene:{location:'孟津渡'}}),{fate:10,destination:'孟津渡口'}); out.dest=x.ok&&x.d.scene.location==='孟津渡口';
  x=run(Object.assign(base(),{narrative:'李昭一路往东，走了七八日，到了洛阳城。'}),{fate:10,destination:'孟津渡口'}); out.destNar=!x.ok&&x.repair&&/孟津渡口/.test(x.conflicts.join());
  x=run(Object.assign(base(),{npcUpdates:[{name:'陆青崖',好感度:5},{name:'岳师伯',好感度:'+3'}]})); out.unknownNpc=x.ok&&x.d.npcUpdates.length===1&&x.d.npcUpdates[0].好感度===3;
  x=run(Object.assign(base(),{npcUpdates:[{name:'沈师姐姐',好感度:2}]})); out.fuzzy=x.ok&&x.d.npcUpdates[0].name==='沈师姐';
  x=run(Object.assign(base(),{options:[{text:'找陆青崖',type:'talk',target:'陆青崖'},{text:''}]})); out.opt=x.ok&&x.d.options.length===1&&x.d.options[0].target===null;
  x=run(Object.assign(base(),{newNpcs:[{name:'甲'},{name:'乙'},{name:'丙'}]})); out.limits=x.ok&&x.d.newNpcs.length===2;
  x=run({summary:'没正文'}); out.noNarr=!x.ok&&x.hard&&!x.repair;
  // 判定冲突
  x=run(Object.assign(base(),{check:{attr:'武功',need:40,success:true}}),{fate:10,check:{attr:'武功',need:90,success:false,total:30}}); out.contra=!x.ok&&x.repair&&/失败/.test(x.conflicts.join());
  x=run(Object.assign(base(),{check:{attr:'武功',need:40,success:true}}),{fate:10,check:{attr:'武功',need:90,success:false,total:30}},{acceptConflicts:true}); out.contraAccept=x.ok&&x.d.check.success===false;
  const tot=attrVal(st.player,'武功')+fdm().check+rollMod(10);
  x=run(Object.assign(base(),{check:{attr:'武功',need:tot+20,success:true}})); out.selfNoBend=!x.ok&&x.repair&&x.conflicts[0].includes('难度'+(tot+20));
  x=run(Object.assign(base(),{check:{attr:'武功',need:tot+20,success:true}}),null,{acceptConflicts:true}); out.selfAccept=x.ok&&x.d.check.need===tot+20&&x.d.check.success===false;
  x=run(Object.assign(base(),{gameOver:true})); out.death=!x.ok&&x.repair;
  x=run(Object.assign(base(),{check:{attr:'武功',success:true},playerChanges:{money:50,attributes:{武功:2},itemsAdd:{其他:[{name:'玉佩'}]}}}),{fate:10,check:{attr:'武功',need:90,success:false,total:30}},{acceptConflicts:true});
  out.strip=x.ok&&x.d.playerChanges.money===0&&!x.d.playerChanges.attributes.武功&&!Object.keys(x.d.playerChanges.itemsAdd).length;
  x=run(Object.assign(base(),{check:null}),{fate:10,check:{attr:'武功',need:90,success:false,total:30}}); out.noEcho=x.ok&&x.d.check.success===false&&x.fixes.some(t=>/没回填/.test(t));
  { const nm0=st.npcs[0].name;
    x=run(Object.assign(base(),{newNpcs:[{name:nm0+'姐',gender:'女',identity:'冒名的'},{name:'过路客',gender:'男',identity:'镖师',secret:'有赌债'}]}));
    out.dupNew=x.ok&&x.d.newNpcs.length===1&&x.d.newNpcs[0].name==='过路客';
    const dead=JSON.parse(JSON.stringify(st)); dead.npcs[1].alive=false; const dn=dead.npcs[1].name;
    try{ const y=validateTurn(Object.assign(base(),{newNpcs:[{name:dn,gender:'男'}]}),'走走',{fate:10},dead); out.deadNew=y.newNpcs.length===0; }catch(e){ out.deadNew=false; }
    x=run(Object.assign(base(),{newNpcs:[]}),{fate:10}); 
    try{ const y=validateTurn(base(),'（我那失散的妹妹，名叫苏小婉，找来了）',{fate:10},st); out.playerNpc=y.newNpcs.some(n=>n.name==='苏小婉'); }catch(e){ out.playerNpc=false; } }
  { const S0=S; S=JSON.parse(JSON.stringify(st)); const n=S.npcs[0]; n.alive=true; n.notes='与主角有杀父之仇'; n.identity='华山掌门'; n.memory=[]; n.past=[];
    const L0=(S.ledger||[]).length;
    applyTurn({narrative:'x',summary:'x',npcUpdates:[{name:n.name,notes:'近来心情不好',identity:'华山派太上长老',好感度:90,武功:30}],playerChanges:{artsAdd:[{name:'天外飞仙',style:'绝学',level:99},{name:'第二门',style:'刚猛',level:20}],itemsAdd:{其他:[{name:'甲'},{name:'乙'},{name:'丙'},{name:'丁'}],武器:[]}}},'走走',{fate:10,months:1});
    out.notesKeep=/杀父之仇/.test(n.notes)&&/心情不好/.test(n.notes);
    out.identLedger=S.ledger.slice(L0).some(t=>/身份：华山掌门 → 华山派太上长老/.test(t));
    out.capFavor=n['好感度']<=Math.min(100,st.npcs[0]['好感度']+50);
    out.capWu=n['武功']<=clampW(st.npcs[0]['武功']+5);
    const a=S.player.arts.find(x=>x.name==='天外飞仙'); out.capArt=!!a&&a.level<=35&&!S.player.arts.find(x=>x.name==='第二门');
    out.capItems=(S.player.items['其他']||[]).filter(x=>['甲','乙','丙','丁'].includes(x.name)).length===3;
    for(let i=0;i<10;i++) pushMemory(n,'第'+i+'件事'); out.past=n.memory.length===MEM().npcMem&&n.past.length===2&&n.past[0]==='第0件事';
    S=S0; }
  { const S0=S; S=st; const t=turnPrompt('试着说服掌柜',{fate:10,months:0,check:{attr:'谈吐',val:40,roll:10,mod:-2,total:38,need:70,success:false}}); S=S0;
    out.mustKeep=t.lastIndexOf('【本回合必守')>t.indexOf('【玩家本回合行动】')&&t.includes('照抄：{"attr":"谈吐","success":false}')&&t.includes('不许把主角写死'); }
  { const S0=S; S=st; const n=st.npcs[0]; const t2=attrVal(st.player,'谈吐')+fdm().check+rollMod(10);
    const v=(d,o)=>{ try{ return validateConvo(d,n,10,o); }catch(e){ return {err:e.message,repair:!!e.repair}; } };
    let c=v({reply:'好说。',attempt:{attr:'谈吐',need:t2+15,success:true}}); out.convoRepair=!!c.repair;
    c=v({reply:'好说。',attempt:{attr:'谈吐',need:t2+15,success:true}},{accept:true}); out.convoAccept=!c.err&&c.attempt.success===false&&c.attempt.need===t2+15;
    c=v({reply:'拿去。',effects:{money:'30两',give:{cat:'其他',name:'玉佩'}}}); out.convoFmt=!c.err&&c.effects.money===30&&Array.isArray(c.effects.give);
    c=v({reply:'罢了。',attempt:{type:'套话',attr:'口才',need:'很难'}}); out.convoFill=!c.err&&c.attempt.attr==='谈吐'&&c.attempt.need===85&&typeof c.attempt.success==='boolean';
    c=v({reply:'拿去吧。',attempt:{attr:'谈吐',need:t2+15,success:false},revealSecret:true,effects:{money:100,give:[{cat:'其他',name:'玉佩'}],vendetta:null}}); out.convoStrip=!c.err&&c.effects===null&&c.revealSecret===false;
    S=S0; }
  return out;
});
ok('行程终点「孟津渡」→ 改回「孟津渡口」', r.dest);
ok('正文压根没写到终点 → 交给局部修复', r.destNar);
ok('不认得的人物更新丢掉，「+3」转成数字', r.unknownNpc);
ok('人名多写一字认回「沈师姐」', r.fuzzy);
ok('选项指向不存在的人 → 去掉指向；空选项丢掉', r.opt);
ok('新人超过两名只留前两名', r.limits);
ok('没有正文 → 整回重写', r.noNarr);
ok('回填的判定与引擎相反 → 局部修复', r.contra);
ok('修复不成时以引擎结果为准', r.contraAccept);
ok('自拟判定算错 → 不挪难度，交给局部修复', r.selfNoBend);
ok('修复不成时难度不动、按引擎算成败', r.selfAccept);
ok('不允许时写死主角 → 局部修复', r.death);
ok('对话判定算错 → 局部修复', r.convoRepair);
ok('对话修复不成时按引擎算成败、难度不动', r.convoAccept);
ok('对话 effects「30两」转数、单件礼物包成数组', r.convoFmt);
ok('判定失败却写成办成、修不好时：正向收益收回', r.strip);
ok('模型没回填判定：按引擎结果记，不打回', r.noEcho);
ok('末尾有本回合必守，判定要照抄', r.mustKeep);
ok('对话判定属性难度填坏：引擎按类型补上（套话→谈吐/85）', r.convoFill);
ok('对话判失败：给钱给物清掉，秘密不算吐露', r.convoStrip);
ok('新人和名册里的人只差一字：不另建档', r.dupNew);
ok('新人借了死人的名字：不建档', r.deadNew);
ok('玩家写的「名叫苏小婉」模型没入档：引擎补上', r.playerNpc);
ok('备注追加不覆盖（杀父之仇还在）', r.notesKeep);
ok('身份变化记进台账', r.identLedger);
ok('NPC 好感单次最多 ±50', r.capFavor);
ok('NPC 武功单次最多 +5', r.capWu);
ok('新武学熟练度封顶 35、一回合只收一门', r.capArt);
ok('一回合新物品至多 3 件', r.capItems);
ok('往来第 9 条起旧的挪进旧往来', r.past);

const step=async(m)=>{ mode=m; turnCalls=0; prompts=[]; await page.click('#choices .opt'); await page.waitForFunction(()=>!busy,null,{timeout:30000}); mode=null;
  return page.evaluate(()=>({turn:S.turn,money:S.player.money,over:!!S.over,story:document.querySelector('#story .chapter:last-child').textContent,toast:document.getElementById('toast').textContent})); };

console.log('\n【结算坏了、正文好的：只补账】');
let b0=await page.evaluate(()=>({turn:S.turn,money:S.player.money}));
let a=await step('fill');
ok(`调用 ${turnCalls} 次（首发 + 补账）`, turnCalls===2);
ok('补账请求带着第一版正文、要求别改', prompts[1]&&prompts[1].includes('这一回的正文已经写好，不要改动')&&prompts[1].includes('第一版：李昭在渡口'));
ok('正文用的是第一版', a.story.includes('第一版：李昭在渡口坐了半日'));
ok('正文里的二十两也落了账：'+b0.money+' → '+a.money, a.money>=b0.money+20-50);
ok('回合推进 '+b0.turn+' → '+a.turn, a.turn===b0.turn+1);

console.log('\n【正文和引擎对不上：局部修复】');
b0=await page.evaluate(()=>S.turn);
a=await step('repair');
ok(`调用 ${turnCalls} 次（首发 + 修复）`, turnCalls===2);
ok('修复请求带着第一版正文和冲突', prompts[1]&&prompts[1].includes('【与引擎对不上的地方】')&&prompts[1].includes('第一版：李昭身中数刀'));
ok('正文换成了改好的', a.story.includes('改好的：李昭身中数刀倒地'));
ok('主角没死、回合照常推进', !a.over&&a.turn===b0+1);

console.log('\n【判定失败却硬写成办成：修两次 → 以引擎为准】');
b0=await page.evaluate(()=>({turn:S.turn,money:S.player.money}));
mode='checkhard'; turnCalls=0; prompts=[];
await page.evaluate(()=>{ const a=S.player.attributes['谈吐']; runTurn('试着说服掌柜借钱',{fate:10,months:0,worldEvent:null,check:{attr:'谈吐',val:a,roll:10,mod:-2,total:a-2,need:99,success:false}},{}); });
await page.waitForTimeout(300); await page.waitForFunction(()=>!busy,null,{timeout:30000}); mode=null;
a=await page.evaluate(()=>({turn:S.turn,money:S.player.money}));
ok(`调用 ${turnCalls} 次（首发 + 两次局部修复，不整回重写）`, turnCalls===3&&prompts[2].includes('【与引擎对不上的地方】'));
ok('修复请求要求回填判定', prompts[1]&&prompts[1].includes('"check":{"attr":"谈吐"'));
ok('五十两没落账：'+b0.money+' → '+a.money, a.money<=b0.money);
ok('回合照常推进', a.turn===b0.turn+1);

console.log('\n【闲聊完不再多调一次余波】');
await page.evaluate(()=>openConvo(S.npcs.find(n=>n.alive)));
mode='chat'; convoCalls=0; turnCalls=0;
await page.fill('#convoText','今天天气如何？'); await page.click('#convoSend');
await page.waitForFunction(()=>!busy,null,{timeout:20000});
const tBefore=await page.evaluate(()=>S.turn);
let calls0=0; page.on('request',q=>{ if(q.url().includes('chat/completions')) calls0++; });
await page.click('#convoEnd'); await page.waitForTimeout(1500); mode=null;
ok('谈完没有再调模型', calls0===0);
ok('选项恢复了（'+await page.evaluate(()=>document.querySelectorAll('#choices .opt').length)+' 个）', await page.evaluate(()=>document.querySelectorAll('#choices .opt').length>=2));
ok('回合数没变', await page.evaluate(()=>S.turn)===tBefore);

console.log('\n【两次都没正文：报错带原因】');
a=await step('nonarr');
ok('失败提示写明原因：'+(a.story.match(/（此回推演失败：[^）]*）[^）]*）/)||[''])[0], a.story.includes('缺少剧情正文'));
ok('有重试按钮', await page.evaluate(()=>[...document.querySelectorAll('#choices .opt')].some(b=>b.textContent.includes('重试'))));

console.log('\n【调试统计】');
const stt=await page.evaluate(()=>{ history.replaceState(null,'','?stats'); openSettings(); return {show:$('statsWrap').style.display,text:$('statsBody').textContent}; });
ok('?stats 时设置里显示统计：'+stt.text.split('\n')[0], stt.show==='block'&&/回合/.test(stt.text)&&/补账/.test(stt.text));

ok('页面无报错'+(errs.length?'：'+errs.join(' | '):''), errs.length===0);
console.log(`\n结果：${oks.length} 通过，${fails.length} 失败`); if(fails.length) console.log('失败项：'+fails.join('；'));
srv.close(); await br.close(); process.exit(fails.length?1:0);
})().catch(e=>{ console.error('FAILED:',e.message); process.exit(1); });
