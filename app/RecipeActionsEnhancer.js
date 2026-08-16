"use client";
import {useEffect,useState} from "react";
import {createPortal} from "react-dom";

export default function RecipeActionsEnhancer(){
  const [mounted,setMounted]=useState(false);
  const [recipes,setRecipes]=useState([]);
  const [current,setCurrent]=useState(null);
  const [target,setTarget]=useState(null);
  const [open,setOpen]=useState(false);
  const [confirmDelete,setConfirmDelete]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  async function loadRecipes(){
    try{const r=await fetch('/api/bootstrap',{cache:'no-store'});const j=await r.json();setRecipes(j.recipes||[])}catch{}
  }

  useEffect(()=>{setMounted(true);loadRecipes()},[]);

  useEffect(()=>{
    const sync=()=>{
      const editor=document.querySelector('.editor-page');
      const actions=editor?.querySelector('.editor-actions');
      setTarget(actions||null);
      if(!editor){setCurrent(null);setOpen(false);return;}
      const recipeInput=[...editor.querySelectorAll('input')].find(i=>i.placeholder?.toLowerCase().includes('chicken fried rice'));
      const name=(recipeInput?.value||'').trim();
      const found=name?recipes.find(r=>r.name===name):null;
      setCurrent(found||null);
    };
    const obs=new MutationObserver(()=>requestAnimationFrame(sync));
    obs.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['value','class']});
    document.addEventListener('input',sync,true);sync();
    return()=>{obs.disconnect();document.removeEventListener('input',sync,true)};
  },[recipes]);

  useEffect(()=>{
    const editor=document.querySelector('.editor-page');
    if(!editor)return;
    const locked=!!current?.is_locked;
    editor.dataset.recipeLocked=locked?'true':'false';
    editor.querySelectorAll('.editor-content input,.editor-content select,.editor-content textarea,.editor-content .entry-primary,.editor-content .mini-link,.editor-content .text-link,.editor-content .component-row>button,.editor-content .timer button,.editor-content .kw-use-timer,.editor-footer button,.draft-btn').forEach(el=>{el.disabled=locked});
  },[current]);

  const notify=text=>{setMessage(text);setTimeout(()=>setMessage(''),2200)};

  async function toggleLock(){
    if(!current||busy)return;setBusy(true);
    const next=!current.is_locked;
    const r=await fetch(`/api/recipes/${current.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({is_locked:next})});
    const j=await r.json();setBusy(false);
    if(!r.ok){notify(j.error||'Could not update recipe');return}
    setCurrent(x=>({...x,...j}));await loadRecipes();setOpen(false);notify(next?'Recipe locked':'Recipe unlocked');
  }

  async function removeRecipe(){
    if(!current||busy)return;setBusy(true);
    const r=await fetch(`/api/recipes/${current.id}`,{method:'DELETE'});const j=await r.json();setBusy(false);
    if(!r.ok){notify(j.error||'Could not delete recipe');return}
    setOpen(false);setConfirmDelete(false);notify('Recipe deleted');
    setTimeout(()=>{document.querySelector('.editor-title>button')?.click();window.location.reload()},450);
  }

  if(!mounted)return null;
  return <>
    {target&&current&&createPortal(<button type="button" className="v2-recipe-more" onClick={()=>{setConfirmDelete(false);setOpen(true)}} aria-label="Recipe actions">•••</button>,target)}
    {current?.is_locked&&document.querySelector('.editor-content')&&createPortal(<div className="v2-locked-banner"><span>🔒</span><div><b>Recipe locked</b><small>Read-only until it is explicitly unlocked.</small></div></div>,document.querySelector('.editor-content'))}
    {open&&<div className="v2-sheet-backdrop" onClick={()=>setOpen(false)}><section className="v2-action-sheet" onClick={e=>e.stopPropagation()}>
      <div className="v2-sheet-handle"/>
      {!confirmDelete?<>
        <header><div><small>RECIPE ACTIONS</small><h2>{current.name}</h2></div><button onClick={()=>setOpen(false)}>×</button></header>
        <button className="v2-action-row" onClick={toggleLock} disabled={busy}><span>{current.is_locked?'🔓':'🔒'}</span><div><b>{current.is_locked?'Unlock recipe':'Lock recipe'}</b><small>{current.is_locked?'Allow editing again':'Prevent accidental changes'}</small></div><i>›</i></button>
        <button className="v2-action-row danger" onClick={()=>setConfirmDelete(true)} disabled={busy}><span>⌫</span><div><b>Delete recipe</b><small>Remove from normal lists; history stays recoverable</small></div><i>›</i></button>
      </>:<div className="v2-delete-confirm"><span className="v2-danger-icon">⌫</span><h2>Delete {current.name}?</h2><p>The recipe will disappear from normal lists, but its historical versions remain recoverable.</p><button className="v2-danger-button" onClick={removeRecipe} disabled={busy}>{busy?'Deleting…':'Delete Recipe'}</button><button className="v2-cancel-button" onClick={()=>setConfirmDelete(false)} disabled={busy}>Keep Recipe</button></div>}
    </section></div>}
    {message&&<div className="v2-toast">{message}</div>}
  </>;
}
