'use strict';
const musicPanel=document.getElementById('musicPanel');
const musicToggle=document.getElementById('musicToggle');
const musicForm=document.getElementById('musicForm');
const musicInput=document.getElementById('musicURL');
const musicNote=document.getElementById('musicNote');
const nowPlaying=document.getElementById('nowPlaying');
const nowPlayingTitle=document.getElementById('nowPlayingTitle');
const musicMedia=document.getElementById('musicMedia');
const youtubeMount=document.getElementById('youtubeMount');
const punchVolume=document.getElementById('punchVolume');
const punchVolumeValue=document.getElementById('punchVolumeValue');
const isiOS=/iPad|iPhone|iPod/i.test(navigator.userAgent)||
 (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
let musicMode=null;
let youtubePlayer=null,youtubeReady=false,ytScriptPromise=null,loadGeneration=0;
let youtubeFallbackFrame=null;

function youtubeVideoId(url){
 try{
  const host=url.hostname.replace(/^www\./,'').toLowerCase();
  let id='';
  if(host==='youtu.be')id=url.pathname.split('/').filter(Boolean)[0]||'';
  else if(['youtube.com','m.youtube.com','music.youtube.com','youtube-nocookie.com'].includes(host)){
   const path=url.pathname.split('/').filter(Boolean);
   if(path[0]==='watch')id=url.searchParams.get('v')||'';
   else if(['shorts','live','embed','v'].includes(path[0]))id=path[1]||'';
  }
  return /^[A-Za-z0-9_-]{11}$/.test(id)?id:null;
 }catch(e){return null}
}
function setMusicNote(key){musicNote.dataset.i18n=key;musicNote.textContent=i18n.t(key)}
function clearCurrent(){
 loadGeneration++;
 musicMedia.pause();musicMedia.removeAttribute('src');musicMedia.load();musicMedia.hidden=true;
 if(youtubePlayer){try{youtubePlayer.destroy()}catch(e){}}
 youtubePlayer=null;youtubeReady=false;
 youtubeMount.replaceChildren();youtubeMount.hidden=true;youtubeFallbackFrame=null;
 musicMode=null;nowPlaying.hidden=true;nowPlaying.classList.remove('audio-only');
}
function showPlayer(titleKey,isAudio=false){
 nowPlayingTitle.dataset.i18n=titleKey;
 nowPlayingTitle.textContent=i18n.t(titleKey);
 nowPlaying.classList.toggle('audio-only',isAudio);
 nowPlaying.hidden=musicPanel.hidden;
}
function ensureYouTubeAPI(){
 if(window.YT&&typeof window.YT.Player==='function')return Promise.resolve(true);
 if(ytScriptPromise)return ytScriptPromise;
 ytScriptPromise=new Promise(resolve=>{
  let finished=false;
  const finish=ok=>{if(finished)return;finished=true;resolve(ok)};
  const earlier=window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady=()=>{
   try{if(typeof earlier==='function')earlier()}catch(e){}
   finish(!!window.YT&&typeof window.YT.Player==='function');
  };
  const script=document.createElement('script');
  script.async=true;script.src='https://www.youtube.com/iframe_api';
  script.onerror=()=>finish(false);
  document.head.appendChild(script);
  // Ad blockers or restricted environments may prevent this script loading.
  setTimeout(()=>finish(!!window.YT&&typeof window.YT.Player==='function'),8000);
 });
 return ytScriptPromise;
}
function youtubeCommand(name){
 if(musicMode!=='youtube')return;
 if(youtubeReady&&youtubePlayer&&typeof youtubePlayer[name]==='function'){
  try{youtubePlayer[name]()}catch(e){}
 }else if(youtubeFallbackFrame?.contentWindow){
  try{youtubeFallbackFrame.contentWindow.postMessage(JSON.stringify({event:'command',func:name,args:[]}), 'https://www.youtube-nocookie.com')}catch(e){}
 }
}
function iframeParameters(){
 const params={playsinline:1,autoplay:1,controls:1,rel:0,enablejsapi:1};
 if(location.protocol==='https:'||location.protocol==='http:')params.origin=location.origin;
 return params;
}
function mountFallbackEmbed(id){
 if(musicMode!=='youtube')return;
 const iframe=document.createElement('iframe');
 iframe.title=i18n.t('youtubeFrameTitle');
 iframe.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';
 iframe.allowFullscreen=true;
 iframe.referrerPolicy='strict-origin-when-cross-origin';
 const params=new URLSearchParams(iframeParameters());
 iframe.src='https://www.youtube-nocookie.com/embed/'+id+'?'+params;
 youtubeMount.replaceChildren(iframe);
 youtubeFallbackFrame=iframe;
 setMusicNote('youtubeApiUnavailable');
}
async function startYoutube(id,generation){
 const ok=await ensureYouTubeAPI();
 if(generation!==loadGeneration||musicMode!=='youtube')return;
 if(!ok){mountFallbackEmbed(id);return}
 const holder=document.createElement('div');
 holder.id='youtubeIframeTarget';
 youtubeMount.replaceChildren(holder);
 try{
  youtubePlayer=new YT.Player(holder,{
   host:'https://www.youtube-nocookie.com',
   videoId:id, width:'100%',height:'188',
   playerVars:iframeParameters(),
   events:{
    onReady:evt=>{
     if(generation!==loadGeneration||musicMode!=='youtube')return;
     youtubeReady=true;
    },
    onStateChange:evt=>{
     if(generation!==loadGeneration||musicMode!=='youtube')return;
    }
   }
  });
 }catch(e){
  youtubePlayer=null;youtubeReady=false;
  mountFallbackEmbed(id);
 }
}
async function loadURL(){
 const raw=musicInput.value.trim();
 let url;try{url=new URL(raw);if(!['https:','http:'].includes(url.protocol))throw 0}
 catch(e){setMusicNote('invalidUrl');return}
 const id=youtubeVideoId(url);
 if(!id&&/(^|\.)youtube\.com$|(^|\.)youtu\.be$|(^|\.)youtube-nocookie\.com$/i.test(url.hostname)){
  setMusicNote('youtubeVideoRequired');return;
 }
 clearCurrent();
 const generation=loadGeneration;
 if(id){
  musicMode='youtube';youtubeMount.hidden=false;
  showPlayer('nowPlayingYoutube');setMusicNote(isiOS?'youtubeIosVolume':'youtubeLoaded');
  startYoutube(id,generation);
  return;
 }
 musicMode='direct';musicMedia.src=url.href;
 musicMedia.hidden=false;
 const isAudio=/\.(mp3|m4a|aac|wav|ogg|flac|opus)(?:$)/i.test(url.pathname);
 showPlayer('nowPlayingUrl',isAudio);
 setMusicNote('directLoading');
 try{await musicMedia.play();if(generation===loadGeneration)setMusicNote('directPlaying')}
 catch(e){if(generation===loadGeneration)setMusicNote('directLoadedPause')}
}
musicForm.addEventListener('submit',e=>{e.preventDefault();loadURL()});
document.getElementById('musicPlay').addEventListener('click',()=>{
 if(musicMode==='direct')musicMedia.play().catch(()=>setMusicNote('playFailed'));
 else if(musicMode==='youtube'){youtubeCommand('playVideo');setMusicNote('youtubePressPlay')}
 else loadURL();
});
document.getElementById('musicPause').addEventListener('click',()=>{
 if(musicMode==='direct')musicMedia.pause();
 else if(musicMode==='youtube')youtubeCommand('pauseVideo');
});
document.getElementById('musicStop').addEventListener('click',()=>{
 if(musicMode==='direct'){musicMedia.pause();try{musicMedia.currentTime=0}catch(e){}}
 else if(musicMode==='youtube'){youtubeCommand('stopVideo');setMusicNote('stopped')}
});
punchVolume.addEventListener('input',()=>{
 punchVolumeValue.textContent=punchVolume.value+'%';
 if(typeof setPunchSoundVolume==='function')setPunchSoundVolume(punchVolume.value);
});
musicMedia.addEventListener('error',()=>{if(musicMode==='direct')setMusicNote('directError')});
musicToggle.addEventListener('click',()=>{
 const opening=musicPanel.hidden;
 musicPanel.hidden=!opening;
 musicToggle.setAttribute('aria-expanded',String(opening));
 musicToggle.dataset.i18n=opening?'musicClose':'musicOpen';
 musicToggle.textContent=i18n.t(musicToggle.dataset.i18n);
 if(musicMode)nowPlaying.hidden=!opening;
});
