// 一统江湖自测（第 5 块）
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'));
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);});
const fails=[],oks=[];
const ok=(n,c)=>{(c?oks:fails).push(n);console.log((c?'  ✓ ':'  ✗ ')+n);};
const E=s=>'(()=>{'+s+'})()';
(async()=>{
srv.listen(8945);
const exe=process.env.PW_CHROME||undefined;
const br=await chromium.launch(exe?{executablePath:exe}:{});
const ctx=await br.newContext({viewport:{width:1400,height:900}});
const page=await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errs.push('console:'+m.text());});
page.on('dialog',d=>d.accept());
await page.addInitScript(()=>localStorage.setItem('wuxia_cfg',JSON.stringify({base:'x',key:'sk-t',model:'m',think:false})));
await page.goto('http://localhost:8945/');
await page.waitForTimeout(500);

const boot=`
  S=newStateShell(); S.freedom='mid'; S.difficulty='normal'; S.ganzhi=0; S.months=200;
  S.player={name:'李逍遥',gender:'男',age:41,lifespan:78,hp:100,money:30000,appearance:'眉目清朗',background:'习武世家',
    attributes:{'谈吐':60,'才学':50,'颖悟':60,'武功':96},'侠名':75,'恶名':0,
    faction:'散人',status:[],arts:[{name:'青锋十三式',style:'刚猛',level:80,desc:''}],items:{},skills:{},traits:[],story:'',title:''};
  S.date=dateStr(); window.act=async()=>{}; window.runTurn=async()=>{};
  document.querySelectorAll('.modal-mask').forEach(x=>x.classList.remove('on'));
  S.world.factions=[
    {name:'华山派',alignment:'正派',power:40,leader:'岳不徐',desc:''},
    {name:'血刀门',alignment:'邪道',power:55,leader:'屠九',desc:''},
    {name:'丐帮',  alignment:'中立',power:35,leader:'洪九',desc:''}];
  S.world.ranking=[{name:'甲',faction:'散人','武功':90,alive:true,age:50},{name:'乙',faction:'散人','武功':85,alive:true,age:50}];
  S.ranked=true;
  foundClan({name:'青锋门',alignment:'正派',creed:'锄强扶弱',base:'雁回山'});
  S.clan.power=75; S.clan.fame=88; S.clan.treasury=9000; S.clan.founded=60;
  for(let i=0;i<14;i++){ const d=makeDisciple({from:'招募',talent:rnd(5,9)}); d['武功']=rnd(50,80); addDisciple(d,true); }
  S.engineNews=[]; renderPanel();`;
await page.evaluate(E(boot+'return 1;'));

console.log('\n【武林大会的门槛】');
const gate=await page.evaluate(E(`
  const a=leagueBlock(), need=leagueNeed(), cost=leagueCost(), rk=playerRank();
  S.clan.fame=60; const b=leagueBlock(); S.clan.fame=88;
  S.clan.power=40; const c2=leagueBlock(); S.clan.power=75;
  S.ranked=false; const d2=leagueBlock(); S.ranked=true;
  S.clan.lastLeague=S.months; const e=leagueBlock(); S.clan.lastLeague=-99;
  const t=S.clan.treasury,m=S.player.money; S.clan.treasury=0;S.player.money=0;
  const f2=leagueBlock(); S.clan.treasury=t;S.player.money=m;
  return {a,b,c:c2,d:d2,e,f:f2,cost,rk,need};`));
ok('威望88/势力75/榜上第'+gate.rk+' → 可以召开（开销 '+gate.cost+' 两）', gate.a==='');
ok('威望不够被拦：'+gate.b, gate.b.includes('威望不够'));
ok('势力不够被拦：'+gate.c, gate.c.includes('势力不够'));
ok('不在江湖榜前三被拦：'+gate.d, gate.d.includes('江湖榜不够'));
ok('二十四个月才能开一次：'+gate.e, gate.e.includes('且等'));
ok('钱不够被拦：'+gate.f, gate.f.includes('凑不齐'));

console.log('\n【肯不肯低头】');
const odds=await page.evaluate(E(`
  const F=n=>S.world.factions.find(x=>x.name===n);
  const base={hua:submitOdds(F('华山派')), xue:submitOdds(F('血刀门')), gai:submitOdds(F('丐帮'))};
  S.clan.wars=[{foe:'血刀门',result:'rout',month:100}];
  const beaten=submitOdds(F('血刀门'));
  S.clan.wars=[];
  const n=normNpc({name:'屠九',gender:'男',age:50,identity:'血刀门主',faction:'血刀门',alignment:'邪道',
    personality:[],appearance:'','武功':80,'谈吐':50,relation:'死敌','好感度':5,alive:true});
  S.npcs.push(n); addVendetta('屠九','血海深仇',true,90);
  const lethal=submitOdds(F('血刀门'));
  S.vendettas=[];
  return Object.assign(base,{beaten,lethal});`));
