"use client";
import {useEffect,useState} from "react";

export default function ActionDeleteExperience(){
 const [pending,setPending]=useState(null);
 const [menu,setMenu]=useState(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");

 useEffect(()=>{
  const onOpen=e=>{
   const detail=e.detail;
   if(!detail)return;
   setMenu(null);setError("");setPending(detail);
  };
  const onMenu=e=>{
   const detail=e.detail;if(!detail)return;
   setMenu(detail);
  };
  const close=()=>setMenu(null);
  window.addEventListener('sg-open-delete',onOpen);
  window.addEventListener('sg-open-menu',onMenu);
  window.addEventListener('resize',close);window.addEventListener('scroll',close,true);
  return()=>{window.removeEventListener('sg-open-delete',onOpen);window.removeEventListener('sg-open-menu',onMenu);window.removeEventListener('resize',close);window.removeEventListener('scroll',close,true)};
 },[]);

 async function confirmDelete(){
  if(!pending)return;setBusy(true);setError('');
  const {type,id,name}=pending;
  let url,options={method:'DELETE',headers:{'Content-Type':'application/json'}};
  if(type==='menu'||type==='bulk')url=`/api/recipes/${id}`;
  else if(type==='ingredient'){url='/api/ingredients';options.body=JSON.stringify({id,name})}
  else {url='/api/categories';options.body=JSON.stringify({id,name})}
  try{
   const r=await fetch(url,options),j=await r.json();
   if(!r.ok){
    const names=(j.used_in||[]).map(x=>x.name).filter(Boolean);
    setError(names.length?`${j.error} Used in: ${names.join(', ')}`:(j.error||'This item cannot be deleted yet.'));
    setBusy(false);return;
   }
   window.location.reload();
  }catch{setError('Could not delete this item. Please try again.');setBusy(false)}
 }

 const copy=pending?pending.type==='menu'
  ?'This menu item will be removed from the active list. Historical versions remain stored.'
  :pending.type==='bulk'
   ?'This bulk recipe can only be deleted when no active item is using it.'
   :pending.type==='ingredient'
    ?'Its purchase-price history will also be removed. This is only allowed when it is not used anywhere.'
    :'This category can only be deleted when no active menu item is assigned to it.':'';

 return <>
  {menu&&<div className="sg-action-menu" style={{left:menu.left,top:menu.top}}>
    <button onClick={()=>{setMenu(null);window.dispatchEvent(new CustomEvent('sg-open-delete',{detail:menu.config}))}}>Delete</button>
  </div>}
  {pending&&<div className="sg-dialog-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setPending(null)}}>
    <div className="sg-dialog" role="dialog" aria-modal="true" aria-labelledby="sg-delete-title">
      <div className="sg-dialog-icon">!</div>
      <div className="sg-dialog-copy">
        <small>DELETE {pending.type==='ingredient'?'INGREDIENT':pending.type==='bulk'?'BULK RECIPE':pending.type==='menu'?'MENU ITEM':'CATEGORY'}</small>
        <h2 id="sg-delete-title">Delete “{pending.name}”?</h2>
        <p>{copy}</p>
        {error&&<div className="sg-dialog-error">{error}</div>}
      </div>
      <div className="sg-dialog-actions">
        <button className="sg-dialog-cancel" disabled={busy} onClick={()=>setPending(null)}>Cancel</button>
        <button className="sg-dialog-delete" disabled={busy} onClick={confirmDelete}>{busy?'Deleting…':'Delete'}</button>
      </div>
    </div>
  </div>}
 </>;
}
