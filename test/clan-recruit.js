// 招徕门人自测（第 3 块）
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'));
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);});
const fails=[],oks=[];
const ok=(n,c)=>{(c?oks:fails).push(n);console.log((c?'  ✓ ':'  ✗ ')+n);};
const E=s=>'(()=>{'+s+'})()';
(async()=>{
srv.listen(8943);
const exe=process.env.PW_CHROME||undefined;
const br=await chromium.launch(exe?{executablePath:exe}:{});
const ctx=await br.newContext({viewport:{width:1400,height:900}});
const page=await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errs.push('console:'+m.text());});
page.on('dialog',d=>d.accept());
await page.addInitScript(()=>localStorage.setItem('wuxia_cfg',JSON.stringify({base:'x',key:'sk-t',model:'m',think:false})));
await page.goto('http://localhost:8943/');
await page.waitForTimeout(500);

const boot=`
  S=newStateShell(); S.freedom='mid'; S.difficulty='normal'; S.ganzhi=0; S.months=0;
  S.player={name:'李逍遥',gender:'男',age:24,lifespan:78,hp:100,money:8000,appearance:'眉目清朗',background:'习武世家',
    attributes:{'谈吐':50,'才学':50,'颖悟':60,'武功':70},'侠名':50,'恶名':0,
    faction:'散人',status:[],arts:[],items:{},skills:{},traits:[],story:'',title:''};
  S.date=dateStr(); window.act=async()=>{};
  document.querySelectorAll('.modal-mask').forEach(x=>x.classList.remove('on'));
  const mk=(o)=>{const n=normNpc(Object.assign({name:'某',gender:'男',age:30,identity:'江湖客',faction:'散人',
    alignment:'中立',personality:[],appearance:'','武功':40,'谈吐':50,relation:'相识','好感度':60,alive:true},o)); S.npcs.push(n); return n;};
  window.mk=mk;
  foundClan({name:'青锋门',alignment:'正派',creed:'锄强扶弱',base:'雁回山'});
  renderPanel();`;
await page.evaluate(E(boot+'return 1;'));

console.log('\n【谁够格招揽】');
const gate=await page.evaluate(E(`
  const a=mk({name:'赵有情',  '武功':40,'好感度':70});
  const b=mk({name:'钱生疏',  '武功':40,'好感度':30});
  const c2=mk({name:'孙高手',  '武功':90,'好感度':90});
  const d=mk({name:'李掌门',  '武功':40,'好感度':90,identity:'华山掌门'});
  const e=mk({name:'周亡故',  '武功':40,'好感度':90,alive:false});
  return {a:recruitBlock(a),b:recruitBlock(b),c:recruitBlock(c2),d:recruitBlock(d),e:recruitBlock(e),
    odds:Math.round(recruitOdds(a)*100)};`));
ok('交情够、武功低于你 → 可招（把握 '+gate.odds+'%）', gate.a==='');
ok('交情不够被拦：'+gate.b, gate.b.includes('交情'));
ok('武功高过你被拦：'+gate.c, gate.c.includes('不在你之下'));
ok('一派之主被拦：'+gate.d, gate.d.includes('一派之主'));
ok('死人被拦：'+gate.e, gate.e.includes('不在了'));

console.log('\n【把握怎么算】');
const odds=await page.evaluate(E(`
  const base=mk({name:'甲',  '武功':40,'好感度':70});
  const high=mk({name:'乙',  '武功':40,'好感度':95});
  const cross=mk({name:'丙', '武功':40,'好感度':70,alignment:'邪道'});
  const other=mk({name:'丁', '武功':40,'好感度':70,faction:'华山派'});
  const o={base:recruitOdds(base),high:recruitOdds(high),cross:recruitOdds(cross),other:recruitOdds(other)};
  S.clan.power=80; S.clan.fame=80;
  o.strong=recruitOdds(base);
  S.clan.power=17; S.clan.fame=20;
  return o;`));
ok('交情越深把握越大（'+Math.round(odds.base*100)+'% → '+Math.round(odds.high*100)+'%）', odds.high>odds.base);
ok('立场相左要打折（'+Math.round(odds.cross*100)+'%）', odds.cross<odds.base);
ok('原本另有师门要打折（'+Math.round(odds.other*100)+'%）', odds.other<odds.base);
ok('门派有气象则人才肯来（'+Math.round(odds.strong*100)+'%）', odds.strong>odds.base);

console.log('\n【招揽成了】');
const got=await page.evaluate(E(`
  const n=mk({name:'张归心','武功':52,'好感度':92,identity:'镖师'});
  let r=null; for(let i=0;i<40&&!(r&&r.ok);i++){ n.recruitFail=0; n.recruitTry=-99; r=recruitNpc(n); }
  const d=clanDisciples().find(x=>x.npcName==='张归心');
  return {ok:r.ok, d:d?{name:d.name,wu:d['武功'],talent:d.talent,loy:d.loyalty,from:d.from}:null,
    npcFaction:n.faction, n:clanDisciples().length};`));
ok('招进来了：'+JSON.stringify(got.d), got.ok&&got.d&&got.d.from==='名录'&&got.d.wu===52);
ok('名录那边门派也改了（'+got.npcFaction+'）', got.npcFaction==='青锋门');
ok('已在门下的不能再招', (await page.evaluate("recruitBlock(findNpc('张归心'))")).includes('已在门下'));

