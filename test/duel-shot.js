// 自动比武画面截图：node test/duel-shot.js [输出目录]
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const {pickBody,sse}=require('./mock');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'));
const OUT=process.argv[2]||'/tmp/duelshots'; fs.mkdirSync(OUT,{recursive:true});
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html);});
async function one(br,name,vp,mobile,frames){
  const ctx=await br.newContext({viewport:vp,deviceScaleFactor:2,isMobile:mobile,hasTouch:mobile});
  const page=await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(String(e))); page.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
  await page.route('**/chat/completions',async route=>{ const b=JSON.parse(route.request().postData()); await route.fulfill({status:200,headers:{'Content-Type':'text/event-stream'},body:sse(pickBody(b.messages[b.messages.length-1].content))}); });
  await page.addInitScript(()=>{localStorage.setItem('wuxia_cfg',JSON.stringify({base:'https://api.deepseek.com',key:'sk-test',model:'m',think:false}));});
  await page.goto('http://localhost:8945/');
  await page.click('#crStart'); await page.waitForSelector('#choices .opt',{timeout:20000});
  await page.evaluate(()=>{
    const p=S.player; p.attributes['武功']=62; p.hp=100;
    p.arts=[{name:'回风剑',style:'刚猛',level:45},{name:'铁布衫',style:'守御',level:55},{name:'点苍指',style:'诡变',level:30},{name:'踏莎行',style:'身法',level:40}];
    p.items['医药']=[{name:'金创药',desc:''}]; p.items['其他']=(p.items['其他']||[]).concat([{name:'透骨钉',desc:''}]);
    const n={name:'韩铁衣',gender:'男',age:41,identity:'黑风寨二当家',faction:'黑风寨',alignment:'邪道',personality:['狡诈','狠辣'],'武功':70,'谈吐':40,signature:'裂石掌',relation:'仇人','好感度':10,alive:true,mood:'阴沉',memory:[],notes:''};
    S.npcs.push(n);
    startDuel(n,{lethal:true,reason:'韩铁衣拦住去路'});
  });
  await page.waitForTimeout(300);
  await page.screenshot({path:`${OUT}/${name}_0开打前.png`});
  await page.check('#duelDart').catch(()=>{});
  await page.click('#duelStart');
  for(let i=0;i<frames;i++){ await page.waitForTimeout(170); await page.screenshot({path:`${OUT}/${name}_f${String(i).padStart(3,'0')}.png`}); if(await page.$('#duelGo,#dSpare,#dKill')) break; }
  await page.waitForSelector('#duelGo,#dSpare',{timeout:90000});
  await page.screenshot({path:`${OUT}/${name}_9结束.png`});
  const st=await page.evaluate(()=>({res:duel.result,rounds:duel.round,log:duel.log.length,lines:document.querySelectorAll('#duelLog .bt').length,kit:duel.opp.kit}));
  console.log(name,JSON.stringify(st),'errors:',errs);
  await ctx.close();
}
(async()=>{
  srv.listen(8945);
  const br=await chromium.launch(process.env.PW_CHROME?{executablePath:process.env.PW_CHROME}:{});
  await one(br,'desk',{width:1280,height:860},false,+process.env.FRAMES||12);
  await one(br,'phone',{width:393,height:852},true,+process.env.FRAMES||12);
  await br.close(); srv.close();
})();
