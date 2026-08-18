"use client";
import {useEffect} from "react";

export default function CategoriesPageExperience(){
 useEffect(()=>{
  let stopped=false,observer,data={categories:[],recipes:[]};

  async function load(){
   try{const r=await fetch('/api/bootstrap',{cache:'no-store'});const j=await r.json();if(!j.error)data=j}catch{}
   enhance();
  }

  function cleanup(){
   document.body.classList.remove('categories-revamped');
   document.querySelectorAll('.category-kpi-strip').forEach(el=>el.remove());
   document.querySelectorAll('.category-search-premium').forEach(el=>el.classList.remove('category-search-premium'));
  }

  function stat(icon,label,value,sub,tone=''){
   const el=document.createElement('div');el.className=`category-stat ${tone}`;
   el.innerHTML=`<div class="category-stat-icon">${icon}</div><div><span>${label}</span><b>${value}</b><small>${sub}</small></div>`;
   return el;
  }

  function ensureSummary(head){
   const area=head.parentElement;if(!area||area.querySelector('.category-kpi-strip'))return;
   const categories=data.categories||[];
   const menuItems=(data.recipes||[]).filter(r=>r.recipe_type==='menu');
   const assigned=menuItems.filter(r=>String(r.category||'').trim()).length;
   const uncategorized=menuItems.length-assigned;
   const usedNames=new Set(menuItems.map(r=>String(r.category||'').trim()).filter(Boolean));
   const usedCount=categories.filter(c=>usedNames.has(c.name)).length;
   const strip=document.createElement('section');strip.className='category-kpi-strip';
   strip.append(
    stat('▦','TOTAL CATEGORIES',categories.length,'Available menu groups'),
    stat('✓','CATEGORIES IN USE',usedCount,'Currently assigned','positive'),
    stat('▣','MENU ITEMS',menuItems.length,`${assigned} categorized`),
    stat('!','UNCATEGORIZED',uncategorized,uncategorized?'Needs attention':'Everything organized',uncategorized?'warning':'positive')
   );
   head.insertAdjacentElement('afterend',strip);
  }

  function enhanceCards(){
   document.querySelectorAll('.category-card').forEach(card=>{
    if(!card.dataset.categoryPremium){
      card.dataset.categoryPremium='1';
      card.classList.add('category-premium-card');
      const name=card.querySelector('p b')?.textContent?.trim();
      const count=(data.recipes||[]).filter(r=>r.recipe_type==='menu'&&r.category===name).length;
      const sub=card.querySelector('p span');
      if(sub)sub.textContent=`${count} menu item${count===1?'':'s'}`;
    }
    const del=card.querySelector('.delete-control');
    if(del&&!del.dataset.categoryOverflow){
      del.dataset.categoryOverflow='1';
      del.classList.add('category-overflow-action');
      if(del.textContent!=='⋮')del.textContent='⋮';
      del.setAttribute('aria-label','Category actions');
      del.title='Category actions';
    }
   });
  }

  function enhance(){
   if(stopped)return;
   const head=[...document.querySelectorAll('.page-head')].find(h=>h.querySelector('h1')?.textContent?.trim()==='Categories');
   if(!head){cleanup();return}
   document.body.classList.add('categories-revamped');
   if(!head.dataset.categoryRevamped){
     head.dataset.categoryRevamped='1';
     head.querySelector('h1')?.parentElement?.classList.add('category-title-copy');
     const add=head.querySelector(':scope > button');if(add)add.classList.add('category-add-main');
   }
   ensureSummary(head);enhanceCards();
   const search=[...document.querySelectorAll('.search')].find(el=>el.querySelector('input')?.placeholder?.toLowerCase().includes('categor'));
   if(search&&!search.classList.contains('category-search-premium'))search.classList.add('category-search-premium');
  }

  load();observer=new MutationObserver(enhance);observer.observe(document.body,{childList:true,subtree:true});
  return()=>{stopped=true;observer?.disconnect();cleanup()};
 },[]);
 return null;
}