ok('同为正派的华山（'+Math.round(odds.hua*100)+'%）比邪道血刀（'+Math.round(odds.xue*100)+'%）容易服', odds.hua>odds.xue);
ok('打过的手下败将更肯低头（血刀门 '+Math.round(odds.xue*100)+'% → '+Math.round(odds.beaten*100)+'%）', odds.beaten>odds.xue);
ok('结了死仇的几乎不可能服（'+Math.round(odds.lethal*100)+'%）', odds.lethal<odds.xue);

console.log('\n【开一次大会】');
const lg=await page.evaluate(E(`
  const before=S.clan.treasury;
  const r=holdLeague();
  return {ok:r.ok, total:r.total, yesN:r.yesN, leader:r.leader, unified:r.unified,
    allies:S.clan.allies.slice(), paid:before-S.clan.treasury,
    rivals:rivalFactions().map(f=>f.name), fame:S.clan.fame,
    vend:S.vendettas.map(v=>v.name), res:r.res.map(x=>x.name+(x.yes?'签':'拂袖'))};`));
ok(gate.cost+' 两开销扣了，'+lg.total+' 家赴会：'+lg.res.join('、'), lg.ok&&lg.paid===gate.cost);
ok('签了盟约的进了盟下：'+(lg.allies.join('、')||'无'), lg.allies.length===lg.yesN);
ok('不肯低头的成了死对头（仇家 '+lg.vend.length+' 人，还剩 '+lg.rivals.length+' 家未服）', lg.rivals.length===lg.total-lg.yesN);
ok(lg.leader?'过半签约，当上武林盟主，威望涨到 '+lg.fame:'未过半，没当上盟主（'+lg.yesN+'/'+lg.total+'）', true);

console.log('\n【文路一统】');
const wen=await page.evaluate(E(`${boot}
  // 各派都肯低头的局面
  for(const f of S.world.factions) if(!f.own) f.power=12;
  S.clan.power=95; S.clan.fame=95;
  let r=null;
  for(let i=0;i<60&&!(r&&r.unified);i++){
    S.world.factions=[{name:'华山派',alignment:'正派',power:12,leader:'岳',desc:''},
      {name:'丐帮',alignment:'中立',power:12,leader:'洪',desc:''}];
    S.clan.allies=[]; S.clan.unified=false; S.clan.annexed=['点苍派']; S.clan.lastLeague=-99;
    clanSyncFaction();
    r=holdLeague();
  }
  return {unified:!!(r&&r.unified), way:S.clan.unifiedWay, pending:!!S.unifyPending,
    ach:S.achievements.filter(a=>a==='unify'||a==='league')};`));
ok('各派都签了 → 一统江湖（走的是「'+wen.way+'」路）', wen.unified&&wen.way==='盟');
ok('武林盟主与一统江湖两个成就都解锁', wen.ach.length===2);

console.log('\n【武路一统】');
const wu=await page.evaluate(E(`${boot}
  S.clan.annexed=['华山派','丐帮']; S.clan.allies=[];
  S.world.factions=S.world.factions.filter(f=>f.own||f.name==='血刀门');
  S.world.factions.find(f=>f.name==='血刀门').power=3;   // 打残了
  S.clan.unified=false; S.unifyPending=false;
  const u=unifyCheck();
  return {u, way:S.clan.unifiedWay, pending:!!S.unifyPending};`));
ok('各派或被吞或被打残 → 一统江湖（走的是「'+wu.way+'」路）', wu.u&&wu.way==='兵');

console.log('\n【不该误判为一统】');
const nope=await page.evaluate(E(`${boot}
  const a=(()=>{ S.clan.annexed=[]; S.clan.allies=[]; S.world.factions=S.world.factions.filter(f=>f.own);
    S.clan.unified=false; return unifyCheck(); })();
  const b=(()=>{ S.clan.annexed=['华山派']; S.clan.power=30; S.clan.unified=false; return unifyCheck(); })();
  const c2=(()=>{ ${boot} S.clan.annexed=['华山派']; S.clan.power=80; S.clan.unified=false; return unifyCheck(); })();
  return {a,b,c:c2};`));
ok('一家都没打过就世界空了 → 不算一统', nope.a===false);
ok('自己势力还不到 55 → 不算一统', nope.b===false);
ok('还有别派立着 → 不算一统', nope.c===false);

