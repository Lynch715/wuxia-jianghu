// 提示词体积与缓存命中自测：把一局养到第 116 回合的规模，量回合/对话/比武余波的输入字数，
// 并比对连续两次调用的公共开头（DeepSeek 按开头相同的部分走缓存）。
// 用法：node test/prompt-size.js            （量当前 index.html，并检查要求一条没少）
//       HTML=别的文件 node test/prompt-size.js （量别的版本，只出数字）
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const {pickBody,sse}=require('./mock');
const fails=[],oks=[]; const ok=(n,c)=>{ (c?oks:fails).push(n); console.log((c?'  ✓ ':'  ✗ ')+n); };
(async()=>{
const file=process.env.HTML?path.resolve(process.env.HTML):path.join(__dirname,'..','index.html');
const html=fs.readFileSync(file);
const srv=http.createServer((q,r)=>{ r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); r.end(html); }).listen(8962);
const exe=process.env.PW_CHROME||undefined;
const br=await chromium.launch(exe?{executablePath:exe}:{});
const page=await (await br.newContext()).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.route('**/chat/completions',async route=>{ const b=JSON.parse(route.request().postData()); await route.fulfill({status:200,headers:{'Content-Type':'text/event-stream'},body:sse(pickBody(b.messages[b.messages.length-1].content))}); });
await page.addInitScript(()=>{ localStorage.setItem('wuxia_cfg',JSON.stringify({base:'https://api.deepseek.com',key:'sk-test',model:'deepseek-v4-flash',think:false})); });
await page.goto('http://localhost:8962/'); await page.click('#crStart'); await page.waitForSelector('#choices .opt',{timeout:25000});
const r=await page.evaluate(()=>{
  let seed=1; const zh=n=>{ const t='江湖夜雨十年灯桃李春风一杯酒长剑在手明月照人归去来兮天涯路远'; let o=''; for(let i=0;i<n;i++){ seed=(seed*16807)%2147483647; o+=t[seed%t.length]; } return o; };
  const names='赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳'.split('');
  S.turn=116;
  for(let i=0;i<60;i++) S.npcs.push({name:names[i]+'青'+'崖峰岳'.charAt(i%3),gender:i%2?'女':'男',age:20+i%40,identity:'某派第'+i+'代弟子',faction:'华山派',alignment:'正派',personality:['豪爽','多疑'],appearance:zh(40),武功:30+i,谈吐:40,signature:'某某剑法',relation:'旧识',好感度:20,爱恋值:null,mood:'平静',alive:i<50,secret:zh(30),notes:zh(60),location:'洛阳',memory:Array.from({length:8},()=>zh(35)),lastSeen:i<16?112:90});
  ensureRoster(S);
  S.scene.present=[S.npcs[3].name,S.npcs[4].name];
  S.history=Array.from({length:35},(_,k)=>({turn:81+k,action:zh(14),summary:zh(28)}));
  S.volumes=Array.from({length:10},(_,k)=>({from:k*8+1,to:k*8+8,text:zh(180)}));
  S.recent=Array.from({length:5},()=>({action:zh(14),narrative:zh(480)}));
  S.ledger=Array.from({length:80},()=>zh(30));
  S.facts=Array.from({length:40},()=>({turn:50,text:zh(30)}));
  S.quests=Array.from({length:6},()=>({title:zh(6),desc:zh(30),status:'进行中',progress:40}));
  S.player.arts=Array.from({length:8},(_,k)=>({name:'掌法'+k,desc:zh(20),style:'刚猛',level:50}));
  for(const c of Object.keys(S.player.items)) S.player.items[c]=Array.from({length:4},()=>({name:zh(4),desc:zh(20)}));
  S.player.backstory=zh(200);
  const w=worldState(); while(w.ranking.length<10)w.ranking.push({name:zh(3),faction:'散人',武功:80});
  for(let k=0;k<12;k++)w.threads.push({id:'e'+(100+k),title:zh(8),text:zh(40),stage:k<8?'发生':'结束',cause:zh(20),actors:[],location:'洛阳',result:k<8?'':zh(20)});
  const sys=(typeof styleSystem==='function'?styleSystem():STYLE_SYSTEM);
  const pre=(a,b)=>{ let i=0; while(i<a.length&&i<b.length&&a[i]===b[i])i++; return i; };
  const judge={fate:10,check:null,months:1};
  const t1=turnPrompt('即日动身回孟津渡口，赴陆青崖召见',judge);
  // 下一回合：时间走了、多一段剧情、多一条提要和台账、在场的人换了
  S.turn++; S.date=S.date+'后'; S.recent.push({action:zh(14),narrative:zh(480)}); S.history.push({turn:117,action:zh(14),summary:zh(28)}); ledger(zh(30)); S.npcs.push(normNpc({name:'新来的甲',gender:'男',identity:'过路镖师',relation:'萍水相逢',secret:'欠了赌债'})); S.npcs[S.npcs.length-1].met=true; S.scene.present=[S.npcs[5].name];
  const t2=turnPrompt('在渡口打听陆青崖的下落',{fate:4,check:null,months:1});
  convo={npc:S.npcs[5],msgs:Array.from({length:10},(_,k)=>({role:k%2?'npc':'me',text:zh(80)}))};
  const c1=convoPrompt(S.npcs[5],'你说的那桩旧事，到底是怎么回事？',10,null);
  convo.msgs.push({role:'me',text:zh(20)},{role:'npc',text:zh(80)}); S.npcs[5].mood='恼怒'; S.npcs[5]['好感度']+=3;
  const c2=convoPrompt(S.npcs[5],'那我再问一句。',6,null);
  const duel={opp:S.npcs[5],log:Array.from({length:8},()=>({plain:zh(40)})),resultText:'主角胜'};
  const d1=duelAftermathPrompt('与人比武',{fate:10,check:null,months:1,duel:true},duel);
  const stableEnd=t2.indexOf('- 新来的甲（'); return {duelCache:sys.length+pre(t2,d1),stableEnd,brk:t2.slice(pre(t1,t2),pre(t1,t2)+30),sys:sys.length,t1:t1.length,t2:t2.length,turnCache:sys.length+pre(t1,t2),c1:c1.length,convoCache:sys.length+pre(c1,c2),d1:d1.length,t2txt:t2,c2txt:c2,d1txt:d1,
    present:S.npcs[5].name,away:S.npcs[6].name,awaySecret:S.npcs[6].secret,presentSecret:S.npcs[5].secret};
});
const row=(k,v)=>console.log(String(v).padStart(7)+'  '+k);
console.log('\n【体积（字）】'+path.basename(file));
row('system',r.sys); row('普通回合 输入',r.t1); row('  其中两回合之间开头相同、可走缓存',r.turnCache+'（'+Math.round(r.turnCache/(r.sys+r.t2)*100)+'%）');
row('对话 每句输入',r.c1); row('  其中同一场对话里可走缓存',r.convoCache+'（'+Math.round(r.convoCache/(r.sys+r.c1)*100)+'%）');
row('比武余波 输入',r.d1); row('  其中与上一回合开头相同、可走缓存',r.duelCache+'（'+Math.round(r.duelCache/(r.sys+r.d1)*100)+'%）'); console.log('  （两回合之间缓存断在：'+r.brk+'……）');
if(!process.env.HTML){
  console.log('\n【要求一条没少】');
  const t=r.t2txt;
  for(const k of ['回合通则','剧情250-500字','options给3至5个','至少1个有风险的check','【本回合必守','secret必填','NPC对象格式','输出格式：','"worldUpdates"','你必须只输出一个合法的JSON对象','【玩家本回合行动】在渡口打听','【本回合引擎判定','【主角面板】','【眼下要紧的人】','【前尘卷录','【前情提要】','【最近剧情原文】','【已成定局的旧事','【主角身世】','【江湖格局】','【当前江湖事件'])
    ok('回合提示词含「'+k+'」', t.includes(k));
  ok('在场的人给全（带画像与秘密）', t.includes('"name":"'+r.present+'"')&&t.includes(r.presentSecret));
  ok('名册里有不在场的人和他的秘密', t.includes('- '+r.away+'（')&&t.includes(r.awaySecret));
  ok('名册在缓存段：新人加在末尾，前面一字不动', r.turnCache-r.sys>=r.stableEnd);
  ok('对话也带名册', r.c2txt.includes('【人物名册')&&r.c2txt.indexOf('【人物名册')<r.c2txt.indexOf('你现在扮演'));
  ok('要求在前、本回合行动在后', t.indexOf('回合通则')<t.indexOf('【当前时间】')&&t.indexOf('【当前时间】')<t.indexOf('【玩家本回合行动】'));
  ok('末尾是本回合必守', /字段按开头的输出格式。$/.test(t)&&t.lastIndexOf('【本回合必守')>t.indexOf('【玩家本回合行动】'));
  
  ok('比武余波接得上上一回合的缓存', r.duelCache-r.sys>=r.stableEnd);
  const c=r.c2txt;
  for(const k of ['规则：','effects','输出：{"reply"','你必须只输出一个合法的JSON对象','【对话至今】','【主角这一句/这一举动】那我再问一句','【引擎掷骰】']) ok('对话提示词含「'+k+'」', c.includes(k));
  ok('对话规则在资料之前', c.indexOf('规则：')<c.indexOf('的资料】'));
  const d=r.d1txt;
  for(const k of ['请把这场比武写成','输出格式同开头的回合格式','【比武实录','【比武结果】','【主角面板】']) ok('比武余波含「'+k+'」', d.includes(k));
  ok('页面无报错'+(errs.length?'：'+errs.join(' | '):''), errs.length===0);
  console.log(`\n结果：${oks.length} 通过，${fails.length} 失败`); if(fails.length) console.log('失败项：'+fails.join('；'));
}
srv.close(); await br.close(); process.exit(fails.length?1:0);
})().catch(e=>{ console.error('FAILED:',e.message); process.exit(1); });
