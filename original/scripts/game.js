/* クロロを殴る v1.4 — uninterrupted canvas, latest-input-first rapid combos. */
'use strict';
const still=document.getElementById('still');
const canvas=document.getElementById('gameCanvas');
const ctx=canvas.getContext('2d',{alpha:false});
const buttons=[...document.querySelectorAll('[data-attack]')];
const meta=window.CHROLLO_FRAMES;
const attacks=meta.attacks;
const types=['left','front','right','body'];
const sheetImages=new Map();
const sheetLoads=new Map();
const comboImages=new Map();
const endImages=new Map();
let assetsReady=false;
let state=null,animationId=0,lastPaint='',punchSoundVolume=1;
let audioCtx=null,audioGain=null;
const audioDecoded={},audioFallback={};
const soundPaths={left:'sfx-left.wav',front:'sfx-front.wav',right:'sfx-right.wav',body:'sfx-left.wav'};
const activeVoices=[];
let lastSoundAt=-1e6;

function setStatus(key){if(key==='loadError')console.warn(i18n.t(key));}
function setPunchSoundVolume(raw){
 punchSoundVolume=Math.max(0,Math.min(1,Number(raw)/100));
 if(audioGain)audioGain.gain.value=punchSoundVolume;
}
async function initSound(){
 try{
  const AudioContextClass=window.AudioContext||window.webkitAudioContext;
  if(!AudioContextClass)return;
  audioCtx=new AudioContextClass({latencyHint:'interactive'});
  audioGain=audioCtx.createGain();audioGain.gain.value=punchSoundVolume;
  audioGain.connect(audioCtx.destination);
  await Promise.all(['left','right','front'].map(async type=>{
   const res=await fetch(soundPaths[type]);if(!res.ok)throw Error('sound');
   audioDecoded[type]=await audioCtx.decodeAudioData(await res.arrayBuffer());
  }));
 }catch(e){ /* fallback audio remains usable */ }
}
function primeFallback(){
 for(const type of types){
  audioFallback[type]=Array.from({length:5},()=>{
   const a=new Audio(soundPaths[type]);a.preload='auto';return a;
  });
 }
}
function soundFor(type){
 if(punchSoundVolume===0)return;
 const time=performance.now();
 // Prevent extreme multi-touch from creating hundreds of simultaneous voices.
 if(time-lastSoundAt<22)return;
 lastSoundAt=time;
 const soundType=type==='body'?'left':type;
 if(audioCtx&&audioDecoded[soundType]){
  try{
   if(audioCtx.state!=='running')audioCtx.resume().catch(()=>{});
   const now=audioCtx.currentTime;
   while(activeVoices.length>=7){
    const old=activeVoices.shift();
    try{old.gain.gain.setTargetAtTime(0.001,now,.012);old.source.stop(now+.045)}catch(e){}
   }
   const source=audioCtx.createBufferSource();source.buffer=audioDecoded[soundType];
   const gain=audioCtx.createGain();gain.gain.value=1;
   source.connect(gain);gain.connect(audioGain);
   source.playbackRate.value=type==='body'?0.9:1;
   const entry={source,gain};activeVoices.push(entry);
   source.onended=()=>{const index=activeVoices.indexOf(entry);if(index>=0)activeVoices.splice(index,1);try{gain.disconnect()}catch(e){}};
   source.start(now);return;
  }catch(e){}
 }
 const pool=audioFallback[type]||[];
 const el=pool.find(a=>a.paused||a.ended)||pool[0];
 if(el){try{el.pause();el.currentTime=0;el.volume=punchSoundVolume;el.play().catch(()=>{})}catch(e){}}
}
function loadSheet(name){
 if(sheetLoads.has(name))return sheetLoads.get(name);
 const promise=new Promise((resolve,reject)=>{
  const img=new Image();img.decoding='async';
  img.onload=()=>{
   const ready=(typeof img.decode==='function'?img.decode().catch(()=>{}):Promise.resolve());
   ready.then(()=>{sheetImages.set(name,img);resolve(img)});
  };
  img.onerror=()=>reject(new Error('Could not load '+name));
  img.src=name;
 });
 sheetLoads.set(name,promise);
 return promise;
}
function loadEndImage(type){
 return new Promise(resolve=>{
 const url=`media/${type}-end.jpg`;
 const im=new Image();im.decoding='async';
 im.onload=()=>{
  const ready=(typeof im.decode==='function'?im.decode().catch(()=>{}):Promise.resolve());
  ready.then(()=>{endImages.set(type,im);resolve()});
 };
 im.onerror=()=>resolve(); // Keep sprite frame as safe fallback.
 im.src=url;
 });
}
function loadCombo(type){
 return new Promise((resolve,reject)=>{
  const img=new Image();img.decoding='async';
  img.onload=()=>{
   const ready=typeof img.decode==='function'?img.decode().catch(()=>{}):Promise.resolve();
   ready.then(()=>{comboImages.set(type,img);resolve(img)});
  };
  img.onerror=()=>reject(new Error('Could not load combo '+type));
  img.src=`media/${type}-combo.webp`;
 });
}
function drawCombo(type,index){
 const img=comboImages.get(type);
 if(!img)return false;
 const frame=Math.max(0,Math.min(type==='front'?11:5,Math.floor(index)));
 const key='combo:'+type+':'+frame;
 if(lastPaint===key)return true;
 try{
  ctx.drawImage(img,(frame%3)*meta.width,Math.floor(frame/3)*meta.height,meta.width,meta.height,0,0,canvas.width,canvas.height);
  lastPaint=key;
  if(canvas.hidden){canvas.hidden=false;still.hidden=true}
  return true;
 }catch(e){return false}
}
function drawFrame(type,index){
 const a=attacks[type];
 const frame=Math.max(0,Math.min(a.frameCount-1,Math.floor(index)));
 const perSheet=meta.columns*meta.rows;
 const name=a.sheets[Math.floor(frame/perSheet)];
 const img=sheetImages.get(name);
 if(!img){loadSheet(name).catch(()=>{});return false}
 const key=type+':'+frame;
 if(lastPaint===key)return true;
 const tile=frame%perSheet;
 try{
  ctx.drawImage(img,(tile%meta.columns)*meta.width,Math.floor(tile/meta.columns)*meta.height,meta.width,meta.height,0,0,canvas.width,canvas.height);
  lastPaint=key;
  // Never expose an unpainted canvas (the source of black flashes on iPhone).
  if(canvas.hidden){canvas.hidden=false;still.hidden=true}
  return true;
 }catch(e){return false}
}
function drawEnd(type){
 const im=endImages.get(type);
 if(im){
  try{ctx.drawImage(im,0,0,canvas.width,canvas.height);lastPaint='end:'+type;return true}catch(e){}
 }
 // If the end JPG has not decoded, keep the latest valid frame on the canvas.
 // Do not replace the image URL or clear the canvas while switching.
 return false;
}

