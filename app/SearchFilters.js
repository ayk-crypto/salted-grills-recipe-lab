"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {usePathname} from "next/navigation";

function n(v){const x=Number(String(v||'').replace(/[^0-9.-]/g,''));return Number.isFinite(x)?x:NaN}
function text(row,i){return row.children?.[i]?.innerText?.trim()||''}
function configFor(path){
  if(path.startsWith('/purchase-prices'))return{label:'Price Filters',sorts:[['default','Default order'],['unit_desc','Highest unit cost'],['unit_asc','Lowest unit cost'],['total_desc','Highest purchase total'],['total_asc','Lowest purchase total'],['date_desc','Newest first'],['date_asc','Oldest first'],['name_asc','Ingredient A–Z'],['name_desc','Ingredient Z–A']],facet:'supplier'};
  if(path.startsWith('/ingredients'))return{label:'Ingredient Filters',sorts:[['default','Default order'],['cost_desc','Highest unit cost'],['cost_asc','Lowest unit cost'],['used_desc','Most used'],['used_asc','Least used'],['name_asc','Name A–Z'],['name_desc','Name Z–A']],facet:'price_status'};
  if(path.startsWith('/prepared-components')||path.startsWith('/bulk-recipes'))return{label:'Bulk Recipe Filters',sorts:[['default','Default order'],['batch_desc','Highest batch cost'],['batch_asc','Lowest batch cost'],['unit_desc','Highest unit cost'],['unit_asc','Lowest unit cost'],['used_desc','Most used'],['name_asc','Name A–Z']]};
  if(path.startsWith('/menu-costing')||path.startsWith('/menu-items'))return{label:'Menu Filters',sorts:[['default','Default order'],['sell_desc','Highest selling price'],['sell_asc','Lowest selling price'],['cost_desc','Highest item cost'],['cost_asc','Lowest item cost'],['food_desc','Highest food cost %'],['food_asc','Lowest food cost %'],['contrib_desc','Highest contribution'],['contrib_asc','Lowest contribution'],['name_asc','Name A–Z']],facet:'category'};
  if(path.startsWith('/categories'))return{label:'Category Filters',sorts:[['default','Default order'],['count_desc','Most menu items'],['count_asc','Least menu items'],['name_asc','Name A–Z'],['name_desc','Name Z–A']]};
  return null;
}
function rowMetric(path,row,sort){
  if(path.startsWith('/purchase-prices')){if(sort.startsWith('date_'))return Date.parse(text(row,0))||0;if(sort.startsWith('name_'))return text(row,1).toLowerCase();if(sort.startsWith('total_'))return n(text(row,3));if(sort.startsWith('unit_'))return n(text(row,4))}
  if(path.startsWith('/ingredients')){if(sort.startsWith('name_'))return text(row,0).toLowerCase();if(sort.startsWith('cost_'))return n(text(row,3));if(sort.startsWith('used_'))return n(text(row,4))}
  if(path.startsWith('/prepared-components')||path.startsWith('/bulk-recipes')){if(sort.startsWith('name_'))return text(row,0).toLowerCase();if(sort.startsWith('batch_'))return n(text(row,2));if(sort.startsWith('unit_'))return n(text(row,3));if(sort.startsWith('used_'))return n(text(row,4))}
  if(path.startsWith('/menu-costing')||path.startsWith('/menu-items')){if(sort.startsWith('name_'))return text(row,0).toLowerCase();if(sort.startsWith('sell_'))return n(text(row,2));if(sort.startsWith('cost_'))return n(text(row,3));if(sort.startsWith('food_'))return n(text(row,4));if(sort.startsWith('contrib_'))return n(text(row,5))}
  if(path.startsWith('/categories')){if(sort.startsWith('name_'))return text(row,0).toLowerCase();if(sort.startsWith('count_'))return n(text(row,1))}
  return 0;
}
function compareValues(a,b,desc){if(typeof a==='string'||typeof b==='string')return desc?String(b).localeCompare(String(a)):String(a).localeCompare(String(b));const av=Number.isFinite(a)?a:(desc?-Infinity:Infinity),bv=Number.isFinite(b)?b:(desc?-Infinity:Infinity);return desc?bv-av:av-bv}
const QuickChip=({active,onClick,children})=><button type="button" className={`filter-chip ${active?'active':''}`} onClick={onClick}>{children}</button>;