console.log('\n【招揽被回绝】');
const no=await page.evaluate(E(`
  const n=mk({name:'王要想想','武功':40,'好感度':56});
  const before=n['好感度'];
  let r=null;
  for(let i=0;i<60&&!(r&&r.refused);i++){
    // 万一这次招成了，把人请回去再试
    S.clan.disciples=S.clan.disciples.filter(d=>(d.npcName||d.name)!==n.name);
    n.faction='散人'; n.recruitFail=0; n.recruitTry=-99; n['好感度']=56;
    r=recruitNpc(n);
  }
  return {refused:!!r.refused, why:r.why, favor:n['好感度'], block:recruitBlock(n)};`));
ok('会被回绝：'+no.why, no.refused);
ok('回绝后掉好感（56→'+no.favor+'）并冷一年：'+no.block, no.favor===51&&no.block.includes('回绝过'));

console.log('\n【弟子练出来的功夫写回名录】');
const sync=await page.evaluate(E(`
  const d=clanDisciples().find(x=>x.npcName==='张归心');
  d['武功']=61; syncDiscNpcs();
  const n=findNpc('张归心');
  const before=clanDisciples().length;
  n.alive=false; syncDiscNpcs();
  return {npcWu:n['武功'], before, after:clanDisciples().length,
    fallen:(S.clan.fallen||[]).some(x=>x.name==='张归心')};`));
ok('名录武功跟着涨到 '+sync.npcWu, sync.npcWu===61);
ok('名录里死了，花名册也跟着除名（'+sync.before+'→'+sync.after+'）', sync.after===sync.before-1&&sync.fallen);

console.log('\n【张榜招徒】');
const post=await page.evaluate(E(`
  S.clan.treasury=0; S.player.money=8000; S.clan.lastPost=-99;
  const cost=postCost(), b1=postBlock();
  const r=postRecruit();
  const paid=8000-S.player.money;
  const b2=postBlock();
  S.player.money=0; S.clan.treasury=0; S.clan.lastPost=-99;
  const b3=postBlock();
  return {cost,b1,ok:r.ok,got:r.got.map(d=>d.name+'(资质'+d.talent+')'),paid,b2,b3};`));
ok('张榜要 '+post.cost+' 两，眼下可张', post.b1==='');
ok('招进 '+post.got.length+' 人：'+post.got.join('、')+'，扣银 '+post.paid+' 两', post.ok&&post.got.length>=1&&post.paid===post.cost);
ok('六个月内不能再张：'+post.b2, post.b2.includes('且等'));
ok('凑不齐钱也拦：'+post.b3, post.b3.includes('凑不齐'));

console.log('\n【叛门与被逐会结仇】');
const grudge=await page.evaluate(E(`
  S.vendettas=[]; S.clan.treasury=0;
  let found=0;
  for(let i=0;i<25&&!found;i++){
    const d=makeDisciple({from:'招募'}); addDisciple(d,true);
    expelDisciple(d);
    found=S.vendettas.length;
  }
  const v=S.vendettas[0];
  return {n:S.vendettas.length, v:v?{name:v.name,reason:v.reason,heat:v.heat}:null,
    npc:v?!!findNpc(v.name):false};`));
ok('逐出门墙有机会结仇：'+(grudge.v?grudge.v.name+'　「'+grudge.v.reason+'」':'—'), grudge.n>0);
ok('结仇的人进了人物名录，仇家榜上认得他', grudge.npc);

console.log('\n【界面】');
await page.evaluate("S.vendettas=[];S.engineNews=[];renderPanel();");
await page.click('#goClan'); await page.waitForTimeout(200);
ok('宗门页有招徕卡', await page.isVisible('#cRecruit'));
ok('张榜按钮在', (await page.textContent('#cRecruit')).includes('张榜'));
const candN=(await page.$$('#cRecruit .cand')).length;
ok('列出了 '+candN+' 个可招揽的人，带把握百分比', candN>0&&(await page.textContent('#cRecruit .cand .co')).includes('%'));
await page.evaluate("S.clan.lastPost=-99;renderClan();");
const nBefore=await page.evaluate("clanDisciples().length");
await page.click('#cRecruit .cand button[data-rc]'); await page.waitForTimeout(300);
const nAfter=await page.evaluate("clanDisciples().length");
ok('点招揽有结果（'+nBefore+'→'+nAfter+'）', nAfter>=nBefore);

console.log('\n【人物弹窗上的按钮】');
await page.evaluate(E(`const n=mk({name:'孙可招','武功':45,'好感度':80}); showNpc(n); return 1;`));
await page.waitForTimeout(200);
const rb=await page.textContent('#npcRecruitBtn');
ok('弹窗上有「招入门下」并写了把握：'+rb.trim(), rb.includes('招入门下')&&rb.includes('%'));
await page.evaluate(E(`const n=mk({name:'孙不招','武功':45,'好感度':20}); showNpc(n); return 1;`));
await page.waitForTimeout(200);
ok('不够格时按钮灰着并写明原因：'+(await page.textContent('#npcRecruitBtn')).trim(),
   await page.isDisabled('#npcRecruitBtn'));
await page.evaluate("S.clan=null;S.player.faction='散人';S.sect=null;const n=findNpc('孙可招');showNpc(n);");
await page.waitForTimeout(200);
ok('没门派时这个按钮藏起来', await page.evaluate("getComputedStyle($('npcRecruitBtn')).display")==='none');

console.log('\n【页面报错】');
ok('无 JS 报错'+(errs.length?'：'+errs.slice(0,3).join(' | '):''), errs.length===0);
console.log('\n'+(fails.length?'✗ 失败 '+fails.length+' 项：\n  '+fails.join('\n  '):'✓ 全部 '+oks.length+' 项通过'));
await br.close(); srv.close(); process.exit(fails.length?1:0);
})();
