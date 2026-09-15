"use client";
import {useEffect,useMemo,useState} from "react";
import {createPortal} from "react-dom";
import {usePathname} from "next/navigation";

function n(v){
  const x=Number(String(v||'').replace(/[^0-9.-]/g,''));
  return Number.isFinite(x)?x:NaN;
}
function text(row,i){return row.children?.[i]?.innerText?.trim()||''}
function configFor(path){
  if(path.startsWith('/purchase-prices'))return{
    label:'Price Filters',
    sorts:[['default','Default'],['unit_desc','Most expensive / unit'],['unit_asc','Least expensive / unit'],['total_desc','Highest purchase total'],['total_asc','Lowest purchase total'],['date_desc','Newest first'],['date_asc','Oldest first'],['name_asc','Ingredient A–Z'],['name_desc','Ingredient Z–A']],
    facet:'supplier',
  };
  if(path.startsWith('/ingredients'))return{
    label:'Ingredient Filters',
    sorts:[['default','Default'],['cost_desc','Highest unit cost'],['cost_asc','Lowest unit cost'],['used_desc','Most used'],['used_asc','Least used'],['name_asc','Name A–Z'],['name_desc','Name Z–A']],
    facet:'price_status',
  };
  if(path.startsWith('/prepared-components')||path.startsWith('/bulk-recipes'))return{
    label:'Bulk Recipe Filters',
    sorts:[['default','Default'],['batch_desc','Highest batch cost'],['batch_asc','Lowest batch cost'],['unit_desc','Highest unit cost'],['unit_asc','Lowest unit cost'],['used_desc','Most used'],['name_asc','Name A–Z']],
  };
  if(path.startsWith('/menu-costing')||path.startsWith('/menu-items'))return{
    label:'Menu Filters',
    sorts:[['default','Default'],['sell_desc','Highest selling price'],['sell_asc','Lowest selling price'],['cost_desc','Highest item cost'],['cost_asc','Lowest item cost'],['food_desc','Highest food cost %'],['food_asc','Lowest food cost %'],['contrib_desc','Highest contribution'],['contrib_asc','Lowest contribution'],['name_asc','Name A–Z']],
    facet:'category',
  };
  if(path.startsWith('/categories'))return{
    label:'Category Filters',
    sorts:[['default','Default'],['count_desc','Most menu items'],['count_asc','Least menu items'],['name_asc','Name A–Z'],['name_desc','Name Z–A']],
  };
  return null;
}

function rowMetric(path,row,sort){
  if(path.startsWith('/purchase-prices')){
    if(sort.startsWith('date_'))return Date.parse(text(row,0))||0;
    if(sort.startsWith('name_'))return text(row,1).toLowerCase();
    if(sort.startsWith('total_'))return n(text(row,3));
    if(sort.startsWith('unit_'))return n(text(row,4));
  }
  if(path.startsWith('/ingredients')){
    if(sort.startsWith('name_'))return text(row,0).toLowerCase();
    if(sort.startsWith('cost_'))return n(text(row,3));
    if(sort.startsWith('used_'))return n(text(row,4));
  }
  if(path.startsWith('/prepared-components')||path.startsWith('/bulk-recipes')){
    if(sort.startsWith('name_'))return text(row,0).toLowerCase();
    if(sort.startsWith('batch_'))return n(text(row,2));
    if(sort.startsWith('unit_'))return n(text(row,3));
    if(sort.startsWith('used_'))return n(text(row,4));
  }
  if(path.startsWith('/menu-costing')||path.startsWith('/menu-items')){
    if(sort.startsWith('name_'))return text(row,0).toLowerCase();
    if(sort.startsWith('sell_'))return n(text(row,2));
    if(sort.startsWith('cost_'))return n(text(row,3));
    if(sort.startsWith('food_'))return n(text(row,4));
    if(sort.startsWith('contrib_'))return n(text(row,5));
  }
  if(path.startsWith('/categories')){
    if(sort.startsWith('name_'))return text(row,0).toLowerCase();
    if(sort.startsWith('count_'))return n(text(row,1));
  }
  return 0;
}

function compareValues(a,b,desc){
  if(typeof a==='string'||typeof b==='string')return desc?String(b).localeCompare(String(a)):String(a).localeCompare(String(b));
  const av=Number.isFinite(a)?a:(desc?-Infinity:Infinity),bv=Number.isFinite(b)?b:(desc?-Infinity:Infinity);
  return desc?bv-av:av-bv;
}