export default function SearchFilters(){
  const path=usePathname()||'/';
  const cfg=useMemo(()=>configFor(path),[path]);
  const wrapRef=useRef(null);
  const [host,setHost]=useState(null),[open,setOpen]=useState(false),[sort,setSort]=useState('default'),[facet,setFacet]=useState('all'),[latestOnly,setLatestOnly]=useState(false),[options,setOptions]=useState([]),[tick,setTick]=useState(0);
  const [usage,setUsage]=useState('all'),[unit,setUnit]=useState('all'),[unitOptions,setUnitOptions]=useState([]),[flagged,setFlagged]=useState('all'),[priceStatus,setPriceStatus]=useState('all');

  useEffect(()=>{setSort('default');setFacet('all');setLatestOnly(false);setUsage('all');setUnit('all');setFlagged('all');setPriceStatus('all');setOpen(false)},[path]);
  useEffect(()=>{const h=()=>setTick(x=>x+1);window.addEventListener('sg-flags-changed',h);return()=>window.removeEventListener('sg-flags-changed',h)},[]);
  useEffect(()=>{
    if(!open)return;
    const onPointer=e=>{if(wrapRef.current&&!wrapRef.current.contains(e.target))setOpen(false)};
    const onKey=e=>{if(e.key==='Escape')setOpen(false)};
    document.addEventListener('pointerdown',onPointer,true);document.addEventListener('keydown',onKey);
    return()=>{document.removeEventListener('pointerdown',onPointer,true);document.removeEventListener('keydown',onKey)};
  },[open]);
  useEffect(()=>{
    if(!cfg)return;let raf=0;
    const findHost=()=>{const toolbar=[...document.querySelectorAll('.v2-toolbar')].find(x=>x.querySelector('input[placeholder*="Search"],input[placeholder*="search"]'));if(!toolbar){setHost(null);return}let node=toolbar.querySelector(':scope > .global-filter-host');if(!node){node=document.createElement('div');node.className='global-filter-host';const count=toolbar.querySelector('b');if(count)toolbar.insertBefore(node,count);else toolbar.appendChild(node)}setHost(prev=>prev===node?prev:node)};
    findHost();const mo=new MutationObserver(()=>{if(!raf)raf=requestAnimationFrame(()=>{raf=0;findHost();setTick(x=>x+1)})});mo.observe(document.body,{subtree:true,childList:true});return()=>{mo.disconnect();cancelAnimationFrame(raf)};
  },[cfg,path]);
  useEffect(()=>{
    if(!path.startsWith('/purchase-prices'))return;let cancelled=false;
    const addMissing=async()=>{
      const j=await fetch('/api/bootstrap',{cache:'no-store'}).then(r=>r.json()).catch(()=>null);if(cancelled||!j)return;
      const table=document.querySelector('.v2-table.prices');if(!table)return;
      table.querySelectorAll(':scope > .filter-missing-price-row').forEach(x=>x.remove());
      (j.ingredients||[]).filter(i=>!i.latest_price).forEach(i=>{
        const row=document.createElement('div');row.className='trow filter-missing-price-row';row.dataset.priceStatus='missing';row.dataset.flagged=i.is_flagged?'true':'false';
        row.innerHTML=`<span>—</span><span><b>${String(i.name||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}</b><small>No purchase price recorded</small></span><span>—</span><span><em class="bad">Missing</em></span><span>—</span><span>—</span>`;
        table.appendChild(row);
      });
      setTick(x=>x+1);
    };
    const t=setTimeout(addMissing,80);return()=>{cancelled=true;clearTimeout(t);document.querySelectorAll('.filter-missing-price-row').forEach(x=>x.remove())};
  },[path]);
  useEffect(()=>{
    if(!cfg)return;const table=document.querySelector('.v2-table');if(!table)return;const rows=[...table.querySelectorAll(':scope > .trow')];table.classList.add('filter-sort-table');const facets=new Set(),units=new Set();
    rows.forEach(row=>{row.hidden=false;if(cfg.facet==='supplier'&&row.dataset.priceStatus!=='missing')facets.add(text(row,5)||'—');if(cfg.facet==='category')facets.add(text(row,1)||'—');if(path.startsWith('/ingredients'))units.add(text(row,1)||'—')});
    setOptions([...facets].filter(Boolean).sort((a,b)=>a.localeCompare(b)));setUnitOptions([...units].filter(Boolean).sort((a,b)=>a.localeCompare(b)));
    let seen=new Set();rows.forEach(row=>{
      let visible=true;
      if(cfg.facet==='supplier'&&facet!=='all')visible=text(row,5)===facet;
      if(cfg.facet==='category'&&facet!=='all')visible=text(row,1)===facet;
      if(cfg.facet==='price_status'&&facet==='missing')visible=/missing/i.test(text(row,2));
      if(cfg.facet==='price_status'&&facet==='priced')visible=!/missing/i.test(text(row,2));
      if(flagged==='flagged')visible=visible&&row.dataset.flagged==='true';
      if(flagged==='unflagged')visible=visible&&row.dataset.flagged!=='true';
      if(path.startsWith('/ingredients')){const used=n(text(row,4));if(usage==='used')visible=visible&&Number.isFinite(used)&&used>0;if(usage==='unused')visible=visible&&(!Number.isFinite(used)||used===0);if(unit!=='all')visible=visible&&text(row,1)===unit}
      if(path.startsWith('/purchase-prices')){
        const normalized=text(row,4),price=text(row,3),isMissing=/missing/i.test(price)||row.dataset.priceStatus==='missing',needsYield=/needs yield/i.test(normalized)||row.dataset.priceStatus==='needs_yield';
        if(priceStatus==='all'&&isMissing)visible=false;
        if(priceStatus==='missing')visible=visible&&isMissing;
        if(priceStatus==='needs_yield')visible=visible&&needsYield&&!isMissing;
        if(priceStatus==='ready')visible=visible&&!isMissing&&!needsYield;
        if(latestOnly&&!isMissing){const key=text(row,1).toLowerCase();if(seen.has(key))visible=false;else seen.add(key)}
      }
      row.hidden=!visible;
    });
    const direction=sort.endsWith('_desc')?'desc':'asc';if(sort==='default')rows.forEach((row,i)=>row.style.order=String(i+1));else{const sorted=[...rows].sort((a,b)=>compareValues(rowMetric(path,a,sort),rowMetric(path,b,sort),direction==='desc'));sorted.forEach((row,i)=>row.style.order=String(i+1))}
  },[cfg,path,sort,facet,latestOnly,usage,unit,flagged,priceStatus,tick]);

  if(!cfg||!host)return null;
  const isIngredients=path.startsWith('/ingredients'),isPrices=path.startsWith('/purchase-prices');
  const activeCount=[sort!=='default',facet!=='all',latestOnly,usage!=='all',unit!=='all',flagged!=='all',priceStatus!=='all'].filter(Boolean).length;
  const reset=()=>{setSort('default');setFacet('all');setLatestOnly(false);setUsage('all');setUnit('all');setFlagged('all');setPriceStatus('all')};
  return createPortal(<div className="global-filter-wrap" ref={wrapRef}>
    <button type="button" className={`global-filter-button ${activeCount?'active':''}`} onClick={()=>setOpen(x=>!x)} aria-expanded={open}><span className="filter-icon">☰</span><span>Filter</span>{activeCount>0&&<b>{activeCount}</b>}</button>
    {open&&<div className={`global-filter-popover ${isIngredients?'ingredient-filter-popover':''}`}>
      <div className="filter-popover-head"><div><strong>{cfg.label}</strong><small>Refine what you see</small></div>{activeCount>0&&<button type="button" className="filter-reset-link" onClick={reset}>Clear all</button>}</div>
      {isPrices&&<section className="filter-section"><span className="filter-section-label">Price status</span><div className="filter-chips"><QuickChip active={priceStatus==='all'} onClick={()=>setPriceStatus('all')}>All records</QuickChip><QuickChip active={priceStatus==='missing'} onClick={()=>setPriceStatus('missing')}>Missing price</QuickChip><QuickChip active={priceStatus==='needs_yield'} onClick={()=>setPriceStatus('needs_yield')}>Needs yield</QuickChip><QuickChip active={priceStatus==='ready'} onClick={()=>setPriceStatus('ready')}>Ready cost</QuickChip></div></section>}
      <section className="filter-section"><span className="filter-section-label">Flag status</span><div className="filter-chips"><QuickChip active={flagged==='all'} onClick={()=>setFlagged('all')}>All</QuickChip><QuickChip active={flagged==='flagged'} onClick={()=>setFlagged('flagged')}>⚑ Flagged</QuickChip><QuickChip active={flagged==='unflagged'} onClick={()=>setFlagged('unflagged')}>Unflagged</QuickChip></div></section>
      {isIngredients&&<>
        <section className="filter-section"><span className="filter-section-label">Price status</span><div className="filter-chips"><QuickChip active={facet==='all'} onClick={()=>setFacet('all')}>All</QuickChip><QuickChip active={facet==='missing'} onClick={()=>setFacet('missing')}>Missing price</QuickChip><QuickChip active={facet==='priced'} onClick={()=>setFacet('priced')}>Has price</QuickChip></div></section>
        <section className="filter-section"><span className="filter-section-label">Recipe usage</span><div className="filter-chips"><QuickChip active={usage==='all'} onClick={()=>setUsage('all')}>All</QuickChip><QuickChip active={usage==='used'} onClick={()=>setUsage('used')}>Used in recipes</QuickChip><QuickChip active={usage==='unused'} onClick={()=>setUsage('unused')}>Unused</QuickChip></div></section>
        <section className="filter-section"><span className="filter-section-label">Quick sort</span><div className="filter-chips"><QuickChip active={sort==='cost_desc'} onClick={()=>setSort(sort==='cost_desc'?'default':'cost_desc')}>Highest cost</QuickChip><QuickChip active={sort==='cost_asc'} onClick={()=>setSort(sort==='cost_asc'?'default':'cost_asc')}>Lowest cost</QuickChip><QuickChip active={sort==='used_desc'} onClick={()=>setSort(sort==='used_desc'?'default':'used_desc')}>Most used</QuickChip></div></section>
        <div className="filter-two-col"><label><span>Default unit</span><select value={unit} onChange={e=>setUnit(e.target.value)}><option value="all">All units</option>{unitOptions.map(x=><option key={x} value={x}>{x}</option>)}</select></label><label><span>Sort by</span><select value={sort} onChange={e=>setSort(e.target.value)}>{cfg.sorts.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label></div>
      </>}
      {!isIngredients&&<>
        <label><span>Sort by</span><select value={sort} onChange={e=>setSort(e.target.value)}>{cfg.sorts.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
        {cfg.facet==='supplier'&&<label><span>Supplier</span><select value={facet} onChange={e=>setFacet(e.target.value)}><option value="all">All suppliers</option>{options.map(x=><option key={x} value={x}>{x}</option>)}</select></label>}
        {cfg.facet==='category'&&<label><span>Category</span><select value={facet} onChange={e=>setFacet(e.target.value)}><option value="all">All categories</option>{options.map(x=><option key={x} value={x}>{x}</option>)}</select></label>}
        {isPrices&&<label className="global-filter-check"><input type="checkbox" checked={latestOnly} onChange={e=>setLatestOnly(e.target.checked)}/><span>Latest record per ingredient only</span></label>}
      </>}
      <div className="global-filter-actions"><button type="button" onClick={reset}>Reset</button><button type="button" className="primary" onClick={()=>setOpen(false)}>Done</button></div>
    </div>}
  </div>,host);
}
