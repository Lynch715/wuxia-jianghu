// 回合校验自测：小毛病引擎就地纠正、不退回；真错才重写；两次都坏时保底出剧情
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
let breakMode=null, turnCalls=0;
await page.route('**/chat/completions',async route=>{
  const b=JSON.parse(route.request().postData()); const prompt=b.messages[b.messages.length-1].content;
  const isTurn=!prompt.includes('现在请生成一位主角并开局')&&!prompt.includes('请为这个武侠世界铸造当世格局')&&!prompt.includes('经历流水账');
  if(isTurn&&breakMode){ turnCalls++;
    if(breakMode==='garbage') return route.fulfill({status:200,headers:{'Content-Type':'text/event-stream'},body:rawSSE('{"narrative":"李昭收拾行囊，天没亮就出了城。官道上尘土飞扬，他一路往东，走了七八日，终于望见渡口的旗子在风里晃。","options":[{"text":}}}]]]')});
    if(breakMode==='nonarr') return route.fulfill({status:200,headers:{'Content-Type':'text/event-stream'},body:rawSSE('{"summary":"啥也没写"}')});
  }
  await route.fulfill({status:200,headers:{'Content-Type':'text/event-stream'},body:sse(pickBody(prompt))});
});
await page.addInitScript(()=>{ localStorage.setItem('wuxia_cfg',JSON.stringify({base:'https://api.deepseek.com',key:'sk-test',model:'deepseek-v4-flash',think:false})); });
await page.goto('http://localhost:8951/');
await page.click('#crStart');
await page.waitForSelector('#choices .opt',{timeout:25000});

console.log('\n【小毛病就地纠正，不退回】');
const r=await page.evaluate(()=>{
  const st=JSON.parse(JSON.stringify(S)); const out={};
  const base=()=>({narrative:'李昭一路往东，走了七八日。',summary:'赶路',playerChanges:{},options:[{text:'歇脚',type:'normal'}]});
  const run=(d,judge)=>{ try{ const x=validateTurn(d,'即日动身回孟津渡口',judge||{fate:10},st); return {ok:true,d:x,fixes:x._fixes||[]}; }catch(e){ return {ok:false,msg:e.message,noSalvage:!!e.noSalvage}; } };
  let x=run(Object.assign(base(),{scene:{location:'孟津渡'}}),{fate:10,destination:'孟津渡口'});
  out.dest=x.ok&&x.d.scene.location==='孟津渡口';
  x=run(Object.assign(base(),{}),{fate:10,destination:'孟津渡口'}); out.destMissing=x.ok&&x.d.scene.location==='孟津渡口';
  x=run(Object.assign(base(),{npcUpdates:[{name:'陆青崖',好感度:5},{name:'岳师伯',好感度:'+3'}]}));
  out.unknownNpc=x.ok&&x.d.npcUpdates.length===1&&x.d.npcUpdates[0].好感度===3;
  x=run(Object.assign(base(),{npcUpdates:[{name:'沈师姐姐',好感度:2}]})); out.fuzzy=x.ok&&x.d.npcUpdates[0].name==='沈师姐';
  x=run(Object.assign(base(),{scene:{location:'城门客栈',present:['岳师伯','路人甲']}})); out.present=x.ok&&x.d.scene.present.join()==='岳师伯';
  x=run(Object.assign(base(),{duel:{opponent:'不存在的人'}})); out.duel=x.ok&&x.d.duel===null;
  x=run(Object.assign(base(),{options:[{text:'找陆青崖',type:'talk',target:'陆青崖'},{text:''}]})); out.opt=x.ok&&x.d.options.length===1&&x.d.options[0].target===null&&x.d.options[0].type==='normal';
  x=run(Object.assign(base(),{worldUpdates:[{id:'e999',text:'乱写的'}]})); out.wu=x.ok&&x.d.worldUpdates.length===0;
  x=run(Object.assign(base(),{newNpcs:[{name:'甲'},{name:'乙'},{name:'丙'}],newWorldEvents:[{title:'一事起',cause:'有因'},{title:'二事起来了',cause:'也有因'}]})); out.limits=x.ok&&x.d.newNpcs.length===2&&x.d.newWorldEvents.length===1;
  x=run({narrative:'李昭走了。',rumors:'一句风闻',playerChanges:{money:'二十两',attributes:{武功:'+2'}}}); out.coerce=x.ok&&x.d.summary&&x.d.rumors.length===1&&x.d.playerChanges.money===undefined&&x.d.playerChanges.attributes.武功===2;
  x=run({summary:'没正文'}); out.noNarr=!x.ok&&!x.noSalvage;
  x=run(Object.assign(base(),{check:{attr:'武功',need:40,success:true}}),{fate:10,check:{attr:'武功',need:90,success:false,total:30}}); out.contra=!x.ok&&x.noSalvage;
  x=run(Object.assign(base(),{gameOver:true})); out.death=!x.ok&&x.noSalvage;
  return out;
});
ok('行程终点写成「孟津渡」→ 改回「孟津渡口」', r.dest);
ok('没写终点 → 补上', r.destMissing);
ok('不认得的人物更新丢掉，「+3」转成数字', r.unknownNpc);
ok('人名多写一字认回「沈师姐」', r.fuzzy);
ok('在场名单去掉不认得的人', r.present);
ok('比武对手不存在 → 比武作废', r.duel);
ok('选项指向不存在的人 → 去掉指向改普通；空选项丢掉', r.opt);
ok('不存在的事件编号丢掉', r.wu);
ok('新人超过两名、新事件超过一件只留前面', r.limits);
ok('缺摘要补上、风闻字串转数组、「二十两」丢弃、「+2」转数', r.coerce);
ok('没有正文 → 仍退回重写', r.noNarr);
ok('成败与引擎相反 → 退回重写且不保底', r.contra);
ok('不允许时写死主角 → 退回重写且不保底', r.death);

