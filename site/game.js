/* クロロを殴る v1.4 — uninterrupted canvas, latest-input-first rapid combos. */
'use strict';
const canvas=document.getElementById('gameCanvas');
const ctx=canvas.getContext('2d',{alpha:false});
const buttons=[...document.querySelectorAll('[data-attack]')];
const meta=window.CHROLLO_SHEET;
const attacks=Object.fromEntries(Object.entries(meta.sheet_frames).map(([t,f])=>[t,{frameCount:f.length}]));
const types=['left','front','right','body'];
// Everything is drawn from ONE sheet: a grid of exactly 3:2 cells (678x452) separated by 1px black lines.
// The display is also 3:2 (750x500), so each cell is drawn whole, with no cropping.
const SRC_W=678,SRC_H=452,CROP_X=0,CROP_Y=0;
let sheetImg=null,lastCell=-1,lastType=null;
const moveViews={};   // per-move zoom/move {z,x,y} (x,y in -1..1), applied when that move draws a cell
// Resolves a file name; the single-file build maps it to an embedded data URI.
const asset=name=>(window.__A&&window.__A[name])||name;
let assetsReady=false;
let state=null,animationId=0,lastPaint='',punchSoundVolume=1;
let audioCtx=null,audioGain=null;
const audioDecoded={},audioFallback={};
const soundPaths={left:asset('sfx-left.wav'),front:asset('sfx-front.wav'),right:asset('sfx-right.wav'),body:asset('sfx-left.wav')};
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
 // Uppercut reuses the left-punch sound (pitched down) unless the user supplied its own.
 const soundType=type==='body'&&!audioDecoded.body?'left':type;
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
   source.playbackRate.value=type==='body'&&soundType==='left'?0.9:1;
   const entry={source,gain};activeVoices.push(entry);
   source.onended=()=>{const index=activeVoices.indexOf(entry);if(index>=0)activeVoices.splice(index,1);try{gain.disconnect()}catch(e){}};
   source.start(now);return;
  }catch(e){}
 }
 const pool=audioFallback[type]||[];
 const el=pool.find(a=>a.paused||a.ended)||pool[0];
 if(el){try{el.pause();el.currentTime=0;el.volume=punchSoundVolume;el.play().catch(()=>{})}catch(e){}}
}
function loadSheet(){
 return new Promise((resolve,reject)=>{
  const img=new Image();img.decoding='async';
  img.onload=()=>{
   const ready=typeof img.decode==='function'?img.decode().catch(()=>{}):Promise.resolve();
   ready.then(()=>{sheetImg=img;resolve(img)});
  };
  img.onerror=()=>reject(new Error('Could not load sheet'));
  img.src=asset(meta.sheet);
 });
}
// A picture is shown through the global view ('all', also used for the idle picture) and then its move's own view:
// zooms multiply, moves add (kept inside the cell).
function viewFor(type){
 const a=moveViews.all,m=type?moveViews[type]:null;
 if(!a&&!m)return null;
 const c=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 return{z:c((a?.z||1)*(m?.z||1),1,8),x:c((a?.x||0)+(m?.x||0),-1,1),y:c((a?.y||0)+(m?.y||0),-1,1)};
}
function drawCell(cell,key,type){
 if(!sheetImg)return false;
 if(lastPaint===key)return true;
 const stepX=meta.cell[0]+meta.line,stepY=meta.cell[1]+meta.line;
 let x=meta.line+(cell%meta.columns)*stepX+CROP_X,y=meta.line+Math.floor(cell/meta.columns)*stepY+CROP_Y,w=SRC_W,h=SRC_H;
 const mv=viewFor(type);
 if(mv){ // zoom into the cell and shift the window; it never leaves the cell, so no grid lines show
  const z=Math.max(1,mv.z||1);w=SRC_W/z;h=SRC_H/z;
  x+=(SRC_W-w)/2*(1+(mv.x||0));y+=(SRC_H-h)/2*(1+(mv.y||0));
 }
 try{
  ctx.drawImage(sheetImg,x,y,w,h,0,0,canvas.width,canvas.height);
  lastPaint=key;lastCell=cell;lastType=type;
  canvas.hidden=false;
  return true;
 }catch(e){return false}
}
function drawCombo(type,index){
 const list=meta.combo_frames[type];
 const frame=Math.max(0,Math.min(list.length-1,Math.floor(index)));
 return drawCell(list[frame],'combo:'+type+':'+frame,type);
}
function drawFrame(type,index){
 const list=meta.sheet_frames[type];
 const frame=Math.max(0,Math.min(list.length-1,Math.floor(index)));
 return drawCell(list[frame],type+':'+frame,type);
}
function drawEnd(type){return drawCell(meta.end[type],'end:'+type,type)}

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
 if(e.repeat||e.ctrlKey||e.altKey||e.metaKey||e.isComposing||document.body.dataset.page==='edit')return;
 const target=e.target;
 if(target?.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName||''))return;
 const type=keyToAttack[e.code];if(!type)return;
 e.preventDefault();attack(type);
 // show the button sinking when it is triggered from the keyboard
 const b=buttons.find(x=>x.dataset.attack===type);if(b){b.classList.add('pressed');setTimeout(()=>b.classList.remove('pressed'),110)}
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
  await loadSheet();
  assetsReady=true;setStatus('readyText');
  drawCell(meta.start,'start');
 }catch(e){setStatus('loadError')}
}
// Test-only diagnostics using inert read-only functions, no external access.
window.chrolloDebug=()=>({ready:assetsReady,active:state?.type||null,phase:state?.phase||null,pending:state?.pending||null,canvasVisible:!canvas.hidden,lastPaint});
// Hooks used by editor.js: swap the sheet (Image or canvas) and replace punch sounds at runtime.
const customSoundUrls={};
async function setSound(type,blob){
 // Decode first, so a bad file changes nothing.
 const decoded=blob&&audioCtx?await audioCtx.decodeAudioData(await blob.arrayBuffer()):null;
 if(customSoundUrls[type]){URL.revokeObjectURL(customSoundUrls[type]);delete customSoundUrls[type]}
 const url=blob?(customSoundUrls[type]=URL.createObjectURL(blob)):asset(type==='body'?'sfx-left.wav':`sfx-${type}.wav`);
 soundPaths[type]=url;
 audioFallback[type]=Array.from({length:5},()=>{const a=new Audio(url);a.preload='auto';return a});
 if(decoded)audioDecoded[type]=decoded;
 else if(type==='body')delete audioDecoded.body;
 else if(audioCtx){
  try{audioDecoded[type]=await audioCtx.decodeAudioData(await (await fetch(url)).arrayBuffer())}catch(e){delete audioDecoded[type]}
 }
}
function setSheetSource(src){
 sheetImg=src;lastPaint='';
 if(!state&&lastCell>=0)drawCell(lastCell,'edited',lastType);
}
function setMoveView(type,v){
 if(v)moveViews[type]=v;else delete moveViews[type];
 lastPaint='';
 if(!state&&lastCell>=0)drawCell(lastCell,'edited',lastType);
}
window.chrolloAPI={meta,get sheet(){return sheetImg},setSheetSource,setMoveView,setSound,playSound:soundFor,attack,currentCell:()=>lastCell,ready:null};
primeFallback();
window.chrolloAPI.ready=Promise.all([initSound(),initializeImages()]);
