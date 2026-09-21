// 门派对战自测（第 4 块）
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'));
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);});
const fails=[],oks=[];
const ok=(n,c)=>{(c?oks:fails).push(n);console.log((c?'  ✓ ':'  ✗ ')+n);};
const E=s=>'(()=>{'+s+'})()';
(async()=>{
srv.listen(8944);
const exe=process.env.PW_CHROME||undefined;
const br=await chromium.launch(exe?{executablePath:exe}:{});
const ctx=await br.newContext({viewport:{width:1400,height:900}});
const page=await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errs.push('console:'+m.text());});
page.on('dialog',d=>d.accept());
await page.addInitScript(()=>localStorage.setItem('wuxia_cfg',JSON.stringify({base:'x',key:'sk-t',model:'m',think:false})));
await page.goto('http://localhost:8944/');
await page.waitForTimeout(500);

const boot=(wu)=>`
  S=newStateShell(); S.freedom='mid'; S.difficulty='normal'; S.ganzhi=0; S.months=120;
  S.player={name:'李逍遥',gender:'男',age:34,lifespan:78,hp:100,money:20000,appearance:'眉目清朗',background:'习武世家',
    attributes:{'谈吐':50,'才学':50,'颖悟':60,'武功':${wu||88}},'侠名':60,'恶名':0,
    faction:'散人',status:[],arts:[{name:'青锋十三式',style:'刚猛',level:60,desc:''}],items:{},skills:{},traits:[],story:'',title:''};
  S.date=dateStr(); window.act=async()=>{}; window.runTurn=async()=>{};
  document.querySelectorAll('.modal-mask').forEach(x=>x.classList.remove('on'));
  S.world.factions=[
    {name:'华山派',alignment:'正派',power:55,leader:'岳不徐',desc:''},
    {name:'血刀门',alignment:'邪道',power:72,leader:'',desc:''},
    {name:'丐帮',  alignment:'中立',power:20,leader:'洪九',desc:''}];
  foundClan({name:'青锋门',alignment:'正派',creed:'锄强扶弱',base:'雁回山'});
  S.clan.power=60; S.clan.fame=50; S.clan.treasury=5000; S.clan.lastWarMonth=-99;
  for(let i=0;i<12;i++){ const d=makeDisciple({from:'招募',talent:rnd(4,9)}); d['武功']=rnd(40,70); d.job=i<3?'护山':'修炼'; addDisciple(d,true); }
  S.engineNews=[]; renderPanel();`;
await page.evaluate(E(boot()+'return 1;'));

console.log('\n【出兵的门槛】');
const gate=await page.evaluate(E(`
  const F=n=>S.world.factions.find(x=>x.name===n);
  const a=warBlock(F('华山派'));
  S.clan.lastWarMonth=S.months; const b=warBlock(F('华山派'));
  S.clan.lastWarMonth=-99;
  const keep=S.clan.disciples.slice(); S.clan.disciples=keep.slice(0,2).map(d=>Object.assign({},d,{job:'护山'}));
  const c2=warBlock(F('华山派'));
  S.clan.disciples=keep;
  const t=S.clan.treasury, m=S.player.money; S.clan.treasury=0; S.player.money=0;
  const d2=warBlock(F('华山派')); S.clan.treasury=t; S.player.money=m;
  const own=warBlock(S.world.factions.find(x=>x.own));
  return {a,b,c:c2,d:d2,own,cost:warCost(F('华山派')),
    mine:myWarForce(), hua:foeWarForce(F('华山派')), xue:foeWarForce(F('血刀门')), gai:foeWarForce(F('丐帮'))};`));
