// 新旧比武胜率对比：旧制按每回合随机选招（强攻/守势/险招/绝招），新制全自动。
// 用法：node test/duel-sim.js [场数]   输出 test/duel-sim.json
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const N=+process.argv[2]||1500;
const serve=(file,port)=>new Promise(r=>{ const html=fs.readFileSync(file); const s=http.createServer((q,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);}); s.listen(port,()=>r(s)); });
const SETUP=`(()=>{
  S=newStateShell(); S.freedom='free';
  S.player={name:'试剑',gender:'男',age:22,attributes:{'武功':60,'谈吐':50,'才学':50,'颖悟':50},hp:100,money:100,status:[],
    items:{'武器':[],'医药':[],'其他':[],'毒药':[],'秘籍':[]},arts:[{name:'伏虎拳',style:'刚猛',level:40},{name:'铁布衫',style:'守御',level:30}],'侠名':0,'恶名':0};
  S.world.ranking=[];
  window.saveGame=()=>{}; window.snapshotDuel=()=>{}; window.renderDuel=()=>{};
})()`;
const GAPS=[-40,-30,-20,-15,-10,-5,0,5,10,15,20,30,40];
async function run(page,mode,gaps,base){
  return page.evaluate(({mode,gaps,N,base})=>{
    const out={};
    for(const g of gaps){
      let w=0,l=0,rounds=0;
      for(let i=0;i<N;i++){
        S.player.attributes['武功']=base; S.player.hp=100; S.player.arts[0].level=base>100?80:40; S.player.arts[1].level=base>100?70:30;
        const opp={name:'对手'+(i%50),identity:'镖师',alignment:'中立',personality:['豪爽'],'武功':base+g,signature:'裂石掌','好感度':40,alive:true};
        let res;
        if(mode==='old'){
          endDuel=k=>{ duel.over=true; duel.result=k; };
          startDuel(opp,{});
          while(!duel.over&&duel.round<60){
            const ks=['A','D','F'].concat(duel.pQi>=actionCost('S')?['S']:[]);
            duelRound(ks[Math.floor(Math.random()*ks.length)]);
          }
          res=duel.result; rounds+=duel.round;
        }else{
          const d={opp,profile:oppProfile(opp),pHp:100,oHp:100,pQi:clamp(50+wuNorm(base)/2),oQi:clamp(50+wuNorm(base+g)/2),
            pW:attrVal(S.player,'武功'),oppW:base+g,log:[],friendly:false,round:0};
          d.eng=adBuild(d);
          let r; do{ r=adRound(d); }while(!r.end);
          res=r.end; rounds+=d.round;
        }
        if(res==='lose'||res==='yield') l++; else if(res!=='draw') w++;
      }
      out[g]={win:w/N,rounds:rounds/N};
    }
    return out;
  },{mode,gaps,N,base});
}
(async()=>{
  const root=path.join(__dirname,'..');
  const oldFile=process.env.OLD||path.join(root,'..','index.orig.html');
  const s1=await serve(oldFile,8951), s2=await serve(path.join(root,'index.html'),8952);
  const br=await chromium.launch(process.env.PW_CHROME?{executablePath:process.env.PW_CHROME}:{});
  const res={};
  for(const [mode,port] of [['old',8951],['new',8952]]){
    const page=await br.newPage();
    await page.goto('http://localhost:'+port+'/'); await page.waitForTimeout(500);
    await page.evaluate(SETUP);
    if(process.env.ADX&&mode==='new') await page.evaluate(x=>Object.assign(AD,x),JSON.parse(process.env.ADX));
    for(const base of [60,300]){ res[mode+base]=await run(page,mode,GAPS,base); }
    await page.close();
  }
  await br.close(); s1.close(); s2.close();
  console.log('差距  旧60  新60  旧300 新300 | 回合 旧60 新60');
  for(const g of GAPS){
    const f=x=>(x*100).toFixed(0).padStart(4)+'%';
    console.log(String(g).padStart(4),f(res.old60[g].win),f(res.new60[g].win),f(res.old300[g].win),f(res.new300[g].win),' |',res.old60[g].rounds.toFixed(1).padStart(5),res.new60[g].rounds.toFixed(1).padStart(5));
  }
  fs.writeFileSync(path.join(__dirname,'duel-sim.json'),JSON.stringify({gaps:GAPS,res},null,1));
})();
