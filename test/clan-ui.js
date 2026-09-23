// 宗门界面自测（第 2 块：立派弹窗与宗门页签）
// 用法：node test/clan-ui.js；容器里用 PW_CHROME 指定 chromium
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'));
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);});
const fails=[],oks=[];
const ok=(n,c)=>{(c?oks:fails).push(n);console.log((c?'  ✓ ':'  ✗ ')+n);};
const E=s=>'(()=>{'+s+'})()';
(async()=>{
srv.listen(8942);
const exe=process.env.PW_CHROME||undefined;
const br=await chromium.launch(exe?{executablePath:exe}:{});
const ctx=await br.newContext({viewport:{width:1400,height:900}});
const page=await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errs.push('console:'+m.text());});
await page.addInitScript(()=>localStorage.setItem('wuxia_cfg',JSON.stringify({base:'x',key:'sk-t',model:'m',think:false})));
await page.goto('http://localhost:8942/');
await page.waitForTimeout(500);

const boot=`
  S=newStateShell(); S.freedom='mid'; S.difficulty='normal'; S.ganzhi=0; S.months=0;
  S.player={name:'李逍遥',gender:'男',age:24,lifespan:78,hp:100,money:5000,appearance:'眉目清朗',background:'习武世家',
    attributes:{'谈吐':50,'才学':50,'颖悟':60,'武功':70},'侠名':50,'恶名':0,
    faction:'散人',status:[],arts:[],items:{},skills:{},traits:['重诺'],story:'',title:''};
  S.date=dateStr(); window.act=async()=>{};
  document.querySelectorAll('.modal-mask').forEach(x=>x.classList.remove('on'));
  renderPanel();`;

console.log('\n【没门派时】');
await page.evaluate(E(boot+'return 1;'));
ok('宗门页签藏着', await page.evaluate("getComputedStyle($('tabClanBtn')).display")==='none');
ok('面板师门卡上有「开宗立派」', await page.evaluate("!!$('btnFound')"));

console.log('\n【立派弹窗】');
await page.click('#btnFound'); await page.waitForTimeout(150);
ok('弹窗开了', await page.isVisible('#foundMask .modal'));
ok('派名与山门已随机填上：'+(await page.inputValue('#foundName'))+' · '+(await page.inputValue('#foundBase')),
   (await page.inputValue('#foundName')).length>=2);
ok('开山按钮可按', !(await page.isDisabled('#foundGo')));
ok('门槛写清楚了：'+(await page.textContent('#foundReq')), (await page.textContent('#foundReq')).includes('门槛'));
await page.click('#foundAlign button[data-v="邪道"]'); await page.waitForTimeout(100);
ok('切到邪道，门规与说明跟着换：'+(await page.inputValue('#foundCreed')),
   (await page.textContent('#foundAlignNote')).includes('保护费'));
await page.click('#foundDice'); await page.waitForTimeout(100);
const n2=await page.inputValue('#foundName');
ok('换一个：'+n2, n2.length>=2);
await page.click('#foundAlign button[data-v="正派"]'); await page.waitForTimeout(100);
await page.fill('#foundName','青锋门'); await page.fill('#foundBase','雁回山'); await page.fill('#foundCreed','锄强扶弱，不问出身');
await page.click('#foundGo'); await page.waitForTimeout(300);
ok('立派后弹窗关了', !(await page.isVisible('#foundMask .modal')));
ok('宗门页签冒出来了', await page.evaluate("getComputedStyle($('tabClanBtn')).display")!=='none');
ok('师门卡换成了掌门样子，并有「打理门派」', await page.evaluate("!!$('goClan')"));

console.log('\n【宗门页】');
await page.evaluate(E(`for(let i=0;i<9;i++) addDisciple(makeDisciple({from:'招募'}),true);
  S.clan.treasury=860; S.clan.lastIncome=62; S.clan.lastCost=48;
  for(let i=0;i<8;i++) advanceTime(1);
  S.engineNews=[]; renderPanel(); return 1;`));
await page.click('#goClan'); await page.waitForTimeout(200);
ok('跳到了宗门页', await page.isVisible('#tab-clan'));
const st=await page.textContent('#cSect');
ok('山门卡：'+st.replace(/\s+/g,' ').slice(0,60)+'…', st.includes('青锋门')&&st.includes('雁回山')&&st.includes('公帐'));
const rows=await page.$$('#cRoster .disc');
ok('花名册列出了 '+rows.length+' 个弟子', rows.length>=8);
ok('有排序按钮与一键分派', (await page.$$('#cRoster .csort button')).length>=6&&await page.isVisible('#cAuto'));

console.log('\n【排序】');
const wuOrder=await page.evaluate("[...document.querySelectorAll('#cRoster .disc .dv')].map(x=>parseInt(x.textContent))");
ok('默认按武功从高到低：'+wuOrder.join(','), wuOrder.every((v,i)=>i===0||wuOrder[i-1]>=v));
await page.click('#cRoster .csort button[data-s="资质"]'); await page.waitForTimeout(120);
const tOrder=await page.evaluate("[...document.querySelectorAll('#cRoster .disc .dmeta span:first-child')].map(x=>parseInt(x.textContent.replace(/\\D/g,'')))");
ok('按资质排：'+tOrder.join(','), tOrder.every((v,i)=>i===0||tOrder[i-1]>=v));