export default function SearchFilters(){
  const path=usePathname()||'/';
  const cfg=useMemo(()=>configFor(path),[path]);
  const [host,setHost]=useState(null),[open,setOpen]=useState(false),[sort,setSort]=useState('default'),[facet,setFacet]=useState('all'),[latestOnly,setLatestOnly]=useState(false),[options,setOptions]=useState([]),[tick,setTick]=useState(0);

  useEffect(()=>{setSort('default');setFacet('all');setLatestOnly(false);setOpen(false)},[path]);

  useEffect(()=>{
    if(!cfg)return;
    let raf=0;
    const findHost=()=>{
      const toolbar=[...document.querySelectorAll('.v2-toolbar')].find(x=>x.querySelector('input[placeholder*="Search"],input[placeholder*="search"]'));
      if(!toolbar){setHost(null);return}
      let node=toolbar.querySelector(':scope > .global-filter-host');
      if(!node){node=document.createElement('div');node.className='global-filter-host';const count=toolbar.querySelector('b');if(count)toolbar.insertBefore(node,count);else toolbar.appendChild(node)}
      setHost(prev=>prev===node?prev:node);
    };
    findHost();
    const mo=new MutationObserver(()=>{if(!raf)raf=requestAnimationFrame(()=>{raf=0;findHost();setTick(x=>x+1)})});
    mo.observe(document.body,{subtree:true,childList:true});
    return()=>{mo.disconnect();cancelAnimationFrame(raf)};
  },[cfg,path]);

  useEffect(()=>{
    if(!cfg)return;
    const table=document.querySelector('.v2-table');
    if(!table)return;
    const rows=[...table.querySelectorAll(':scope > .trow')];
    table.classList.add('filter-sort-table');
    const facets=new Set();
    rows.forEach(row=>{
      row.hidden=false;
      if(cfg.facet==='supplier')facets.add(text(row,5)||'—');
      if(cfg.facet==='category')facets.add(text(row,1)||'—');
    });
    setOptions([...facets].filter(Boolean).sort((a,b)=>a.localeCompare(b)));

    let seen=new Set();
    rows.forEach(row=>{
      let visible=true;
      if(cfg.facet==='supplier'&&facet!=='all')visible=text(row,5)===facet;
      if(cfg.facet==='category'&&facet!=='all')visible=text(row,1)===facet;
      if(cfg.facet==='price_status'&&facet==='missing')visible=/missing/i.test(text(row,2));
      if(cfg.facet==='price_status'&&facet==='priced')visible=!/missing/i.test(text(row,2));
      if(path.startsWith('/purchase-prices')&&latestOnly){
        const key=text(row,1).toLowerCase();
        if(seen.has(key))visible=false;else seen.add(key);
      }
      row.hidden=!visible;
    });

    const direction=sort.endsWith('_desc')?'desc':'asc';
    if(sort==='default')rows.forEach((row,i)=>row.style.order=String(i+1));
    else{
      const sorted=[...rows].sort((a,b)=>compareValues(rowMetric(path,a,sort),rowMetric(path,b,sort),direction==='desc'));
      sorted.forEach((row,i)=>row.style.order=String(i+1));
    }
  },[cfg,path,sort,facet,latestOnly,tick]);

  if(!cfg||!host)return null;
  const active=sort!=='default'||facet!=='all'||latestOnly;
  return createPortal(<div className="global-filter-wrap">
    <button type="button" className={`global-filter-button ${active?'active':''}`} onClick={()=>setOpen(x=>!x)} aria-expanded={open}>Filter{active?' •':''}</button>
    {open&&<div className="global-filter-popover">
      <label><span>Sort</span><select value={sort} onChange={e=>setSort(e.target.value)}>{cfg.sorts.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      {cfg.facet==='supplier'&&<label><span>Supplier</span><select value={facet} onChange={e=>setFacet(e.target.value)}><option value="all">All suppliers</option>{options.map(x=><option key={x} value={x}>{x}</option>)}</select></label>}
      {cfg.facet==='category'&&<label><span>Category</span><select value={facet} onChange={e=>setFacet(e.target.value)}><option value="all">All categories</option>{options.map(x=><option key={x} value={x}>{x}</option>)}</select></label>}
      {cfg.facet==='price_status'&&<label><span>Price status</span><select value={facet} onChange={e=>setFacet(e.target.value)}><option value="all">All ingredients</option><option value="priced">Has price</option><option value="missing">Missing price</option></select></label>}
      {path.startsWith('/purchase-prices')&&<label className="global-filter-check"><input type="checkbox" checked={latestOnly} onChange={e=>setLatestOnly(e.target.checked)}/><span>Latest record per ingredient only</span></label>}
      <div className="global-filter-actions"><button type="button" onClick={()=>{setSort('default');setFacet('all');setLatestOnly(false)}}>Reset</button><button type="button" className="primary" onClick={()=>setOpen(false)}>Apply</button></div>
    </div>}
  </div>,host);
}
