// 文风自测：金庸档与改版前一字不差；其余九种只带自己那一段；换文风下一回合跟着变；老存档按金庸
// 用法：node test/style.js（本机）；对比改版前的提示词：OLD_HTML=路径 node test/style.js
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const {pickBody,sse}=require('./mock');
const fails=[],oks=[];
const ok=(n,c)=>{ (c?oks:fails).push(n); console.log((c?'  ✓ ':'  ✗ ')+n); };
function serve(file,port){ const html=fs.readFileSync(file); return http.createServer((q,r)=>{ r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); r.end(html); }).listen(port); }
async function open(br,port,reqs){
  const page=await (await br.newContext({viewport:{width:1300,height:850}})).newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
  await page.route('**/chat/completions',async route=>{
    const b=JSON.parse(route.request().postData()); reqs.push(b.messages);
    await route.fulfill({status:200,headers:{'Content-Type':'text/event-stream'},body:sse(pickBody(b.messages[b.messages.length-1].content))});
  });
  await page.addInitScript(()=>{ localStorage.setItem('wuxia_cfg',JSON.stringify({base:'https://api.deepseek.com',key:'sk-test',model:'deepseek-v4-flash',think:false})); });
  await page.goto('http://localhost:'+port+'/');
  await page.click('#crStart');
  await page.waitForSelector('#choices .opt',{timeout:25000});
  return {page,errs};
}
(async()=>{
const exe=process.env.PW_CHROME||undefined;
const br=await chromium.launch(exe?{executablePath:exe}:{});
const s1=serve(path.join(__dirname,'..','index.html'),8941);
const reqNew=[]; const {page,errs}=await open(br,8941,reqNew);

console.log('\n【金庸档：默认与改版前一致】');
const base=await page.evaluate(()=>({style:S.style,sys:styleSystem(),wr:worldRules(),wh:worldHead(),bio:bioPrompt('寿终'),STY:STYLE_SYSTEM}));
ok('新开局默认金庸', base.style==='jinyong');
ok('开局请求的 system 就是原来的 STYLE_SYSTEM', reqNew[0][0].content===base.STY);
ok('传记仍是「金庸后记般的白话」', base.bio.includes('请以金庸后记般的白话写一篇'));
ok('铁律文风句仍是金庸原句', base.wr.includes('- 文风：参考金庸小说的笔法——通俗流畅的白话')&&!base.wr.includes('{{STYLE}}'));
if(process.env.OLD_HTML){
  const s0=serve(process.env.OLD_HTML,8942); const reqOld=[]; const o=await open(br,8942,reqOld);
  const old=await o.page.evaluate(()=>({sys:STYLE_SYSTEM,wr:worldRules(),wh:worldHead()}));
  ok('system 与改版前一字不差', old.sys===base.sys);
  ok('世界观铁律与改版前一字不差', old.wr===base.wr);
  ok('对话抬头与改版前一字不差', old.wh===base.wh);
  s0.close();
}

console.log('\n【九种新文风】');
const all=await page.evaluate(()=>STYLE_IDS.filter(id=>id!=='jinyong').map(id=>{
  S.style=id; const w=WRITING_STYLES[id];
  const sys=styleSystem(), wr=worldRules(), wh=worldHead(), bio=bioPrompt('寿终');
  const others=STYLE_IDS.filter(x=>x!==id&&x!=='jinyong');
  return {id,label:w.label,
    sysHas: sys.includes(w.rule)&&sys.includes(w.sample)&&sys.includes('「」'),
    sysOnlyOne: others.every(x=>!sys.includes(WRITING_STYLES[x].rule)) && !sys.includes('笔法学金庸'),
    wrLine: wr.includes('- 文风：'+w.line)&&wh.includes('- 文风：'+w.line)&&!wr.includes('参考金庸小说'),
    bio: bio.includes(w.bio)&&!bio.includes('金庸后记'),
    len: sys.length};
}));
for(const r of all){
  ok(`${r.label}：system 带笔法与范例（${r.len} 字）`, r.sysHas);
  ok(`${r.label}：只带这一种文风`, r.sysOnlyOne);
  ok(`${r.label}：铁律与对话抬头的文风句已换`, r.wrLine);
  ok(`${r.label}：传记口吻已换`, r.bio);
}

console.log('\n【换文风，下一回合跟着变】');
await page.evaluate(()=>{ S.style='gulong'; });
const n0=reqNew.length;
await page.click('#choices .opt');
await page.waitForFunction(()=>!busy,null,{timeout:25000});
const turnReq=reqNew.slice(n0).find(m=>m[0].role==='system');
ok('下一回合 system 是古龙', !!turnReq && turnReq[0].content.includes('笔法学古龙'));
ok('下一回合铁律文风句是古龙', !!turnReq && turnReq[1].content.includes('文风学古龙'));

console.log('\n【卷录压缩不带文风】');
const fold=await page.evaluate(async()=>{ S.style='pingshu'; const before=S.history.length; return before; });
// 直接看 callLLM 的口子：plainStyle 时用原 system
const plain=await page.evaluate(()=>{ S.style='pingshu'; return foldHistoryInner.toString().includes('plainStyle:true'); });
ok('卷录压缩调用标了 plainStyle', plain);

console.log('\n【老存档】');
const oldSave=await page.evaluate(()=>{ delete S.style; return {id:styleId(), sys:styleSystem()===STYLE_SYSTEM}; });
ok('没有 style 字段按金庸走', oldSave.id==='jinyong'&&oldSave.sys);
const bad=await page.evaluate(()=>{ S.style='不存在'; return styleId(); });
ok('乱填的 style 也回落金庸', bad==='jinyong');

ok('页面无报错'+(errs.length?'：'+errs.join(' | '):''), errs.length===0);
console.log(`\n结果：${oks.length} 通过，${fails.length} 失败`); if(fails.length) console.log('失败项：'+fails.join('；'));
s1.close(); await br.close(); process.exit(fails.length?1:0);
})().catch(e=>{ console.error('FAILED:',e.message); process.exit(1); });
