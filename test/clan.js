// 宗门玩法自测（第 1 块：数据与月结）
// 用法：node test/clan.js（本机）；容器里用 PW_CHROME 指定 chromium
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'));
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);});
const fails=[],oks=[];
const ok=(n,c)=>{(c?oks:fails).push(n);console.log((c?'  ✓ ':'  ✗ ')+n);};
const E=src=>'(()=>{'+src+'})()';
(async()=>{
srv.listen(8941);
const exe=process.env.PW_CHROME||undefined;
const br=await chromium.launch(exe?{executablePath:exe}:{});
const page=await(await br.newContext()).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errs.push('console:'+m.text());});
await page.addInitScript(()=>localStorage.setItem('wuxia_cfg',JSON.stringify({base:'x',key:'sk-t',model:'m',think:false})));
await page.goto('http://localhost:8941/');
await page.waitForTimeout(600);

const mk=(free,wu,money,fame)=>`
  S=newStateShell(); S.freedom='${free}'; S.difficulty='normal'; S.ganzhi=0; S.months=0;
  S.player={name:'李逍遥',gender:'男',age:24,lifespan:78,hp:100,money:${money},
    attributes:{'谈吐':50,'才学':50,'颖悟':60,'武功':${wu}},'侠名':${fame},'恶名':0,
    faction:'散人',status:[],arts:[],items:{},skills:{},looks:'',story:'',traits:[]};
  S.date=dateStr();`;

console.log('\n【立派门槛】');
ok('江湖传奇 武功70/侠名50/5000两 → 可立派', await page.evaluate(E(mk('mid',70,5000,50)+'return foundBlock();'))==='');
const b1=await page.evaluate(E(mk('mid',50,5000,50)+'return foundBlock();'));
ok('江湖传奇 武功50 → 拦下（'+b1.slice(0,22)+'…）', b1.includes('武功不足'));
ok('写实江湖 武功70 → 拦下', (await page.evaluate(E(mk('strict',70,5000,50)+'return foundBlock();'))).includes('武功不足'));
ok('随心所欲 武功45/300两/侠名25 → 可立派', await page.evaluate(E(mk('free',45,300,25)+'return foundBlock();'))==='');
ok('江湖传奇 只有500两 → 拦下', (await page.evaluate(E(mk('mid',70,500,50)+'return foundBlock();'))).includes('家财不足'));
ok('重名立派被拦', (await page.evaluate(E(mk('mid',70,5000,50)+"S.world.factions=[{name:'青锋门',alignment:'正派',power:50,leader:'某',desc:''}];return foundClan({name:'青锋门'}).why||'';"))).includes('已经有一个'));

console.log('\n【立派】');
const r=await page.evaluate(E(mk('mid',70,5000,50)+`
  const res=foundClan({name:'青锋门',alignment:'正派',creed:'以武止戈',base:'青锋山'});
  return {res, money:S.player.money, faction:S.player.faction, sect:S.sect,
    clan:{name:S.clan.name,power:S.clan.power,fame:S.clan.fame,cap:clanCap()},
    f:(S.world.factions||[]).map(x=>({name:x.name,own:!!x.own,power:x.power,leader:x.leader}))};`));
ok('立派成功，扣银 '+r.res.cost+' 两', r.res.ok===true&&r.money===5000-r.res.cost);
ok('主角门派改为青锋门、记为自家', r.faction==='青锋门'&&r.sect.own===true);
ok('初始势力 '+r.clan.power+'、威望 '+r.clan.fame+'、员额 '+r.clan.cap, r.clan.power===17&&r.clan.cap>=20);
ok('门派势力表多了一行并标了 own', r.f.length===1&&r.f[0].own===true&&r.f[0].leader==='李逍遥');
ok('模型把 faction 写成「散人」→ 被拨回', await page.evaluate("S.player.faction='散人';syncSect();S.player.faction")==='青锋门');

console.log('\n【六十个月空跑】');
const sim=await page.evaluate(E(`
  for(let i=0;i<6;i++) addDisciple(makeDisciple({from:'招募'}),true);
  const bad=[]; let maxD=0;
  for(let m=0;m<60;m++){
    try{ advanceTime(1); }catch(e){ bad.push('第'+m+'月炸了：'+e.message); break; }
    const c=S.clan;
    if(c.treasury<0) bad.push('第'+m+'月公帐为负');
    if(S.player.money<0) bad.push('第'+m+'月私财为负');
    if(c.power<0||c.power>100) bad.push('势力越界 '+c.power);
    if(c.fame<0||c.fame>100) bad.push('威望越界 '+c.fame);
    if(clanDisciples().length>clanCap()) bad.push('弟子超编 '+clanDisciples().length+'/'+clanCap());
    for(const d of clanDisciples()){
      if(d['武功']>discCap(d)) bad.push(d.name+' 武功'+d['武功']+' 超上限'+discCap(d));
      if(d.loyalty<0||d.loyalty>100) bad.push('忠诚越界');
      maxD=Math.max(maxD,d['武功']);
    }
    S.engineNews=[];
  }
  const c=S.clan, ds=clanDisciples();
  return {bad, n:ds.length, cap:clanCap(), power:c.power, fame:c.fame, treasury:c.treasury,
    money:S.player.money, maxD, mine:S.player.attributes['武功'], fallen:(c.fallen||[]).length,
    fpow:(S.world.factions.find(x=>x.own)||{}).power,
    jobs:ds.reduce((a,d)=>(a[d.job]=(a[d.job]||0)+1,a),{}),
    wu:ds.map(d=>d['武功']), loy:ds.map(d=>d.loyalty),
    sample:ds.slice().sort((a,b)=>b.talent-a.talent).slice(0,4).map(d=>d.name+' 资质'+d.talent+'　武功'+d['武功']+'(顶'+discCap(d)+')　忠'+d.loyalty+'　'+d.job)};`));
