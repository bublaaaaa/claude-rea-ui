/* Edit display & sounds with your own media. Changes are kept in this browser (IndexedDB). */
(()=>{
'use strict';
const api=window.chrolloAPI;if(!api)return;
const meta=api.meta,CW=meta.cell[0],CH=meta.cell[1],L=meta.line,COLS=meta.columns;
const NAMES={left:'Left punch',front:'Front punch',right:'Right punch',body:'Uppercut'};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// Which attacks use which cell (front never plays the sheet frames, only its combo frames).
const uses={};const use=(c,n)=>{(uses[c]??=new Set()).add(n)};
for(const t in meta.combo_frames)meta.combo_frames[t].forEach(c=>use(c,NAMES[t]));
for(const t in meta.sheet_frames)if(t!=='front')meta.sheet_frames[t].forEach(c=>use(c,NAMES[t]));
for(const t in meta.end)use(meta.end[t],NAMES[t]+' (end)');
use(meta.start,'Idle');
const total=Math.max(...Object.keys(uses).map(Number))+1;

// ---- storage (optional: everything still works for the session if it is unavailable) ----
let dbp=null;
const db=()=>dbp??=new Promise((res,rej)=>{
 try{const r=indexedDB.open('chrollo-media',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();dbp=null};res(r.result)};r.onerror=()=>rej(r.error)}catch(e){rej(e)}
});
const tx=async(mode,fn)=>{const d=await db();return new Promise((res,rej)=>{const t=d.transaction('kv',mode),s=t.objectStore('kv'),r=fn(s);t.oncomplete=()=>res(r&&r.result);t.onerror=()=>rej(t.error)})};
let persistOk=true;
const keep=(k,v)=>tx('readwrite',s=>s.put(v,k)).catch(()=>{persistOk=false});
const drop=k=>tx('readwrite',s=>s.delete(k)).catch(()=>{});
const loadAll=async()=>{
 const d=await db();
 return new Promise((res,rej)=>{const out={},t=d.transaction('kv'),r=t.objectStore('kv').openCursor();
  r.onsuccess=()=>{const c=r.result;if(c){out[c.key]=c.value;c.continue()}else res(out)};r.onerror=()=>rej(r.error)});
};

// ---- UI ----
const css=document.createElement('style');
css.textContent=`
/* edit page: same soft plastic as the game page (variables come from body[data-page=edit] in index.html) */
#editPage{width:100%;max-width:1100px;padding:clamp(12px,3.5vw,28px) clamp(14px,4vw,28px) 48px;gap:clamp(12px,3vw,18px);align-items:center;color:var(--ink)}
.ed-top{width:100%;display:flex;align-items:center;gap:14px}.ed-top h2{margin:0;font-size:clamp(15px,4vw,19px);color:var(--ink);text-shadow:0 1px 0 var(--hi)}
.ed-back{color:var(--ink);text-decoration:none;padding:0 18px;height:42px;display:inline-flex;align-items:center;background:var(--bbg);border-radius:999px;box-shadow:var(--braise-s);font-size:14px;font-weight:700;white-space:nowrap;text-shadow:0 1px 0 var(--hi)}
.ed-back:active{box-shadow:var(--bsink-s)}.ed-back:focus-visible{outline:2px solid #6d7cff;outline-offset:3px}
.ed-layout{width:100%;display:grid;grid-template-columns:minmax(0,1fr);gap:clamp(14px,3vw,22px);align-items:start}
@media(min-width:900px){.ed-layout{grid-template-columns:minmax(0,500px) minmax(0,1fr)}}
.ed-tools{display:flex;flex-direction:column;gap:clamp(14px,3vw,22px);min-width:0}
.ed-card{padding:clamp(14px,3.5vw,22px);border-radius:28px;background:var(--bg);box-shadow:var(--raise)}
.ed-card h3{margin:0 0 8px;font-size:17px;color:var(--ink);text-shadow:0 1px 0 var(--hi)}
#editPage p{margin:8px 0 0;font-size:12.5px;line-height:1.55;color:var(--ink-soft)}
.ed-hint{margin:8px 0 12px!important}

/* live preview: stays in view while you work the sliders below */
.ed-live{position:sticky;top:8px;z-index:6;padding:clamp(10px,2.8vw,14px);border-radius:28px;background:var(--bg);box-shadow:var(--raise)}
.ed-bezel{position:relative;padding:clamp(8px,2.4vw,12px);border-radius:8px;background:#0e0e0e;box-shadow:inset 0 3px 10px #000,inset 0 0 0 2px #212121,var(--bezel-ring)}
#edPreview{width:100%;display:block;border-radius:8px;background:#100e15;cursor:grab;touch-action:none;box-shadow:0 0 0 1px #000}#edPreview:active{cursor:grabbing}
/* frame timeline: one tick per cell, filled up to the frame you are on; click or drag to scrub */
.ed-frames{margin-top:12px}
.ed-frames-top{display:flex;align-items:baseline;justify-content:space-between;margin:0 4px 8px}
.ed-counter{display:flex;align-items:baseline;gap:7px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--ink)}
.ed-counter b{font-size:clamp(22px,6vw,30px);font-weight:800;letter-spacing:.04em;line-height:1;text-shadow:0 1px 0 var(--hi)}
.ed-counter span{font-size:13px;font-weight:700;color:var(--ink-soft)}
.ed-frames-label{font-size:12px;font-weight:700;color:var(--ink-soft);letter-spacing:.08em;text-transform:uppercase;text-shadow:0 1px 0 var(--hi)}
.ed-ticks{display:flex;gap:2px;height:30px;padding:0 2px;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none}
.ed-ticks i{flex:1;min-width:0;border-radius:2px;background:var(--tick);transition:background .08s}
.ed-ticks i.on{background:var(--tick-on)}.ed-ticks i.cur{background:#ff5a3c;transform:scaleY(1.2)}
.ed-ticks i.ed{box-shadow:inset 0 5px 0 #ff9f1c}.ed-ticks i.fv{box-shadow:inset 0 -5px 0 #38bdf8}.ed-ticks i.ed.fv{box-shadow:inset 0 5px 0 #ff9f1c,inset 0 -5px 0 #38bdf8}
.ed-ticks:focus-visible{outline:2px solid #6d7cff;outline-offset:4px;border-radius:6px}
#edSel{margin:10px 4px 0!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;color:var(--ink)!important}
#edNote{min-height:1.2em;margin:8px 4px 0!important}
.ed-play{margin:10px 0 0;gap:10px;flex-wrap:nowrap!important}
#editPage .ed-play label{margin:0;font-size:14px;font-weight:700;color:var(--ink);flex:0 0 auto;text-shadow:0 1px 0 var(--hi)}
#edMove{flex:1 1 0;max-width:220px;box-sizing:border-box;height:42px;min-width:0;padding:0 16px;font:inherit;font-size:14px;font-weight:700;color:var(--ink);background:var(--bg);border:0;border-radius:999px;box-shadow:var(--sink-s)}
#edMove:focus-visible{outline:2px solid #6d7cff;outline-offset:3px}
/* narrow screens: a compact pinned bar (small preview + Move menu + Play) so the sliders stay visible below it */
@media(max-width:899px){
 .ed-live{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);grid-template-areas:"bz ctl" "fr fr" "sel sel" "note note";gap:8px 12px;align-items:center;padding:10px;border-radius:24px}
 .ed-bezel{grid-area:bz;padding:7px;border-radius:8px}
 .ed-frames{grid-area:fr;margin-top:2px}.ed-ticks{height:24px}
 .ed-play{grid-area:ctl;margin:0;flex-direction:column;align-items:stretch;gap:8px;flex-wrap:nowrap}
 #editPage .ed-play label{font-size:12px}
 #edMove{max-width:none;width:100%;height:38px;padding:0 12px;font-size:13px}
 #editPage #edPlayBtn{height:38px;padding:0 10px;font-size:13px}
 #edSel{grid-area:sel;margin:0!important;font-size:12px}
 #edNote{grid-area:note;margin:0!important;min-height:0}#edNote:empty{display:none}
}
/* narrow screens: the header is pinned too, right above the live bar (they scroll away together never; the page scrolls under them) */
@media(max-width:899px){
 #editPage{--pad:clamp(14px,4vw,28px);--hdr:46px}
 .ed-top{position:sticky;top:0;z-index:8;height:var(--hdr);width:calc(100% + 2*var(--pad));margin:0 calc(-1*var(--pad));padding:0 var(--pad);background:var(--bg);box-shadow:0 8px 10px -8px var(--dark)}
 .ed-live{top:calc(var(--hdr) + 6px)}
}
/* phones: everything in the pinned area gets smaller */
@media(max-width:560px){
 #editPage{--hdr:40px}
 .ed-top{gap:10px}.ed-top h2{font-size:13px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .ed-back{height:30px;padding:0 12px;font-size:12px}
 .ed-live{top:calc(var(--hdr) + 4px);padding:8px;border-radius:20px;gap:6px 8px;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr)}
 .ed-bezel{padding:5px}
 .ed-frames-top{margin:0 2px 4px}.ed-counter b{font-size:17px}.ed-counter span{font-size:11px}.ed-frames-label{font-size:10px}
 .ed-ticks{height:14px;gap:1px}
 #edSel{font-size:10.5px}
 #editPage .ed-play{gap:6px}#editPage .ed-play label{font-size:11px}
 #edMove{height:30px;font-size:12px;padding:0 10px}
 #editPage #edPlayBtn{height:30px;font-size:12px}
 /* the "used by" line is hidden on phones to save room (the counter + timeline still show the frame) */
 #edSel{display:none}.ed-live{grid-template-areas:"bz ctl" "fr fr" "note note"}
 /* all other buttons and controls get smaller too */
 main#editPage .ed-btn,main#editPage button{height:34px;min-width:34px;padding:0 12px;font-size:12.5px}
 main#editPage #edActions{gap:8px}
 main#editPage #edActions .ed-btn,main#editPage #edActions button{min-height:34px;padding:6px 8px;font-size:12px}
 .ed-drop{border-radius:18px}.ed-drop summary{height:40px;padding:0 16px;font-size:13px}.ed-ctl{padding:4px 14px 16px;gap:10px}
 .ed-slider input::-webkit-slider-thumb{width:20px;height:20px}.ed-slider input::-moz-range-thumb{width:20px;height:20px}.ed-slider input{height:12px}
 .ed-card{padding:14px;border-radius:22px}.ed-card h3{font-size:15px}
 #edPicker{border-radius:12px;margin:10px 0 4px}
 /* sound rows: name, then file name, then Choose / play / Reset on one line (nothing gets clipped) */
 main#editPage .ed-sfx{grid-template-columns:minmax(0,1fr) auto auto;gap:8px;padding:10px 12px;border-radius:16px}
 .ed-sfx .ed-name{font-size:13px}.ed-sfx .ed-file{grid-column:1/-1}
 main#editPage .ed-sfx .ed-btn,main#editPage .ed-sfx button{height:32px;min-width:32px;padding:0 12px!important;font-size:12px!important}
}

/* buttons: raised pills that sink when pressed */
#editPage .ed-btn,#editPage button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;height:42px;min-width:42px;margin:0;padding:0 16px;font-size:14px;font-weight:700;line-height:1;color:var(--ink);background:var(--bbg);border:0;border-radius:999px;box-shadow:var(--braise-s);cursor:pointer;white-space:nowrap;text-shadow:0 1px 0 var(--hi);transition:box-shadow .08s}
#editPage .ed-btn:active,#editPage button:active{box-shadow:var(--sink-s)}
#editPage .ed-btn:focus-within,#editPage button:focus-visible{outline:2px solid #6d7cff;outline-offset:3px}
#editPage #edPlayBtn{flex:0 0 auto;color:var(--play-ink);background:linear-gradient(145deg,var(--play-a),var(--play-b))}
#edActions{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
#editPage #edActions .ed-btn,#editPage #edActions button{width:100%;height:auto;min-height:42px;padding:8px 12px;white-space:normal;text-align:center;line-height:1.2}

/* dropdown with the zoom / move sliders */
.ed-infobody{gap:8px}#editPage .ed-infobody p{margin:0}
/* Info: a plain disclosure line, no card; the text inside is small gray text */
#edInfo,#edInfo[open]{background:none;box-shadow:none;border-radius:0;margin:10px 0 0}
#edInfo summary{height:auto;padding:4px 2px;font-size:12.5px;font-weight:700;color:var(--ink-soft);text-shadow:none;justify-content:flex-start;gap:8px}
#edInfo summary{gap:6px}
#edInfo summary::after{content:"\\203A";font-size:17px;line-height:1;font-weight:700;margin-top:-1px;transition:transform .15s}
#edInfo[open] summary::after{transform:rotate(90deg)}
#edInfo .ed-infobody{padding:6px 2px 4px}
#editPage #edInfo .ed-infobody p{font-size:12.5px;line-height:1.55;color:var(--ink-soft)}
.ed-card .ed-drop{margin:12px 0 0}.ed-card .ed-drop+.ed-drop{margin-top:10px}
.ed-drop{margin:0 0 4px;border-radius:22px;background:var(--bbg);box-shadow:var(--braise-s)}
.ed-drop summary{list-style:none;display:flex;align-items:center;justify-content:space-between;height:48px;padding:0 20px;font-size:14px;font-weight:800;color:var(--ink);cursor:pointer;user-select:none;text-shadow:0 1px 0 var(--hi)}
.ed-drop summary::-webkit-details-marker{display:none}
.ed-drop summary::after{content:"\\25BE";transition:transform .15s;color:var(--ink-soft)}.ed-drop[open] summary::after{transform:rotate(180deg)}
.ed-drop summary:focus-visible{outline:2px solid #6d7cff;outline-offset:3px;border-radius:22px}
.ed-drop[open]{box-shadow:var(--bsink-s)}
.ed-ctl{display:flex;flex-direction:column;gap:12px;padding:6px 20px 20px}.ed-ctl h4{margin:0;font-size:13px;color:var(--ink);font-weight:800;text-shadow:0 1px 0 var(--hi)}
.ed-ctl .ed-sep{margin-top:10px;padding-top:16px;border-top:1px solid var(--line);box-shadow:0 -1px 0 var(--hi2)}
/* "This move: Front ▾" is itself the move chooser (an invisible <select> lies on top); Global is a button on the right */
.ed-movehead{display:flex;align-items:center;justify-content:space-between;gap:10px}
.ed-pick{position:relative;display:inline-flex;align-items:center;gap:6px;padding:6px 2px;font-size:13px;font-weight:800;color:var(--ink);text-shadow:0 1px 0 var(--hi);cursor:pointer;border-radius:8px}
.ed-pick::after{content:"\\25BE";font-size:1.15em;line-height:1;color:var(--ink-soft)}
.ed-pick select{position:absolute;inset:0;width:100%;height:100%;margin:0;padding:0;border:0;opacity:0;cursor:pointer;font-size:16px;-webkit-appearance:none;appearance:none}
.ed-pick:focus-within{outline:2px solid #6d7cff;outline-offset:2px}
.ed-movehead.global .ed-pick{opacity:.6}
main#editPage #edGlobalBtn{height:30px;min-width:0;padding:0 14px;font-size:12px;flex:0 0 auto}
main#editPage #edGlobalBtn[aria-pressed=true]{box-shadow:var(--bsink-s);color:var(--ink-strong)}
.ed-slider{display:grid;grid-template-columns:112px minmax(0,1fr) 54px;gap:12px;align-items:center}
.ed-slider span{font-size:13px;color:var(--ink-soft)}.ed-slider output{font-size:13px;font-weight:700;color:var(--ink);text-align:right}
.ed-slider input{-webkit-appearance:none;appearance:none;width:100%;height:14px;margin:0;border-radius:999px;background:var(--bg);box-shadow:var(--sink-s);cursor:pointer}
.ed-slider input::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:24px;height:24px;border-radius:50%;border:0;background:linear-gradient(145deg,var(--k1),var(--k2));box-shadow:var(--braise-s)}
.ed-slider input::-moz-range-thumb{width:24px;height:24px;border-radius:50%;border:0;background:linear-gradient(145deg,var(--k1),var(--k2));box-shadow:var(--braise-s)}
.ed-slider input:disabled{opacity:.35;cursor:default}
.ed-slider input:focus-visible{outline:2px solid #6d7cff;outline-offset:4px}
#edPicker{width:100%;display:block;border-radius:16px;cursor:pointer;background:#000;margin:14px 0 6px;box-shadow:var(--raise-s)}

/* sounds */
.ed-sfx{display:grid!important;grid-template-columns:minmax(0,1fr) auto auto auto;gap:10px;align-items:center;padding:12px 14px;border-radius:20px;box-shadow:var(--sink-s)}
.ed-sfx .ed-name{grid-column:1/-1;font-weight:800;font-size:14px;color:var(--ink);text-shadow:0 1px 0 var(--hi)}.ed-sfx .ed-file{min-width:0;font-size:12px;color:var(--ink-soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media(max-width:480px){.ed-sfx .ed-btn,.ed-sfx button{padding:0 12px!important;font-size:13px!important}
 .ed-slider{grid-template-columns:78px minmax(0,1fr) 40px;gap:8px}.ed-slider span{font-size:12px}.ed-slider output{font-size:12px}.ed-ctl{padding:4px 14px 16px}}

main#editPage button.theme-toggle{margin-left:auto;width:36px;height:36px;min-width:36px;padding:0;font-size:15px;border-radius:50%}
@media(max-width:560px){main#editPage button.theme-toggle{width:30px;height:30px;min-width:30px;font-size:13px}}
/* Sample list on the game page (dark fallback; index.html restyles it for the game page) */
.ed-sample{position:fixed;left:max(14px,env(safe-area-inset-left));bottom:max(14px,env(safe-area-inset-bottom));z-index:5;box-sizing:border-box;height:40px;max-width:calc(100vw - 120px);padding:0 14px;font:inherit;font-weight:700;font-size:14px;color:#fff;background:#30303a;border:1px solid #666;border-radius:999px;box-shadow:0 2px 10px #0008;cursor:pointer}.ed-sample option{background:#1c1c22;color:#fff}
`;
document.head.append(css);
const el=h=>{const t=document.createElement('template');t.innerHTML=h.trim();return t.content.firstChild};
const slider=(id,label,min,max,step)=>`<div class="ed-slider"><span>${label}</span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}"><output id="${id}V"></output></div>`;
const home=document.querySelector('main');
const moveOpts=['front','left','right','body'].map(t=>`<option value="${t}"${t==='front'?' selected':''}>${t==='body'?'Uppercut':NAMES[t].replace(' punch','')}</option>`).join('');   // the move lists (Global is a button, not a list entry)
const page=el(`<main id="editPage" hidden>
<header class="ed-top"><a class="ed-back" href="#">&larr; Back to game</a><h2>Edit display &amp; sounds</h2><button type="button" class="theme-toggle" aria-pressed="false">&#9790;</button></header>
<div class="ed-layout">
 <section class="ed-live" aria-label="Live preview">
  <div class="ed-bezel"><canvas id="edPreview" width="678" height="452"></canvas></div>
  <div class="ed-frames">
   <div class="ed-frames-top"><div class="ed-counter" id="edCounter"><b>01</b><span>/ 50</span></div><span class="ed-frames-label" id="edFramesLabel">Frame</span></div>
   <div class="ed-ticks" id="edTicks" role="slider" tabindex="0" aria-label="Frame"></div>
  </div>
  <p id="edSel"></p>
  <div class="music-row ed-play" id="edPlay"><label for="edMove">Move</label><select id="edMove">${moveOpts}</select><button type="button" id="edPlayBtn">Play sequence</button></div>
  <p id="edNote" role="status"></p>
 </section>
 <div class="ed-tools">
  <section class="ed-card">
   <h3>Display</h3>
   <details class="ed-drop" id="edInfo">
    <summary>How this works</summary>
    <div class="ed-ctl ed-infobody">
     <p>Click a picture below, then replace it with your own image and frame it with zoom and move. Orange dot = replaced image, blue dot = zoomed or moved.</p>
     <p>The live preview updates as you work. Drag it to move the picture, scroll over it to zoom - or open the zoom &amp; move dropdown for sliders.</p>
    </div>
   </details>
   <details class="ed-drop" id="edFrame">
    <summary>Edit: zoom &amp; move</summary>
    <div class="ed-ctl">
     <h4>This cell</h4>
     ${slider('edZoom','Zoom',1,4,0.01)}
     ${slider('edPanY','Move vertical',-100,100,1)}
     ${slider('edPanX','Move horizontal',-100,100,1)}
     <div class="music-row" style="margin:0"><button type="button" id="edViewReset">Reset this cell</button></div>
     <div class="ed-sep ed-movehead" id="edMoveHead">
      <label class="ed-pick"><span id="edMoveSum">This move</span><select id="edMovePick" aria-label="Choose move">${moveOpts}</select></label>
      <button type="button" id="edGlobalBtn" aria-pressed="false" title="Edit all moves at once">Global</button>
     </div>
     <p class="ed-hint" id="edMoveHint" style="margin:0!important">Applies to every picture of the move chosen in the Move menu.</p>
     ${slider('edMZoom','Zoom',1,4,0.01)}
     ${slider('edMPanY','Move vertical',-100,100,1)}
     ${slider('edMPanX','Move horizontal',-100,100,1)}
     <div class="music-row" style="margin:0"><button type="button" id="edMoveReset">Reset this move</button><button type="button" id="edViewResetAll">Reset all views</button></div>
    </div>
   </details>
   <canvas id="edPicker"></canvas>
   <div class="music-row" id="edActions" style="margin-top:10px">
    <label class="ed-btn">Replace selected cell&hellip;<input type="file" id="edCellFile" accept="image/*" hidden></label>
    <label class="ed-btn">Load whole sheet&hellip;<input type="file" id="edSheetFile" accept="image/*" hidden></label>
    <button type="button" id="edDownload">Download prompt</button>
    <button type="button" id="edResetImg">Reset display</button>
   </div>
   <p style="margin:10px 0 0;text-align:center"><a href="https://github.com/bublaaaaa/punch/tree/main/sample" target="_blank" rel="noopener noreferrer" style="color:var(--ink);font-weight:700;white-space:nowrap;text-decoration:underline;text-underline-offset:2px">gallery &#8599;</a></p>
  </section>
  <section class="ed-card">
   <h3>Sounds</h3>
   <div id="edSfx"></div>
  </section>
 </div>
</div>
</main>`);
// Ready-made full sheets (same 10x5 layout). Chosen from the list at the bottom-left of the game page.
const SAMPLES=[{id:'gabi',label:'Gabi',file:'sample-gabi.webp'},{id:'tucker',label:'Tucker',file:'sample-tucker.webp'}];
const sampleSel=el(`<select class="ed-sample" id="edSample" aria-label="Sample sheet"><option value="">Sample: Original</option>${SAMPLES.map(s=>`<option value="${s.id}">Sample: ${s.label}</option>`).join('')}<option value="custom" hidden>Sample: Custom sheet</option></select>`);
document.body.append(page,sampleSel);
window.chrolloTheme?.sync?.();   // set the icon of the toggle in the edit page header   // the Edit button is the link in the game page's label row
// the legal notice from the bottom of the game page is repeated at the bottom of the edit page (same text, same translations)
const legalSrc=document.querySelector('.legal');
if(legalSrc){page.append(legalSrc.cloneNode(true));window.i18n?.render?.()}
// "Pages": #edit shows the editor, anything else shows the game. Same file, so saved edits are always shared.
function route(){
 const edit=location.hash==='#edit';
 document.body.dataset.page=edit?'edit':'home';
 home.hidden=edit;page.hidden=!edit;sampleSel.hidden=edit;
 if(edit){window.scrollTo(0,0);select(sel)}
}
addEventListener('hashchange',route);
const $=q=>page.querySelector(q);
const note=t=>{$('#edNote').textContent=t};

// ---- display ----
// Model: every cell is re-rendered into a working canvas from its source (the original sheet cell, a
// replacement image, or a loaded sheet) through a per-cell view {z zoom, x/y move in -1..1}. On top of that,
// each move (punch) has its own view that the game applies whenever that move draws a picture.
// Nothing is baked into the stored files, so a view can always be changed or reset.
let base=null,work=null,layer=null,sel=0;          // cell 01 is selected from the start
let sample='';                                      // '' = original sheet, a SAMPLES id, or 'custom' (a sheet you loaded)
const bmps={},edited=new Set(),DEF={z:1,x:0,y:0},MOVES=['left','front','right','body'],MOVES_MENU=['front','left','right','body'],VIEW_KEYS=[...MOVES,'all'];   // 'all' = the global view
const freshView=()=>({moves:{},cells:{}});         // cells[i] and moves[type] = {z,x,y}
let view=freshView();
const viewIsDefault=()=>!Object.keys(view.moves).length&&!Object.keys(view.cells).length;
let globalMode=false;   // the Global button: edit one view that applies to every move
const moveSel=()=>globalMode?'all':$('#edMove').value;
const setMove=t=>{$('#edMove').value=t;$('#edMovePick').value=t};   // both move lists always show the same move
// which moves draw a given cell (the Move menu and the picked cell always agree)
const movesUsing=i=>{const by=uses[i];return by?MOVES_MENU.filter(t=>by.has(NAMES[t])||by.has(NAMES[t]+' (end)')):[]};
const applyMoveViews=()=>{for(const t of VIEW_KEYS)api.setMoveView(t,view.moves[t]||null)};
const pad=i=>String(i+1).padStart(2,'0');
const sheetSize=()=>{const s=api.sheet;return[s.naturalWidth||s.width,s.naturalHeight||s.height]};
const cellXY=i=>[L+(i%COLS)*(CW+L),L+Math.floor(i/COLS)*(CH+L)];
const isDefaultView=i=>!view.cells[i];
function ensureWork(){
 if(work)return work;
 base??=api.sheet;
 work=document.createElement('canvas');work.width=base.naturalWidth;work.height=base.naturalHeight;
 work.getContext('2d').drawImage(layer||base,0,0,work.width,work.height);
 api.setSheetSource(work);return work;
}
function sourceFor(i){
 base??=api.sheet;
 if(bmps[i])return{img:bmps[i],sx:0,sy:0,sw:bmps[i].width,sh:bmps[i].height};
 const img=layer||base,f=(img.naturalWidth||img.width)/base.naturalWidth,[x,y]=cellXY(i);
 return{img,sx:x*f,sy:y*f,sw:CW*f,sh:CH*f};
}
function viewRect(i){   // the 3:2 window of the source that is shown
 const s=sourceFor(i),v=view.cells[i]||DEF,z=Math.max(1,v.z);
 let cw=s.sw,ch=s.sh;if(cw/ch>CW/CH)cw=ch*CW/CH;else ch=cw*CH/CW;
 const vw=cw/z,vh=ch/z,rx=(s.sw-vw)/2,ry=(s.sh-vh)/2;
 return{s,vw,vh,rx,ry,vx:s.sx+rx+v.x*rx,vy:s.sy+ry+v.y*ry};
}
function renderCell(i){
 const c=ensureWork().getContext('2d'),r=viewRect(i),[x,y]=cellXY(i);
 c.imageSmoothingQuality='high';c.drawImage(r.s.img,r.vx,r.vy,r.vw,r.vh,x,y,CW,CH);
}
function renderAll(){for(let i=0;i<total;i++)renderCell(i)}
let saveT=0;
function saveViewSoon(){
 clearTimeout(saveT);
 saveT=setTimeout(()=>{if(viewIsDefault())drop('view');else keep('view',view)},250);
}
function afterView(){if(work)api.setSheetSource(work);syncControls();drawPicker();saveViewSoon()}

function drawPicker(){
 paintTicks();
 if(!api.sheet||page.hidden)return;
 const p=$('#edPicker'),[sw,sh]=sheetSize();p.width=1360;p.height=Math.round(1360*sh/sw);
 const c=p.getContext('2d'),k=p.width/sw;c.drawImage(api.sheet,0,0,p.width,p.height);
 c.font='bold 22px system-ui';c.textBaseline='top';
 for(let i=0;i<total;i++){
  const[x,y]=cellXY(i);
  c.fillStyle='rgba(0,0,0,.6)';c.fillRect(x*k+4,y*k+4,36,28);
  c.fillStyle='#fff';c.fillText(pad(i),x*k+9,y*k+7);
  let dx=(x+CW)*k-18;
  if(edited.has(i)){c.fillStyle='#ff9f1c';c.beginPath();c.arc(dx,y*k+18,9,0,7);c.fill();dx-=24}
  if(!isDefaultView(i)){c.fillStyle='#38bdf8';c.beginPath();c.arc(dx,y*k+18,9,0,7);c.fill()}
 }
 drawPreview();
 const[x,y]=cellXY(sel);c.strokeStyle='#ffd23f';c.lineWidth=6;c.strokeRect(x*k+3,y*k+3,CW*k-6,CH*k-6);
}
function drawPreview(){
 if(!api.sheet)return;
 // the preview shows the cell as the chosen move would draw it (with that move's zoom/move), when the move uses it
 // the game shows a picture through the global view, then its move's view (zoom multiplies, move adds)
 const mt=moveSel(),by=uses[sel],a=view.moves.all,m=mt!=='all'&&by&&(by.has(NAMES[mt])||by.has(NAMES[mt]+' (end)'))?view.moves[mt]:null;
 let[x,y]=cellXY(sel),w=CW,h=CH;
 if(a||m){const z=clamp((a?.z||1)*(m?.z||1),1,8),px=clamp((a?.x||0)+(m?.x||0),-1,1),py=clamp((a?.y||0)+(m?.y||0),-1,1);w=CW/z;h=CH/z;x+=(CW-w)/2*(1+px);y+=(CH-h)/2*(1+py)}
 $('#edPreview').getContext('2d').drawImage(api.sheet,x,y,w,h,0,0,CW,CH);
}
function syncControls(){
 const v=view.cells[sel]||DEF,m=view.moves[moveSel()]||DEF,pct=n=>Math.round(n*100);
 $('#edZoom').value=v.z;$('#edPanX').value=pct(v.x);$('#edPanY').value=pct(v.y);
 $('#edZoomV').textContent=v.z.toFixed(2)+'×';$('#edPanXV').textContent=pct(v.x);$('#edPanYV').textContent=pct(v.y);
 if(api.sheet){const r=viewRect(sel);$('#edPanX').disabled=r.rx<1e-3;$('#edPanY').disabled=r.ry<1e-3}
 $('#edMZoom').value=m.z;$('#edMPanX').value=pct(m.x);$('#edMPanY').value=pct(m.y);
 $('#edMZoomV').textContent=m.z.toFixed(2)+'×';$('#edMPanXV').textContent=pct(m.x);$('#edMPanYV').textContent=pct(m.y);
 $('#edMPanX').disabled=$('#edMPanY').disabled=m.z<=1;   // nothing to move until zoomed in
 const global=moveSel()==='all';
 $('#edMovePick').value=$('#edMove').value;$('#edGlobalBtn').setAttribute('aria-pressed',String(global));$('#edMoveHead').classList.toggle('global',global);
 $('#edMoveSum').textContent=global?'Global: all moves':'This move: '+$('#edMove').selectedOptions[0].textContent;
 $('#edMoveHint').textContent=global?'Applies to every picture of every move, including the idle picture. It stacks with each move\'s own view.':'Applies to every picture of the move chosen in the Move menu above.';
}
// ---- frame timeline ----
const ticks=$('#edTicks');ticks.innerHTML='<i></i>'.repeat(total);
const tickEls=[...ticks.children];
let playhead=-1;   // while a move plays, the timeline follows the frame the game is drawing
function paintTicks(){
 const cur=playhead>=0?playhead:sel;
 tickEls.forEach((t,i)=>{t.className=(i<cur?'on ':'')+(i===cur?'cur ':'')+(edited.has(i)?'ed ':'')+(isDefaultView(i)?'':'fv')});
 $('#edCounter b').textContent=pad(cur);$('#edCounter span').textContent='/ '+total;
 $('#edFramesLabel').textContent=playhead>=0?'Playing':'Frame';
 ticks.setAttribute('aria-valuemin',1);ticks.setAttribute('aria-valuemax',total);ticks.setAttribute('aria-valuenow',cur+1);
}
const tickAt=e=>{const r=ticks.getBoundingClientRect();return clamp(Math.floor((e.clientX-r.left)/r.width*total),0,total-1)};
let scrub=false;
ticks.addEventListener('pointerdown',e=>{scrub=true;try{ticks.setPointerCapture(e.pointerId)}catch(err){}select(tickAt(e))});
ticks.addEventListener('pointermove',e=>{if(!scrub)return;const i=tickAt(e);if(i!==sel)select(i)});
for(const ev of['pointerup','pointercancel'])ticks.addEventListener(ev,()=>{scrub=false});
ticks.addEventListener('keydown',e=>{const d={ArrowLeft:-1,ArrowRight:1,Home:-1e9,End:1e9}[e.key];if(d){e.preventDefault();select(clamp(sel+d,0,total-1))}});
function select(i){
 sel=i;
 const mu=movesUsing(i);if(mu.length&&moveSel()!=='all'&&!mu.includes(moveSel()))setMove(mu[0]);   // picked cell -> its move (Global stays Global)
 syncControls();drawPicker();
 $('#edSel').textContent=`Cell ${pad(i)} - used by: ${[...(uses[i]||['nothing'])].join(', ')}`;
}
function setCellView(p){
 const v={...(view.cells[sel]||DEF),...p};
 v.z=clamp(v.z,1,4);v.x=clamp(v.x,-1,1);v.y=clamp(v.y,-1,1);
 if(v.z===1&&v.x===0&&v.y===0)delete view.cells[sel];else view.cells[sel]=v;
 renderCell(sel);afterView();
}

$('#edPicker').addEventListener('click',e=>{
 const r=e.currentTarget.getBoundingClientRect(),[sw]=sheetSize();
 const x=(e.clientX-r.left)/r.width*sw,y=(e.clientY-r.top)/r.width*sw;
 const col=Math.floor((x-L)/(CW+L)),row=Math.floor((y-L)/(CH+L)),i=row*COLS+col;
 if(col>=0&&col<COLS&&row>=0&&i<total)select(i);   // clicks on grid lines/blank space keep the current cell
});
$('#edZoom').addEventListener('input',e=>setCellView({z:+e.target.value}));
$('#edPanX').addEventListener('input',e=>setCellView({x:+e.target.value/100}));
$('#edPanY').addEventListener('input',e=>setCellView({y:+e.target.value/100}));
$('#edViewReset').addEventListener('click',()=>{if(!view.cells[sel])return;delete view.cells[sel];renderCell(sel);afterView();note(`Cell ${pad(sel)} view reset.`)});
// per-move view: lives in the game (applied at draw time), so it works for every picture of that move
function setMoveViewP(p){
 const mt=moveSel(),v={...(view.moves[mt]||DEF),...p};
 v.z=clamp(v.z,1,4);v.x=clamp(v.x,-1,1);v.y=clamp(v.y,-1,1);
 if(v.z===1)v.x=v.y=0;
 if(v.z===1)delete view.moves[mt];else view.moves[mt]=v;
 api.setMoveView(mt,view.moves[mt]||null);
 syncControls();drawPreview();saveViewSoon();
}
$('#edMZoom').addEventListener('input',e=>setMoveViewP({z:+e.target.value}));
$('#edMPanX').addEventListener('input',e=>setMoveViewP({x:+e.target.value/100}));
$('#edMPanY').addEventListener('input',e=>setMoveViewP({y:+e.target.value/100}));
$('#edMoveReset').addEventListener('click',()=>{setMoveViewP({z:1});note('Move view reset.')});
// choosing a move (from either list) leaves Global mode; if the current cell isn't one of that move's pictures, jump to its first picture
function chooseMove(t){
 globalMode=false;setMove(t);
 if(!movesUsing(sel).includes(t))select(meta.combo_frames[t][0]);else{syncControls();drawPreview()}
}
$('#edMove').addEventListener('change',e=>chooseMove(e.target.value));
$('#edMovePick').addEventListener('change',e=>chooseMove(e.target.value));
// Global button: edit one view for every move (the cell you are on does not change); press again to go back to the move
$('#edGlobalBtn').addEventListener('click',()=>{globalMode=!globalMode;syncControls();drawPreview()});
$('#edViewResetAll').addEventListener('click',()=>{
 view=freshView();drop('view');applyMoveViews();
 if(work){renderAll();afterView()}else{syncControls();drawPicker()}
 note('All views reset.');
});
// drag the preview to move, wheel to zoom
const pv=$('#edPreview');let drag=null;
pv.addEventListener('pointerdown',e=>{if(!api.sheet)return;const r=viewRect(sel);drag={x:e.clientX,y:e.clientY,vx:r.vx,vy:r.vy};pv.setPointerCapture(e.pointerId)});
pv.addEventListener('pointermove',e=>{
 if(!drag)return;
 const r=viewRect(sel),k=r.vw/pv.getBoundingClientRect().width;
 const vx=drag.vx-(e.clientX-drag.x)*k,vy=drag.vy-(e.clientY-drag.y)*k;
 setCellView({x:r.rx>1e-3?(vx-(r.s.sx+r.rx))/r.rx:0,y:r.ry>1e-3?(vy-(r.s.sy+r.ry))/r.ry:0});
});
for(const ev of['pointerup','pointercancel'])pv.addEventListener(ev,()=>{drag=null});
pv.addEventListener('wheel',e=>{e.preventDefault();setCellView({z:(view.cells[sel]||DEF).z*Math.exp(-e.deltaY*0.0015)})},{passive:false});

// Preview a move: run the real game attack (same timing, frames and sound) and mirror its canvas into the preview.
// 'all' plays the four moves one after another.
let playRaf=0,playRun=0;
async function playMove(t){
 if(!api.sheet)return;
 const run=++playRun,list=t==='all'?['front','left','right','body']:[t];
 cancelAnimationFrame(playRaf);
 const gc=document.getElementById('gameCanvas'),pc=$('#edPreview').getContext('2d');
 (function tick(){
  pc.drawImage(gc,0,0,CW,CH);
  const c=api.currentCell();if(c>=0&&c!==playhead){playhead=c;paintTicks()}   // the timeline follows the frame being drawn
  if(run===playRun)playRaf=requestAnimationFrame(tick);
 })();
 for(const m of list){
  if(run!==playRun)return;
  api.attack(m);
  const t0=performance.now();   // wait for the move to finish (the game clears its state when it ends)
  await new Promise(r=>setTimeout(r,120));
  while(chrolloDebug().active&&performance.now()-t0<2500&&run===playRun)await new Promise(r=>setTimeout(r,40));
  await new Promise(r=>setTimeout(r,250));
 }
 if(run===playRun){cancelAnimationFrame(playRaf);playRaf=0;playhead=-1;paintTicks();drawPreview()}
}
$('#edPlayBtn').addEventListener('click',()=>playMove(globalMode?'all':$('#edMove').value));   // Global plays all four moves in a row

const bitmap=f=>createImageBitmap(f);
$('#edCellFile').addEventListener('change',async e=>{
 const f=e.target.files[0];e.target.value='';if(!f)return;
 try{
  const b=await bitmap(f);bmps[sel]?.close?.();bmps[sel]=b;edited.add(sel);delete view.cells[sel];
  renderCell(sel);await keep('cell:'+sel,f);afterView();
  note(`Cell ${pad(sel)} replaced.`+(persistOk?'':' (Not saved - storage unavailable; lasts until reload.)'));
 }catch(err){note('Could not read that image.')}
});
$('#edSheetFile').addEventListener('change',async e=>{
 const f=e.target.files[0];e.target.value='';if(!f)return;
 try{
  base??=api.sheet;
  const b=await bitmap(f);
  for(const i of edited){await drop('cell:'+i);bmps[i]?.close?.();delete bmps[i]}edited.clear();
  view=freshView();drop('view');applyMoveViews();layer=b;work=null;ensureWork();
  sample='custom';sampleSel.value=sample;await drop('sample');
  await keep('sheet',f);afterView();
  note(Math.abs(b.width/b.height-base.naturalWidth/base.naturalHeight)>.02?'Sheet loaded, but its shape differs from the default layout - cells may be misaligned.':'Whole sheet replaced.');
 }catch(err){note('Could not read that image.')}
});
$('#edDownload').addEventListener('click',()=>{
 const a=document.createElement('a');a.href='character-sequence-prompt-kit-image-swap.zip';a.download='character-sequence-prompt-kit-image-swap.zip';a.click();
 note('Prompt kit downloaded.');
});
$('#edResetImg').addEventListener('click',async()=>{
 for(const i of edited){await drop('cell:'+i);bmps[i]?.close?.();delete bmps[i]}edited.clear();
 await drop('sheet');await drop('sample');await drop('view');layer=null;sample='';sampleSel.value='';view=freshView();applyMoveViews();
 if(base){api.setSheetSource(base);work=null}
 select(sel);note('Display reset to the original.');
});

// ---- sample sheets ----
const sampleCache={};
const sampleBitmap=s=>sampleCache[s.id]??=fetch((window.__A||{})[s.file]||s.file).then(r=>r.blob()).then(b=>createImageBitmap(b)).catch(e=>{delete sampleCache[s.id];throw e});
async function useSample(id){
 try{
  await api.ready;base??=api.sheet;
  const b=id?await sampleBitmap(SAMPLES.find(s=>s.id===id)):null;
  layer=b;sample=id;sampleSel.value=id;
  await drop('sheet');if(id)await keep('sample',id);else await drop('sample');
  work=null;   // your own replaced cells and zoom/move views stay on top of the chosen sheet
  if(layer||edited.size||Object.keys(view.cells).length){ensureWork();renderAll();api.setSheetSource(work)}else api.setSheetSource(base);
  syncControls();drawPicker();
 }catch(e){sampleSel.value=sample;note('Could not load that sample.')}
}
sampleSel.addEventListener('change',()=>{if(sampleSel.value==='custom'){sampleSel.value=sample;return}useSample(sampleSel.value)});

// ---- sounds ----
const sfxBox=$('#edSfx');
for(const t of ['left','front','right','body']){
 const row=el(`<div class="music-row ed-sfx" data-type="${t}"><span class="ed-name">${NAMES[t]}</span><span class="ed-file">${t==='body'?'default (left sound, lower pitch)':'default'}</span><label class="ed-btn">Choose audio…<input type="file" accept="audio/*" hidden></label><button type="button" data-act="test">▶</button><button type="button" data-act="reset">Reset</button></div>`);
 const label=row.querySelector('.ed-file'),dflt=label.textContent;
 row.querySelector('input').addEventListener('change',async e=>{
  const f=e.target.files[0];e.target.value='';if(!f)return;
  try{await api.setSound(t,f);label.textContent=f.name;await keep('sfx:'+t,{blob:f,name:f.name});api.playSound(t);note(`${NAMES[t]} sound replaced.`)}
  catch(err){note('Could not decode that audio file.')}
 });
 row.querySelector('[data-act=test]').addEventListener('click',()=>api.playSound(t));
 row.querySelector('[data-act=reset]').addEventListener('click',async()=>{await api.setSound(t,null);label.textContent=dflt;await drop('sfx:'+t);note(`${NAMES[t]} sound reset.`)});
 row._label=label;sfxBox.append(row);
}

// ---- restore saved edits ----
route();
api.ready.then(async()=>{
 base=api.sheet;select(sel);
 let saved;try{saved=await loadAll()}catch(e){persistOk=false;return}
 try{
  if(saved.sheet){layer=await bitmap(saved.sheet);sample='custom'}
  else if(SAMPLES.some(s=>s.id===saved.sample)){sample=saved.sample;layer=await sampleBitmap(SAMPLES.find(s=>s.id===sample))}
  sampleSel.value=sample;
  for(const k of Object.keys(saved).filter(k=>k.startsWith('cell:'))){
   const i=+k.slice(5);try{bmps[i]=await bitmap(saved[k]);edited.add(i)}catch(e){}
  }
  if(saved.view){   // (an older global zoom/move is dropped: moves have their own view now)
   const mv={};for(const t of VIEW_KEYS){const m=saved.view.moves?.[t];if(m&&m.z>1)mv[t]={z:clamp(+m.z,1,4),x:clamp(+m.x||0,-1,1),y:clamp(+m.y||0,-1,1)}}
   view={moves:mv,cells:saved.view.cells||{}};applyMoveViews();
  }
  if(layer||edited.size||Object.keys(view.cells).length){ensureWork();renderAll();api.setSheetSource(work)}
 }catch(e){}
 select(sel);
 for(const k of Object.keys(saved).filter(k=>k.startsWith('sfx:'))){
  const t=k.slice(4),row=sfxBox.querySelector(`[data-type="${t}"]`);
  try{await api.setSound(t,saved[k].blob);if(row)row._label.textContent=saved[k].name}catch(e){}
 }
});
})();