console.log('\n【两次都坏：保底出剧情】');
const before=await page.evaluate(()=>({turn:S.turn,money:S.player.money}));
breakMode='garbage'; turnCalls=0;
await page.click('#choices .opt');
await page.waitForFunction(()=>!busy,null,{timeout:30000});
const after=await page.evaluate(()=>({turn:S.turn,story:document.querySelector('#story .chapter:last-child').textContent,opts:document.querySelectorAll('#choices .opt').length,toast:document.getElementById('toast').textContent}));
ok(`模型调用了 ${turnCalls} 次（首发+重写）`, turnCalls===2);
ok('回合照常推进：'+before.turn+' → '+after.turn, after.turn===before.turn+1);
ok('剧情正文显示出来了', after.story.includes('终于望见渡口的旗子'));
ok('没有「推演失败」', !after.story.includes('推演失败'));
ok('选项由引擎补上（'+after.opts+' 个）', after.opts>=2);
ok('提示玩家只留了剧情：'+after.toast, after.toast.includes('只留下了剧情'));

console.log('\n【两次都没正文：报错带原因】');
breakMode='nonarr'; turnCalls=0;
await page.click('#choices .opt');
await page.waitForFunction(()=>!busy,null,{timeout:30000});
const fail=await page.evaluate(()=>document.querySelector('#story .chapter:last-child').textContent);
ok('失败提示写明原因：'+(fail.match(/（此回推演失败：[^）]*）[^）]*）/)||[''])[0], fail.includes('缺少剧情正文'));
ok('有重试按钮', await page.evaluate(()=>[...document.querySelectorAll('#choices .opt')].some(b=>b.textContent.includes('重试'))));
breakMode=null;

ok('页面无报错'+(errs.length?'：'+errs.join(' | '):''), errs.length===0);
console.log(`\n结果：${oks.length} 通过，${fails.length} 失败`); if(fails.length) console.log('失败项：'+fails.join('；'));
srv.close(); await br.close(); process.exit(fails.length?1:0);
})().catch(e=>{ console.error('FAILED:',e.message); process.exit(1); });
