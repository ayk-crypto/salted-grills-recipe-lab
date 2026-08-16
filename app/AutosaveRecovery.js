"use client";
import {useEffect,useRef,useState} from "react";

const DB='sg-recipe-recovery';
const STORE='drafts';
const KEY='active';
const STEP_NAMES=['basics','ingredients','method','finish'];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE)};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function putDraft(v){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(v,KEY);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}
async function getDraft(){const db=await openDb();return new Promise((resolve,reject)=>{const req=db.transaction(STORE).objectStore(STORE).get(KEY);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error)})}
async function clearDraft(){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(KEY);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}
function setNative(el,value){if(!el)return;const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;setter?.call(el,String(value??''));el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));if(el.tagName!=='SELECT')el.dispatchEvent(new Event('change',{bubbles:true}))}
function fieldByLabel(text){return [...document.querySelectorAll('.form-field')].find(x=>(x.querySelector('label')?.textContent||'').trim().toLowerCase().startsWith(text.toLowerCase()))?.querySelector('input,select,textarea')||null}
function wizardButton(name){return [...document.querySelectorAll('.wizard button')].find(b=>(b.textContent||'').toLowerCase().includes(name))}
function activeStep(){const b=document.querySelector('.wizard button.active');const t=(b?.textContent||'').toLowerCase();return STEP_NAMES.find(x=>t.includes(x))||'basics'}
function dataUrlToFile(url,name='recovery.jpg'){const [head,data]=String(url).split(',');const mime=(head.match(/data:(.*?);/)||[])[1]||'image/jpeg';const bin=atob(data||'');const bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return new File([bytes],name,{type:mime})}
function setFiles(input,urls){if(!input||!urls?.length)return;try{const dt=new DataTransfer();urls.filter(x=>String(x).startsWith('data:')).forEach((u,i)=>dt.items.add(dataUrlToFile(u,`recovery-${i}.jpg`)));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}))}catch{}}

