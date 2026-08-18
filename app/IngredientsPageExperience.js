"use client";
import {useEffect} from "react";

function pct(part,total){return total?Math.round((part/total)*1000)/10:0}
function daysAgo(dateStr){
  if(!dateStr)return Infinity;
  const d=new Date(dateStr);if(Number.isNaN(d.getTime()))return Infinity;
  return (Date.now()-d.getTime())/86400000;
}

export default function IngredientsPageExperience(){
 useEffect(()=>{
  let stopped=false,observer,data={ingredients:[]};

  async function load(){
   try{const r=await fetch('/api/bootstrap',{cache:'no-store'});const j=await r.json();if(!j.error)data=j}catch{}
   enhance();
  }

  function stat(icon,label,value,sub,tone=''){
   const el=document.createElement('div');el.className=`ingredient-stat ${tone}`;
   el.innerHTML=`<div class="ingredient-stat-icon">${icon}</div><div><span>${label}</span><b>${value}</b><small>${sub}</small></div>`;
   return el;
  }

  function ensureSummary(head){
   const area=head.parentElement;if(!area||area.querySelector('.ingredient-kpi-strip'))return;
   const ingredients=data.ingredients||[],total=ingredients.length,priced=ingredients.filter(i=>i.latest_price).length,missing=total-priced,recent=ingredients.filter(i=>daysAgo(i.latest_price?.price_date)<=7).length;
   const strip=document.createElement('section');strip.className='ingredient-kpi-strip';
   strip.append(
    stat('♧','TOTAL INGREDIENTS',total,'All ingredients'),
    stat('◇','PRICED',priced,`${pct(priced,total)}% of total`,'positive'),
    stat('!','MISSING PRICES',missing,`${pct(missing,total)}% of total`,'warning'),
    stat('▣','RECENTLY UPDATED',recent,'In the last 7 days')
   );
   head.insertAdjacentElement('afterend',strip);
  }

  function ensureControlLayout(head){
   if(head.dataset.revamped)return;
   head.dataset.revamped='1';
   const h=head.querySelector('h1');if(h)h.parentElement?.classList.add('ingredient-title-copy');
   const existing=head.querySelector(':scope > button');
   if(existing)existing.classList.add('ingredient-add-main');
  }

  function enhanceCards(){
   document.querySelectorAll('.ingredient.linked').forEach(card=>{
    card.classList.add('ingredient-premium-card');
    const p=card.querySelector('p');
    const priceLine=p?.querySelector('span');
    if(priceLine){
      const missing=/missing/i.test(priceLine.textContent||'');
      priceLine.classList.toggle('ingredient-price-missing',missing);
      priceLine.classList.toggle('ingredient-price-set',!missing);
      if(missing&&!priceLine.textContent?.trim().startsWith('•'))priceLine.textContent=`• ${priceLine.textContent.trim()}`;
    }
    const priceBtn=card.querySelector('button');
    if(priceBtn){priceBtn.classList.add('ingredient-price-action');priceBtn.textContent=/update/i.test(priceBtn.textContent||'')?'Update Price':'Add Price'}
    const del=card.querySelector('.delete-control');
    if(del){del.classList.add('ingredient-overflow-action');del.textContent='⋮';del.setAttribute('aria-label','Delete ingredient');del.title='Delete ingredient'}
   });
  }

  function enhance(){
   if(stopped)return;
   const head=[...document.querySelectorAll('.page-head')].find(h=>h.querySelector('h1')?.textContent?.trim()==='Ingredients');
   const active=!!head;
   document.body.classList.toggle('ingredients-revamped',active);
   if(!active)return;
   ensureControlLayout(head);ensureSummary(head);enhanceCards();
   const search=document.querySelector('.page-head + .ingredient-kpi-strip + .search, .ingredient-kpi-strip + .search, .search');
   if(search&&search.querySelector('input')?.placeholder?.toLowerCase().includes('ingredient'))search.classList.add('ingredient-search-premium');
   const importActions=head.querySelector('.price-import-actions');if(importActions)importActions.classList.add('ingredient-toolbar-actions');
  }

  load();
  observer=new MutationObserver(enhance);observer.observe(document.body,{childList:true,subtree:true});
  return()=>{stopped=true;observer?.disconnect();document.body.classList.remove('ingredients-revamped')};
 },[]);
 return null;
}