ok('六十个月不炸、无越界'+(sim.bad.length?'：'+sim.bad.slice(0,3).join(' / '):''), sim.bad.length===0);
console.log('    弟子 '+sim.n+'/'+sim.cap+'　势力 '+sim.power+'　威望 '+sim.fame+'　公帐 '+sim.treasury+' 两　私财 '+sim.money+' 两　往事 '+sim.fallen+' 人');
console.log('    职务 '+JSON.stringify(sim.jobs)+'　忠诚 '+Math.min(...sim.loy)+'~'+Math.max(...sim.loy));
console.log('    '+sim.sample.join('\n    '));
ok('徒不过师：最强弟子 '+sim.maxD+' < 主角 '+sim.mine, sim.maxD<sim.mine);
ok('资质拉开了差距（武功 '+Math.min(...sim.wu)+'~'+Math.max(...sim.wu)+'）', new Set(sim.wu).size>=5);
ok('忠诚不是人人满分', Math.max(...sim.loy)<100&&new Set(sim.loy).size>=3);
ok('公帐没常年见底（'+sim.treasury+' 两）', sim.treasury>0);
ok('势力表同步了势力值', sim.fpow===sim.power);

console.log('\n【一键分派】');
const aj=await page.evaluate(E(`for(const d of clanDisciples()) d.job='修炼';
  const moved=autoAssignJobs();
  return {moved, jobs:clanDisciples().reduce((a,d)=>(a[d.job]=(a[d.job]||0)+1,a),{})};`));
ok('一键分派动了 '+aj.moved+' 人：'+JSON.stringify(aj.jobs), Object.keys(aj.jobs).length>=4);

console.log('\n【欠饷与叛门】');
const owe=await page.evaluate(E(`
  // 造一个发不出饷的局面：公帐与私财都清零，且这一月的进项手动抹掉
  const before=clanDisciples().map(d=>d.loyalty);
  S.clan.treasury=0; S.player.money=0;
  const realInc=clanIncome; clanIncome=()=>0;
  let everUnpaid=false;
  for(let i=0;i<14;i++){ S.player.money=0; advanceTime(1); if(S.clan.lastUnpaid>0) everUnpaid=true; }
  clanIncome=realInc;
  return {unpaid:everUnpaid, before, loy:clanDisciples().map(d=>d.loyalty),
    left:(S.clan.fallen||[]).filter(x=>x.how==='离山').length, n:clanDisciples().length};`));
ok('发不出月例时确实欠饷', owe.unpaid);
ok('欠饷十四个月：忠诚由 '+Math.min(...owe.before)+'~'+Math.max(...owe.before)+' 跌到 '+(owe.loy.length?Math.min(...owe.loy)+'~'+Math.max(...owe.loy):'—')+'，'+owe.left+' 人离山，剩 '+owe.n+' 人', owe.left>0);

console.log('\n【老存档迁移】');
const mg=await page.evaluate(E(`
  const old={v:8,turn:5,player:{name:'旧人',attributes:{'武功':50},status:[],money:10,'侠名':10,'恶名':0,age:30,hp:80,items:{}},
    npcs:[],history:[],recent:[],world:{factions:[],ranking:[],events:[],fallen:[],vacant:0},
    sect:{name:'华山',contrib:40,joined:1},chapters:[],achievements:[],quests:[],ledger:[]};
  const m=migrate(old); return {v:m.v, clan:m.clan, own:m.sect.own, contrib:m.sect.contrib};`));
ok('老存档升到 v9、无自家门派、原贡献不丢（'+mg.contrib+'）', mg.v===9&&mg.clan===null&&mg.own===false&&mg.contrib===40);

console.log('\n【无自家门派时一切照旧】');
const nc=await page.evaluate(E(mk('mid',70,5000,50)+`
  S.player.faction='华山派'; syncSect();
  const own=S.sect.own;
  S.world.factions=[{name:'华山派',alignment:'正派',power:60,leader:'岳掌门',desc:''}];
  S.sect.contrib=100; advanceTime(3);
  return {own, clan:S.clan, pay:S.sectPay};`));
ok('投在别人门下：月例照发（'+nc.pay+' 两）、S.clan 仍为 null', nc.clan===null&&nc.pay>0&&nc.own===false);

console.log('\n【页面报错】');
ok('无 JS 报错'+(errs.length?'：'+errs.slice(0,2).join(' | '):''), errs.length===0);
console.log('\n'+(fails.length?'✗ 失败 '+fails.length+' 项：\n  '+fails.join('\n  '):'✓ 全部 '+oks.length+' 项通过'));
await br.close(); srv.close(); process.exit(fails.length?1:0);
})();