ok('兵强马壮时可以出兵（粮饷 '+gate.cost+' 两）', gate.a==='');
ok('六个月内不能再动刀兵：'+gate.b, gate.b.includes('且等'));
ok('能出征的不足三人被拦：'+gate.c, gate.c.includes('不足三个'));
ok('粮饷凑不齐被拦：'+gate.d, gate.d.includes('凑不齐'));
ok('打不了自己：'+gate.own, gate.own.includes('本派'));
console.log('    战力对比：我 '+gate.mine+'　华山 '+gate.hua+'　血刀 '+gate.xue+'　丐帮 '+gate.gai);
ok('势力越大的门派越难打', gate.xue>gate.hua&&gate.hua>gate.gai);

console.log('\n【三阵】');
const w1=await page.evaluate(E(`
  const r=startWar('华山派');
  return {ok:r.ok, foeN:war.foeSide.length, leader:war.leaderName, leaderWu:war.leaderWu,
    guards:war.guards, stage:war.stage, cost:war.cost, treasury:S.clan.treasury};`));
ok('出兵了：对方 '+w1.foeN+' 人，掌门'+w1.leader+'（武功'+w1.leaderWu+'），本派留守 '+w1.guards+' 人', w1.ok&&w1.foeN>=4&&w1.guards===3);
ok('粮饷从公帐扣了', w1.treasury===5000-w1.cost);
ok('战阵弹窗开着，先在先锋阵', await page.isVisible('#warMask .modal')&&w1.stage==='先锋');
ok('按钮是「先锋出阵」', (await page.textContent('#warActions')).includes('先锋出阵'));
await page.click('#wGo'); await page.waitForTimeout(250);
const r1=await page.evaluate("({stage:war.stage,me:war.me,them:war.them,rounds:war.rounds.length,myDead:war.myDead.length,foeDead:war.foeDead.length,log:war.log.length})");
ok('先锋阵打完：'+r1.me+':'+r1.them+'，本派折 '+r1.myDead+' 人，对方折 '+r1.foeDead+' 人', r1.rounds===1&&r1.log>=5);
ok('接着是中军阵', r1.stage==='中军'&&(await page.textContent('#warActions')).includes('中军出阵'));
await page.click('#wGo'); await page.waitForTimeout(250);
const r2=await page.evaluate("({stage:war.stage,me:war.me,them:war.them,rounds:war.rounds.length})");
ok('中军阵打完：'+r2.me+':'+r2.them, r2.rounds===2);
ok('轮到主将阵，按钮写着「点将——你亲自上」', r2.stage==='主将'&&(await page.textContent('#warActions')).includes('点将'));
ok('主将阵前有一句形势判断：'+(await page.textContent('#warActions')).replace('点将——你亲自上','').trim(),
   /定胜负|吞并要看|只剩你/.test(await page.textContent('#warActions')));
await page.screenshot({path:(process.env.SHOT_DIR||'.')+'/门派战_三阵.png'});

console.log('\n【主将阵接进比武】');
await page.click('#wGo'); await page.waitForTimeout(350);
ok('战阵弹窗关了，比武弹窗开了', !(await page.isVisible('#warMask .modal'))&&await page.isVisible('#duelMask .modal'));
ok('这场比武挂着门派战的牌子', await page.evaluate("!!(duel&&duel.war)"));
ok('对手是敌派掌门', await page.evaluate("duel.opp.name")===w1.leader);

console.log('\n【真伤亡】');
const cas=await page.evaluate(E(`
  const before=war.foeSide.length;
  return {foeDead:war.foeSide.filter(x=>!x.alive).length, foeHurt:war.foeSide.filter(x=>x.hurt>0).length,
    myHurt:S.clan.disciples.filter(d=>d.hurt>0).length,
    fallen:(S.clan.fallen||[]).filter(x=>x.how==='亡故').length, before};`));
ok('对方有人死伤（'+cas.foeDead+' 亡 / '+cas.foeHurt+' 伤）', cas.foeDead+cas.foeHurt>0);
ok('本派也挂了彩（'+cas.myHurt+' 人带伤，'+cas.fallen+' 人阵亡）', cas.myHurt+cas.fallen>0);