console.log('\n【盟下供奉与不再挨打】');
const tri=await page.evaluate(E(`${boot}
  S.clan.allies=['华山派','丐帮']; S.clan.leagueLeader=true;
  const t=allyTribute();
  S.clan.treasury=0; S.clan.months=11;
  clanMonth();
  const after=S.clan.treasury;
  let raided=0;
  S.clan.power=80;
  for(let i=0;i<300;i++){ S.engineNews=[]; raidCheck(); if((S.engineNews||[]).join('').includes('华山派')||(S.engineNews||[]).join('').includes('丐帮')) raided++; }
  return {t, after, raided};`));
ok('盟下每年供奉 '+tri.t+' 两，满一年时进公帐', tri.t>0&&tri.after>=tri.t);
ok('签了盟约的门派不会再来打你的山门（'+tri.raided+' 次）', tri.raided===0);

console.log('\n【界面】');
await page.evaluate(E(boot+'S.engineNews=[];renderPanel();return 1;'));
await page.click('#goClan'); await page.waitForTimeout(250);
ok('宗门页有「一统江湖」卡', await page.isVisible('#cLeague'));
const lt=await page.textContent('#cLeague');
ok('文武两路的进度都写着：'+lt.replace(/\s+/g,' ').slice(0,52)+'…', lt.includes('武路')&&lt.includes('文路')&&lt.includes('威望'));
ok('门槛都够时按钮可按', !(await page.isDisabled('#cLeagueGo')));
await page.evaluate("$('cLeague').scrollIntoView({block:'center'})"); await page.waitForTimeout(150);
await page.screenshot({path:(process.env.SHOT_DIR||'.')+'/一统江湖_宗门页.png'});
await page.click('#cLeagueGo'); await page.waitForTimeout(350);
ok('大会结果弹窗开了', await page.isVisible('#leagueMask .modal'));
const lb=await page.textContent('#leagueBody');
ok('逐家列出服不服：'+lb.replace(/\s+/g,' ').slice(0,50)+'…', /签|拂袖/.test(lb));
await page.screenshot({path:(process.env.SHOT_DIR||'.')+'/一统江湖_武林大会.png'});
await page.click('#leagueGo'); await page.waitForTimeout(200);
ok('散会后弹窗关了', !(await page.isVisible('#leagueMask .modal')));

console.log('\n【终局屏】');
await page.evaluate(E(`S.clan.annexed=['华山派','丐帮']; S.clan.allies=['血刀门'];
  S.clan.unified=true; S.clan.unifiedWay='兵'; S.clan.unifiedMonth=S.months; S.clan.wins=4; S.clan.losses=1;
  renderPanel(); showUnify(); return 1;`));
await page.waitForTimeout(250);
ok('终局屏开了', await page.isVisible('#unifyMask .modal'));
const ub=await page.textContent('#unifyBody');
ok('写了门派、历时、门下、吞并、臣服、战史、评分', ['门派','历时','门下','吞并','臣服','战史','评分'].every(k=>ub.includes(k)));
ok('两个按钮：接着走下去 / 就此收官立传',
   (await page.textContent('#unifyStay')).includes('接着')&&(await page.textContent('#unifyEnd')).includes('收官'));
await page.screenshot({path:(process.env.SHOT_DIR||'.')+'/一统江湖_终局屏.png'});
await page.click('#unifyStay'); await page.waitForTimeout(150);
ok('选「接着走下去」不结束这一局', !(await page.isVisible('#unifyMask .modal'))&&!(await page.evaluate("S.over")));
await page.evaluate("renderPanel()"); await page.waitForTimeout(150);
ok('一统之后宗门页换成「一统江湖」的样子', (await page.textContent('#cLeague')).includes('一 统 江 湖'));

console.log('\n【手机端】');
const mob=await br.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
const mp=await mob.newPage();
await mp.addInitScript(()=>localStorage.setItem('wuxia_cfg',JSON.stringify({base:'x',key:'sk-t',model:'m',think:false})));
await mp.goto('http://localhost:8945/'); await mp.waitForTimeout(400);
await mp.evaluate(E(boot+"S.engineNews=[];renderPanel();setDrawer(true);gotoTab('clan');$('cLeague').scrollIntoView({block:'center'});return 1;"));
await mp.waitForTimeout(300);
await mp.screenshot({path:(process.env.SHOT_DIR||'.')+'/一统江湖_手机.png'});
ok('宗门页没有横向溢出', await mp.evaluate("$('tab-clan').scrollWidth<=$('tab-clan').clientWidth+2"));

console.log('\n【页面报错】');
ok('无 JS 报错'+(errs.length?'：'+errs.slice(0,3).join(' | '):''), errs.length===0);
console.log('\n'+(fails.length?'✗ 失败 '+fails.length+' 项：\n  '+fails.join('\n  '):'✓ 全部 '+oks.length+' 项通过'));
await br.close(); srv.close(); process.exit(fails.length?1:0);
})();