export default function AutosaveRecovery(){
 const snapshot=useRef({version:1,recipeType:'menu',name:'',category:'',components:[],steps:[],finish:{},photos:{},packaging:[],currentStep:'basics',updatedAt:null});
 const [savedAt,setSavedAt]=useState(null),[available,setAvailable]=useState(false),[recovering,setRecovering]=useState(false),[editorOpen,setEditorOpen]=useState(false);
 const dirty=useRef(false),lastPersist=useRef(0);

 useEffect(()=>{getDraft().then(d=>{if(d?.updatedAt){snapshot.current=d;setAvailable(true);setSavedAt(d.updatedAt)}}).catch(()=>{})},[]);

 useEffect(()=>{
  const mark=()=>{if(document.querySelector('.editor-page'))dirty.current=true};
  const click=e=>{
   if(!document.querySelector('.editor-page'))return;
   const btn=e.target.closest('button');if(!btn)return;
   const txt=(btn.textContent||'').trim().toLowerCase();
   if(btn.closest('.type-grid')){snapshot.current.recipeType=txt.includes('bulk')?'bulk':'menu';mark()}
   if(txt.includes('add to recipe')){const raw=document.getElementById('comp')?.value,qty=document.getElementById('qty')?.value,unit=document.getElementById('unit')?.value;if(raw&&qty){snapshot.current.components.push({raw,qty,unit});mark()}}
   if(txt.includes('add step')){const instruction=document.getElementById('methodText')?.value?.trim(),seconds=document.getElementById('methodSecs')?.value;if(instruction){snapshot.current.steps.push({instruction,seconds});mark()}}
   const compRow=btn.closest('.component-row');if(compRow&&txt==='×'){const rows=[...document.querySelectorAll('.component-row')];const method=compRow.classList.contains('method');const group=rows.filter(r=>r.classList.contains('method')===method);const ix=group.indexOf(compRow);if(ix>=0){if(method)snapshot.current.steps.splice(ix,1);else snapshot.current.components.splice(ix,1);mark()}}
   if(btn.closest('.pkg-tabs')){const l=txt.includes('dine')?'dine_in':txt.includes('delivery')?'delivery':'takeaway';snapshot.current.packagingTab=l}
   if(btn.closest('.pkg-add')&&txt.includes('add')){const id=document.getElementById('packItem')?.value,qty=document.getElementById('packQty')?.value||'1';if(id){snapshot.current.packaging.push({order_type:snapshot.current.packagingTab||'takeaway',packaging_item_id:id,quantity:qty});mark()}}
   const pkgRow=btn.closest('.pkg-assigned>div');if(pkgRow&&txt==='×'){const type=snapshot.current.packagingTab||'takeaway';const visible=[...document.querySelectorAll('.pkg-assigned>div')];const ix=visible.indexOf(pkgRow);const matches=snapshot.current.packaging.map((p,i)=>({p,i})).filter(x=>x.p.order_type===type);if(matches[ix])snapshot.current.packaging.splice(matches[ix].i,1);mark()}
  };
  const change=e=>{
   if(!document.querySelector('.editor-page'))return;
   const el=e.target;if(!(el instanceof HTMLInputElement||el instanceof HTMLSelectElement||el instanceof HTMLTextAreaElement))return;
   if(el.closest('.photo-grid')||el.closest('.kw-stage-gallery')||el.closest('.kw-step-media')){setTimeout(capturePhotos,250);return}
   mark();captureVisibleFields();
  };
  document.addEventListener('click',click,true);document.addEventListener('input',change,true);document.addEventListener('change',change,true);
  return()=>{document.removeEventListener('click',click,true);document.removeEventListener('input',change,true);document.removeEventListener('change',change,true)};
 },[]);

 function captureVisibleFields(){
  const editor=document.querySelector('.editor-page');if(!editor)return;
  snapshot.current.currentStep=activeStep();
  const step=snapshot.current.currentStep;
  if(step==='basics'){
   const inputs=[...document.querySelectorAll('.editor-content .form-field input')];if(inputs[0])snapshot.current.name=inputs[0].value;
   const cat=fieldByLabel('category');if(cat)snapshot.current.category=cat.value;
   const active=document.querySelector('.type-grid>button.active');if(active)snapshot.current.recipeType=(active.textContent||'').includes('Bulk')?'bulk':'menu';
  }
  if(step==='finish'){
   const map=[['yield','yield_quantity'],['prep minutes','prep_time_minutes'],['cook minutes','cook_time_minutes'],['kitchen notes','kitchen_notes'],['status','status']];
   map.forEach(([label,key])=>{const el=fieldByLabel(label);if(el)snapshot.current.finish[key]=el.value});
   const units=[...document.querySelectorAll('.editor-content .double select')];if(units[0])snapshot.current.finish.yield_unit=units[0].value;
   capturePhotos();capturePackagingFromDom();
  }
 }
 function capturePhotos(){
  const tiles=[...document.querySelectorAll('.photo-grid .photo')];const types=['prep','during','dine_in','takeaway','delivery','final'];
  tiles.forEach((tile,i)=>{const src=tile.querySelector('img')?.src;if(src&&src.startsWith('data:'))snapshot.current.photos[types[i]]=[src]});
  const galleries=[...document.querySelectorAll('.kw-stage-gallery section')];galleries.forEach(sec=>{const type=(sec.querySelector('header b')?.textContent||'').toLowerCase().includes('prep')?'prep':'during';const urls=[...sec.querySelectorAll('img')].map(i=>i.src).filter(x=>x.startsWith('data:'));if(urls.length)snapshot.current.photos[type]=[...new Set([...(snapshot.current.photos[type]||[]),...urls])]});
  [...document.querySelectorAll('.component-row.method')].forEach((row,i)=>{const urls=[...row.querySelectorAll('.kw-step-media img')].map(x=>x.src).filter(x=>x.startsWith('data:'));if(urls.length)snapshot.current.photos[`step:${i+1}`]=urls});
 }
 function capturePackagingFromDom(){
  // assignments are primarily captured at Add/Remove time; this preserves the selected tab.
  const tab=[...document.querySelectorAll('.pkg-tabs button')].find(b=>b.classList.contains('active'));if(tab){const t=(tab.textContent||'').toLowerCase();snapshot.current.packagingTab=t.includes('dine')?'dine_in':t.includes('delivery')?'delivery':'takeaway'}
 }

 useEffect(()=>{
  const t=setInterval(async()=>{
   const open=!!document.querySelector('.editor-page');setEditorOpen(open);if(!open)return;
   captureVisibleFields();
   if(!dirty.current&&Date.now()-lastPersist.current<15000)return;
   snapshot.current.updatedAt=new Date().toISOString();
   try{await putDraft(structuredClone(snapshot.current));lastPersist.current=Date.now();dirty.current=false;setSavedAt(snapshot.current.updatedAt);setAvailable(true)}catch{}
  },3000);
  return()=>clearInterval(t)
 },[]);

 useEffect(()=>{
  const original=window.fetch.bind(window);
  window.fetch=async(input,init={})=>{const response=await original(input,init);const url=typeof input==='string'?input:input?.url||'';const method=(init?.method||'GET').toUpperCase();if(response.ok&&((method==='POST'&&url==='/api/recipes')||(method==='PUT'&&url.startsWith('/api/recipes/')))){setTimeout(async()=>{await clearDraft().catch(()=>{});setAvailable(false);setSavedAt(null);snapshot.current={version:1,recipeType:'menu',name:'',category:'',components:[],steps:[],finish:{},photos:{},packaging:[],currentStep:'basics',updatedAt:null}},100)}return response};
  return()=>{window.fetch=original}
 },[]);

 useEffect(()=>{
  const sync=()=>{
   document.querySelectorAll('[data-recovery-card]').forEach(x=>x.remove());
   if(!available||document.querySelector('.editor-page'))return;
   const h=[...document.querySelectorAll('.page-head h1')].find(x=>(x.textContent||'').includes('My Drafts'));if(!h)return;
   const list=document.querySelector('.page-area .list')||h.closest('.page-head')?.parentElement?.querySelector('.list');if(!list)return;
   const card=document.createElement('div');card.dataset.recoveryCard='1';card.className='recovery-card';
   const when=savedAt?new Date(savedAt).toLocaleString():'';card.innerHTML=`<div><span>RECOVERY DRAFT</span><b>${snapshot.current.name||'Untitled recipe'}</b><small>Autosaved ${when}</small></div><button type="button">Continue</button><button type="button" class="discard">Discard</button>`;
   const [resume,discard]=card.querySelectorAll('button');resume.onclick=()=>recover();discard.onclick=async()=>{if(confirm('Discard this autosaved recovery draft?')){await clearDraft();setAvailable(false);card.remove()}};list.prepend(card)
  };
  const obs=new MutationObserver(()=>setTimeout(sync,30));obs.observe(document.body,{childList:true,subtree:true});sync();return()=>obs.disconnect()
 },[available,savedAt]);

 async function openEditor(){
  if(document.querySelector('.editor-page'))return true;
  let b=[...document.querySelectorAll('button')].find(x=>/start recipe|new recipe/i.test(x.textContent||''));
  if(!b){const nav=[...document.querySelectorAll('.side-nav button')].find(x=>/all recipes/i.test(x.textContent||''));nav?.click();await sleep(180);b=[...document.querySelectorAll('button')].find(x=>/new recipe/i.test(x.textContent||''))}
  b?.click();for(let i=0;i<20&&!document.querySelector('.editor-page');i++)await sleep(80);return !!document.querySelector('.editor-page')
 }
 async function recover(){
  if(recovering)return;setRecovering(true);const d=await getDraft().catch(()=>null);if(!d){setRecovering(false);return}snapshot.current=d;
  if(!await openEditor()){setRecovering(false);return alert('Could not open the recipe editor for recovery.')}
  wizardButton('basics')?.click();await sleep(100);
  const types=[...document.querySelectorAll('.type-grid>button')];(d.recipeType==='bulk'?types[1]:types[0])?.click();
  const name=[...document.querySelectorAll('.editor-content .form-field input')][0];setNative(name,d.name||'');setNative(fieldByLabel('category'),d.category||'');
  wizardButton('ingredients')?.click();await sleep(120);
  for(const c of d.components||[]){setNative(document.getElementById('comp'),c.raw);await sleep(25);setNative(document.getElementById('qty'),c.qty);setNative(document.getElementById('unit'),c.unit);[...document.querySelectorAll('.entry-primary')].find(x=>/add to recipe/i.test(x.textContent||''))?.click();await sleep(60)}
  wizardButton('method')?.click();await sleep(120);
  for(const s of d.steps||[]){setNative(document.getElementById('methodText'),s.instruction);setNative(document.getElementById('methodSecs'),s.seconds||'');[...document.querySelectorAll('.entry-primary')].find(x=>/add step/i.test(x.textContent||''))?.click();await sleep(60)}
  wizardButton('finish')?.click();await sleep(180);
  const finish=d.finish||{};setNative(fieldByLabel('usable yield'),finish.yield_quantity||'');const unit=[...document.querySelectorAll('.editor-content .double select')][0];setNative(unit,finish.yield_unit||'g');setNative(fieldByLabel('prep minutes'),finish.prep_time_minutes||'');setNative(fieldByLabel('cook minutes'),finish.cook_time_minutes||'');setNative(fieldByLabel('kitchen notes'),finish.kitchen_notes||'');setNative(fieldByLabel('status'),finish.status||'draft');
  const photoInputs=[...document.querySelectorAll('.photo-grid .photo input[type=file]')];['prep','during','dine_in','takeaway','delivery','final'].forEach((t,i)=>setFiles(photoInputs[i],d.photos?.[t]||[]));await sleep(250);
  for(const p of d.packaging||[]){const tab=[...document.querySelectorAll('.pkg-tabs button')].find(b=>{const t=(b.textContent||'').toLowerCase();return p.order_type==='dine_in'?t.includes('dine'):p.order_type==='delivery'?t.includes('delivery'):t.includes('takeaway')});tab?.click();await sleep(30);setNative(document.getElementById('packItem'),p.packaging_item_id);setNative(document.getElementById('packQty'),p.quantity||1);document.querySelector('.pkg-add button')?.click();await sleep(40)}
  wizardButton(d.currentStep||'basics')?.click();dirty.current=true;setRecovering(false)
 }

 return <>{editorOpen&&<div className="autosave-status"><span></span>{savedAt?`Autosaved ${new Date(savedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`:'Autosave on'}</div>}{available&&!editorOpen&&<button className="autosave-fab" onClick={recover} disabled={recovering}>{recovering?'Recovering…':'↻ Continue autosaved recipe'}</button>}</>
}
