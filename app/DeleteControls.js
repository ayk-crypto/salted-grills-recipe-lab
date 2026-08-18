"use client";
import {useEffect} from "react";

export default function DeleteControls(){
 useEffect(()=>{
  let stopped=false,data={recipes:[],ingredients:[],categories:[]};

  async function refreshData(){
   try{const r=await fetch('/api/bootstrap',{cache:'no-store'});const j=await r.json();if(!j.error)data=j}catch{}
  }

  function describeUsed(j){
   const names=(j.used_in||[]).map(x=>x.name).filter(Boolean);
   return names.length?`${j.error}\n\nUsed in:\n• ${names.join('\n• ')}`:(j.error||'This item cannot be deleted yet.');
  }

  async function runDelete({type,id,name}){
   const labels={menu:'menu item',bulk:'bulk recipe',ingredient:'ingredient',category:'category'};
   const warning=type==='menu'
    ?`Delete menu item “${name}”?\n\nIt will disappear from the active menu item list. Historical recipe versions remain stored.`
    :type==='bulk'
      ?`Delete bulk recipe “${name}”?\n\nThis is only allowed when no active menu item or bulk recipe is using it.`
      :type==='ingredient'
        ?`Delete ingredient “${name}”?\n\nIts purchase-price history will also be removed. This is only allowed when it is not used anywhere.`
        :`Delete category “${name}”?\n\nThis is only allowed when no active menu item is assigned to it.`;
   if(!window.confirm(warning))return;
   let url,options={method:'DELETE',headers:{'Content-Type':'application/json'}};
   if(type==='menu'||type==='bulk')url=`/api/recipes/${id}`;
   else if(type==='ingredient'){url='/api/ingredients';options.body=JSON.stringify({id,name})}
   else {url='/api/categories';options.body=JSON.stringify({id,name})}
   try{
    const r=await fetch(url,options),j=await r.json();
    if(!r.ok){window.alert(describeUsed(j));return}
    window.location.reload();
   }catch(e){window.alert(`Could not delete this ${labels[type]||'item'}. Please try again.`)}
  }

  function makeDeleteButton(config){
   const el=document.createElement('span');
   el.className='delete-control';el.setAttribute('role','button');el.setAttribute('tabindex','0');el.setAttribute('aria-label',`Delete ${config.name}`);el.title=`Delete ${config.name}`;el.textContent='Delete';
   const act=e=>{e.preventDefault();e.stopPropagation();runDelete(config)};
   el.addEventListener('click',act);
   el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();act(e)}});
   return el;
  }

  function scan(){
   if(stopped)return;
   document.querySelectorAll('.cost-card').forEach(card=>{
    if(card.dataset.deleteReady)return;
    const name=card.querySelector('.cost-card-main b')?.textContent?.trim();
    const type=card.querySelector('.list-icon')?.classList.contains('bulk')?'bulk':'menu';
    const matches=(data.recipes||[]).filter(r=>r.name===name&&r.recipe_type===type);
    if(!name||matches.length!==1)return;
    card.dataset.deleteReady='1';card.classList.add('has-delete-control');card.appendChild(makeDeleteButton({type,id:matches[0].id,name}));
   });

   document.querySelectorAll('.ingredient.linked').forEach(card=>{
    if(card.dataset.deleteReady)return;
    const name=card.querySelector('p b')?.textContent?.trim();
    const matches=(data.ingredients||[]).filter(i=>i.name===name);
    if(!name||matches.length!==1)return;
    card.dataset.deleteReady='1';card.classList.add('has-delete-control');card.appendChild(makeDeleteButton({type:'ingredient',id:matches[0].id,name}));
   });

   document.querySelectorAll('.category-card').forEach(card=>{
    if(card.dataset.deleteReady)return;
    const name=card.querySelector('p b')?.textContent?.trim();
    const matches=(data.categories||[]).filter(c=>c.name===name);
    if(!name||matches.length!==1)return;
    card.dataset.deleteReady='1';card.classList.add('has-delete-control');card.appendChild(makeDeleteButton({type:'category',id:matches[0].id,name}));
   });

   document.querySelectorAll('.simple-modal.wide').forEach(modal=>{
    if(modal.dataset.deleteReady)return;
    const name=modal.querySelector('header h2')?.textContent?.trim();
    const matches=(data.ingredients||[]).filter(i=>i.name===name);
    if(!name||matches.length!==1)return;
    modal.dataset.deleteReady='1';
    const slot=document.createElement('div');slot.className='modal-delete-slot';slot.appendChild(makeDeleteButton({type:'ingredient',id:matches[0].id,name}));
    modal.appendChild(slot);
   });

   const editor=document.querySelector('.cost-editor .editor-top');
   if(editor&&!editor.dataset.deleteReady){
    const heading=editor.querySelector('h1')?.textContent||'';
    if(heading.startsWith('Edit ')){
     const name=document.querySelector('.editor-form-card input')?.value?.trim();
     const type=heading.includes('Bulk Recipe')?'bulk':'menu';
     const matches=(data.recipes||[]).filter(r=>r.name===name&&r.recipe_type===type);
     if(name&&matches.length===1){
      editor.dataset.deleteReady='1';
      const actions=document.createElement('div');actions.className='editor-delete-slot';actions.appendChild(makeDeleteButton({type,id:matches[0].id,name}));
      editor.appendChild(actions);
     }
    }
   }
  }

  let observer;
  (async()=>{await refreshData();if(stopped)return;scan();observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true});})();
  return()=>{stopped=true;observer?.disconnect()};
 },[]);
 return null;
}
