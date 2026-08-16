"use client";
import {useEffect} from "react";

export default function RecipeActionsEnhancer(){
  useEffect(()=>{
    let current=null;
    let recipes=[];
    let busy=false;

    const loadRecipes=async()=>{
      try{
        const r=await fetch('/api/bootstrap',{cache:'no-store'});
        const j=await r.json();
        recipes=j.recipes||[];
      }catch{}
    };

    const getName=()=>{
      const editor=document.querySelector('.editor-page');
      if(!editor)return '';
      const inputs=[...editor.querySelectorAll('input')];
      const recipeInput=inputs.find(i=>i.placeholder?.toLowerCase().includes('chicken fried rice'));
      return (recipeInput?.value||'').trim();
    };

    const applyReadOnly=locked=>{
      const editor=document.querySelector('.editor-page');
      if(!editor)return;
      editor.dataset.recipeLocked=locked?'true':'false';
      editor.querySelectorAll('.editor-content input,.editor-content select,.editor-content textarea,.editor-content .entry-primary,.editor-content .mini-link,.editor-content .text-link,.editor-content .component-row>button,.editor-content .timer button,.editor-content .kw-use-timer').forEach(el=>{
        el.disabled=!!locked;
      });
      editor.querySelectorAll('.editor-footer button,.draft-btn').forEach(el=>el.disabled=!!locked);
    };

    const render=()=>{
      const editor=document.querySelector('.editor-page');
      if(!editor)return;
      const name=getName();
      if(name){
        const found=recipes.find(r=>r.name===name);
        if(found) current=found;
      }
      const old=editor.querySelector('.recipe-admin-actions');
      if(!current?.id){old?.remove();applyReadOnly(false);return;}
      applyReadOnly(!!current.is_locked);
      if(old){
        old.querySelector('[data-lock-label]').textContent=current.is_locked?'Unlock':'Lock';
        old.classList.toggle('locked',!!current.is_locked);
        return;
      }
      const box=document.createElement('div');
      box.className='recipe-admin-actions'+(current.is_locked?' locked':'');
      box.innerHTML=`<button type="button" class="recipe-lock-btn"><span>${current.is_locked?'🔓':'🔒'}</span><b data-lock-label>${current.is_locked?'Unlock':'Lock'}</b></button><button type="button" class="recipe-delete-btn"><span>⌫</span><b>Delete</b></button>`;
      const actions=editor.querySelector('.editor-actions');
      if(actions) actions.prepend(box);

      box.querySelector('.recipe-lock-btn').addEventListener('click',async()=>{
        if(busy||!current)return;busy=true;
        const next=!current.is_locked;
        const r=await fetch(`/api/recipes/${current.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({is_locked:next})});
        const j=await r.json();busy=false;
        if(!r.ok){alert(j.error||'Could not update recipe lock');return;}
        current={...current,...j};
        await loadRecipes();render();
      });

      box.querySelector('.recipe-delete-btn').addEventListener('click',async()=>{
        if(busy||!current)return;
        const ok=window.confirm(`Delete “${current.name}”?\n\nIt will be removed from normal recipe lists but its history can still be recovered.`);
        if(!ok)return;
        busy=true;
        const r=await fetch(`/api/recipes/${current.id}`,{method:'DELETE'});
        const j=await r.json();busy=false;
        if(!r.ok){alert(j.error||'Could not delete recipe');return;}
        document.querySelector('.editor-page .close-x')?.click();
        document.querySelector('.editor-title>button')?.click();
        window.location.reload();
      });
    };

    loadRecipes().then(render);
    const observer=new MutationObserver(()=>requestAnimationFrame(render));
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['value']});
    document.addEventListener('input',render,true);
    return()=>{observer.disconnect();document.removeEventListener('input',render,true)};
  },[]);
  return null;
}
