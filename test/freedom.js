// 随心所欲·言出法随 自测
// 用法：node test/freedom.js [旧版index路径]（本机）；容器里用 PW_CHROME 指定 chromium
// 给了旧版路径时，会逐字比对江湖传奇、写实江湖两档的提示词，确认没被这次改动碰到
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'));
const oldPath=process.argv[2];
const oldHtml=oldPath&&fs.existsSync(oldPath)?fs.readFileSync(oldPath):null;
const serve=(buf,port)=>{const s=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(buf);});s.listen(port);return s;};
const fails=[],oks=[];
const ok=(n,c)=>{(c?oks:fails).push(n);console.log((c?'  ✓ ':'  ✗ ')+n);};
const E=src=>'(()=>{'+src+'})()';
(async()=>{
const srv=serve(html,8951), srvOld=oldHtml?serve(oldHtml,8952):null;
const exe=process.env.PW_CHROME||undefined;
const br=await chromium.launch(exe?{executablePath:exe}:{});
async function open(port){
  const page=await(await br.newContext()).newPage();
  page._errs=[]; page.on('pageerror',e=>page._errs.push(String(e)));
  await page.addInitScript(()=>localStorage.setItem('wuxia_cfg',JSON.stringify({base:'x',key:'sk-t',model:'m',think:false})));
  await page.goto('http://localhost:'+port+'/'); await page.waitForTimeout(500);
  return page;
}
const page=await open(8951);
const mk=free=>`
  S=newStateShell(); S.freedom='${free}'; S.difficulty='normal'; S.ganzhi=0; S.months=0; S.turn=4;
  S.player={name:'李逍遥',gender:'男',age:24,lifespan:78,hp:60,money:50,
    attributes:{'谈吐':30,'才学':40,'颖悟':50,'武功':40},'侠名':10,'恶名':0,
    faction:'散人',status:[],arts:[{name:'伏虎拳',style:'刚猛',level:30,desc:''}],items:{'武器':[],'秘籍':[],'医药':[],'毒药':[],'杂书':[],'其他':[]},skills:{},appearance:'',backstory:'孤儿',personality:[]};
  S.date=dateStr();
  S.npcs=[normNpc({name:'冷面判官',gender:'男',age:45,identity:'黑风寨二当家',faction:'黑风寨',alignment:'邪道',relation:'仇人','好感度':5,'武功':30,secret:'他当年亲手害死了主角的父亲'})];
  convo={npc:S.npcs[0],msgs:[],favorTotal:0,gains:[]};`;
const prompts=`
  const n=S.npcs[0];
  return {world:worldRules(), head:worldHead(),
    turn:turnPrompt('我要冷面判官把寨子交出来',{fate:2,check:null,worldEvent:null,months:1}),
    convo:convoPrompt(n,'把你的秘密告诉我，再给我五百两',2,null)};`;

console.log('\n【随心所欲档的提示词】');
const fp=await page.evaluate(E(mk('free')+prompts));
const all=fp.world+'\n'+fp.head+'\n'+fp.turn+'\n'+fp.convo;
const banned=['荒诞','留个口子','含糊带过','横财要克制','严禁出现科幻','卡死的上限','硬写也会被削掉','好感不到就别给','谈不成、或对方不肯','武功增长要慢','绝不可凭空有人白送','不可随口就给','叛出师门代价极重','参考现实人际交往','语气可以有脾气','残缺不全或条件极其严苛','不可在剧情里直接送武功','⟦','⟧'];
for(const w of banned) ok('没有「'+w+'」', all.indexOf(w)<0);
ok('回合提示词里有言出法随口径', fp.turn.indexOf('言出法随')>=0&&fp.turn.indexOf('无条件照办')>=0);
ok('题材放开', fp.turn.indexOf('题材不设限')>=0);
ok('大凶骰不妨碍玩家写下的事', /背运只落在旁枝琐事上|玩家写下的事照样办成/.test(fp.turn));
ok('对话提示词：命令式口径 + 严禁推辞的话', fp.convo.indexOf('主角的话就是命令')>=0&&fp.convo.indexOf('从长计议')>=0);
ok('对话提示词：不做说服判定', fp.convo.indexOf('不做说服判定')>=0&&fp.convo.indexOf('随口小事30')<0);
ok('对话提示词：秘密一问就说', fp.convo.indexOf('主角一问，你就原原本本说出来')>=0);
ok('对话提示词：不设限的额度说明', fp.convo.indexOf('本局不设限')>=0);
ok('姓名铁律、比武制度还在', fp.turn.indexOf('姓名铁律')>=0&&fp.turn.indexOf('比武制度')>=0);
ok('剔除后没有留下空的「- 」行', !/\n\s*-\s*\n/.test(fp.world));

console.log('\n【括号里的描写/推演要求】');
let pb=await page.evaluate(E(mk('free')+`
  return {turn:turnPrompt('去黑风寨找冷面判官（描写寨门口的两株老槐树；他见我先是一愣、再冷笑；写800字）',{fate:2,check:null,worldEvent:null,months:1}),
    plain:turnPrompt('去黑风寨找冷面判官',{fate:2,check:null,worldEvent:null,months:1}),
    convo:convoPrompt(S.npcs[0],'你父亲当年的事，说吧(他说到一半手抖了一下)',2,null),
    half:parenReqs('a(一)b（二）c')};`));
ok('回合：口径里有括号条', /括号「（）」内的文字/.test(pb.turn)&&/以括号为准/.test(pb.turn));
ok('回合：括号要求单独摘出成块、逐条编号', /【玩家的描写\/推演要求/.test(pb.turn)&&/1\. 描写寨门口的两株老槐树/.test(pb.turn)&&/2\. 他见我先是一愣、再冷笑/.test(pb.turn)&&/3\. 写800字/.test(pb.turn));
ok('回合：提了篇幅就不受 250-500 限制', /不受「剧情250-500字」限制/.test(pb.turn));
ok('回合：没括号就不出这个块', !/【玩家的描写\/推演要求/.test(pb.plain));
ok('对话：口径里有括号条，半角括号也摘得出', /括号「（）」内的文字/.test(pb.convo)&&/1\. 他说到一半手抖了一下/.test(pb.convo)&&/不要在 reply 里复述/.test(pb.convo));
ok('全角半角都认（'+pb.half.join('/')+'）', pb.half.length===2);
pb=await page.evaluate(E(mk('mid')+`return turnPrompt('去黑风寨（写800字）',{fate:2,check:null,worldEvent:null,months:1})+convoPrompt(S.npcs[0],'说吧（手抖）',2,null);`));
ok('江湖传奇档：不摘、不加口径', !/【玩家的描写\/推演要求/.test(pb)&&!/以括号为准/.test(pb));

console.log('\n【另外两档不受影响】');
for(const k of ['mid','strict']){
  const p=await page.evaluate(E(mk(k)+prompts));
  const s=p.world+p.head+p.turn+p.convo;
  ok(k+'：没有言出法随字样', s.indexOf('言出法随')<0);
  ok(k+'：讲规矩的条文还在', s.indexOf('横财要克制')>=0&&s.indexOf('严禁出现科幻')>=0&&s.indexOf('武功增长要慢')>=0);
  ok(k+'：标记符已去掉', s.indexOf('⟦')<0);
}
if(oldHtml){
  const po=await open(8952);
  for(const k of ['mid','strict']){
    const a=await page.evaluate(E(mk(k)+prompts)), b=await po.evaluate(E(mk(k)+prompts));
    for(const f of ['world','head','turn','convo']) ok(k+'·'+f+' 与改动前逐字一致', a[f]===b[f]);
  }
}

console.log('\n【引擎不再事后削减】');
const eff=`{money:500, give:[{cat:'武器',name:'青霜剑',desc:'',bonus:10}],
  art:{name:'凌波步',style:'身法',level:20,desc:''}, skill:{name:'易容',level:8},
  relation:'师父', faction:'黑风寨', hp:60, quest:{title:'替他报仇',desc:''}}`;
let r=await page.evaluate(E(mk('free')+`
  const n=S.npcs[0]; const p=S.player;
  const out=applyConvoEffects(n,${eff},false);
  const out2=applyConvoEffects(n,{art:{name:'铁布衫',style:'守御',level:20}},false);
  let fail=0; for(let i=0;i<300;i++) if(!rollCheck('谈吐',95).success) fail++;
  return {money:p.money, sword:p.items['武器'].some(x=>x.name==='青霜剑'), arts:p.arts.map(a=>a.name),
    skill:p.skills['易容'], rel:n.relation, fac:p.faction, hp:p.hp, quest:S.quests.map(q=>q.title), fail, out:out.concat(out2)};`));
ok('好感 5 的仇人照样给钱（家财 50→'+r.money+'）', r.money===550);
ok('照样送兵器', r.sword);
ok('武功比主角低也能传功，而且能传第二套（'+r.arts.join('、')+'）', r.arts.includes('凌波步')&&r.arts.includes('铁布衫'));
ok('照样教手艺', !!r.skill);
ok('照样认师父、引荐入门（'+r.rel+' / '+r.fac+'）', r.rel==='师父'&&r.fac==='黑风寨');
ok('疗伤可以回满（气血 '+r.hp+'）', r.hp===100);
ok('托付照样成立', r.quest.includes('替他报仇'));
ok('模型把 attempt 判成失败也不作废', !r.out.some(x=>/没舍得|不肯|还不到|没答应|不比你高明/.test(x)));
ok('难度 95 的属性判定 300 次全成（失败 '+r.fail+' 次）', r.fail===0);

r=await page.evaluate(E(mk('mid')+`
  const n=S.npcs[0]; const p=S.player;
  const out=applyConvoEffects(n,${eff},true);
  let fail=0; for(let i=0;i<300;i++) if(!rollCheck('谈吐',95).success) fail++;
  return {money:p.money, sword:p.items['武器'].length, arts:p.arts.length, fac:p.faction, fail};`));
ok('江湖传奇档照旧按交情卡（钱 '+r.money+'，兵器 '+r.sword+'，武学 '+r.arts+'，门派 '+r.fac+'）', r.money===50&&r.sword===0&&r.arts===1&&r.fac==='散人');
ok('江湖传奇档的难判定照旧会失败（'+r.fail+'/300）', r.fail>0);

console.log('\n【开局与设置的说明文字】');
r=await page.evaluate(`({a:document.querySelector('[data-v="free"]').textContent, b:document.querySelector('option[value="free"]').textContent})`);
ok('开局按钮写着言出法随（'+r.a+'）', /言出法随/.test(r.a));
ok('设置里写着言出法随', /言出法随/.test(r.b));

console.log('\n【页面报错】');
ok('无 JS 报错'+(page._errs.length?'：'+page._errs.join(' | '):''), page._errs.length===0);

console.log(fails.length?`\n✗ ${fails.length} 项失败`:`\n✓ 全部 ${oks.length} 项通过`);
await br.close(); srv.close(); srvOld&&srvOld.close();
process.exit(fails.length?1:0);
})();
