// 本派写进提示词（第 6 块）
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'));
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);});
const fails=[],oks=[];
const ok=(n,c)=>{(c?oks:fails).push(n);console.log((c?'  ✓ ':'  ✗ ')+n);};
const E=s=>'(()=>{'+s+'})()';
(async()=>{
srv.listen(8946);
const exe=process.env.PW_CHROME||undefined;
const br=await chromium.launch(exe?{executablePath:exe}:{});
const page=await(await br.newContext()).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.addInitScript(()=>localStorage.setItem('wuxia_cfg',JSON.stringify({base:'x',key:'sk-t',model:'m'})));
await page.goto('http://localhost:8946/'); await page.waitForTimeout(500);
const boot=`
  S=newStateShell(); S.freedom='mid'; S.difficulty='normal'; S.months=200;
  S.player={name:'李逍遥',gender:'男',age:41,lifespan:78,hp:100,money:9000,appearance:'眉目清朗',background:'习武世家',backstory:'幼年丧父',
    attributes:{'谈吐':60,'才学':50,'颖悟':60,'武功':92},'侠名':70,'恶名':0,
    faction:'散人',status:[],arts:[],items:{},skills:{},traits:[],story:'',title:''};
  S.date=dateStr();
  S.world.factions=[{name:'华山派',alignment:'正派',power:40,leader:'岳不徐',desc:''},
                    {name:'血刀门',alignment:'邪道',power:55,leader:'屠九',desc:''}];`;

console.log('\n【没门派时】');
const none=await page.evaluate(E(boot+'return {blk:clanBlock(), sb:stateBlocks().includes("【本派】")};'));
ok('不写【本派】这一段', none.blk===''&&!none.sb);

console.log('\n【有门派·长记忆】');
const long=await page.evaluate(E(boot+`
  foundClan({name:'青锋门',alignment:'正派',creed:'锄强扶弱',base:'雁回山'});
  S.clan.power=72; S.clan.fame=80; S.clan.treasury=3400; S.clan.wins=2; S.clan.losses=1;
  S.clan.annexed=['点苍派']; S.clan.allies=['丐帮'];
  S.clan.wars=[{foe:'点苍派',month:190,result:'rout',score:'3:0',myDead:[],foeDead:[],taken:[]}];
  for(let i=0;i<8;i++){ const d=makeDisciple({from:'招募'}); d['武功']=40+i*5; addDisciple(d,true); }
  S.clan.fallen=[{name:'某甲','武功':30,when:'',how:'亡故'}];
  S.memLong=true;
  const b=clanBlock();
  return {b, inState:stateBlocks().includes('【本派】'), len:b.length};`));
ok('写进了 stateBlocks（'+long.len+' 字）', long.inState);
ok('点明了是主角自己创立、他是掌门', long.b.includes('主角一手创立')&&long.b.includes('这不是别人的门派'));
ok('带上立场、山门、门规、势力、威望、公帐',
   ['正派','雁回山','锄强扶弱','势力72','威望80','3400两'].every(k=>long.b.includes(k)));
ok('列了挑得出头的弟子与位阶差事', /武功\d+/.test(long.b)&&long.b.includes('修炼'));
ok('带上吞并、臣服、尚未低头的门派',
   long.b.includes('已吞并：点苍派')&&long.b.includes('已臣服本派：丐帮')&&long.b.includes('尚未低头的：华山派、血刀门'));
ok('带上战史与最近一仗', long.b.includes('2 胜 1 负')&&long.b.includes('胜点苍派'));
ok('明确告诉模型：弟子可写，门派数字不许改',
   long.b.includes('全由引擎记账')&&long.b.includes('不要在任何字段里改动'));
console.log('    ——\n'+long.b.trim().split('\n').map(x=>'    '+x).join('\n'));

console.log('\n【短记忆时压成一行】');
const short=await page.evaluate("S.memLong=false; clanBlock()");
ok('压到 '+short.trim().length+' 字，只剩要紧的', short.trim().length<110&&short.includes('青锋门')&&short.includes('掌门'));
console.log('    '+short.trim());

console.log('\n【盟主与一统的口径】');
const st=await page.evaluate(E(`S.memLong=true; S.clan.leagueLeader=true;
  const a=clanBlock(); S.clan.unified=true; const b=clanBlock();
  return {a,b};`));
ok('当上盟主后写明', st.a.includes('武林盟主'));
ok('一统之后改口', st.b.includes('一统江湖')&&!st.b.includes('战史'));

console.log('\n【模型改不动本派的数字】');
const guard=await page.evaluate(E(`
  S.clan.unified=false; S.clan.leagueLeader=false; S.clan.power=72;
  const before=S.clan.power;
  applyTurn({narrative:'',summary:'',factionUpdates:[{name:'青锋门',power:-60,leader:'张三'},{name:'华山派',power:-10}],
    playerChanges:{},npcUpdates:[],options:[]},'试试',{fate:10,check:null,months:0});
  const own=S.world.factions.find(f=>f.own), hua=S.world.factions.find(f=>f.name==='华山派');
  return {ownPower:own.power, ownLeader:own.leader, clanPower:S.clan.power, before, hua:hua.power};`));
ok('模型把本派势力砍 60 不作数（'+guard.before+' → '+guard.ownPower+'）', guard.ownPower===guard.clanPower);
ok('模型也换不掉掌门（'+guard.ownLeader+'）', guard.ownLeader==='李逍遥');
ok('别派的势力它还是改得动（华山 40 → '+guard.hua+'）', guard.hua===30);

console.log('\n【整段提示词拼得出来】');
const full=await page.evaluate("turnPrompt('去山门外走走',{fate:12,check:null,worldEvent:null,months:1}).length");
ok('常规回合提示词 '+full+' 字，没炸', full>2000);

console.log('\n【页面报错】');
ok('无 JS 报错'+(errs.length?'：'+errs.slice(0,3).join(' | '):''), errs.length===0);
console.log('\n'+(fails.length?'✗ 失败 '+fails.length+' 项：\n  '+fails.join('\n  '):'✓ 全部 '+oks.length+' 项通过'));
await br.close(); srv.close(); process.exit(fails.length?1:0);
})();
