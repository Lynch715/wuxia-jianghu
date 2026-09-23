// 头像匹配与换画像自测
// 用法：node test/avatar.js（本机）；容器里用 PW_CHROME 指定 chromium
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'));
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);});
const fails=[],oks=[];
const ok=(n,c)=>{(c?oks:fails).push(n);console.log((c?'  ✓ ':'  ✗ ')+n);};
const E=src=>'(()=>{'+src+'})()';
(async()=>{
srv.listen(8947);
const exe=process.env.PW_CHROME||undefined;
const br=await chromium.launch(exe?{executablePath:exe}:{});
const page=await(await br.newContext({viewport:{width:1280,height:900}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errs.push('console:'+m.text());});
await page.addInitScript(()=>localStorage.setItem('wuxia_cfg',JSON.stringify({base:'x',key:'sk-t',model:'m',think:false})));
await page.goto('http://localhost:8947/');
await page.waitForTimeout(600);

const mk=`
  S=newStateShell(); S.freedom='mid'; S.difficulty='normal'; S.ganzhi=0; S.months=0;
  S.player={name:'李逍遥',gender:'男',age:24,lifespan:78,hp:100,money:500,
    attributes:{'谈吐':50,'才学':50,'颖悟':60,'武功':60},'侠名':10,'恶名':0,
    faction:'散人',status:[],arts:[],items:{},skills:{},appearance:'',backstory:'',personality:[]};
  S.date=dateStr();
  const npc=o=>normNpc(Object.assign({name:'某人',gender:'女',age:24,identity:'',faction:'散人',relation:'',notes:''},o));`;

console.log('\n【匹配规则】');
let r=await page.evaluate(E(mk+`
  const out={};
  out.shijie=npc({name:'周芷若',relation:'大师姐',identity:'峨眉派弟子'}).avatar;
  out.gai=npc({name:'黄蓉',identity:'丐帮帮主'}).avatar;
  out.dao=npc({name:'李莫愁',identity:'古墓派道姑',age:40}).avatar;
  out.nun=npc({name:'灭绝',identity:'峨眉派掌门师太',age:62}).avatar;
  out.gov=npc({name:'冷捕头',identity:'女捕快',age:28}).avatar;
  out.monkY=npc({name:'慧明',gender:'男',identity:'少林寺僧人',age:30}).avatar;
  out.monkO=npc({name:'玄苦',gender:'男',identity:'少林寺方丈',age:72}).avatar;
  out.monkNote=npc({name:'张三',gender:'男',age:30,identity:'镖师',notes:'曾在少林寺跟大师学艺',relation:'乞求主角帮忙'}).avatar;
  out.shixiong=npc({name:'令狐冲',gender:'男',age:26,identity:'华山派弟子',relation:'大师兄'}).avatar;
  out.maskF=npc({name:'黑衣女',identity:'刺客',age:25}).avatar;
  out.noAge=npc({name:'无岁',gender:'女',age:0,identity:'过路人'}).avatar;
  return out;`));
ok('女弟子关系写「大师姐」→ 女青年脸（'+r.shijie+'）', /^f2_/.test(r.shijie));
ok('女丐帮帮主 → 不给乞丐男孩，给女脸（'+r.gai+'）', /^f/.test(r.gai));
ok('道姑 → 女中年脸（'+r.dao+'）', /^f3_/.test(r.dao));
ok('师太 62 岁 → 女老年脸（'+r.nun+'）', /^f4_/.test(r.nun));
ok('女捕快 → 女脸，不给男差役（'+r.gov+'）', /^f/.test(r.gov));
ok('30 岁僧人 → 中年和尚（'+r.monkY+'）', r.monkY==='x_monk_01');
ok('72 岁方丈 → 老苦行僧（'+r.monkO+'）', r.monkO==='x_monk_02');
ok('备注里提到少林大师、关系里有「乞」→ 不再误判特型（'+r.monkNote+'）', /^m2_/.test(r.monkNote));
ok('「大师兄」不再命中和尚（'+r.shixiong+'）', /^m2_/.test(r.shixiong));
ok('女刺客 → 可以用蒙面客通用图（'+r.maskF+'）', /^x_mask_0[12]$/.test(r.maskF));
ok('年龄没填 → 不落到少年桶（'+r.noAge+'）', /^f2_/.test(r.noAge));

console.log('\n【性别推断】');
r=await page.evaluate(E(mk+`
  return {
    lbn:npc({name:'王二',gender:'',identity:'客栈老板娘',age:40}).gender,
    sis:npc({name:'小翠',gender:'',relation:'师妹',age:18}).gender,
    name:npc({name:'林霜月',gender:'',identity:'剑客',age:30}).gender,
    male:npc({name:'赵大',gender:'',identity:'镖局汉子',age:30}).gender,
    avOk:(()=>{const n=npc({name:'王二',gender:'',identity:'客栈老板娘',age:40});return n.avatar;})()
  };`));
ok('没填性别的「客栈老板娘」→ 女', r.lbn==='女');
ok('没填性别、关系「师妹」→ 女', r.sis==='女');
ok('没填性别、名字「林霜月」→ 女', r.name==='女');
ok('没填性别的「镖局汉子」→ 男', r.male==='男');
ok('老板娘分到女中年脸（'+r.avOk+'）', /^f3_/.test(r.avOk));

console.log('\n【后期生成的人物】');
r=await page.evaluate(E(mk+`
  S.world.ranking=[{name:'冷月姑',gender:'女',faction:'月影宫','武功':80,note:'月影刀',alive:true,age:50}];
  S.lastChallengeMonth=-99;
  const _sd=startDuel; startDuel=()=>{}; try{ challengeRanked('冷月姑'); }finally{ startDuel=_sd; }
  const n=findNpc('冷月姑');
  const fn=[]; for(let i=0;i<40;i++) fn.push({g:'女',n:makeRankName('女')});
  const bad=fn.filter(x=>!RK_GIVEN_F.some(g=>x.n.indexOf(g)>0));
  const f=makeFoeFighters({name:'黑风寨',power:50,alignment:'邪道'});
  const d=makeDisciple({from:'招募'});
  return {g:n&&n.gender, av:n&&n.avatar, bad:bad.length, foe:f.every(x=>x.name&&x.gender), dg:d.gender, dn:d.name,
          rk:(()=>{ S.world.ranking=[]; S.world.vacant=2; S.rankVacantTurns=5; try{ rankRefresh(); }catch(e){ return 'err:'+e.message; }
                    return (S.world.ranking||[]).every(x=>x.gender); })()};`));
ok('挑战女性榜上高手 → 名录里是女的（'+r.g+'）、女脸（'+r.av+'）', r.g==='女'&&/^f/.test(r.av));
ok('女性随机名全部取自女名表', r.bad===0);
ok('敌方打手都有名字和性别', r.foe);
ok('招来的弟子有性别、名字（'+r.dg+' '+r.dn+'）', !!r.dg&&!!r.dn);
ok('江湖榜补缺的人都带性别（'+r.rk+'）', r.rk===true);

console.log('\n【老存档自愈】');
r=await page.evaluate(E(mk+`
  const old=JSON.parse(JSON.stringify(S)); old.v=9;
  old.npcs=[
    {name:'周芷若',gender:'女',age:24,identity:'峨眉派弟子',relation:'大师姐',avatar:'x_monk_02',portrait:'老苦行僧，光头灰僧衣，枯瘦长眉，入定',memory:[],fromPlayer:[]},
    {name:'苏小妹',gender:'',age:20,identity:'客栈老板娘',avatar:'m4_01',portrait:'老掌门',memory:[],fromPlayer:[]},
    {name:'林霜月',gender:'男',age:50,identity:'月影刀',notes:'江湖榜上人物',avatar:'m3_01',memory:[],fromPlayer:[]},
    {name:'锁住的',gender:'女',age:24,identity:'侠女',avatar:'m4_01',avatarLocked:true,portrait:'老掌门，玄色宽袍，白发白须，清癯沉凝',memory:[],fromPlayer:[]},
    {name:'长大的',gender:'女',age:16,identity:'丫鬟',avatar:'f1_01',memory:[],fromPlayer:[]}
  ];
  old.world.ranking=[{name:'林霜月',faction:'月影宫','武功':80,note:'月影刀',alive:true,age:50}];
  const s=migrate(old); S=s;
  const by=nm=>s.npcs.find(x=>x.name===nm);
  const grown=by('长大的'); const a1=avSlotOf(grown); grown.age=30; const a2=avSlotOf(grown); grown.age=60; const a3=avSlotOf(grown);
  return {v:s.v, zr:by('周芷若').avatar, zrP:by('周芷若').portrait, sx:by('苏小妹'), lin:by('林霜月'), lk:by('锁住的'),
    a1,a2,a3, rkG:s.world.ranking[0].gender};`));
ok('存档升到 v'+r.v, r.v===10);
ok('周芷若的老和尚脸被换掉（'+r.zr+'）', /^f2_/.test(r.zr));
ok('画像描述跟着换（'+r.zrP+'）', r.zrP&&!/僧/.test(r.zrP));
ok('没性别的老板娘补成女、换女脸（'+r.sx.gender+' '+r.sx.avatar+'）', r.sx.gender==='女'&&/^f/.test(r.sx.avatar));
ok('被写死成男的榜上「林霜月」认回女（'+r.lin.gender+' '+r.lin.avatar+'）', r.lin.gender==='女'&&/^f/.test(r.lin.avatar));
ok('手动锁定的脸不被覆盖', r.lk.avatar==='m4_01'&&r.lk.avatarLocked===true);
ok('16→30 岁差一档，脸不变（'+r.a1+'→'+r.a2+'）', r.a1==='f1_01'&&r.a2==='f1_01');
ok('长到 60 岁差三档，换成老年脸（'+r.a3+'）', /^f4_/.test(r.a3));

console.log('\n【提示词】');
r=await page.evaluate(E(mk+`
  S.player.avatar='m3_02'; S.player.avatarLocked=true; S.player.portrait=avDesc('m3_02');
  const t=turnPrompt('四处走走',{fate:10,check:null,worldEvent:null,months:1});
  return {has:t.indexOf(avDesc('m3_02'))>=0, noKey:t.indexOf('"avatarLocked"')<0&&t.indexOf('"avatar"')<0};`));
ok('主角画像描述进了提示词', r.has);
ok('avatar/avatarLocked 这种内部字段没漏进提示词', r.noKey);

console.log('\n【换画像界面】');
await page.evaluate(E(mk+`
  S.npcs=[normNpc({name:'周芷若',gender:'女',age:24,identity:'峨眉派弟子',relation:'大师姐','好感度':40})];
  S.turn=3; S.recent=[]; S.history=[];
  document.querySelectorAll('.modal-mask').forEach(x=>x.classList.remove('on'));
  renderPanel(); showNpc(S.npcs[0]);`));
await page.waitForTimeout(200);
await page.screenshot({path:require('path').join(__dirname,'..','Claude outputs','头像_人物弹窗.png')});
await page.click('#npcAvSwap');
await page.waitForTimeout(200);
r=await page.evaluate(`({on:$('avMask').classList.contains('on'), n:$('avMBody').querySelectorAll('.cell').length,
  first:[...$('avMBody').querySelectorAll('.avsec')].map(x=>x.textContent)[0]})`);
ok('点头像弹出换画像面板（'+r.n+' 格）', r.on&&r.n===57);
ok('同性别排在最前（'+r.first+'）', /^女/.test(r.first||''));
await page.screenshot({path:require('path').join(__dirname,'..','Claude outputs','头像_换画像面板.png')});
await page.click('#avMBody .cell[data-a="f3_02"]');
await page.waitForTimeout(150);
r=await page.evaluate(`({a:S.npcs[0].avatar,l:S.npcs[0].avatarLocked,p:S.npcs[0].portrait,d:avDesc('f3_02'),now:$('avMNow').textContent})`);
ok('选中后锁定、画像描述同步', r.a==='f3_02'&&r.l===true&&r.p===r.d&&r.now.indexOf('已锁定')===0);
await page.click('#avMBody details summary');
await page.click('#avMBody .cell[data-a="m4_01"]');
r=await page.evaluate(`({a:S.npcs[0].avatar, fits:avSlotOf(S.npcs[0])})`);
ok('可以跨性别选，且不被校验改回去', r.a==='m4_01'&&r.fits==='m4_01');
await page.click('#avMBody .cell.auto');
r=await page.evaluate(`({a:S.npcs[0].avatar,l:S.npcs[0].avatarLocked})`);
ok('「随天意」解锁并交回自动分配（'+r.a+'）', r.l===false&&/^f2_/.test(r.a));
await page.evaluate(`$('avMask').classList.remove('on');$('npcMask').classList.remove('on')`);
await page.click('#pFace .avswap');
await page.waitForTimeout(150);
r=await page.evaluate(`({on:$('avMask').classList.contains('on'), t:$('avMTitle').textContent+' '+$('avMSub').textContent})`);
ok('主角头像也能点开换（'+r.t+'）', r.on&&/主角/.test(r.t));
await page.click('#avMBody .cell[data-a="m2_03"]');
r=await page.evaluate(`({a:S.player.avatar,l:S.player.avatarLocked,face:$('pFace').innerHTML.indexOf('avatar')>=0})`);
ok('主角换脸生效、面板刷新', r.a==='m2_03'&&r.l===true&&r.face);

// 手机端
await page.setViewportSize({width:390,height:844});
await page.waitForTimeout(150);
r=await page.evaluate(`(()=>{const m=document.querySelector('#avMask .modal');return {w:m.scrollWidth,cw:m.clientWidth}})()`);
ok('手机宽度下面板不横向溢出', r.w<=r.cw+1);
await page.screenshot({path:require('path').join(__dirname,'..','Claude outputs','头像_换画像_手机.png')});

console.log('\n【页面报错】');
ok('无 JS 报错'+(errs.length?'：'+errs.slice(0,3).join(' | '):''), errs.length===0);

console.log(fails.length?`\n✗ ${fails.length} 项失败`:`\n✓ 全部 ${oks.length} 项通过`);
await br.close(); srv.close();
process.exit(fails.length?1:0);
})();
