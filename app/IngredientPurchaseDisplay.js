"use client";
import {useEffect} from "react";
import {usePathname} from "next/navigation";

const money=n=>Number.isFinite(Number(n))?`Rs ${Number(n).toLocaleString(undefined,{maximumFractionDigits:2})}`:'—';
const qty=n=>Number.isFinite(Number(n))?Number(n).toLocaleString(undefined,{maximumFractionDigits:3}):'—';
function norm(v){return String(v||'').trim().toLowerCase().replace(/\s+/g,' ')}
function meta(v){
  if(!v)return {};
  if(typeof v==='object')return v;
  try{return JSON.parse(v)||{}}catch{return {}}
}
function dateLabel(v){
  if(!v)return '';
  const d=new Date(v);
  if(Number.isNaN(d.getTime()))return String(v).slice(0,10);
  return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
}

export default function IngredientPurchaseDisplay(){
  const path=usePathname()||'';
  useEffect(()=>{
    if(!path.startsWith('/ingredients'))return;
    let cancelled=false,observer=null,raf=0,prices=new Map();

    const patch=()=>{
      if(cancelled||!prices.size)return;
      const table=document.querySelector('.v2-table');
      if(!table)return;
      table.querySelectorAll(':scope > .trow').forEach(row=>{
        const cells=row.children;
        if(!cells||cells.length<4)return;
        const name=norm(cells[0]?.querySelector('b')?.textContent||cells[0]?.textContent);
        const p=prices.get(name);
        if(!p)return;
        const m=meta(p.source_metadata);
        const purchaseQty=Number(p.display_purchase_quantity ?? m.sourceEnteredQty ?? p.purchase_quantity);
        const purchaseUnit=p.display_purchase_unit||m.sourceEnteredUnit||m.sourcePurchaseUnit||p.purchase_unit;
        const purchasePrice=Number(p.display_purchase_price ?? m.sourceReceiptTotal ?? p.purchase_price);
        if(Number.isFinite(purchaseQty)&&purchaseQty>0&&purchaseUnit&&Number.isFinite(purchasePrice)){
          const cell=cells[2];
          const value=`${money(purchasePrice)} / ${qty(purchaseQty)} ${purchaseUnit}`;
          const date=dateLabel(m.effectiveDate||p.price_date);
          if(cell.dataset.purchaseDisplay!==value){
            cell.dataset.purchaseDisplay=value;
            cell.innerHTML='';
            const strong=document.createElement('span');strong.textContent=value;strong.className='source-purchase-value';cell.appendChild(strong);
            const small=document.createElement('small');
            small.textContent=p.source==='shelfsense'?(date?`ShelfSense receipt · ${date}`:'ShelfSense receipt'):(date?`Purchase · ${date}`:'Purchase price');
            small.className='source-purchase-meta';cell.appendChild(small);
            cell.title='Original purchase price. Unit Cost is the kitchen costing rate used in recipes.';
          }
        }
        const costCell=cells[3];
        if(p.costing_status==='needs_yield'){
          costCell.innerHTML='';
          const badge=document.createElement('em');badge.className='costing-needs-yield';badge.textContent='Needs yield';costCell.appendChild(badge);
          const small=document.createElement('small');small.className='source-purchase-meta';small.textContent=`Set usable ${p.costing_unit||'kitchen'} per ${p.source_purchase_unit||purchaseUnit}`;costCell.appendChild(small);
          costCell.title='This purchase unit cannot be converted to a kitchen unit until usable yield is set.';
        }
      });
    };

    fetch('/api/bootstrap',{cache:'no-store'})
      .then(r=>r.json())
      .then(j=>{
        if(cancelled)return;
        prices=new Map((j.ingredients||[]).filter(i=>i.latest_price).map(i=>[norm(i.name),i.latest_price]));
        patch();
        observer=new MutationObserver(()=>{if(!raf)raf=requestAnimationFrame(()=>{raf=0;patch()})});
        observer.observe(document.body,{subtree:true,childList:true,characterData:true});
      })
      .catch(()=>{});

    return()=>{cancelled=true;if(observer)observer.disconnect();if(raf)cancelAnimationFrame(raf)};
  },[path]);
  return null;
}
