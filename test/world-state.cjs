// 当前真实脚本的隔离回归：不读取玩家存档、不请求模型、不启动外部浏览器。
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8');
const source=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n').split('/* ================= 界面事件 ================= */')[0];
let passed=0;
function env(){
  const el=()=>({classList:{toggle(){},add(){},remove(){}},addEventListener(){},querySelectorAll:()=>[],querySelector:()=>el(),appendChild(){},remove(){},innerHTML:'',textContent:''});
  const math=Object.create(Math);math.random=()=>0.99;
  const c=vm.createContext({console,window:{addEventListener(){}},document:{getElementById:el,querySelectorAll:()=>[],addEventListener(){},createElement:el},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout:()=>0,clearTimeout(){},Math:math});
  vm.runInContext(source,c);
  const run=s=>vm.runInContext(s,c); const val=s=>JSON.parse(JSON.stringify(run(s)));
  run(`saveGame=()=>{}; S=newStateShell(); S.runId='regression'; S.player={name:'李昭',gender:'男',age:25,lifespan:78,hp:100,money:10000,attributes:{武功:50,谈吐:50,才学:50,颖悟:50},侠名:0,恶名:0,faction:'散人',status:[],arts:[{name:'伏虎拳',style:'刚猛',level:20}],items:{武器:[],秘籍:[],医药:[],毒药:[],杂书:[],其他:[]},skills:{},personality:[]}; S.turn=20;S.date=dateStr();S.scene={location:'客栈',unresolved:[],present:[],uAge:{}};worldState();`);
  return {c,run,val};
}
async function test(name,fn){await fn(env());passed++;console.log('✓ '+name);}
const body=`({narrative:'李昭在客栈练拳，记住了新的发力法。',summary:'练会新发力法',scene:{location:'客栈',unresolved:[]},playerChanges:{attributes:{武功:1},artsTrain:[{name:'伏虎拳',level:1}]},options:[{text:'继续练拳',type:'rest',months:1}],worldUpdates:[],newWorldEvents:[],npcEvents:[],rumors:[]})`;
(async()=>{
await test('明确空列表立即退出关注；不伪称案件完成',({run,val})=>{run(`addUnresolved('追查旧案');applyTurn({scene:{unresolved:[]}},'放下旧案',{fate:10,months:0});`);assert.deepEqual(val('S.scene.unresolved'),[]);assert.match(run('S.ledger.join()'),/退出当前关注/);});
await test('省略列表保留当前目标',({run,val})=>{run(`addUnresolved('追查旧案');applyTurn({scene:{location:'客栈'}},'休息',{fate:10,months:0});`);assert.deepEqual(val('S.scene.unresolved'),['追查旧案']);});
await test('推进中的事项超过12回不消失',({run,val})=>{run(`addUnresolved('追查旧案');for(let i=0;i<20;i++){S.turn++;addUnresolved('追查旧案');ageUnresolved();}`);assert.deepEqual(val('S.scene.unresolved'),['追查旧案']);});
await test('失去关注的旧事项只暂搁',({run,val})=>{run(`addUnresolved('追查旧案');S.turn+=13;ageUnresolved();`);assert.deepEqual(val('S.scene.unresolved'),[]);assert.match(run('S.engineNews.join()'),/暂且搁下/);});
await test('已办带人名选项不原样回流',({run,val})=>{run(`S.npcs=[{name:'岳师伯',alive:true}];S.history=[{action:'找岳师伯打听旧案',summary:'得知镖师行踪'}];`);assert(!val(`dedupeOptions([{text:'找岳师伯打听旧案',type:'normal'}]).map(x=>x.text)`).includes('找岳师伯打听旧案'));});
await test('未选择的有效人物钩子可保留',({run,val})=>{run(`S.npcs=[{name:'岳师伯',alive:true}];S.optSeen={'找岳师伯打听旧案':8};`);assert(val(`dedupeOptions([{text:'找岳师伯打听旧案',type:'normal'}]).map(x=>x.text)`).includes('找岳师伯打听旧案'));});
await test('玩家连续练功选择可保留',({run,val})=>{run(`S.history=[{action:'继续练功',summary:'练到第二式'}];`);assert(val(`dedupeOptions([{text:'继续练功',type:'rest',months:1}]).map(x=>x.text)`).includes('继续练功'));});
await test('已过的相似回合不误触发转场',({run})=>{run(`S.history=[{summary:'在华山练剑第一式'},{summary:'在华山练剑第二式'},{summary:'下山救出被劫的商人'},{summary:'密信送达杭州镖局'}];`);assert.equal(run('stuckLevel()'),0);assert(!/必须让主角离开|必须有一个此前/.test(run('pickNudge()')));});
await test('有结构化进展的连续行动不判卡住',({run})=>{run(`S.history=[{summary:'练拳'},{summary:'练拳',progress:true}];`);assert.equal(run('stuckLevel()'),0);});
await test('世界种子提交后不得原样重复抽中',({run})=>{run(`Math.random=()=>0;S.turn=100;const seed=pickWorldEvent('出去逛逛');recordWorldTurn({},'出去逛逛',{worldEvent:seed});S.turn+=3;`);assert.notEqual(run('pickWorldEvent("出去逛逛")'),run('seed'));});
await test('练功和明确拒绝不被随机大事打断',({run})=>{run('Math.random=()=>0;');assert.equal(run('pickWorldEvent("继续练功")'),null);assert.equal(run('pickWorldEvent("这案不追了")'),null);});
await test('完成事件归档且不能原地重开',({run,val})=>{run(`const e=addWorldThread({title:'追查黑风寨失镖案',cause:'答应镖师寻镖'},'寻镖');recordWorldTurn({worldUpdates:[{id:e.id,stage:'结束',result:'镖银追回，内应伏法'}]},'追回镖银',{});`);assert.deepEqual(val('S.world.events'),[]);assert.equal(run(`addWorldThread({title:'追查黑风寨失镖案',cause:'答应镖师寻镖'},'再说一次')`),null);});
await test('复发需要新原因和旧事件引用',({run})=>{run(`const e=addWorldThread({title:'追查黑风寨失镖案',cause:'答应镖师寻镖'},'寻镖');closeWorldThread(e,'旧案告破');`);assert(run(`addWorldThread({title:'追查黑风寨失镖案',cause:'新商队遭幸存劫匪袭击',recurrenceOf:e.id},'调查新劫案')`));});
await test('玩家拒绝事件后搁置而非完成，消息不挂成任务',({run,val})=>{run(`const e=addWorldThread({title:'追查失镖案',cause:'镖师求助'},'听说');recordWorldTurn({worldUpdates:[{id:e.id,stage:'搁置',text:'主角不接，镖局自行寻人'}]},'拒绝求助',{});const n=normNpc({name:'沈师姐',alive:true,好感度:80,武功:60});S.npcs.push(n);applyConvoEffects(n,{info:'黑风口有埋伏'},true);`);assert.deepEqual(val('S.scene.unresolved'),[]);assert.equal(run('S.world.threads[0].stage'),'搁置');assert(run('S.knowledge.some(k=>k.text.includes("埋伏"))'));});
await test('人物近况与未证实风闻持久记住并区分',({run})=>{run(`S.npcs=[normNpc({name:'岳师伯',alive:true})];recordWorldTurn({npcEvents:['岳师伯与镖师和解'],rumors:['深山有宝藏']},'休息',{});`);assert(run('S.npcs[0].memory.some(x=>x.includes("和解"))'));assert.equal(run('S.knowledge[1].status'),'未证实');});
await test('人物与势力消失令关联旧事件结束',({run})=>{run(`S.npcs=[normNpc({name:'秃鹰',alive:true})];const e=addWorldThread({title:'秃鹰扬言劫镖',cause:'山寨缺粮',actors:['秃鹰']},'听说');S.npcs[0].alive=false;tickWorldThreads();`);assert.equal(run('e.stage'),'结束');});
await test('半年没有新变化退出前台，不能虚构获胜',({run})=>{run(`const e=addWorldThread({title:'镖局求助查案',cause:'失镖'},'听说');S.elapsedDays=181;tickWorldThreads();`);assert.equal(run('e.stage'),'搁置');assert.equal(run('e.result'),'');});
await test('一天短行动不扣整月开销；满30日只扣一次',({run})=>{run(`const money=S.player.money;for(let i=0;i<29;i++)advanceTime(1/30);`);assert.equal(run('S.player.money'),10000);assert.equal(run('S.elapsedDays'),29);run('advanceTime(1/30)');assert.equal(run('S.months'),1);assert.equal(run('S.elapsedDays'),30);assert(run('S.player.money<10000'));});
await test('半月精度一致，两个半月合计一个月',({run})=>{run('advanceTime(0.5)');assert.equal(run('S.elapsedDays'),15);assert.equal(run('S.months'),0);run('advanceTime(0.5)');assert.equal(run('S.months'),1);});
await test('自由输入半年闭关和短等待解析正确',({run})=>{assert.equal(run(`optMonths(null,'闭关半年，钻研伏虎拳')`),6);assert.equal(run(`optMonths(null,'等待三天')`),0.1);assert.equal(run(`optMonths(null,'问一句路怎么走')`),1/30);});
await test('同一榜上人物每年只老化与判成长一次',({run})=>{run(`S.npcs=[normNpc({name:'岳师伯',age:39,武功:80,alive:true})];S.world.ranking=[{name:'岳师伯',age:39,武功:80,alive:true}];Math.random=()=>0;npcYearTick();`);assert.equal(run('S.npcs[0].age'),40);assert.equal(run('S.world.ranking[0].age'),40);assert.equal(run('S.npcs[0]["武功"]'),run('S.world.ranking[0]["武功"]'));});
await test('远方变动不刷新见面时间，转场清空旧在场人',({run,val})=>{run(`S.npcs=[normNpc({name:'岳师伯',alive:true})];S.npcs[0].lastSeen=1;S.scene.present=['岳师伯'];applyTurn({npcUpdates:[{name:'岳师伯',mood:'悲伤',location:'华山'}],scene:{location:'杭州'}},'赶路',{months:0,fate:10});`);assert.equal(run('S.npcs[0].lastSeen'),1);assert.deepEqual(val('S.scene.present'),[]);});
await test('坏回合缺正文被拒绝；错类型与未知人物就地纠正',({run,val})=>{assert.throws(()=>run(`validateTurn({summary:'没正文'},'休息',{fate:10},S)`),/narrative/);assert.ok(Array.isArray(val(`validateTurn({narrative:'有正文',summary:'休息',playerChanges:{artsTrain:{}}},'休息',{fate:10},S).playerChanges.artsTrain`)));assert.deepEqual(val(`validateTurn({narrative:'有正文',summary:'休息',npcUpdates:[{name:'不存在'}]},'休息',{fate:10},S).npcUpdates`),[]);});
await test('预设成败矛盾、自拟判定算错都交给局部修复',({run})=>{assert.throws(()=>run(`validateTurn({narrative:'说服了他',summary:'说服',check:{success:true}},'说服',{fate:10,check:{attr:'谈吐',success:false}},S)`),/对不上/);assert.throws(()=>run(`validateTurn({narrative:'说服了他',summary:'说服',check:{attr:'谈吐',need:99,success:true}},'说服',{fate:10},S)`),/对不上/);});
await test('有效回合只提交一次，预演不改主存档',({run})=>{run(`const owner=S;const judge={fate:10,months:2};const forecast=forecastTurn(S,judge,'练拳');`);assert.equal(run('S.months'),0);assert.equal(run('forecast.state.months'),2);run(`const d=validateTurn(${body},'练拳',judge,forecast.state);S=settleTurnOnce(owner,d,'练拳',judge,'tx-1',forecast);const money=S.player.money;const power=S.player.attributes.武功;S=settleTurnOnce(S,d,'练拳',judge,'tx-1',forecast);`);assert.equal(run('S.months'),2);assert.equal(run('S.turn'),21);assert.equal(run('S.player.money'),run('money'));assert.equal(run('S.player.attributes.武功'),run('power'));});
await test('结算中途异常回滚，不污染主状态或carryDeltas',({run})=>{run(`const owner=S;const originalMoney=S.player.money;const real=applyTurn;applyTurn=(...a)=>{real(...a);throw new Error('注入结算错误')};carryDeltas={武功:2};`);assert.throws(()=>run(`settleTurnOnce(owner,${body},'练拳',{fate:10,months:1},'bad')`),/注入/);assert.equal(run('S'),run('owner'));assert.equal(run('S.player.money'),run('originalMoney'));assert.equal(run('S.turn'),20);assert.equal(run('carryDeltas.武功'),2);});
await test('老存档迁移事件与天数，重复迁移不重新生成',({run})=>{run(`const old=JSON.parse(JSON.stringify(S));old.v=10;old.months=5;delete old.elapsedDays;delete old.world.threads;old.world.events=['镖局失镖'];const migrated=migrate(old);const id=migrated.world.threads[0].id;migrate(migrated);`);assert.equal(run('migrated.v'),11);assert.equal(run('migrated.elapsedDays'),150);assert.equal(run('migrated.world.threads.length'),1);assert.equal(run('migrated.world.threads[0].id'),run('id'));});
await test('后台摘要返回不能串入新局',async({run})=>{run(`let complete;llmJSON=()=>new Promise(r=>complete=r);S.history=Array.from({length:14},(_,i)=>({turn:i,action:'练拳',summary:'有所收获'}));const work=foldHistoryInner();S=newStateShell();S.runId='new-run';complete({text:'旧局经历'});`);await run('work');assert.equal(run('S.volumes.length'),0);});
await test('worldUpdates与战后规则进入提示词',({run})=>{assert.match(run(`turnPrompt('继续练功',{fate:10,months:1})`),/worldUpdates/);assert.match(run(`turnPrompt('继续练功',{fate:10,months:1})`),/禁止为了去重强制转场|不得强制转场/);});
await test('25回连续剧情保留选择、阶段推进、结案不回流',({run})=>{run(`const e=addWorldThread({title:'追查黑风寨失镖案',cause:'镖师求助'},'答应调查');for(let i=0;i<25;i++){const judge={fate:10,months:1/30};const forecast=forecastTurn(S,judge,'继续调查');const data={narrative:'李昭确认第'+i+'条线索。',summary:'确认第'+i+'条线索',scene:{location:'客栈',unresolved:i<4?['追查失镖案']:[]},options:[{text:'自行决定下一步',days:1}],worldUpdates:i<4?[{id:e.id,stage:'升级',text:'查明第'+i+'个疑点'}]:i===4?[{id:e.id,stage:'结束',result:'追回镖银，旧案告破'}]:[],newWorldEvents:[],npcEvents:[],rumors:[]};const d=validateTurn(data,'继续调查',judge,forecast.state);S=settleTurnOnce(S,d,'继续调查',judge,'long-'+i,forecast);}`);assert.equal(run('S.turn'),45);assert.equal(run('S.elapsedDays'),25);assert.equal(run('S.world.threads[0].stage'),'结束');assert.equal(run('S.world.events.length'),0);assert.equal(run('S.scene.unresolved.length'),0);});
await test('真正runTurn保存门派战上下文与已生成的时间预演',async({run})=>{
  run(`beginChapter=()=>{};updateChapterNarrative=()=>{};setBusy=b=>busy=b;toast=()=>{};renderOptions=()=>{};let captured='';llmJSON=async p=>{captured=p;throw new Error('接口调用失败（模拟断线）')};const before=S.player.money;`);
  await run(`runTurn('门派战后续写',{fate:10,months:2,duel:true},{warData:{w:{foe:'血刀门',me:2,them:0,log:[],myDead:[],myHurt:[],foeDead:[],settle:[]},kind:'rout',duel:{log:[],resultText:'胜利'}}})`);
  assert(run('S.pending.extra.warData'));assert.equal(run('S.months'),0);assert.equal(run('S.player.money'),run('before'));assert.equal(run('S.pending.forecast.state.months'),2);assert.match(run('captured'),/门派战实录/);
});
await test('runTurn重试沿用同一预演，显示失败不重复结算',async({run})=>{
  run(`beginChapter=()=>{};updateChapterNarrative=()=>{};setBusy=b=>busy=b;toast=()=>{};renderOptions=()=>{};renderPanel=()=>{};checkAchievements=()=>{};foldHistory=()=>{};finishChapter=()=>{throw new Error('显示失败')};llmJSON=async(p,on,opt)=>opt.validate(${body});`);
  await run(`runTurn('练拳',{fate:10,months:2},{})`);
  assert.equal(run('S.turn'),21);assert.equal(run('S.months'),2);assert.equal(run('S.pending'),null);assert.equal(run('S.committedTurns.length'),1);assert.equal(run('busy'),false);
});
await test('新局不会接收旧回合的模型回复',async({run})=>{
  run(`beginChapter=()=>{};updateChapterNarrative=()=>{};setBusy=b=>busy=b;toast=()=>{};renderOptions=()=>{};let complete;llmJSON=()=>new Promise(r=>complete=r);const work=runTurn('练拳',{fate:10,months:2},{});const owner=S;S=newStateShell();S.runId='different';complete(${body});`);
  await run('work');assert.equal(run('S.runId'),'different');assert.equal(run('S.turn'),0);assert.equal(run('S.player'),null);assert.equal(run('busy'),false);
});
await test('对话计算矛盾被拒绝、赠礼只移除一份',({run})=>{
  run(`S.npcs=[normNpc({name:'沈师姐',alive:true})];S.player.items.医药=[{name:'金创药'},{name:'金创药'}];`);
  assert.throws(()=>run(`validateConvo({reply:'答应了',attempt:{attr:'谈吐',need:99,success:true}},S.npcs[0],10)`),/对不上/);
  run(`removeOneItem('金创药')`);assert.equal(run('S.player.items.医药.length'),1);
});

await test('模拟断线后重试保留相同事务ID和时间预演',async({run})=>{
  run(`beginChapter=()=>{};updateChapterNarrative=()=>{};setBusy=b=>busy=b;toast=()=>{};renderOptions=()=>{};renderPanel=()=>{};checkAchievements=()=>{};foldHistory=()=>{};finishChapter=()=>{};llmJSON=async()=>{throw new Error('接口调用失败（断线）')};`);
  await run(`runTurn('练拳',{fate:10,months:2},{})`);
  run(`const firstId=S.pending.id;const firstPreview=JSON.stringify(S.pending.forecast);llmJSON=async(p,on,opt)=>opt.validate(${body});`);
  await run(`runTurn('练拳',{fate:20,months:6},{})`);
  assert.equal(run('S.turn'),21);assert.equal(run('S.months'),2);assert.equal(run('S.committedTurns[0]'),run('firstId'));assert.equal(run('S.pending'),null);
});
await test('显示故障保存可恢复章节，不重发奖励',async({run})=>{
  run(`beginChapter=()=>{};updateChapterNarrative=()=>{};setBusy=b=>busy=b;toast=()=>{};renderOptions=()=>{};renderPanel=()=>{};checkAchievements=()=>{};foldHistory=()=>{};finishChapter=()=>{throw new Error('显示失败')};llmJSON=async(p,on,opt)=>opt.validate(${body});`);
  await run(`runTurn('练拳',{fate:10,months:2},{})`);
  assert(run('S.lastTurn.d.narrative'));assert.equal(run('S.lastTurn.turn'),20);assert.equal(run('S.months'),2);assert.equal(run('S.committedTurns.length'),1);
});
await test('明确放弃由引擎搁置，模型不能重新挂回待办',({run})=>{
  run(`addUnresolved('追查失镖案');const e=addWorldThread({title:'追查失镖案',cause:'镖师求助'},'听说');const j=makeJudge(null,'不追失镖案了');applyTurn({scene:{unresolved:['追查失镖案']}},'不追失镖案了',j);`);
  assert.equal(run('e.stage'),'搁置');assert.equal(run('S.scene.unresolved.length'),0);
});
await test('短行动不重复展示上回月例，长期月例累计正确',({run})=>{
  run(`S.player.faction='华山派';S.world.factions=[{name:'华山派',alignment:'正派',power:70}];S.sectPay=99;advanceTime(1/30);`);assert.equal(run('S.sectPay'),0);
  run(`advanceTime(2)`);assert.equal(run('S.sectPay'),run('sectStipend()*2'));
});
await test('不允许剧情杀的自由度必须修正文后才能提交',({run})=>{
  run(`S.freedom='free';`);assert.throws(()=>run(`validateTurn({narrative:'主角死了',summary:'身死',gameOver:true},'打听消息',{fate:10},S)`),/不允许/);
});
await test('重要事实超过短台账长度仍按相关性被找回',({run})=>{
  run(`ledger('你把伏虎拳传给了岳师伯');for(let i=0;i<100;i++)ledger('日常小事'+i);`);
  assert(!run('S.ledger.some(t=>t.includes("传给"))'));
  assert(run('S.facts.some(t=>t.text.includes("传给"))'));
  assert.match(run(`stateBlocks('找岳师伯问话')`),/你把伏虎拳传给了岳师伯/);
});

await test('持续调查有新进展时保留继续选择，结案后移除',({run})=>{
  run(`const e=addWorldThread({title:'追查失镖案',cause:'镖师求助'},'接案');S.history=[{action:'继续追查失镖案',progress:true}];`);
  assert(run(`dedupeOptions([{text:'继续追查失镖案',eventId:e.id,days:1}]).some(o=>o.text==='继续追查失镖案')`));
  run(`closeWorldThread(e,'追回镖银');`);
  assert(!run(`dedupeOptions([{text:'继续追查失镖案',eventId:e.id,days:1}]).some(o=>o.text==='继续追查失镖案')`));
});
await test('追查已故人物的旧案不因受害者早已死亡而自动结案',({run})=>{
  run(`S.npcs=[{name:'镖师',alive:false}];const e=addWorldThread({title:'追查镖师死因',cause:'发现遗书',actors:['镖师']},'调查');tickWorldThreads();`);
  assert.equal(run('e.stage'),'发生');
});
await test('重复新建活动事件与照抄旧结果复发都被丢掉',({run,val})=>{
  run(`const e=addWorldThread({title:'追查失镖案',cause:'镖师求助'},'接案');`);
  assert.deepEqual(val(`validateTurn({narrative:'继续调查',summary:'调查',newWorldEvents:[{title:e.title,cause:'又听说了'}]},'调查',{fate:10},S).newWorldEvents`),[]);
  run(`closeWorldThread(e,'追回镖银');`);
  assert.deepEqual(val(`validateTurn({narrative:'旧案重开',summary:'又发生',newWorldEvents:[{title:e.title,cause:e.result,recurrenceOf:e.id}]},'调查',{fate:10},S).newWorldEvents`),[]);
});
await test('统一选项规则不再禁止连续练功或强制月耗时和风闻',({run})=>{
  assert(!run('OPTIONS_RULE.includes("连着练了两回")'));
  assert(!run('OPTIONS_RULE.includes("眼前立刻能做的事填1")'));
  assert(!run('WORLD_RULES.includes("每回合末尾须有江湖风闻")'));
});

console.log(`\n${passed} 项通过`);
})().catch(e=>{console.error(e);process.exitCode=1;});