console.log('\n【大胜：吞并与收降】');
const rout=await page.evaluate(E(`
  war.me=2; war.them=0;
  const f=S.world.factions.find(x=>x.name==='华山派'); f.power=8;
  const beforeN=clanDisciples().length, beforeT=S.clan.treasury, beforeP=S.clan.power;
  const kind=settleWar(true);
  return {kind, gone:!S.world.factions.some(x=>x.name==='华山派'), annexed:S.clan.annexed.slice(),
    power:S.clan.power-beforeP, treasury:S.clan.treasury-beforeT, taken:(war.taken||[]).length,
    n:clanDisciples().length-beforeN, wars:S.clan.wars.length, settle:war.settle,
    vend:S.vendettas.map(v=>v.name+(v.lethal?'（死仇）':''))};`));
ok('三阵全胜判为大胜', rout.kind==='rout');
ok('打到势力见底就吞并了：'+rout.annexed.join('、'), rout.gone&&rout.annexed.includes('华山派'));
ok('本派势力 +'+rout.power+'，公帐 +'+rout.treasury+' 两', rout.power>0&&rout.treasury>0);
ok('收降 '+rout.taken+' 人，花名册多了 '+rout.n+' 人', rout.taken===rout.n);
ok('战史记了一笔', rout.wars===1);
ok('灭人满门要结死仇：'+rout.vend.join('、'), rout.vend.some(x=>x.includes('死仇')));

console.log('\n【惨胜：阵赢了人没赢】');
const pyr=await page.evaluate(E(`${boot()}
  S.world.factions.push({name:'点苍派',alignment:'中立',power:50,leader:'马五',desc:''});
  startWar('点苍派'); war.me=2; war.them=0;
  const beforeP=S.clan.power;
  const kind=settleWar(false);
  return {kind, still:S.world.factions.some(x=>x.name==='点苍派'), gain:S.clan.power-beforeP,
    taken:(war.taken||[]).length, settle:war.settle};`));
ok('主将一场输了 → 惨胜', pyr.kind==='pyrrhic');
ok('吞并不成，对方还在（势力 +'+pyr.gain+'），也没人归降', pyr.still&&pyr.taken===0);

console.log('\n【败北】');
const lose=await page.evaluate(E(`${boot()}
  startWar('血刀门'); war.me=0; war.them=2;
  const beforeP=S.clan.power, beforeT=S.clan.treasury;
  const kind=settleWar(false);
  return {kind, power:S.clan.power-beforeP, treasury:S.clan.treasury-beforeT,
    losses:S.clan.losses, vend:S.vendettas.length, loy:clanDisciples().map(d=>d.loyalty)};`));
ok('败北判定', lose.kind==='lose');
ok('势力 '+lose.power+'，公帐 '+lose.treasury+' 两，士气也掉了', lose.power<0&&lose.treasury<0);
ok('败了记一笔败仗（'+lose.losses+'），对方掌门成了仇家（'+lose.vend+' 人）', lose.losses===1&&lose.vend>0);

console.log('\n【战报交给模型】');
const pr=await page.evaluate(E(`${boot()}
  startWar('华山派'); warVanguard(); warMain();
  const d={log:[{plain:'第一回合：主角一刀劈出'},{plain:'第二回合：对方还手'}],resultText:'主角获胜，对方认输。',
    opp:{name:war.leaderName,identity:'华山掌门','武功':war.leaderWu,signature:'独孤九剑'}};
  const kind=settleWar(true);
  const p=warAftermathPrompt('率青锋门攻打华山派',{fate:12,check:null,worldEvent:null,months:2},{w:war,duel:d,kind});
  return {len:p.length, hasLog:p.includes('先锋阵'), hasDead:p.includes('本派阵亡'),
    hasRule:p.includes('全部由引擎记账'), hasJson:p.includes('"narrative"'), hasScore:p.includes('三阵总计')};`));
