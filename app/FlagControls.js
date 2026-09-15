"use client";
import {useEffect,useRef} from "react";
import {usePathname} from "next/navigation";

function rowName(row){return row.querySelector(':scope > span:first-child b')?.textContent?.trim()||''}
function context(path){
  if(path.startsWith('/ingredients'))return{type:'ingredient',kind:null};
  if(path.startsWith('/prepared-components')||path.startsWith('/bulk-recipes'))return{type:'recipe',kind:'bulk'};
  if(path.startsWith('/menu-costing')||path.startsWith('/menu-items'))return{type:'recipe',kind:'menu'};
  if(path.startsWith('/categories'))return{type:'category',kind:null};
  return null;
}

export default function FlagControls(){
  const path=usePathname()||'/';
  const cache=useRef(null);
  useEffect(()=>{
    const cfg=context(path);if(!cfg)return;
    let stopped=false,raf=0,observer;
    const load=async()=>{try{const r=await fetch('/api/bootstrap',{cache:'no-store'});const j=await r.json();if(!r.ok||j.error)return;cache.current=j;decorate()}catch{}};
    const decorate=()=>{
      if(stopped||!cache.current)return;
      const data=cache.current;
      document.querySelectorAll('.v2-table > .trow').forEach(row=>{
        const name=rowName(row);if(!name)return;
        let item=null;
        if(cfg.type==='ingredient')item=(data.ingredients||[]).find(x=>x.name===name);
        else if(cfg.type==='category')item=(data.categories||[]).find(x=>x.name===name);
        else item=(data.recipes||[]).find(x=>x.name===name&&x.recipe_type===cfg.kind);
        if(!item)return;
        row.dataset.flagged=item.is_flagged?'true':'false';
        row.classList.toggle('flagged-row',Boolean(item.is_flagged));
        const actions=row.querySelector(':scope > span.row-actions');if(!actions)return;
        let btn=actions.querySelector('.entity-flag-button');
        if(!btn){btn=document.createElement('button');btn.type='button';btn.className='entity-flag-button';actions.prepend(btn)}
        btn.classList.toggle('is-flagged',Boolean(item.is_flagged));
        btn.textContent=item.is_flagged?'⚑':'⚐';
        btn.title=item.is_flagged?'Unflag for review':'Flag for review';
        btn.setAttribute('aria-label',btn.title);
        btn.onclick=async(e)=>{
          e.preventDefault();e.stopPropagation();
          const was=Boolean(item.is_flagged);
          btn.disabled=true;
          try{
            const r=await fetch('/api/flags',{method:was?'DELETE':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entity_type:cfg.type,entity_id:item.id})});
            const j=await r.json();if(!r.ok)throw new Error(j.error||'Could not update flag');
            item.is_flagged=!was;
            row.dataset.flagged=item.is_flagged?'true':'false';
            row.classList.toggle('flagged-row',item.is_flagged);
            btn.classList.toggle('is-flagged',item.is_flagged);
            btn.textContent=item.is_flagged?'⚑':'⚐';
            btn.title=item.is_flagged?'Unflag for review':'Flag for review';
            btn.setAttribute('aria-label',btn.title);
            window.dispatchEvent(new CustomEvent('sg-flags-changed'));
          }catch(err){alert(err.message||'Could not update flag')}finally{btn.disabled=false}
        };
      });
    };
    load();
    observer=new MutationObserver(()=>{if(!raf)raf=requestAnimationFrame(()=>{raf=0;decorate()})});
    observer.observe(document.body,{subtree:true,childList:true});
    return()=>{stopped=true;observer?.disconnect();cancelAnimationFrame(raf)};
  },[path]);
  return null;
}
