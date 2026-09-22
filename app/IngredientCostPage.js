"use client";
import {useEffect,useMemo,useState} from "react";
import IngredientImportModal from "./IngredientImportModal";
import {useRouter} from "next/navigation";
import "./ingredient-cost-page.css";

const DEFAULT_INGREDIENT_CATEGORIES=[
 'Vegetables & Produce','Meat & Poultry','Seafood','Dairy & Eggs','Bakery & Bread',
 'Rice & Pulses','Flour & Baking','Pasta & Noodles','Spices & Seasonings','Sauces & Condiments',
 'Oils & Fats','Canned & Preserved','Frozen Foods','Beverages','Desserts & Sweets',
 'Packaging & Disposables','Cleaning & Chemicals','Stationery & Admin','Other','Uncategorized'
];
const NAV_GROUPS=[
 {label:'HOME',items:[['/','Overview']]},
 {label:'COST WORKFLOW',items:[['/ingredients','Ingredients'],['/purchase-prices','Purchase Prices'],['/prepared-components','Bulk Recipes'],['/packaging','Packaging'],['/menu-costing','Menu Costing']]},
 {label:'INSIGHTS',items:[['/cost-analysis','Cost Analysis']]},
 {label:'MANAGE',items:[['/categories','Categories'],['/settings','Settings']]}
];
const money=n=>Number.isFinite(Number(n))?`Rs ${Number(n).toLocaleString(undefined,{maximumFractionDigits:2})}`:'—';
const norm=v=>String(v||'').trim().toLowerCase();
function unitInfo(unit){const u=norm(unit);if(u==='kg')return['weight',1000,'g'];if(['g','gm','gram','grams'].includes(u))return['weight',1,'g'];if(['l','ltr','liter','litre'].includes(u))return['volume',1000,'ml'];if(u==='ml')return['volume',1,'ml'];if(['pc','pcs','piece','pieces','each'].includes(u))return['count',1,'pc'];return[u||'other',1,u||'other']}
function direct(from,to){const a=unitInfo(from),b=unitInfo(to);return ['weight','volume','count'].includes(a[0])&&a[0]===b[0]}
function meta(v){if(!v)return{};if(typeof v==='object')return v;try{return JSON.parse(v)||{}}catch{return{}}}
function fmtDate(v){return v?new Date(v).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'}):'—'}
function CategoryPicker({value,onChange,categories,placeholder='Select category',name}){
 const [open,setOpen]=useState(false),[search,setSearch]=useState('');
 const filtered=(categories||[]).filter(cat=>!search.trim()||cat.toLowerCase().includes(search.trim().toLowerCase()));
 return <div className="pc-category-picker">
  {name&&<input type="hidden" name={name} value={value||''}/>}
  <button type="button" className={open?'open':''} onClick={()=>setOpen(v=>!v)}><span>{value||placeholder}</span><i>⌄</i></button>
  {open&&<div className="pc-category-menu">
    <div className="pc-category-search"><input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search categories..."/></div>
    <div className="pc-category-options">{filtered.length?filtered.map(cat=><button type="button" key={cat} className={cat===value?'selected':''} onClick={()=>{onChange(cat);setOpen(false);setSearch('')}}><span>{cat}</span>{cat===value&&<b>✓</b>}</button>):<div className="pc-category-empty">No matching category</div>}</div>
  </div>}
 </div>
}

export default function IngredientCostPage(){
 const router=useRouter();
 const [data,setData]=useState({tenant:null,ingredients:[],recipes:[]}),[integration,setIntegration]=useState({connected:false,items:[],mappings:[]});
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[q,setQ]=useState(''),[view,setView]=useState('all'),[category,setCategory]=useState('all'),[sourceFilter,setSourceFilter]=useState('all'),[usageFilter,setUsageFilter]=useState('all'),[sort,setSort]=useState('name_asc'),[navOpen,setNavOpen]=useState(false);
 const [yieldItem,setYieldItem]=useState(null),[yieldQty,setYieldQty]=useState(''),[yieldUnit,setYieldUnit]=useState('g'),[saving,setSaving]=useState(false);
 const [editItem,setEditItem]=useState(null),[editCategory,setEditCategory]=useState(''),[notice,setNotice]=useState(''),[importOpen,setImportOpen]=useState(false),[selected,setSelected]=useState({}),[deleteConfirm,setDeleteConfirm]=useState(null),[bulkCategory,setBulkCategory]=useState('');
 async function load(){setLoading(true);setError('');try{const [r,ir]=await Promise.all([fetch('/api/bootstrap',{cache:'no-store'}),fetch('/api/integrations/shelfsense',{cache:'no-store'})]),[j,ij]=await Promise.all([r.json(),ir.json()]);if(!r.ok)throw new Error(j.error||'Could not load ingredients');setData(j);if(ir.ok)setIntegration({connected:Boolean(ij.connected),items:ij.items||[],mappings:ij.mappings||[]})}catch(e){setError(e.message)}finally{setLoading(false)}}
 useEffect(()=>{load();const refreshCosting=()=>load(),storageRefresh=e=>{if(e.key==='platecost:costing-updated')load()};window.addEventListener('platecost:costing-updated',refreshCosting);window.addEventListener('storage',storageRefresh);return()=>{window.removeEventListener('platecost:costing-updated',refreshCosting);window.removeEventListener('storage',storageRefresh)}},[]);
 useEffect(()=>{document.body.classList.toggle('v2-nav-open',navOpen);return()=>document.body.classList.remove('v2-nav-open')},[navOpen]);
 useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),2600);return()=>clearTimeout(t)},[notice]);
 const shelfMeta=useMemo(()=>{const itemById=new Map((integration.items||[]).map(x=>[String(x.id),x])),mapByIngredient=new Map((integration.mappings||[]).filter(x=>x.source_type==='shelfsense').map(x=>[String(x.ingredient_id),x]));return{itemById,mapByIngredient}},[integration]);
 const packagingByName=useMemo(()=>new Map((data.packaging||[]).map(p=>[norm(p.name),p])),[data.packaging]);
 const rows=useMemo(()=>data.ingredients.map(i=>buildRow(i,data.recipes||[],shelfMeta,packagingByName)),[data,shelfMeta,packagingByName]);
 const categories=useMemo(()=>[...new Set(rows.map(r=>r.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b)),[rows]);
 const plateCostCategories=useMemo(()=>[...new Set([...DEFAULT_INGREDIENT_CATEGORIES,...categories])].sort((a,b)=>a.localeCompare(b)),[categories]);
 const visible=useMemo(()=>{const query=q.trim().toLowerCase();const filtered=rows.filter(r=>!query||((r.name+' '+r.category+' '+(r.supplier||'')+' '+(r.source||'')).toLowerCase().includes(query))).filter(r=>view==='all'||(view==='yield'&&r.needsYield)||(view==='ready'&&r.ready)||(view==='flagged'&&r.isFlagged)||(view==='missing'&&!r.hasSource)).filter(r=>category==='all'||r.category===category).filter(r=>sourceFilter==='all'||(sourceFilter==='shelfsense'&&r.source==='shelfsense')||(sourceFilter==='manual'&&r.source!=='shelfsense')).filter(r=>usageFilter==='all'||(usageFilter==='used'&&r.used>0)||(usageFilter==='unused'&&r.used===0));return [...filtered].sort((a,b)=>sort==='name_desc'?b.name.localeCompare(a.name):sort==='cost_desc'?(Number.isFinite(b.finalCost)?b.finalCost:-1)-(Number.isFinite(a.finalCost)?a.finalCost:-1):sort==='cost_asc'?(Number.isFinite(a.finalCost)?a.finalCost:Number.MAX_VALUE)-(Number.isFinite(b.finalCost)?b.finalCost:Number.MAX_VALUE):sort==='used_desc'?b.used-a.used:a.name.localeCompare(b.name))},[rows,q,view,category,sourceFilter,usageFilter,sort]);
 const counts=useMemo(()=>({all:rows.length,yield:rows.filter(x=>x.needsYield).length,ready:rows.filter(x=>x.ready).length,flagged:rows.filter(x=>x.isFlagged).length,missing:rows.filter(x=>!x.hasSource).length}),[rows]);
 function buildRow(i,recipes,shelfMeta,packagingByName){
   const category=String(i.ingredient_category||'Uncategorized');
   const packageItem=/packag|disposable/i.test(category)?packagingByName?.get(norm(i.name)):null;
   const p=i.latest_price,m=meta(p?.source_metadata),isShelf=p?.source==='shelfsense';
   const pm=meta(packageItem?.source_metadata);
   const packageSource=Boolean(packageItem&&packageItem.source_type==='shelfsense');
   const purchaseQty=packageSource
     ? Number(pm.enteredQuantity??pm.receivedQuantity??packageItem.purchase_quantity)
     : Number(p?.display_purchase_quantity??p?.purchase_quantity);
   const purchaseUnit=packageSource
     ? (pm.enteredUnit||pm.purchaseUnit||packageItem.purchase_unit)
     : (p?.display_purchase_unit||p?.purchase_unit);
   const purchasePrice=packageSource
     ? Number(pm.sourceReceiptTotal??packageItem.purchase_price)
     : Number(p?.display_purchase_price??p?.purchase_price);
   const storageUnit=packageSource
     ? (packageItem.storage_unit||pm.baseUnit||null)
     : (p?.storage_unit||(isShelf?m.sourceBaseUnit:(p?.source_purchase_unit||p?.display_purchase_unit||p?.purchase_unit))||null);
   let storageCost=packageSource?Number(packageItem.storage_unit_cost):isShelf?Number(p?.storage_unit_cost??m.sourceUnitCost):NaN;
   if(!Number.isFinite(storageCost)&&!isShelf&&!packageSource&&p&&Number.isFinite(purchasePrice)&&purchaseQty>0)storageCost=purchasePrice/purchaseQty;
   const conversions=i.costing_conversions||[];
   const conv=conversions.find(c=>norm(c.purchase_unit)===norm(storageUnit))||null;
   const isDirect=packageSource
     ? packageItem.costing_status==='ready'
     : Boolean(storageUnit&&direct(storageUnit,i.default_unit));
   let finalCost=NaN,finalUnit=packageSource?(packageItem.costing_unit||'each'):unitInfo(i.default_unit)[2];
   if(packageSource&&packageItem.costing_status==='ready'&&Number.isFinite(Number(packageItem.unit_cost))){
     finalCost=Number(packageItem.unit_cost);
   }else if(Number.isFinite(storageCost)&&storageUnit&&!packageSource){
     const s=unitInfo(storageUnit),t=unitInfo(i.default_unit);
     if(isDirect)finalCost=storageCost*(t[1]/s[1]);
     else if(conv){const cc=unitInfo(conv.costing_unit);if(cc[0]===t[0])finalCost=storageCost*(t[1]/(Number(conv.usable_quantity)*cc[1]))}
   }
   if(!Number.isFinite(finalCost)&&!packageSource&&p?.costing_status==='ready'){
     const info=unitInfo(p.purchase_unit),base=Number(p.purchase_quantity)*info[1];
     if(base>0){finalCost=Number(p.purchase_price)/base*unitInfo(i.default_unit)[1];finalUnit=unitInfo(i.default_unit)[2]}
   }
   const used=recipes.filter(r=>(r.components_summary||[]).some(c=>String(c.ingredient_id)===String(i.id))).length;
   const mapping=shelfMeta?.mapByIngredient?.get(String(i.id)),shelfItem=mapping?shelfMeta?.itemById?.get(String(mapping.external_item_id)):null;
   const resolvedCategory=String(i.ingredient_category||shelfItem?.category||'Uncategorized');
   const packageYield=Number(packageItem?.storage_to_costing_factor??packageItem?.units_per_storage_unit);
   const packagingNeedsYield=packageSource&&packageItem.costing_status==='needs_yield';
   return{
     id:i.id,name:i.name,type:i.ingredient_type||'raw',defaultUnit:i.default_unit||'g',isFlagged:Boolean(i.is_flagged),
     purchaseQty,purchaseUnit,purchasePrice,date:packageSource?(pm.effectiveDate||packageItem.last_source_sync_at):p?.price_date,
     source:packageSource?'shelfsense-packaging':p?.source||null,
     supplier:packageSource?(typeof pm.supplier==='object'?pm.supplier?.name:pm.supplier):p?.supplier||null,
     storageUnit,storageCost,conv,isDirect,
     needsYield:packageSource?packagingNeedsYield:Boolean(storageUnit&&!isDirect&&!conv),
     ready:Number.isFinite(finalCost),finalCost,finalUnit,used,
     hasSource:packageSource||Boolean(p),category:resolvedCategory,shelfMapped:Boolean(mapping),
     raw:i,packageItem,packageYield,packageSource
   };
 }
 async function toggleFlag(r){const method=r.isFlagged?'DELETE':'POST';const res=await fetch('/api/flags',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify({entity_type:'ingredient',entity_id:r.id})});if(res.ok){setNotice(r.isFlagged?'Unflagged':'Flagged for review');await load()}}
 function openYield(r){setYieldItem(r);setYieldQty(r.conv?.usable_quantity||'');setYieldUnit(r.conv?.costing_unit||r.defaultUnit||'g')}
 async function saveYield(e){e.preventDefault();if(!yieldItem?.storageUnit)return;setSaving(true);const res=await fetch('/api/costing-conversions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ingredient_id:yieldItem.id,purchase_unit:yieldItem.storageUnit,usable_quantity:Number(yieldQty),costing_unit:yieldUnit,source:yieldItem.source==='shelfsense'?'shelfsense':'manual'})});const j=await res.json();setSaving(false);if(!res.ok)return setNotice(j.error||'Could not save yield');setYieldItem(null);setNotice('Yield saved');await load()}
 async function saveIngredient(e){e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));if(editItem?.id)b.id=editItem.id;const res=await fetch('/api/ingredients',{method:editItem?.id?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});const j=await res.json();if(!res.ok)return setNotice(j.error||'Could not save');setEditItem(null);setNotice(editItem?.id?'Ingredient updated':'Ingredient added');await load()}
 async function deleteIngredients(ids){if(!ids?.length)return;setSaving(true);const res=await fetch('/api/ingredients',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});const j=await res.json();setSaving(false);if(!res.ok){setDeleteConfirm(null);return setNotice(j.error||'Could not delete')}const blocked=j.blocked||[];setDeleteConfirm(null);setSelected({});setNotice((j.deletedCount||0)+' ingredient(s) removed.'+(blocked.length?' '+blocked.length+' could not be removed because they are used in active recipes.':''));await load()}
 function requestDelete(rowsToDelete){const list=Array.isArray(rowsToDelete)?rowsToDelete:[rowsToDelete];setDeleteConfirm(list.filter(Boolean))}
 async function applyBulkCategory(){
   if(!selectedIds.length)return;
   if(!bulkCategory.trim())return setNotice('Choose or enter a category first');
   setSaving(true);
   const res=await fetch('/api/ingredients',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:selectedIds,ingredient_category:bulkCategory.trim()})});
   const j=await res.json();setSaving(false);
   if(!res.ok)return setNotice(j.error||'Could not update category');
   setNotice((j.updatedCount||0)+' ingredient(s) moved to '+bulkCategory.trim());
   setSelected({});setBulkCategory('');await load();
 }

 async function downloadTemplate(){const XLSX=await import('xlsx');const rows=(data.ingredients||[]).map(i=>({'Ingredient Name':i.name,'Default Unit':i.default_unit||'g','Type':i.ingredient_type||'raw','Notes':i.notes||''}));rows.push({'Ingredient Name':'','Default Unit':'g','Type':'raw','Notes':''});const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Ingredients');XLSX.writeFile(wb,'PlateCost-Ingredients.xlsx')}
 async function exportIngredients(){const XLSX=await import('xlsx');const exportRows=visible.map(r=>({
   'Ingredient':r.name,
   'Category':r.category,
   'Type':r.type,
   'Recipe Unit':r.defaultUnit,
   'Purchase Price':Number.isFinite(r.purchasePrice)?r.purchasePrice:'',
   'Purchase Quantity':Number.isFinite(r.purchaseQty)?r.purchaseQty:'',
   'Purchase Unit':r.purchaseUnit||'',
   'Purchase Date':r.date||'',
   'Supplier':r.supplier||'',
   'Source':r.source||'',
   'Storage Unit':r.storageUnit||'',
   'Storage Unit Cost':Number.isFinite(r.storageCost)?r.storageCost:'',
   'Yield Status':r.isDirect?'Direct':r.conv?'Configured':r.needsYield?'Needs yield':'Not available',
   'Yield Source Unit':r.conv?.purchase_unit||r.storageUnit||'',
   'Usable Yield Qty':r.conv?.usable_quantity??'',
   'Yield Unit':r.conv?.costing_unit||'',
   'Kitchen Unit Cost':Number.isFinite(r.finalCost)?r.finalCost:'',
   'Kitchen Cost Unit':r.finalUnit||'',
   'Used In Recipes':r.used,
   'Flagged':r.isFlagged?'Yes':'No',
   'Cost Status':r.ready?'Ready':r.needsYield?'Needs yield':'No source cost'
 }));const ws=XLSX.utils.json_to_sheet(exportRows),wb=XLSX.utils.book_new();ws['!cols']=[{wch:28},{wch:12},{wch:12},{wch:14},{wch:16},{wch:14},{wch:14},{wch:20},{wch:12},{wch:14},{wch:18},{wch:16},{wch:18},{wch:18},{wch:14},{wch:18},{wch:16},{wch:14},{wch:10},{wch:16}];XLSX.utils.book_append_sheet(wb,ws,'Ingredients');const stamp=new Date().toISOString().slice(0,10),viewLabel=view==='all'?'All':view==='yield'?'Needs-Yield':view==='ready'?'Cost-Ready':view==='missing'?'No-Source-Cost':view==='flagged'?'Flagged':'Filtered';XLSX.writeFile(wb,`PlateCost-Ingredients-${viewLabel}-${stamp}.xlsx`)}
 async function importIngredients(file){const XLSX=await import('xlsx');const wb=XLSX.read(await file.arrayBuffer()),ws=wb.Sheets[wb.SheetNames[0]],raw=XLSX.utils.sheet_to_json(ws,{defval:''});const rows=raw.map(r=>({name:r['Ingredient Name']||r.name,default_unit:r['Default Unit']||r.default_unit||'g',ingredient_type:r['Type']||r.type||'raw',notes:r['Notes']||r.notes||''})).filter(r=>String(r.name||'').trim());if(!rows.length)return setNotice('No ingredients found in file');if(!window.confirm(`Import ${rows.length} ingredient rows? Existing names will be updated.`))return;const res=await fetch('/api/ingredients',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows})}),j=await res.json();if(!res.ok)return setNotice(j.error||'Import failed');setNotice(`${j.created||0} added, ${j.updated||0} updated`);await load()}
 const selectedIds=Object.keys(selected).filter(id=>selected[id]);
 const visibleSelectableIds=visible.map(r=>String(r.id));
 const allVisibleSelected=visibleSelectableIds.length>0&&visibleSelectableIds.every(id=>selected[id]);
 function toggleSelected(id){setSelected(s=>({...s,[id]:!s[id]}))}
 function toggleVisible(){setSelected(s=>{const next={...s};for(const id of visibleSelectableIds){if(allVisibleSelected)delete next[id];else next[id]=true}return next})}
 const selectedRows=rows.filter(r=>selected[String(r.id)]);
 const workspace=data.tenant?.name||'Workspace';
 return <div className="v2-shell ingredient-cost-shell">
 <div className="v2-mobile-bar"><button type="button" className="v2-menu-toggle" aria-label={navOpen?'Close menu':'Open menu'} aria-expanded={navOpen} onClick={()=>setNavOpen(v=>!v)}><span></span><span></span><span></span></button><div><b>PlateCost</b><span>Ingredients</span></div></div>
 <button type="button" aria-label="Close menu" className={`v2-nav-backdrop ${navOpen?'show':''}`} onClick={()=>setNavOpen(false)}/>
 <aside className={`v2-side ${navOpen?'mobile-open':''}`}>
   <div className="pc-brand"><div className="pc-mark">PC</div><div><b>PlateCost</b><span>Restaurant Cost Control</span></div></div>
   <div className="pc-workspace"><small>WORKSPACE</small><b>{workspace}</b></div>
   <nav>{NAV_GROUPS.map(group=><div className="v2-nav-group" data-nav-group={group.label.toLowerCase().replace(/\s+/g,'-')} key={group.label}><div className="v2-nav-group-title">{group.label}</div>{group.items.map(([href,label])=><button key={href} className={href==='/ingredients'?'active':''} onClick={()=>{setNavOpen(false);router.push(href)}}>{label}</button>)}</div>)}</nav>
   <footer><b>PlateCost</b><span>Restaurant costing</span></footer>
 </aside>
 <div className="v2-work"><main className="v2-main ingredient-cost-main">
   <div className="v2-head"><div><span>COST PIPELINE</span><h1>Ingredients</h1><p>ShelfSense supplies purchase and storage cost. PlateCost applies usable yield and calculates the kitchen unit cost used in recipes.</p></div><div className="v2-actions"><button className="ghost" onClick={exportIngredients}>Export Excel</button><button className="ghost" onClick={downloadTemplate}>Download Template</button><button className="ghost" onClick={()=>setImportOpen(true)}>Import Ingredients</button><button className="primary" onClick={()=>{setEditCategory('');setEditItem({})}}>+ Add Ingredient</button></div></div>
   <div className="cost-flow"><div><small>1 · SOURCE</small><b>ShelfSense</b><span>Purchase + storage cost</span></div><i>→</i><div><small>2 · PLATECOST</small><b>Usable Yield</b><span>Waste / drained / usable qty</span></div><i>→</i><div><small>3 · RESULT</small><b>Kitchen Unit Cost</b><span>Rs/g · Rs/ml · Rs/pc</span></div></div>
   <div className="ingredient-status"><button className={view==='all'?'active':''} onClick={()=>setView('all')}>All <b>{counts.all}</b></button><button className={view==='yield'?'active':''} onClick={()=>setView('yield')}>Needs yield <b>{counts.yield}</b></button><button className={view==='ready'?'active':''} onClick={()=>setView('ready')}>Cost ready <b>{counts.ready}</b></button><button className={view==='missing'?'active':''} onClick={()=>setView('missing')}>No source cost <b>{counts.missing}</b></button><button className={view==='flagged'?'active':''} onClick={()=>setView('flagged')}>Flagged <b>{counts.flagged}</b></button></div>
   <div className="ingredient-filter-panel">
    <div className="ingredient-search-row"><input placeholder="Search ingredients, category, supplier..." value={q} onChange={e=>setQ(e.target.value)}/><button className={(category!=='all'||sourceFilter!=='all'||usageFilter!=='all'||sort!=='name_asc'||q)?'active-filter':''} onClick={()=>{setCategory('all');setSourceFilter('all');setUsageFilter('all');setSort('name_asc');setQ('')}}>Clear filters</button></div>
    <div className="ingredient-filter-grid">
      <label><span>Category</span><select value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All categories</option>{categories.map(cat=><option key={cat} value={cat}>{cat}</option>)}</select></label>
      <label><span>Source</span><select value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)}><option value="all">All sources</option><option value="shelfsense">ShelfSense</option><option value="manual">Manual / no ShelfSense</option></select></label>
      <label><span>Recipe usage</span><select value={usageFilter} onChange={e=>setUsageFilter(e.target.value)}><option value="all">All ingredients</option><option value="used">Used in recipes</option><option value="unused">Unused</option></select></label>
      <label><span>Sort by</span><select value={sort} onChange={e=>setSort(e.target.value)}><option value="name_asc">Name A–Z</option><option value="name_desc">Name Z–A</option><option value="cost_desc">Highest kitchen cost</option><option value="cost_asc">Lowest kitchen cost</option><option value="used_desc">Most used</option></select></label>
    </div>
    <div className="ingredient-list-meta"><span><b>{visible.length}</b> of {rows.length} ingredients shown{category!=='all'?' · '+category:''}</span><div>{selectedIds.length>0&&<><div className="bulk-category-control"><CategoryPicker value={bulkCategory} onChange={setBulkCategory} categories={plateCostCategories} placeholder="Assign category…"/><button disabled={saving||!bulkCategory.trim()} onClick={applyBulkCategory}>{saving?'Updating…':'Apply to '+selectedIds.length}</button></div><button className="bulk-delete" onClick={()=>requestDelete(selectedRows)}>Delete selected ({selectedIds.length})</button></>}</div></div>
   </div>
   {error&&<div className="cost-error">{error}</div>}{loading?<div className="v2-empty">Loading ingredients…</div>:<div className="ingredient-cost-table"><div className="ict-head"><span><input type="checkbox" aria-label="Select visible ingredients" checked={allVisibleSelected} onChange={toggleVisible}/></span><span>Ingredient</span><span>Purchase · ShelfSense</span><span>Storage Cost · ShelfSense</span><span>Yield · PlateCost</span><span>Kitchen Unit Cost</span><span>Used In</span><span>Actions</span></div>{visible.map(r=><div className={`ict-row ${r.needsYield?'needs-yield':''} ${r.isFlagged?'flagged':''} ${selected[String(r.id)]?'selected':''}`} key={r.id}><span className="ict-select"><input type="checkbox" aria-label={`Select ${r.name}`} checked={Boolean(selected[String(r.id)])} onChange={()=>toggleSelected(String(r.id))}/></span><span className="ict-name"><b>{r.name}</b><small>{r.category} · {r.type} · recipe unit {r.defaultUnit}</small></span><span>{r.packageSource?<><b>{Number.isFinite(r.storageCost)?`${money(r.storageCost)} / ${r.storageUnit}`:'—'}</b><small>{r.purchaseUnit&&r.storageUnit&&r.purchaseUnit!==r.storageUnit?`1 ${r.purchaseUnit} = ${Number(r.packageItem?.purchase_to_storage_factor||1)} ${r.storageUnit}`:`ShelfSense packaging source`} · {fmtDate(r.date)}</small></>:r.hasSource?<><b>{Number.isFinite(r.purchasePrice)?money(r.purchasePrice):'—'}</b><small>{Number.isFinite(r.purchaseQty)?`${r.purchaseQty} ${r.purchaseUnit||''}`:'Purchase qty unavailable'} · {fmtDate(r.date)}</small></>:<><b>—</b><small>No purchase price</small></>}</span><span>{Number.isFinite(r.storageCost)?<><b>{money(r.storageCost)} / {r.storageUnit}</b><small>{r.packageSource?'Packaging master · ShelfSense':r.source==='shelfsense'?'From ShelfSense':'Manual source'}</small></>:<><b>—</b><small>{r.packageSource?'Packaging source cost unavailable':r.source==='shelfsense'?'Storage cost unavailable':'No ShelfSense storage cost'}</small></>}</span><span>{r.packageSource?(r.ready?<><b className="good">Configured</b><small>{r.packageYield?`1 ${r.storageUnit} = ${Number(r.packageYield).toLocaleString()} ${r.finalUnit}`:`${r.storageUnit} → ${r.finalUnit}`}</small></>:<><button className="yield-missing" onClick={()=>router.push('/packaging')}>Set in Packaging</button><small>Packaging yield is managed on Packaging page</small></>):r.isDirect?<><b className="good">Direct</b><small>{r.storageUnit} → {r.defaultUnit}</small></>:r.conv?<><button className="yield-link" onClick={()=>openYield(r)}>1 {r.storageUnit} = {Number(r.conv.usable_quantity).toLocaleString()} {r.conv.costing_unit}</button><small>Usable yield · click to edit</small></>:r.storageUnit?<><button className="yield-missing" onClick={()=>openYield(r)}>+ Set yield</button><small>How much usable {r.defaultUnit} from 1 {r.storageUnit}?</small></>:<><b>—</b><small>Source unit required first</small></>}</span><span>{r.ready?<><b className="plate-cost">{money(r.finalCost)} / {r.finalUnit}</b><small>{r.packageSource?'Used by packaging sets':'Used by recipes'}</small></>:<><b className="warn">Not ready</b><small>{r.packageSource?'Set packaging yield':r.needsYield?'Set yield to calculate':'Source cost required'}</small></>}</span><span><b>{r.used}</b><small>recipes</small></span><span className="ict-actions"><button className={r.isFlagged?'flagged-btn':''} onClick={()=>toggleFlag(r)} title={r.isFlagged?'Unflag':'Flag for review'}>⚑</button><button onClick={()=>{setEditCategory(r.raw.ingredient_category||r.category||'');setEditItem(r.raw)}}>Edit</button><button onClick={()=>router.push(r.packageSource?'/packaging':'/purchase-prices')}>{r.packageSource?'Packaging':'Prices'}</button><button className="danger" onClick={()=>requestDelete(r)}>Delete</button></span></div>)}</div>}
 </main></div>
 {yieldItem&&<div className="modal-bg" onMouseDown={e=>e.target===e.currentTarget&&setYieldItem(null)}><div className="v2-modal yield-modal"><header><div><span>PLATECOST YIELD</span><h2>{yieldItem.name}</h2></div><button onClick={()=>setYieldItem(null)}>×</button></header><div className="yield-source"><span><small>SHELFENSE STORAGE COST</small><b>{money(yieldItem.storageCost)} / {yieldItem.storageUnit}</b></span><span><small>RECIPE UNIT</small><b>{yieldItem.defaultUnit}</b></span></div><form onSubmit={saveYield}><p className="yield-question">How much usable product do you get from <b>1 {yieldItem.storageUnit}</b>?</p><div className="yield-entry"><span>1 {yieldItem.storageUnit} =</span><input autoFocus type="number" step="any" min="0.0001" value={yieldQty} onChange={e=>setYieldQty(e.target.value)} placeholder="Usable qty" required/><select value={yieldUnit} onChange={e=>setYieldUnit(e.target.value)}><option value="g">g</option><option value="ml">ml</option><option value="pc">pc</option><option value="kg">kg</option><option value="L">L</option></select></div><small className="yield-help">Example: 1 can = 720 g drained olives, or 1 bottle = 750 ml usable syrup.</small><button className="primary" disabled={saving}>{saving?'Saving…':'Save Yield'}</button></form></div></div>}
 {editItem&&<div className="modal-bg" onMouseDown={e=>e.target===e.currentTarget&&setEditItem(null)}><div className="v2-modal"><header><div><span>INGREDIENT</span><h2>{editItem.id?'Edit Ingredient':'Add Ingredient'}</h2></div><button onClick={()=>setEditItem(null)}>×</button></header><form onSubmit={saveIngredient}><label>Ingredient name<input name="name" defaultValue={editItem.name||''} required/></label><div className="two"><label>Recipe unit<select name="default_unit" defaultValue={editItem.default_unit||'g'}><option>g</option><option>kg</option><option>ml</option><option>L</option><option>pc</option></select></label><label>PlateCost Category<CategoryPicker name="ingredient_category" value={editCategory} onChange={setEditCategory} categories={plateCostCategories} placeholder="Select category"/></label></div><small className="ingredient-category-help">PlateCost Category controls recipe visibility. ShelfSense category remains the source classification. Packaging, Disposables, Stationery/Admin and Cleaning categories are excluded from recipe ingredient selection.</small><label>Notes<textarea name="notes" defaultValue={editItem.notes||''}/></label><button className="primary">{editItem.id?'Save Changes':'Add Ingredient'}</button></form></div></div>}
 <IngredientImportModal open={importOpen} onClose={()=>setImportOpen(false)} onExcel={importIngredients} onImported={load}/>
 {deleteConfirm&&<div className="ingredient-delete-bg" onMouseDown={e=>e.target===e.currentTarget&&setDeleteConfirm(null)}><div className="ingredient-delete-modal"><header><div><span>REMOVE INGREDIENTS</span><h2>Remove {deleteConfirm.length} ingredient{deleteConfirm.length===1?'':'s'}?</h2></div><button onClick={()=>setDeleteConfirm(null)}>×</button></header><p>These ingredients will be removed from the active PlateCost ingredient list and ShelfSense price sync. Historical costing data is preserved.</p><div className="ingredient-delete-list">{deleteConfirm.slice(0,12).map(r=><span key={r.id}>{r.name}</span>)}{deleteConfirm.length>12&&<span>+ {deleteConfirm.length-12} more</span>}</div><div className="ingredient-delete-warning">Ingredients currently used in active recipes will be protected and will not be removed.</div><footer><button className="ghost" onClick={()=>setDeleteConfirm(null)}>Cancel</button><button className="danger" disabled={saving} onClick={()=>deleteIngredients(deleteConfirm.map(r=>r.id))}>{saving?'Removing…':'Remove Ingredients'}</button></footer></div></div>}
 {notice&&<div className="toast">{notice}</div>}
 </div>
}
