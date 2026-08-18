"use client";
import {useEffect} from "react";

export default function DeleteControls(){
 useEffect(()=>{
  let stopped=false,data={recipes:[],ingredients:[],categories:[]};

  async function refreshData(){try{const r=await fetch('/api/bootstrap',{cache:'no-store'});const j=await r.json();if(!j.error)data=j}catch{}}

  function makeActionButton(config,overflow=false){
   const el=document.createElement('span');
   el.className='delete-control';el.setAttribute('role','button');el.setAttribute('tabindex','0');
   el.setAttribute('aria-label',overflow?`More actions for ${config.name}`:`Delete ${config.name}`);
   el.title=overflow?'More actions':`Delete ${config.name}`;el.textContent=overflow?'⋮':'Delete';
   const act=e=>{
    e.preventDefault();e.stopPropagation();
    if(overflow){const r=el.getBoundingClientRect();window.dispatchEvent(new CustomEvent('sg-open-menu',{detail:{left:Math.max(12,r.right-142),top:r.bottom+7,config}}))}
    else window.dispatchEvent(new CustomEvent('sg-open-delete',{detail:config}));
   };
   el.addEventListener('click',act);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();act(e)}});
   return el;
  }

  function scan(){
   if(stopped)return;
   document.querySelectorAll('.cost-card').forEach(card=>{
    if(card.dataset.deleteReady)return;
    const name=card.querySelector('.cost-card-main b')?.textContent?.trim(),type=card.querySelector('.list-icon')?.classList.contains('bulk')?'bulk':'menu';
    const matches=(data.recipes||[]).filter(r=>r.name===name&&r.recipe_type===type);if(!name||matches.length!==1)return;
    card.dataset.deleteReady='1';card.classList.add('has-delete-control');card.appendChild(makeActionButton({type,id:matches[0].id,name},true));
   });
   document.querySelectorAll('.ingredient.linked').forEach(card=>{
    if(card.dataset.deleteReady)return;const name=card.querySelector('p b')?.textContent?.trim();const matches=(data.ingredients||[]).filter(i=>i.name===name);if(!name||matches.length!==1)return;
    card.dataset.deleteReady='1';card.classList.add('has-delete-control');card.appendChild(makeActionButton({type:'ingredient',id:matches[0].id,name},true));
   });
   document.querySelectorAll('.category-card').forEach(card=>{
    if(card.dataset.deleteReady)return;const name=card.querySelector('p b')?.textContent?.trim();const matches=(data.categories||[]).filter(c=>c.name===name);if(!name||matches.length!==1)return;
    card.dataset.deleteReady='1';card.classList.add('has-delete-control');card.appendChild(makeActionButton({type:'category',id:matches[0].id,name},true));
   });
   document.querySelectorAll('.simple-modal.wide').forEach(modal=>{
    if(modal.dataset.deleteReady)return;const name=modal.querySelector('header h2')?.textContent?.trim();const matches=(data.ingredients||[]).filter(i=>i.name===name);if(!name||matches.length!==1)return;
    modal.dataset.deleteReady='1';const slot=document.createElement('div');slot.className='modal-delete-slot';slot.appendChild(makeActionButton({type:'ingredient',id:matches[0].id,name},false));modal.appendChild(slot);
   });
   const editor=document.querySelector('.cost-editor .editor-top');
   if(editor&&!editor.dataset.deleteReady){const heading=editor.querySelector('h1')?.textContent||'';if(heading.startsWith('Edit ')){const name=document.querySelector('.editor-form-card input')?.value?.trim();const type=heading.includes('Bulk Recipe')?'bulk':'menu';const matches=(data.recipes||[]).filter(r=>r.name===name&&r.recipe_type===type);if(name&&matches.length===1){editor.dataset.deleteReady='1';const actions=document.createElement('div');actions.className='editor-delete-slot';actions.appendChild(makeActionButton({type,id:matches[0].id,name},false));editor.appendChild(actions)}}}
  }

  let observer;(async()=>{await refreshData();if(stopped)return;scan();observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true})})();
  return()=>{stopped=true;observer?.disconnect()};
 },[]);
 return null;
}