ok('战报提示词拼得出来（'+pr.len+' 字）', pr.len>800);
ok('带上了三阵实录、阵亡名单、三阵总计', pr.hasLog&&pr.hasDead&&pr.hasScore);
ok('明确告诉模型门派数字由引擎记账、它只管叙述', pr.hasRule);
ok('输出格式照旧', pr.hasJson);

console.log('\n【别人打上门来】');
const raid=await page.evaluate(E(`${boot()}
  let held=0, lost=0;
  for(let i=0;i<400;i++){
    S.clan.power=70; S.clan.treasury=2000; S.engineNews=[];
    for(const d of S.clan.disciples) { d.alive=true; d.hurt=0; }
    if(clanDisciples().filter(d=>d.job==='护山').length===0) for(const d of clanDisciples().slice(0,3)) d.job='护山';
    raidCheck();
    const t=(S.engineNews||[]).join('');
    if(t.includes('挡了回去')) held++;
    else if(t.includes('打上')) lost++;
  }
  S.clan.power=10; S.engineNews=[];
  let weak=0; for(let i=0;i<200;i++){ raidCheck(); if((S.engineNews||[]).length) weak++; S.engineNews=[]; }
  return {held,lost,weak};`));
ok('势力大了会有人来袭（挡住 '+raid.held+' 次，被破 '+raid.lost+' 次 / 400 个月）', raid.held>0&&raid.lost>0);
ok('势力小的时候没人来惹（'+raid.weak+' 次）', raid.weak===0);

console.log('\n【关了页面再回来】');
const rs=await page.evaluate(E(`${boot()}
  startWar('华山派'); warVanguard();
  saveGame();
  const raw=JSON.parse(localStorage.getItem('wuxia_save_v1'));
  const back=migrate(raw);
  return {v:back.v, hasWar:!!back.war, stage:back.war&&back.war.stage, me:back.war&&back.war.me,
    foeN:back.war&&back.war.foeSide.length};`));
ok('仗存进了存档（'+rs.stage+'阵，'+rs.me+' 胜）', rs.hasWar&&rs.stage==='中军'&&rs.foeN>0);

console.log('\n【成就】');
const ach=await page.evaluate(E(`${boot()}
  S.achievements=[]; checkAchievements();
  const a=S.achievements.slice();
  S.clan.annexed=['华山派']; for(let i=0;i<22;i++) addDisciple(makeDisciple({from:'招募'}),true);
  checkAchievements();
  return {a, b:S.achievements.slice()};`));
ok('立派与首徒解锁：'+ach.a.join('、'), ach.a.includes('clan')&&ach.a.includes('disciple1'));
ok('门庭若市与踏平一派解锁', ach.b.includes('clan20')&&ach.b.includes('annex'));

console.log('\n【界面】');
await page.evaluate(E(boot()+'S.engineNews=[];renderPanel();return 1;'));
await page.click('#goClan'); await page.waitForTimeout(250);
ok('宗门页有征伐卡', await page.isVisible('#cWar'));
const foes=(await page.$$('#cWar .foe')).length;
ok('列出 '+foes+' 个可打的门派，带战力对比', foes===3&&(await page.textContent('#cWar')).includes('势力'));
ok('明牌写了敌我战力与胜算措辞', /稳操胜券|略占上风|胜负难料|不容乐观|以卵击石/.test(await page.textContent('#cWar')));
await page.evaluate("$('cWar').scrollIntoView({block:'center'})"); await page.waitForTimeout(150);
await page.screenshot({path:(process.env.SHOT_DIR||'.')+'/门派战_征伐.png'});

console.log('\n【页面报错】');
ok('无 JS 报错'+(errs.length?'：'+errs.slice(0,3).join(' | '):''), errs.length===0);
console.log('\n'+(fails.length?'✗ 失败 '+fails.length+' 项：\n  '+fails.join('\n  '):'✓ 全部 '+oks.length+' 项通过'));
await br.close(); srv.close(); process.exit(fails.length?1:0);
})();