console.log('\n【一键分派】');
await page.evaluate("for(const d of clanDisciples()) d.job='修炼'; renderClan();");
await page.click('#cAuto'); await page.waitForTimeout(200);
const jobs=await page.evaluate("clanDisciples().reduce((a,d)=>(a[d.job]=(a[d.job]||0)+1,a),{})");
ok('一键分派后差事分开了：'+JSON.stringify(jobs), Object.keys(jobs).length>=4);
ok('花名册上也跟着变了', (await page.textContent('#cRoster')).includes('经商'));

console.log('\n【弟子弹窗】');
await page.click('#cRoster .disc'); await page.waitForTimeout(200);
ok('弹窗开了：'+(await page.textContent('#discTitle'))+' · '+(await page.textContent('#discSub')).replace(/\s+/g,' '),
   await page.isVisible('#discMask .modal'));
const body=await page.textContent('#discBody');
ok('写了资质、忠诚、到顶多少', body.includes('资质')&&body.includes('忠诚')&&body.includes('此生到顶'));
await page.click('#discJob button[data-v="护山"]'); await page.waitForTimeout(150);
ok('改差事：'+(await page.textContent('#discJobNote')), (await page.textContent('#discJobNote')).includes('守着山门'));
await page.click('#discRank button[data-v="长老"]'); await page.waitForTimeout(200);
ok('提为长老', await page.evaluate("clanDisciples().filter(d=>d.rank==='长老').length")===1);
const quota=await page.evaluate(E(`for(let i=0;i<3;i++){const d=clanDisciples().find(x=>x.rank==='弟子'); if(d) setDiscRank(d,'长老');}
  const err=setDiscRank(clanDisciples().find(x=>x.rank==='弟子'),'长老');
  return {n:clanDisciples().filter(d=>d.rank==='长老').length, err};`));
ok('长老满员三人后拦下第四个：'+quota.err, quota.n===3&&quota.err.includes('满'));
await page.click('#discMask .mbtn'); await page.waitForTimeout(100);
ok('合上了', !(await page.isVisible('#discMask .modal')));

console.log('\n【逐出门墙】');
page.on('dialog',d=>d.accept());
const beforeN=await page.evaluate("clanDisciples().length");
await page.click('#cRoster .disc'); await page.waitForTimeout(150);
await page.click('#discExpel'); await page.waitForTimeout(250);
const afterN=await page.evaluate("clanDisciples().length");
ok('逐出后少一个人（'+beforeN+'→'+afterN+'），花名册里有「来去之人」', afterN===beforeN-1&&(await page.textContent('#cRoster')).includes('来去之人'));

console.log('\n【存档往返】');
const rt=await page.evaluate(E(`saveGame();
  const raw=localStorage.getItem('wuxia_save_v1');
  const back=migrate(JSON.parse(raw));
  return {v:back.v, sv:SAVE_VERSION, name:back.clan&&back.clan.name, n:(back.clan.disciples||[]).length,
    job:(back.clan.disciples[0]||{}).job, treasury:back.clan.treasury};`));
ok('存进去再读回来，门派还在：'+rt.name+' '+rt.n+'人 公帐'+rt.treasury+'两', rt.v===rt.sv&&rt.name==='青锋门'&&rt.n===afterN);

console.log('\n【截图】');
await page.screenshot({path:(process.env.SHOT_DIR||'.')+'/宗门_桌面.png'});
await page.click('#cRoster .disc'); await page.waitForTimeout(200);
await page.screenshot({path:(process.env.SHOT_DIR||'.')+'/宗门_弟子.png'});
await page.click('#discMask .mbtn');
const mob=await br.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
const mp=await mob.newPage();
await mp.addInitScript(()=>localStorage.setItem('wuxia_cfg',JSON.stringify({base:'x',key:'sk-t',model:'m',think:false})));
await mp.goto('http://localhost:8942/');
await mp.waitForTimeout(400);
await mp.evaluate(E(boot+`foundClan({name:'青锋门',alignment:'正派',creed:'锄强扶弱，不问出身',base:'雁回山'});
  for(let i=0;i<9;i++) addDisciple(makeDisciple({from:'招募'}),true);
  S.clan.treasury=860; for(let i=0;i<8;i++) advanceTime(1); autoAssignJobs();
  S.engineNews=[]; renderPanel(); setDrawer(true); gotoTab('clan'); return 1;`));
await mp.waitForTimeout(300);
await mp.screenshot({path:(process.env.SHOT_DIR||'.')+'/宗门_手机.png'});
const tabW=await mp.evaluate("[...document.querySelectorAll('#tabs button')].filter(b=>getComputedStyle(b).display!=='none').map(b=>Math.round(b.getBoundingClientRect().width))");
ok('手机上五个页签宽度 '+tabW.join('/')+'，没被挤爆', tabW.length===5&&Math.min(...tabW)>50);
const overflow=await mp.evaluate("$('tab-clan').scrollWidth<=$('tab-clan').clientWidth+2");
ok('宗门页没有横向溢出', overflow);

console.log('\n【页面报错】');
ok('无 JS 报错'+(errs.length?'：'+errs.slice(0,3).join(' | '):''), errs.length===0);
console.log('\n'+(fails.length?'✗ 失败 '+fails.length+' 项：\n  '+fails.join('\n  '):'✓ 全部 '+oks.length+' 项通过'));
await br.close(); srv.close(); process.exit(fails.length?1:0);
})();
