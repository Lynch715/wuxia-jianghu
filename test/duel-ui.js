// 自动比武按钮与读档：node test/duel-ui.js
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const {pickBody,sse}=require('./mock');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'));
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);});
const fails=[]; const ok=(n,c)=>{ if(!c) fails.push(n); console.log((c?'  ✓ ':'  ✗ ')+n); };
(async()=>{
srv.listen(8946);
const br=await chromium.launch(process.env.PW_CHROME?{executablePath:process.env.PW_CHROME}:{});
const ctx=await br.newContext({viewport:{width:1280,height:860}});
const page=await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.route('**/chat/completions',async route=>{ const b=JSON.parse(route.request().postData()); await route.fulfill({status:200,headers:{'Content-Type':'text/event-stream'},body:sse(pickBody(b.messages[b.messages.length-1].content))}); });
await page.addInitScript(()=>{localStorage.setItem('wuxia_cfg',JSON.stringify({base:'https://api.deepseek.com',key:'sk-test',model:'m',think:false}));});
await page.goto('http://localhost:8946/');
await page.click('#crStart'); await page.waitForSelector('#choices .opt',{timeout:20000});
const setup=async (w,extra)=>page.evaluate(([w,extra])=>{
  if(typeof duel!=='undefined'&&duel){ duelStop(); duel=null; S.duelState=null; }
  $('duelMask').classList.remove('on');
  const p=S.player; p.attributes['武功']=60; p.hp=100; p.arts=[{name:'回风剑',style:'刚猛',level:45},{name:'踏莎行',style:'身法',level:60}];
  let n=S.npcs.find(x=>x.name==='测试客'); if(!n){ n={name:'测试客',gender:'男',age:40,identity:'镖师',faction:'散人',alignment:'中立',personality:['沉稳'],'武功':w,'谈吐':40,signature:'开山刀',relation:'萍水相逢','好感度':40,alive:true,mood:'平静',memory:[],notes:''}; S.npcs.push(n); }
  n['武功']=w; n.alive=true; startDuel(n,Object.assign({reason:'试手'},extra||{}));
},[w,extra]);

console.log('【开打前】');
await setup(60);
ok('开打前没有脱身/认输，只有开打和速战', !!(await page.$('#duelStart'))&&!!(await page.$('#duelSkip'))&&!(await page.$('#duelFlee')));
ok('双方技能小印', (await page.$$('#fP .dchip')).length===2 && (await page.$$('#fO .dchip')).length>=1);

console.log('【速战】');
await page.click('#duelSkip');
await page.waitForSelector('#duelGo,#dSpare',{timeout:5000});
const r1=await page.evaluate(()=>({over:duel.over,res:duel.result,rounds:duel.round,rows:document.querySelectorAll('#duelLog .r[data-rn]').length}));
ok('速战直接出结果：'+JSON.stringify(r1), r1.over&&r1.rows===r1.rounds);

console.log('【换挡与中途速战】');
await setup(60);
await page.click('#duelStart'); await page.waitForTimeout(700);
await page.click('.dspeed button[data-s="fast"]');
ok('换到疾档并存档', await page.evaluate(()=>S.duelSpeed)==='fast');
const t0=await page.evaluate(()=>duel.round); await page.waitForTimeout(900);
const t1=await page.evaluate(()=>duel.round);
ok(`疾档推进快（0.9 秒内 ${t0}→${t1}）`, t1-t0>=1||await page.evaluate(()=>duel.over));
if(!(await page.evaluate(()=>duel.over))){ await page.click('#duelSkip'); }
await page.waitForSelector('#duelGo,#dSpare',{timeout:5000});
const r2=await page.evaluate(()=>({rows:document.querySelectorAll('#duelLog .r[data-rn]').length,rounds:duel.round,bt:document.querySelectorAll('#duelLog .bt').length}));
ok('中途速战，战报回合数对得上：'+JSON.stringify(r2), r2.rows===r2.rounds);
await page.evaluate(()=>{ S.duelSpeed='normal'; });

console.log('【认输】');
await setup(60);
await page.click('#duelStart'); await page.waitForTimeout(600);
await page.click('#duelYield');
await page.waitForSelector('#duelGo',{timeout:5000});
ok('认输后走原来的收尾', await page.evaluate(()=>duel.result==='yield'&&/认输/.test(duel.resultText)));

console.log('【脱身】');
let fled=0,tried=0;
for(let i=0;i<6;i++){
  await setup(60);
  await page.click('#duelStart'); await page.waitForTimeout(300);
  if(await page.evaluate(()=>duel.over)) continue;
  await page.click('#duelFlee'); tried++;
  ok('按下后按钮变成等待态', i>0||await page.textContent('#duelFlee')==='伺机脱身…');
  await page.click('.dspeed button[data-s="fast"]');
  await page.waitForFunction(()=>!duel.eng.flee,null,{timeout:8000}); await page.waitForFunction(()=>duel.over||!duelQ,null,{timeout:8000}); await page.waitForTimeout(100);
  const res=await page.evaluate(()=>({over:duel.over,res:duel.result,txt:duel.log.map(x=>x.plain).join('')}));
  if(res.res==='escape') fled++;
  else ok('脱身失败要挨一下 '+JSON.stringify(res).slice(0,300), /追上|欲走/.test(res.txt)||res.over);
  await page.evaluate(()=>{ S.duelSpeed='normal'; });
}
ok(`脱身成功 ${fled}/${tried}（身法 60，对等功力）`, fled>0);

console.log('【打到一半关页面】');
await setup(60);
await page.click('#duelStart'); await page.waitForTimeout(1400);
const before=await page.evaluate(()=>({round:duel.round,pHp:duel.pHp,oHp:duel.oHp,over:duel.over}));
if(!before.over){
  await page.evaluate(()=>saveGame());
  await page.reload(); await page.waitForSelector('#duelMask.on',{timeout:8000});
  const after=await page.evaluate(()=>({round:duel.round,pHp:duel.pHp,oHp:duel.oHp,playing:duel.playing,btn:!!document.getElementById('duelStart'),txt:document.getElementById('duelStart')&&document.getElementById('duelStart').textContent}));
  ok('读档回到比武，回合与气血不重掷：'+JSON.stringify(before)+' → '+JSON.stringify(after), after.round===before.round&&after.pHp===before.pHp&&after.oHp===before.oHp);
  ok('读档后停着，按「接着打」继续', after.btn&&after.txt==='接着打'&&!after.playing);
  await page.click('#duelStart'); await page.click('#duelSkip');
  await page.waitForSelector('#duelGo,#dSpare',{timeout:5000});
  ok('接着打完', await page.evaluate(()=>duel.over));
}
console.log('【旧存档：打到一半的旧式比武】');
await page.evaluate(()=>{
  duelStop(); duel=null; $('duelMask').classList.remove('on');
  S.duelState={oppName:'测试客',lethal:false,reason:'旧档',action:'旧档比武',judge:null,vendetta:null,war:false,pHp:47,oHp:62,pQi:40,oQi:55,oppW:60,pW:60,round:3,log:[{plain:'第1回合……'},{plain:'第2回合……'},{plain:'第3回合……'}],over:false,result:null,resultText:'',profile:{agg:false,def:true,trick:false,coward:false},friendly:false,logHtml:'<div class="r">旧战报</div>'};
  restoreDuel();
});
const old=await page.evaluate(()=>({pHp:duel.eng.P.hp,oHp:duel.eng.O.hp,round:duel.eng.round,btn:document.getElementById('duelStart').textContent}));
ok('旧存档的半场比武折进新引擎：'+JSON.stringify(old), old.pHp===47&&old.oHp===62&&old.round===3&&old.btn==='接着打');
await page.click('#duelSkip'); await page.waitForSelector('#duelGo,#dSpare',{timeout:5000});
ok('旧档续打回合从 4 接上', await page.evaluate(()=>/^第4回合/.test(duel.log[3].plain)));
ok('无报错 '+errs.join(' | '), !errs.length);
console.log(fails.length?`\n失败 ${fails.length} 项`:'\n全部通过');
await br.close(); srv.close(); process.exit(fails.length?1:0);
})();