// Impact frames intentionally stay in the FIRST, already decoded sprite sheet.
// The full video is only needed during the recovery after tapping stops.
// Pack impact and full retraction in one sheet per attack. Every tap can
// use this memory-resident animation even on a slow cellular connection.
const recoverFrom={left:12,front:6,right:13,body:12};
const IMPACT_MS=105;
const MIN_REPEAT_MS=118;
const MIN_SWITCH_MS=27;
const RECOVER_MS=250;
// Front-facing source footage has a held impact and a sudden disappearing fist.
// A dedicated 12-frame motion gives front punches a real entering and retracting
// phase. All other attacks intentionally continue using the v1.2 code paths.
const FRONT_SINGLE_MS=235;
const FRONT_REPEAT_MS=165;
function startPunch(type,now){
 state={type,started:now,pending:null,phase:'impact'};
 drawCombo(type,0);
 setStatus('hitText');
 if(!animationId)animationId=requestAnimationFrame(frameLoop);
}
function attack(type){
 if(!attacks[type])return;
 // Play on the actual pointer/key gesture, independent of visual scheduling.
 soundFor(type);
 if(!assetsReady){setStatus('videoLoading');return}
 const now=performance.now();
 if(!state){startPunch(type,now);return}
 // Front-to-front spam should complete one visible in/out trajectory before
 // starting the most recent requested hit. Never restart on the held hit frame.
 if(type==='front' && state.type==='front'){
  state.pending='front';
  return;
 }
 const elapsed=now-state.started;
 const minTime=state.type===type?MIN_REPEAT_MS:MIN_SWITCH_MS;
 if(state.phase!=='impact'||elapsed>=minTime){
  // No queue of old punches. Latest input replaces the current recovery.
  startPunch(type,now);
 }else{
  // Avoid the old bug: rewinding the first frame on every tap freezes the fist.
  // Keep one most recent request and play it as soon as a complete hit is visible.
  state.pending=type;
 }
}
function finishAttack(){
 const done=state;if(!done)return;
 // Keep the canvas visible; the last video frame is drawn on it directly.
 if(!drawEnd(done.type)){
  drawFrame(done.type,attacks[done.type].frameCount-1);
 }
 state=null;
 setStatus('waitingText');
}
function frameLoop(now){
 animationId=0;
 if(!state)return;
 const current=state;
 const elapsed=Math.max(0,now-current.started);
 if(current.type==='front'){
  // Switching to another move stays responsive. Repeating front punches
  // draws the whole punch-and-retraction sequence, with no old-input backlog.
  if(current.pending && current.pending!=='front' && elapsed>=MIN_SWITCH_MS){
   startPunch(current.pending,now);return;
  }
  const cycleMs=current.pending==='front'?FRONT_REPEAT_MS:FRONT_SINGLE_MS;
  if(elapsed>=cycleMs){
   if(current.pending==='front'){startPunch('front',now);return;}
   finishAttack();return;
  }
  drawCombo('front',Math.floor((elapsed/cycleMs)*12));
  animationId=requestAnimationFrame(frameLoop);
  return;
 }
 if(current.pending && elapsed >= (current.pending===current.type?MIN_REPEAT_MS:MIN_SWITCH_MS)){
  const newType=current.pending;
  startPunch(newType,now);
  return;
 }
 if(elapsed<IMPACT_MS){
  const index=Math.min(5,Math.floor(elapsed/IMPACT_MS*6));
  drawCombo(current.type,index);
 }else if(elapsed<IMPACT_MS+RECOVER_MS){
  current.phase='recover';
  const a=attacks[current.type];
  // Progress through recovery to the end of this attack's *original* video.
  // A sheet that is still decoding leaves the previous frame visible.
  const t=(elapsed-IMPACT_MS)/RECOVER_MS;
  const first=recoverFrom[current.type];
  const frame=Math.min(a.frameCount-1,Math.floor(first+t*(a.frameCount-1-first)));
  drawFrame(current.type,frame);
 }else{
  finishAttack();
  return;
 }
 animationId=requestAnimationFrame(frameLoop);
}
for(const b of buttons){
 const type=b.dataset.attack;
 b.addEventListener('pointerdown',e=>{
  if(e.pointerType==='mouse'&&e.button!==0)return;
  e.preventDefault();attack(type);
 },{passive:false});
 b.addEventListener('click',e=>{if(e.detail===0)attack(type)});
}
const keyToAttack={KeyW:'front',KeyS:'front',KeyX:'front',KeyQ:'left',KeyA:'left',KeyZ:'left',KeyE:'right',KeyD:'right',KeyC:'right',KeyR:'body',KeyF:'body',KeyV:'body'};
document.addEventListener('keydown',e=>{
 if(e.repeat||e.ctrlKey||e.altKey||e.metaKey||e.isComposing)return;
 const target=e.target;
 if(target?.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName||''))return;
 const type=keyToAttack[e.code];if(!type)return;
 e.preventDefault();attack(type);
});
document.addEventListener('visibilitychange',()=>{
 if(document.hidden&&state){
  if(animationId){cancelAnimationFrame(animationId);animationId=0}
  finishAttack();
 }
});
async function initializeImages(){
 setStatus('videoLoading');
 try{
  await Promise.all([...types.map(type=>loadEndImage(type)),...types.map(type=>loadCombo(type))]);
  assetsReady=true;setStatus('readyText');
  // Download the remaining sheets while the user reads the controls. They are
  // not needed for the high-speed impact cycle, and never block a gesture.
  const more=types.flatMap(type=>attacks[type].sheets);
  const prefetch=async()=>{
   // Decode remaining cinematic frames one-by-one while not playing.
   // Never stall a live rapid combo to unpack many large images at once.
   for(const name of more){
    if(document.hidden)return;
    while(state){await new Promise(resolve=>setTimeout(resolve,200))}
    await loadSheet(name).catch(()=>{});
    await new Promise(resolve=>setTimeout(resolve,90));
   }
  };
  if('requestIdleCallback' in window)requestIdleCallback(()=>{prefetch().catch(()=>{})},{timeout:2500});
  else setTimeout(()=>{prefetch().catch(()=>{})},700);
 }catch(e){setStatus('loadError')}
}
// Test-only diagnostics using inert read-only functions, no external access.
window.chrolloDebug=()=>({ready:assetsReady,active:state?.type||null,phase:state?.phase||null,pending:state?.pending||null,canvasVisible:!canvas.hidden,lastPaint});
primeFallback();initSound();initializeImages();
