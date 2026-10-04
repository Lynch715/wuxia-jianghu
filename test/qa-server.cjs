// 本机浏览器验收夹具。仅 /__qa 使用虚构密钥；普通 / 保持原页面。
const http=require('http'),fs=require('fs'),path=require('path');
const {pickBody,sse}=require('./mock');
const root=path.resolve(__dirname,'..');let practice=0;
function fixture(prompt){
  const d=pickBody(prompt);
  const match=prompt.match(/【玩家本回合行动】([^\n]*)/);const action=match?match[1]:'';
  if(!match)return d;
  if(action.includes('模拟断线'))return null;
  const scenes=prompt.match(/【当前场景】主角现在([^。]*)/);const location=scenes?scenes[1]:'城门客栈';
  Object.assign(d,{npcUpdates:[],npcEvents:[],rumors:[],newVendettas:[],questUpdates:[],newQuests:[],worldUpdates:[],newWorldEvents:[],duel:null,gameOver:false,scene:{location,unresolved:[],present:[]}});
  if(/练功|练拳/.test(action)){
    practice++;d.narrative=`李昭留在${location}练拳。这一次，他把第${practice}式的发力练准了，拳落在木桩上，声音比昨日沉实。\n他收势记下练习的要点，准备照自己的打算继续。`;d.summary=`第${practice}式练到发力稳准`;d.playerChanges={attributes:{武功:1},artsTrain:[{name:'伏虎拳',level:1}]};
    d.options=[{text:'继续练功，练下一式',type:'rest',months:1},{text:'休息一天，料理日常',type:'normal',days:1},{text:'追查失镖案',type:'normal',days:1}];
  }else if(/失镖|追回镖银/.test(action)){
    const m=prompt.match(/【当前江湖事件[^\n]*】\n([^\n]*)/);let threads=[];try{threads=JSON.parse(m[1]);}catch(_){}
    const e=threads.find(e=>e.title==='追查失镖案');
    d.playerChanges={};d.scene.unresolved=['追查失镖案'];
    if(!e){d.newWorldEvents=[{title:'追查失镖案',text:'镖师请李昭调查失镖路线',cause:'李昭决定追查镖局失镖案',location,actors:[],stage:'发生'}];d.narrative='李昭决定追查失镖案。镖师画出走镖路线，把最后看到镖银的地点标了出来。';d.summary='确认失镖路线';}
    else if(/不追|放弃|拒绝/.test(action)){d.worldUpdates=[{id:e.id,stage:'搁置',text:'李昭不再追查，镖局自行找人',cause:action}];d.scene.unresolved=[];d.narrative='李昭说明自己不再追查。镖师虽有些失望，也只得另找人手。';d.summary='放下失镖案';}
    else if(e.stage==='发生'){d.worldUpdates=[{id:e.id,stage:'升级',text:'查出押镖队伍中有人暗递路线',cause:'李昭核对脚夫供词'}];d.narrative='李昭核对了两名脚夫的供词，发现押镖队伍中有人暗中递出路线。新的疑点指向队伍内应。';d.summary='找出内应线索';}
    else{d.worldUpdates=[{id:e.id,stage:'结束',result:'镖银已追回，内应交由镖局处置',cause:'李昭沿线索找回藏银'}];d.scene.unresolved=[];d.resolvedInfo=['追查失镖案'];d.narrative='李昭沿着内应的线索找回藏银，将镖银交还镖局。旧案到此了结，他可以自己决定下一步。';d.summary='追回镖银，旧案告破';}
    d.options=[{text:'继续追查失镖案',type:'normal',days:1},{text:'继续练功，练下一式',type:'rest',months:1},{text:'休息一天，料理日常',type:'normal',days:1}];
  }else{d.narrative='李昭过了一天平静日子。江湖没有新消息，他按自己的计划料理了日常。';d.summary='料理日常，歇息一天';d.playerChanges={};d.options=[{text:'继续练功，练下一式',type:'rest',months:1},{text:'追查失镖案',type:'normal',days:1},{text:'休息一天，料理日常',type:'normal',days:1}];}
  return d;
}
const server=http.createServer((req,res)=>{
  if(req.url==='/mock/chat/completions'){
    let data='';req.on('data',c=>data+=c);req.on('end',()=>{
      try{const b=JSON.parse(data),d=fixture(b.messages.at(-1).content);if(!d){res.writeHead(503);res.end(JSON.stringify({error:{message:'模拟断线'}}));return;}res.writeHead(200,{'Content-Type':'text/event-stream'});res.end(sse(d));}catch(e){res.writeHead(500);res.end(String(e));}
    });return;
  }
  if(req.url==='/__qa'){
    const config={base:'http://127.0.0.1:8967/mock',key:'qa-dummy-key',model:'qa-fixture',think:false};
    let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
    html=html.replace('<script>','<script>localStorage.setItem("wuxia_cfg",'+JSON.stringify(JSON.stringify(config))+');</script><script>');
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);return;
  }
  const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.webp')?'image/webp':file.endsWith('.png')?'image/png':'application/octet-stream'});res.end(data);});
});
server.listen(8967,'127.0.0.1',()=>console.log('QA http://127.0.0.1:8967/__qa (local mock only)'));
