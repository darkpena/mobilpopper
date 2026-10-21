(() => {
  'use strict';

  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const ui = {
    start: $('#startScreen'), hud: $('#hud'), pause: $('#pauseScreen'), end: $('#endScreen'),
    health: $('#healthBar'), healthText: $('#healthText'), heat: $('#heatBar'), heatText: $('#heatText'),
    paper: $('#paperText'), room: $('#roomLabel'), objective: $('#objective'), printerState: $('#printerState'),
    printProgress: $('#printProgress'), queue: $$('#queue span'), toast: $('#toast'), jam: $('#jamPanel'),
    jamProgress: $('#jamProgress'), dashCd: $('#dashCd'), interact: $('#interactBtn')
  };

  const COLORS = { bomb:'#ff735f', snail:'#86d98c', electric:'#70c7ff', platform:'#d9a7ff' };
  const STICKERS = {
    bomb: { name:'BOMBA', icon:'💥', cost:2, time:2.4, heat:20 },
    snail: { name:'SALYANGOZ', icon:'🐌', cost:1, time:1.4, heat:12 },
    electric: { name:'ELEKTRİK', icon:'⚡', cost:2, time:2.4, heat:20 },
    platform: { name:'PLATFORM', icon:'▰', cost:2, time:2.4, heat:18 }
  };
  const keys = new Set();
  const mouse = { x:0, y:0, down:false };
  let W = innerWidth, H = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
  let state = 'menu', last = performance.now(), elapsed = 0, room = 1, kills = 0, prints = 0;
  let enemies = [], projectiles = [], particles = [], hazards = [], decals = [], obstacles = [];
  let shake = 0, toastTimer = 0, roomClearTimer = 0, nextEnemyId = 1;
  let aim = { x:1, y:0 }, selected = 'bomb', queue = [], currentPrint = null, ready = [];
  let heat = 0, paper = 40, jammed = false, jamHold = 0, jamTriggered = false;
  let generator = null, exit = null, dashCooldown = 0;
  let audio = null;

  const player = { x:220, y:360, r:22, hp:100, maxHp:100, speed:235, invuln:0, dash:0, walk:0 };
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const rand = (a,b) => a + Math.random()*(b-a);

  function resize(){
    W = innerWidth; H = innerHeight; dpr = Math.min(devicePixelRatio || 1,2);
    canvas.width = W*dpr; canvas.height = H*dpr;
    canvas.style.width = W+'px'; canvas.style.height = H+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  addEventListener('resize', resize); resize();

  function beep(freq=300, duration=.06, type='square', volume=.035){
    try{
      audio ||= new (window.AudioContext||window.webkitAudioContext)();
      const o=audio.createOscillator(), g=audio.createGain();
      o.type=type; o.frequency.setValueAtTime(freq,audio.currentTime);
      g.gain.setValueAtTime(volume,audio.currentTime); g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);
      o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime+duration);
    }catch(e){}
  }
  function noiseBurst(){ beep(90,.12,'sawtooth',.025); setTimeout(()=>beep(60,.08,'square',.018),45); }
  function showToast(text, seconds=1.7){ ui.toast.textContent=text; ui.toast.classList.add('show'); toastTimer=seconds; }

  function resetGame(){
    elapsed=0; room=1; kills=0; prints=0; heat=0; paper=40; queue=[]; currentPrint=null; ready=[];
    jammed=false; jamHold=0; jamTriggered=false; dashCooldown=0; selected='bomb';
    Object.assign(player,{x:180,y:H/2,r:22,hp:100,maxHp:100,invuln:0,dash:0,walk:0});
    enemies=[]; projectiles=[]; particles=[]; hazards=[]; decals=[];
    setupRoom(1); state='playing'; ui.start.classList.remove('active'); ui.hud.classList.remove('hidden');
    ui.pause.classList.add('hidden'); ui.end.classList.add('hidden'); ui.jam.classList.add('hidden');
    showToast('HURDA BANDINDAN KAÇ!'); updateUI();
  }

  function setupRoom(n){
    room=n; enemies=[]; projectiles=[]; hazards=[]; decals=[]; generator=null; roomClearTimer=0;
    player.x=90; player.y=H/2; exit={x:W-42,y:H/2,w:45,h:150,open:false};
    obstacles=[
      {x:W*.32,y:H*.23,w:90,h:85},{x:W*.32,y:H*.67,w:90,h:85},
      {x:W*.68,y:H*.35,w:105,h:72},{x:W*.68,y:H*.76,w:105,h:72}
    ];
    if(n===1){
      spawnEnemy('box',W*.55,H*.42); spawnEnemy('box',W*.73,H*.58); spawnEnemy('tape',W*.82,H*.29);
    } else if(n===2){
      obstacles.push({x:W*.49,y:H*.5,w:70,h:170});
      spawnEnemy('box',W*.48,H*.25); spawnEnemy('tape',W*.62,H*.55); spawnEnemy('scanner',W*.78,H*.34); spawnEnemy('box',W*.84,H*.72);
    } else if(n===3){
      generator={x:W*.76,y:H*.5,r:38,charged:false,pulse:0};
      spawnEnemy('tape',W*.48,H*.28); spawnEnemy('scanner',W*.62,H*.68); spawnEnemy('box',W*.77,H*.24);
    } else {
      obstacles=[{x:W*.3,y:H*.22,w:70,h:70},{x:W*.3,y:H*.78,w:70,h:70},{x:W*.7,y:H*.22,w:70,h:70},{x:W*.7,y:H*.78,w:70,h:70}];
      spawnEnemy('boss',W*.72,H*.5); exit.open=false;
    }
    updateObjective();
  }

  function spawnEnemy(type,x,y){
    const base={box:{hp:55,r:22,speed:72},tape:{hp:70,r:24,speed:58},scanner:{hp:48,r:20,speed:92},boss:{hp:560,r:54,speed:42}}[type];
    enemies.push({id:nextEnemyId++,type,x,y,vx:0,vy:0,...base,maxHp:base.hp,hit:0,slow:0,attack:rand(.3,1.2),phase:0,marked:0});
  }

  function updateObjective(){
    if(room===4) ui.objective.textContent='KOLİ USTABAŞI’NI DURDUR';
    else if(enemies.length) ui.objective.textContent='ALANI TEMİZLE • '+enemies.length+' HEDEF';
    else if(room===3 && generator && !generator.charged) ui.objective.textContent='JENERATÖRE ELEKTRİK YAPIŞTIR';
    else ui.objective.textContent='ÇIKIŞ AÇILDI →';
    ui.room.textContent='ODA '+room+'/4';
  }

  function requestPrint(type){
    if(state!=='playing'||jammed) return;
    selected=type; $$('#stickers button').forEach(b=>b.classList.toggle('selected',b.dataset.sticker===type));
    if(queue.length+(currentPrint?1:0)>=3){ showToast('BASKI KUYRUĞU DOLU'); beep(120); return; }
    const s=STICKERS[type];
    const reserved = queue.reduce((sum,t)=>sum+STICKERS[t].cost,0)+(currentPrint?currentPrint.cost:0);
    if(paper-reserved<s.cost){ showToast('KAĞIT YETERSİZ'); beep(110,.12); return; }
    queue.push(type); beep(430,.04,'square'); updateUI();
  }

  function startNextPrint(){
    if(currentPrint||!queue.length||jammed||heat>=95) return;
    const type=queue.shift(), s=STICKERS[type]; paper-=s.cost;
    currentPrint={type,t:0,duration:s.time,cost:s.cost};
    beep(190,.05,'sawtooth',.02);
  }

  function finishPrint(){
    const type=currentPrint.type, s=STICKERS[type];
    heat=clamp(heat+s.heat,0,100); ready.push(type); prints++; currentPrint=null;
    burst(player.x+8,player.y-25,COLORS[type],10); beep(760,.08,'square');
    showToast(s.name+' HAZIR');
    if(heat>=80&&!jamTriggered){
      jamTriggered=true; setTimeout(()=>{ if(state==='playing'&&heat>=72) triggerJam(); },450);
    }
  }

  function triggerJam(){ jammed=true; jamHold=0; ui.jam.classList.remove('hidden'); showToast('YÜKSEK ISI → KAĞIT SIKIŞMASI'); noiseBurst(); }
  function clearJam(){ jammed=false; jamHold=0; heat=Math.max(55,heat-18); ui.jam.classList.add('hidden'); showToast('SIKIŞMA TEMİZLENDİ'); beep(520,.1,'triangle'); }

  function fireSticker(dx=aim.x,dy=aim.y){
    if(state!=='playing'||jammed) return;
    let idx=ready.lastIndexOf(selected);
    if(idx<0){
      if(!ready.length){ requestPrint(selected); showToast(STICKERS[selected].name+' KUYRUĞA EKLENDİ'); return; }
      idx=ready.length-1; selected=ready[idx];
    }
    ready.splice(idx,1); const len=Math.hypot(dx,dy)||1; dx/=len; dy/=len;
    projectiles.push({x:player.x+dx*28,y:player.y+dy*28,vx:dx*560,vy:dy*560,r:8,type:selected,life:1.6});
    beep(330,.05,'triangle'); player.vx=-dx*20; player.vy=-dy*20;
  }

  function burst(x,y,color,count=8){ for(let i=0;i<count;i++){ const a=rand(0,Math.PI*2),s=rand(35,170); particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(.25,.65),max:.65,color,r:rand(2,6)}); } }

  function hitSticker(p,e){
    if(p.type==='bomb'){
      decals.push({type:'blast',x:p.x,y:p.y,r:78,life:.45}); shake=9; burst(p.x,p.y,COLORS.bomb,22); beep(75,.18,'sawtooth');
      enemies.forEach(o=>{ if(Math.hypot(o.x-p.x,o.y-p.y)<95) damageEnemy(o,44); });
    }else if(p.type==='snail'){
      e.slow=4.5; damageEnemy(e,14); decals.push({type:'goo',x:e.x,y:e.y,r:34,life:5}); burst(e.x,e.y,COLORS.snail,9);
    }else if(p.type==='electric'){
      damageEnemy(e,31); e.marked=.25; burst(e.x,e.y,COLORS.electric,13);
      const near=enemies.find(o=>o!==e&&o.hp>0&&dist(o,e)<155); if(near){ damageEnemy(near,20); hazards.push({type:'arc',x:e.x,y:e.y,x2:near.x,y2:near.y,life:.18}); }
      beep(900,.08,'sawtooth');
    }else if(p.type==='platform'){
      damageEnemy(e,20); hazards.push({type:'platform',x:p.x,y:p.y,r:42,life:5}); burst(p.x,p.y,COLORS.platform,10);
    }
  }

  function damageEnemy(e,amount){ e.hp-=amount; e.hit=.12; if(e.hp<=0){ kills++; burst(e.x,e.y,e.type==='boss'?'#ffd166':'#d3aa72',e.type==='boss'?45:18); shake=e.type==='boss'?16:5; paper=Math.min(60,paper+(Math.random()<.45?2:0)); } }
  function hurtPlayer(amount){
    if(player.invuln>0||player.dash>0) return;
    player.hp-=amount; player.invuln=.8; shake=8; burst(player.x,player.y,'#ff7185',14); beep(100,.14,'sawtooth');
    if(player.hp<=0) finish(false);
  }

  function update(dt){
    if(state!=='playing') return;
    elapsed+=dt; toastTimer-=dt; if(toastTimer<=0) ui.toast.classList.remove('show');
    heat=Math.max(0,heat-dt*9); if(heat<65) jamTriggered=false;
    player.invuln=Math.max(0,player.invuln-dt); dashCooldown=Math.max(0,dashCooldown-dt); shake=Math.max(0,shake-dt*25);
    updateMovement(dt); updatePrinter(dt); updateEnemies(dt); updateProjectiles(dt); updateEffects(dt);
    enemies=enemies.filter(e=>e.hp>0);
    if(!enemies.length){
      if(room!==3||generator?.charged){
        exit.open=true; roomClearTimer+=dt;
        if(roomClearTimer<.1){ paper=Math.min(60,paper+5); showToast(room===4?'MÜDÜR DEVRİLDİ!':'ODA TEMİZ • +5 KAĞIT'); }
      }
      updateObjective();
    }
    if(exit.open && player.x>W-78 && Math.abs(player.y-exit.y)<exit.h/2){
      if(room===4) finish(true); else { setupRoom(room+1); showToast('ODA '+room+' • BASKI DEVAM EDİYOR'); }
    }
    if(generator&&!generator.charged) generator.pulse+=dt;
    updateUI();
  }

  function updateMovement(dt){
    let dx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
    let dy=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
    if(touchMove.active){ dx=touchMove.dx; dy=touchMove.dy; }
    const len=Math.hypot(dx,dy); if(len>1){dx/=len;dy/=len;}
    let speed=player.speed*(currentPrint?.9:1)*(heat>=95?.75:1);
    if(player.dash>0){ player.dash-=dt; speed=650; dx=player.dashX; dy=player.dashY; }
    if(len>0||player.dash>0){ player.walk+=dt*9; const nx=player.x+dx*speed*dt, ny=player.y+dy*speed*dt; moveWithCollisions(nx,ny); }
    player.x=clamp(player.x,35,W-35); player.y=clamp(player.y,75,H-35);
  }

  function moveWithCollisions(nx,ny){
    let tx=nx,ty=ny;
    for(const o of obstacles){
      const left=o.x-o.w/2-player.r,right=o.x+o.w/2+player.r,top=o.y-o.h/2-player.r,bottom=o.y+o.h/2+player.r;
      if(tx>left&&tx<right&&player.y>top&&player.y<bottom) tx=player.x;
      if(player.x>left&&player.x<right&&ty>top&&ty<bottom) ty=player.y;
    }
    player.x=tx; player.y=ty;
  }

  function doDash(){
    if(state!=='playing'||dashCooldown>0) return;
    let dx=(keys.has('d')?1:0)-(keys.has('a')?1:0),dy=(keys.has('s')?1:0)-(keys.has('w')?1:0);
    if(touchMove.active){dx=touchMove.dx;dy=touchMove.dy;} if(!dx&&!dy){dx=aim.x;dy=aim.y;}
    const l=Math.hypot(dx,dy)||1; player.dashX=dx/l;player.dashY=dy/l;player.dash=.18;dashCooldown=4; beep(240,.08,'sawtooth');
  }

  function updatePrinter(dt){
    if(jammed){ if(jamHold>0){jamHold+=dt;ui.jamProgress.style.width=clamp(jamHold/1.25*100,0,100)+'%';if(jamHold>=1.25)clearJam();} return; }
    if(!currentPrint) startNextPrint();
    if(currentPrint){
      if(heat>=95) return;
      const slow=heat>=80?.75:1; currentPrint.t+=dt*slow;
      if(currentPrint.t>=currentPrint.duration) finishPrint();
    }
  }

  function updateEnemies(dt){
    for(const e of enemies){
      e.hit=Math.max(0,e.hit-dt);e.slow=Math.max(0,e.slow-dt);e.marked=Math.max(0,e.marked-dt);e.attack-=dt;
      const dx=player.x-e.x,dy=player.y-e.y,d=Math.hypot(dx,dy)||1;
      let speed=e.speed*(e.slow>0?.38:1);
      if(e.type==='boss'){
        e.phase=e.hp/e.maxHp<.34?2:e.hp/e.maxHp<.67?1:0; speed+=e.phase*14;
        if(e.attack<=0){
          const count=5+e.phase*2; for(let i=0;i<count;i++){const a=Math.atan2(dy,dx)+(i-(count-1)/2)*.16;hazards.push({type:'bullet',x:e.x,y:e.y,vx:Math.cos(a)*220,vy:Math.sin(a)*220,r:7,life:4});} e.attack=2.1-e.phase*.35; beep(130,.1,'sawtooth');
        }
      } else if(e.type==='scanner'&&e.attack<=0&&d<430){
        hazards.push({type:'laser',x:e.x,y:e.y,x2:player.x,y2:player.y,life:.7,armed:.45});e.attack=2.2;
      } else if(e.type==='tape'&&e.attack<=0&&d<230){
        hazards.push({type:'tape',x:player.x,y:player.y,r:42,life:5});e.attack=3.4;
      }
      if(d>e.r+player.r+5){ e.vx=dx/d*speed;e.vy=dy/d*speed;e.x+=e.vx*dt;e.y+=e.vy*dt; }
      else if(e.attack<=0){ hurtPlayer(e.type==='boss'?18:11);e.attack=e.type==='boss'?1.2:1.05; }
      for(const h of hazards) if(h.type==='platform'&&Math.hypot(e.x-h.x,e.y-h.y)<h.r+e.r){e.x-=e.vx*dt*2;e.y-=e.vy*dt*2;}
    }
  }

  function updateProjectiles(dt){
    for(const p of projectiles){
      p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;
      if(generator&&!generator.charged&&p.type==='electric'&&Math.hypot(p.x-generator.x,p.y-generator.y)<generator.r+10){generator.charged=true;p.life=0;burst(generator.x,generator.y,COLORS.electric,28);showToast('JENERATÖR ÇALIŞIYOR • ÇIKIŞ AÇILDI');beep(940,.2,'square');exit.open=true;updateObjective();}
      for(const e of enemies){if(p.life>0&&Math.hypot(p.x-e.x,p.y-e.y)<p.r+e.r){hitSticker(p,e);p.life=0;break;}}
      if(p.x<0||p.x>W||p.y<0||p.y>H)p.life=0;
    }
    projectiles=projectiles.filter(p=>p.life>0);
  }

  function updateEffects(dt){
    for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.95;p.vy*=.95;p.life-=dt;}
    particles=particles.filter(p=>p.life>0);
    for(const d of decals)d.life-=dt;decals=decals.filter(d=>d.life>0);
    for(const h of hazards){
      h.life-=dt;
      if(h.type==='bullet'){h.x+=h.vx*dt;h.y+=h.vy*dt;if(Math.hypot(h.x-player.x,h.y-player.y)<h.r+player.r){hurtPlayer(9);h.life=0;}}
      if(h.type==='laser'&&h.life<=h.armed&&h.life+dt>h.armed){ if(pointLineDistance(player,h)<player.r+7)hurtPlayer(15); }
      if(h.type==='tape'&&Math.hypot(h.x-player.x,h.y-player.y)<h.r) player.speed=155; else if(h.type==='tape') player.speed=235;
    }
    if(!hazards.some(h=>h.type==='tape'&&Math.hypot(h.x-player.x,h.y-player.y)<h.r))player.speed=235;
    hazards=hazards.filter(h=>h.life>0);
  }
  function pointLineDistance(p,l){const A=p.x-l.x,B=p.y-l.y,C=l.x2-l.x,D=l.y2-l.y,t=clamp((A*C+B*D)/(C*C+D*D),0,1);return Math.hypot(p.x-(l.x+t*C),p.y-(l.y+t*D));}

  function updateUI(){
    ui.health.style.width=clamp(player.hp/player.maxHp*100,0,100)+'%';ui.healthText.textContent=Math.ceil(Math.max(0,player.hp));
    ui.heat.style.width=heat+'%';ui.heatText.textContent=Math.round(heat)+'°';ui.paper.textContent=paper;
    ui.printerState.textContent=jammed?'SIKIŞTI':heat>=95?'SOĞUTULUYOR':currentPrint?'BASILIYOR':ready.length?'STICKER HAZIR':'HAZIR';
    ui.printerState.style.color=jammed||heat>=95?'#ff7185':'#65d6d0';
    ui.printProgress.style.width=currentPrint?(currentPrint.t/currentPrint.duration*100)+'%':'0%';
    const all=(currentPrint?[currentPrint.type]:[]).concat(queue);ui.queue.forEach((q,i)=>q.classList.toggle('on',i<all.length));
    $$('#stickers button').forEach(b=>{const count=ready.filter(x=>x===b.dataset.sticker).length;b.classList.toggle('selected',b.dataset.sticker===selected);b.title=count?count+' hazır':'Baskı kuyruğuna ekle';b.style.setProperty('--ink',COLORS[b.dataset.sticker]);let badge=b.querySelector('.badge');if(!badge){badge=document.createElement('b');badge.className='badge';badge.style.cssText='position:absolute;left:5px;top:3px;color:var(--ink);font-size:10px';b.append(badge);}badge.textContent=count?'×'+count:'';});
    ui.dashCd.textContent=dashCooldown>0?Math.ceil(dashCooldown):'';
  }

  function draw(){
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);ctx.save();
    if(shake){ctx.translate(rand(-shake,shake),rand(-shake,shake));}
    drawFloor(); drawExit(); decals.forEach(drawDecal); hazards.filter(h=>h.type==='tape'||h.type==='platform').forEach(drawHazard);
    obstacles.forEach(drawObstacle); if(generator)drawGenerator(); hazards.filter(h=>h.type!=='tape'&&h.type!=='platform').forEach(drawHazard);
    enemies.forEach(drawEnemy);projectiles.forEach(drawProjectile);drawPlayer();particles.forEach(drawParticle);ctx.restore();
    if(state==='playing')drawAim(); requestAnimationFrame(loop);
  }

  function drawFloor(){
    const palettes=[['#252b37','#2b3240'],['#242a35','#2d3441'],['#202a30','#27353a'],['#292630','#322d38']],p=palettes[room-1]||palettes[0];
    ctx.fillStyle=p[0];ctx.fillRect(0,0,W,H);ctx.strokeStyle=p[1];ctx.lineWidth=1;
    const size=64;for(let x=-H;x<W;x+=size){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+H,H);ctx.stroke();}for(let x=0;x<W+H;x+=size){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x-H,H);ctx.stroke();}
    ctx.fillStyle='#161923';ctx.fillRect(0,55,W,8);ctx.fillStyle='#3c4250';for(let x=20;x<W;x+=85)ctx.fillRect(x,57,42,3);
    ctx.fillStyle='#ffffff0a';ctx.font='900 64px system-ui';ctx.textAlign='center';ctx.fillText('ETİKET A.Ş.  '+String(room).padStart(2,'0'),W/2,H*.52);
  }
  function drawExit(){
    ctx.save();ctx.translate(exit.x,exit.y);ctx.fillStyle=exit.open?'#5fe0b355':'#ed526333';ctx.fillRect(-exit.w/2,-exit.h/2,exit.w,exit.h);ctx.strokeStyle=exit.open?'#65e6bd':'#ff6576';ctx.lineWidth=4;ctx.strokeRect(-exit.w/2,-exit.h/2,exit.w,exit.h);
    ctx.fillStyle=exit.open?'#8effcf':'#ff7a88';ctx.font='900 10px system-ui';ctx.textAlign='center';ctx.rotate(-Math.PI/2);ctx.fillText(exit.open?'ÇIKIŞ →':'KİLİTLİ',0,4);ctx.restore();
  }
  function drawObstacle(o){ctx.save();ctx.translate(o.x,o.y);ctx.fillStyle='#a8784c';ctx.strokeStyle='#523e34';ctx.lineWidth=5;roundRect(-o.w/2,-o.h/2,o.w,o.h,8,true,true);ctx.strokeStyle='#d49b61';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-o.w/2,0);ctx.lineTo(o.w/2,0);ctx.moveTo(0,-o.h/2);ctx.lineTo(0,o.h/2);ctx.stroke();ctx.fillStyle='#f1d494';ctx.fillRect(-15,-7,30,14);ctx.restore();}
  function drawPlayer(){
    ctx.save();ctx.translate(player.x,player.y);if(player.invuln>0&&Math.floor(player.invuln*12)%2)ctx.globalAlpha=.35;
    ctx.fillStyle='#0005';ctx.beginPath();ctx.ellipse(0,19,25,10,0,0,Math.PI*2);ctx.fill();
    const bob=Math.sin(player.walk)*2;ctx.translate(0,bob);ctx.strokeStyle='#ef6e82';ctx.lineWidth=7;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-13,15);ctx.lineTo(-15,28);ctx.moveTo(13,15);ctx.lineTo(15,28);ctx.stroke();
    ctx.fillStyle='#f1ead9';ctx.strokeStyle='#ce6879';ctx.lineWidth=5;roundRect(-24,-27,48,48,12,true,true);
    ctx.fillStyle='#20242f';roundRect(-17,-17,34,25,7,true,false);ctx.fillStyle='#7ee4d4';ctx.beginPath();ctx.arc(-7,-6,3,0,Math.PI*2);ctx.arc(7,-6,3,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#7ee4d4';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,1,7,.3,Math.PI-.3);ctx.stroke();
    ctx.fillStyle='#f5f0e3';ctx.fillRect(-14,-31,28,7);ctx.fillStyle='#222631';ctx.font='900 8px system-ui';ctx.textAlign='center';ctx.fillText('PIP',0,-25);
    if(ready.length){ctx.fillStyle=COLORS[ready.at(-1)];ctx.fillRect(-15,20,30,13);ctx.fillStyle='#222';ctx.font='12px sans-serif';ctx.fillText(STICKERS[ready.at(-1)].icon,0,31);}
    ctx.restore();
  }
  function drawEnemy(e){
    ctx.save();ctx.translate(e.x,e.y);if(e.hit)ctx.globalAlpha=.55;ctx.fillStyle='#0005';ctx.beginPath();ctx.ellipse(0,e.r*.75,e.r*1.05,e.r*.4,0,0,Math.PI*2);ctx.fill();
    if(e.type==='box'||e.type==='boss'){
      const r=e.r;ctx.fillStyle=e.hit?'#fff':'#b98452';ctx.strokeStyle=e.type==='boss'?'#ef5c6f':'#62472f';ctx.lineWidth=e.type==='boss'?8:4;roundRect(-r,-r*.9,r*2,r*1.8,e.type==='boss'?16:6,true,true);ctx.strokeStyle='#e4ad68';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(0,-r*.85);ctx.lineTo(0,r*.85);ctx.stroke();ctx.fillStyle='#242530';ctx.fillRect(-r*.62,-r*.2,r*1.24,r*.42);ctx.fillStyle='#ff747f';ctx.beginPath();ctx.arc(-r*.28,0,e.type==='boss'?7:4,0,7);ctx.arc(r*.28,0,e.type==='boss'?7:4,0,7);ctx.fill();if(e.type==='boss'){ctx.fillStyle='#f5d680';ctx.font='900 10px system-ui';ctx.textAlign='center';ctx.fillText('USTABAŞI',0,-r-12);}
    }else if(e.type==='tape'){
      ctx.fillStyle=e.hit?'#fff':'#e8c557';ctx.strokeStyle='#765f23';ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,e.r,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#33333c';ctx.beginPath();ctx.arc(0,0,e.r*.42,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ff7185';ctx.fillRect(-13,-4,26,8);
    }else{
      ctx.fillStyle=e.hit?'#fff':'#4c5669';ctx.strokeStyle='#181b24';ctx.lineWidth=4;roundRect(-e.r,-e.r*.65,e.r*2,e.r*1.3,6,true,true);ctx.fillStyle='#ff6478';ctx.fillRect(-e.r*.7,-3,e.r*1.4,6);ctx.strokeStyle='#8794a8';ctx.beginPath();ctx.moveTo(-12,e.r*.6);ctx.lineTo(-18,e.r);ctx.moveTo(12,e.r*.6);ctx.lineTo(18,e.r);ctx.stroke();
    }
    if(e.slow>0){ctx.strokeStyle=COLORS.snail;ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,e.r+7,0,Math.PI*2);ctx.stroke();}
    if(e.marked>0){ctx.strokeStyle=COLORS.electric;ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,e.r+10,rand(0,2),rand(4,7));ctx.stroke();}
    ctx.fillStyle='#181a22';ctx.fillRect(-e.r,-e.r-12,e.r*2,5);ctx.fillStyle=e.type==='boss'?'#ffd166':'#ef6877';ctx.fillRect(-e.r,-e.r-12,e.r*2*clamp(e.hp/e.maxHp,0,1),5);ctx.restore();
  }
  function drawProjectile(p){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.atan2(p.vy,p.vx));ctx.fillStyle='#f4eddc';ctx.strokeStyle=COLORS[p.type];ctx.lineWidth=3;roundRect(-13,-9,26,18,4,true,true);ctx.fillStyle='#24232b';ctx.font='12px sans-serif';ctx.textAlign='center';ctx.fillText(STICKERS[p.type].icon,0,5);ctx.restore();}
  function drawGenerator(){ctx.save();ctx.translate(generator.x,generator.y);const glow=generator.charged?10+Math.sin(elapsed*8)*5:0;ctx.shadowBlur=glow;ctx.shadowColor=COLORS.electric;ctx.fillStyle=generator.charged?'#397b83':'#39414d';ctx.strokeStyle=generator.charged?'#83eaff':'#788290';ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,generator.r,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle=generator.charged?'#b5f7ff':'#9ba2ac';ctx.font='900 27px system-ui';ctx.textAlign='center';ctx.fillText('⚡',0,10);ctx.font='900 9px system-ui';ctx.fillText(generator.charged?'AKTİF':'ENERJİ GEREKLİ',0,-50);ctx.restore();}
  function drawHazard(h){ctx.save();if(h.type==='tape'){ctx.fillStyle='#e7ca452c';ctx.strokeStyle='#e7ca45aa';ctx.lineWidth=3;ctx.beginPath();ctx.arc(h.x,h.y,h.r,0,Math.PI*2);ctx.fill();ctx.stroke();}else if(h.type==='platform'){ctx.fillStyle='#d9a7ff44';ctx.strokeStyle='#d9a7ff';ctx.lineWidth=4;ctx.beginPath();ctx.arc(h.x,h.y,h.r,0,Math.PI*2);ctx.fill();ctx.stroke();}else if(h.type==='bullet'){ctx.fillStyle='#ff6979';ctx.shadowBlur=10;ctx.shadowColor='#ff6979';ctx.beginPath();ctx.arc(h.x,h.y,h.r,0,7);ctx.fill();}else if(h.type==='laser'){ctx.strokeStyle=h.life>h.armed?'#ff667744':'#ff6677';ctx.lineWidth=h.life>h.armed?4:10;ctx.beginPath();ctx.moveTo(h.x,h.y);ctx.lineTo(h.x2,h.y2);ctx.stroke();}else if(h.type==='arc'){ctx.strokeStyle=COLORS.electric;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(h.x,h.y);for(let i=1;i<5;i++)ctx.lineTo(h.x+(h.x2-h.x)*i/5+rand(-10,10),h.y+(h.y2-h.y)*i/5+rand(-10,10));ctx.lineTo(h.x2,h.y2);ctx.stroke();}ctx.restore();}
  function drawDecal(d){ctx.save();ctx.globalAlpha=clamp(d.life,0,.6);ctx.fillStyle=d.type==='goo'?COLORS.snail:COLORS.bomb;ctx.beginPath();ctx.arc(d.x,d.y,d.r,0,Math.PI*2);ctx.fill();ctx.restore();}
  function drawParticle(p){ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
  function drawAim(){const x=player.x+aim.x*55,y=player.y+aim.y*55;ctx.strokeStyle=COLORS[selected]+'aa';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,9,0,Math.PI*2);ctx.moveTo(x-15,y);ctx.lineTo(x-5,y);ctx.moveTo(x+5,y);ctx.lineTo(x+15,y);ctx.stroke();}
  function roundRect(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill)ctx.fill();if(stroke)ctx.stroke();}

  function finish(win){state='ended';ui.hud.classList.add('hidden');ui.jam.classList.add('hidden');ui.end.classList.remove('hidden');ui.end.classList.add('active');$('#resultEyebrow').textContent=win?'KOŞU TAMAMLANDI':'PIP DEVRE DIŞI';$('#resultTitle').textContent=win?'Son baskı teslim edildi!':'Kâğıt burada bitmez.';$('#resultText').textContent=win?'PIP, Etiket A.Ş.’nin bu bölümündeki kontrolünü kırdı. Yeni baskılar için atölyeye dönüyor.':'Isıyı düşük tut, baskı sırasında hareket et ve doğru sticker kombinasyonunu kullan.';$('#finalTime').textContent=formatTime(elapsed);$('#finalKills').textContent=kills;$('#finalPrints').textContent=prints;}
  function formatTime(t){return String(Math.floor(t/60)).padStart(2,'0')+':'+String(Math.floor(t%60)).padStart(2,'0');}
  function togglePause(){if(state==='playing'){state='paused';ui.pause.classList.remove('hidden');ui.pause.classList.add('active');}else if(state==='paused'){state='playing';ui.pause.classList.add('hidden');ui.pause.classList.remove('active');last=performance.now();}}
  function loop(now){const dt=Math.min((now-last)/1000,.033);last=now;update(dt);draw();}

  addEventListener('keydown',e=>{
    const k=e.key.toLowerCase();keys.add(k);if(['1','2','3','4'].includes(k))requestPrint(['bomb','snail','electric','platform'][+k-1]);if(k===' ')doDash();if(k==='e')fireSticker();if(k==='escape')togglePause();
  });
  addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  canvas.addEventListener('pointermove',e=>{mouse.x=e.clientX;mouse.y=e.clientY;const dx=mouse.x-player.x,dy=mouse.y-player.y,l=Math.hypot(dx,dy)||1;aim.x=dx/l;aim.y=dy/l;});
  canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&state==='playing')fireSticker();});
  $$('#stickers button').forEach(b=>b.addEventListener('pointerdown',e=>{e.preventDefault();requestPrint(b.dataset.sticker);}));
  $('#startBtn').onclick=resetGame;$('#againBtn').onclick=resetGame;$('#restartBtn').onclick=resetGame;$('#pauseBtn').onclick=togglePause;$('#resumeBtn').onclick=togglePause;$('#dashBtn').onclick=doDash;
  const clearBtn=$('#clearJamBtn');clearBtn.addEventListener('pointerdown',e=>{e.preventDefault();jamHold=.001;clearBtn.setPointerCapture(e.pointerId);});clearBtn.addEventListener('pointerup',()=>{if(jamHold<1.25)jamHold=0;});clearBtn.addEventListener('pointercancel',()=>jamHold=0);

  const touchMove={active:false,dx:0,dy:0},touchAim={active:false};
  function bindPad(el,data,onRelease){
    const knob=el.querySelector('i');
    el.addEventListener('pointerdown',e=>{data.active=true;el.setPointerCapture(e.pointerId);move(e);});
    el.addEventListener('pointermove',move);el.addEventListener('pointerup',release);el.addEventListener('pointercancel',release);
    function move(e){if(!data.active)return;const r=el.querySelector('.pad-ring').getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,l=Math.hypot(dx,dy),max=r.width*.34,mag=Math.min(l,max);data.dx=l?dx/l*clamp(l/max,0,1):0;data.dy=l?dy/l*clamp(l/max,0,1):0;knob.style.transform=`translate(${data.dx*max}px,${data.dy*max}px)`;if(data===touchAim&&l>8){aim.x=dx/l;aim.y=dy/l;}}
    function release(){if(!data.active)return;data.active=false;knob.style.transform='';if(onRelease)onRelease();data.dx=data.dy=0;}
  }
  bindPad($('#movePad'),touchMove);bindPad($('#aimPad'),touchAim,()=>fireSticker());

  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='playing')togglePause();});
  $$('#stickers button')[0].classList.add('selected');
  setupRoom(1);
  requestAnimationFrame(t=>{last=t;draw();});
})();
