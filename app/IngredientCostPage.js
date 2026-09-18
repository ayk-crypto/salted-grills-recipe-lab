"use client";
import {useEffect,useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import "./ingredient-cost-page.css";

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

export default function IngredientCostPage(){
 const router=useRouter();
 const [data,setData]=useState({tenant:null,ingredients:[],recipes:[]});
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[q,setQ]=useState(''),[view,setView]=useState('all'),[navOpen,setNavOpen]=useState(false);
 const [yieldItem,setYieldItem]=useState(null),[yieldQty,setYieldQty]=useState(''),[yieldUnit,setYieldUnit]=useState('g'),[saving,setSaving]=useState(false);
 const [editItem,setEditItem]=useState(null),[notice,setNotice]=useState('');
 async function load(){setLoading(true);setError('');try{const r=await fetch('/api/bootstrap',{cache:'no-store'}),j=await r.json();if(!r.ok)throw new Error(j.error||'Could not load ingredients');setData(j)}catch(e){setError(e.message)}finally{setLoading(false)}}
 useEffect(()=>{load()},[]);
 useEffect(()=>{document.body.classList.toggle('v2-nav-open',navOpen);return()=>document.body.classList.remove('v2-nav-open')},[navOpen]);
 useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),2600);return()=>clearTimeout(t)},[notice]);
 const rows=useMemo(()=>data.ingredients.map(i=>buildRow(i,data.recipes||[])),[data]);
 const visible=useMemo(()=>rows.filter(r=>r.name.toLowerCase().includes(q.toLowerCase())).filter(r=>view==='all'||(view==='yield'&&r.needsYield)||(view==='ready'&&r.ready)||(view==='flagged'&&r.isFlagged)||(view==='missing'&&!r.hasSource)),[rows,q,view]);
 const counts=useMemo(()=>({all:rows.length,yield:rows.filter(x=>x.needsYield).length,ready:rows.filter(x=>x.ready).length,flagged:rows.filter(x=>x.isFlagged).length,missing:rows.filter(x=>!x.hasSource).length}),[rows]);
 function buildRow(i,recipes){
   const p=i.latest_price,m=meta(p?.source_metadata),isShelf=p?.source==='shelfsense';
   const purchaseQty=Number(p?.display_purchase_quantity??p?.purchase_quantity),purchaseUnit=p?.display_purchase_unit||p?.purchase_unit,purchasePrice=Number(p?.display_purchase_price??p?.purchase_price);
   const storageUnit=p?.storage_unit||(isShelf?m.sourceBaseUnit:(p?.source_purchase_unit||p?.display_purchase_unit||p?.purchase_unit))||null;
   let storageCost=isShelf?Number(p?.storage_unit_cost??m.sourceUnitCost):NaN;
   if(!Number.isFinite(storageCost)&&!isShelf&&p&&Number.isFinite(purchasePrice)&&purchaseQty>0)storageCost=purchasePrice/purchaseQty;
   const conversions=i.costing_conversions||[];
   const conv=conversions.find(c=>norm(c.purchase_unit)===norm(storageUnit))||null;
   const isDirect=storageUnit&&direct(storageUnit,i.default_unit);
   let finalCost=NaN,finalUnit=unitInfo(i.default_unit)[2];
   if(Number.isFinite(storageCost)&&storageUnit){const s=unitInfo(storageUnit),t=unitInfo(i.default_unit);if(isDirect)finalCost=storageCost*(t[1]/s[1]);else if(conv){const c=unitInfo(conv.costing_unit);if(c[0]===t[0])finalCost=storageCost*(t[1]/(Number(conv.usable_quantity)*c[1]))}}
   if(!Number.isFinite(finalCost)&&p?.costing_status==='ready'){const info=unitInfo(p.purchase_unit),base=Number(p.purchase_quantity)*info[1];if(base>0){finalCost=Number(p.purchase_price)/base*unitInfo(i.default_unit)[1];finalUnit=unitInfo(i.default_unit)[2]}}
   const used=recipes.filter(r=>(r.components_summary||[]).some(c=>String(c.ingredient_id)===String(i.id))).length;
   return{id:i.id,name:i.name,type:i.ingredient_type||'raw',defaultUnit:i.default_unit||'g',isFlagged:Boolean(i.is_flagged),purchaseQty,purchaseUnit,purchasePrice,date:p?.price_date,source:p?.source||null,supplier:p?.supplier||null,storageUnit,storageCost,conv,isDirect,needsYield:Boolean(storageUnit&&!isDirect&&!conv),ready:Number.isFinite(finalCost),finalCost,finalUnit,used,hasSource:Boolean(p),raw:i};
 }
 async function toggleFlag(r){const method=r.isFlagged?'DELETE':'POST';const res=await fetch('/api/flags',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify({entity_type:'ingredient',entity_id:r.id})});if(res.ok){setNotice(r.isFlagged?'Unflagged':'Flagged for review');await load()}}
 function openYield(r){setYieldItem(r);setYieldQty(r.conv?.usable_quantity||'');setYieldUnit(r.conv?.costing_unit||r.defaultUnit||'g')}
 async function saveYield(e){e.preventDefault();if(!yieldItem?.storageUnit)return;setSaving(true);const res=await fetch('/api/costing-conversions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ingredient_id:yieldItem.id,purchase_unit:yieldItem.storageUnit,usable_quantity:Number(yieldQty),costing_unit:yieldUnit,source:yieldItem.source==='shelfsense'?'shelfsense':'manual'})});const j=await res.json();setSaving(false);if(!res.ok)return setNotice(j.error||'Could not save yield');setYieldItem(null);setNotice('Yield saved');await load()}
 async function saveIngredient(e){e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));if(editItem?.id)b.id=editItem.id;const res=await fetch('/api/ingredients',{method:editItem?.id?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});const j=await res.json();if(!res.ok)return setNotice(j.error||'Could not save');setEditItem(null);setNotice(editItem?.id?'Ingredient updated':'Ingredient added');await load()}
 async function remove(r){if(!window.confirm(`Delete ${r.name}?`))return;const res=await fetch('/api/ingredients',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:r.id})});const j=await res.json();if(!res.ok)return setNotice(j.error||'Could not delete');setNotice('Ingredient deleted');await load()}
 async function downloadTemplate(){const XLSX=await import('xlsx');const rows=(data.ingredients||[]).map(i=>({'Ingredient Name':i.name,'Default Unit':i.default_unit||'g','Type':i.ingredient_type||'raw','Notes':i.notes||''}));rows.push({'Ingredient Name':'','Default Unit':'g','Type':'raw','Notes':''});const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Ingredients');XLSX.writeFile(wb,'PlateCost-Ingredients.xlsx')}
 async function exportIngredients(){const XLSX=await import('xlsx');const exportRows=visible.map(r=>({
   'Ingredient':r.name,
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
   <div className="v2-head"><div><span>COST PIPELINE</span><h1>Ingredients</h1><p>ShelfSense supplies purchase and storage cost. PlateCost applies usable yield and calculates the kitchen unit cost used in recipes.</p></div><div className="v2-actions"><button className="ghost" onClick={exportIngredients}>Export Excel</button><button className="ghost" onClick={downloadTemplate}>Download Template</button><label className="ghost file">Import Ingredients<input type="file" accept=".xlsx,.xls,.csv" onChange={e=>e.target.files?.[0]&&importIngredients(e.target.files[0])}/></label><button className="primary" onClick={()=>setEditItem({})}>+ Add Ingredient</button></div></div>
   <div className="cost-flow"><div><small>1 · SOURCE</small><b>ShelfSense</b><span>Purchase + storage cost</span></div><i>→</i><div><small>2 · PLATECOST</small><b>Usable Yield</b><span>Waste / drained / usable qty</span></div><i>→</i><div><small>3 · RESULT</small><b>Kitchen Unit Cost</b><span>Rs/g · Rs/ml · Rs/pc</span></div></div>
   <div className="ingredient-status"><button className={view==='all'?'active':''} onClick={()=>setView('all')}>All <b>{counts.all}</b></button><button className={view==='yield'?'active':''} onClick={()=>setView('yield')}>Needs yield <b>{counts.yield}</b></button><button className={view==='ready'?'active':''} onClick={()=>setView('ready')}>Cost ready <b>{counts.ready}</b></button><button className={view==='missing'?'active':''} onClick={()=>setView('missing')}>No source cost <b>{counts.missing}</b></button><button className={view==='flagged'?'active':''} onClick={()=>setView('flagged')}>Flagged <b>{counts.flagged}</b></button></div>
   <div className="v2-toolbar"><input placeholder="Search ingredients..." value={q} onChange={e=>setQ(e.target.value)}/><b>{visible.length} shown</b></div>
   {error&&<div className="cost-error">{error}</div>}{loading?<div className="v2-empty">Loading ingredients…</div>:<div className="ingredient-cost-table"><div className="ict-head"><span>Ingredient</span><span>Purchase · ShelfSense</span><span>Storage Cost · ShelfSense</span><span>Yield · PlateCost</span><span>Kitchen Unit Cost</span><span>Used In</span><span>Actions</span></div>{visible.map(r=><div className={`ict-row ${r.needsYield?'needs-yield':''} ${r.isFlagged?'flagged':''}`} key={r.id}><span className="ict-name"><b>{r.name}</b><small>{r.type} · recipe unit {r.defaultUnit}</small></span><span>{r.hasSource?<><b>{Number.isFinite(r.purchasePrice)?money(r.purchasePrice):'—'}</b><small>{Number.isFinite(r.purchaseQty)?`${r.purchaseQty} ${r.purchaseUnit||''}`:'Purchase qty unavailable'} · {fmtDate(r.date)}</small></>:<><b>—</b><small>No purchase price</small></>}</span><span>{Number.isFinite(r.storageCost)?<><b>{money(r.storageCost)} / {r.storageUnit}</b><small>{r.source==='shelfsense'?'From ShelfSense':'Manual source'}</small></>:<><b>—</b><small>{r.source==='shelfsense'?'Storage cost unavailable':'No ShelfSense storage cost'}</small></>}</span><span>{r.isDirect?<><b className="good">Direct</b><small>{r.storageUnit} → {r.defaultUnit}</small></>:r.conv?<><button className="yield-link" onClick={()=>openYield(r)}>1 {r.storageUnit} = {Number(r.conv.usable_quantity).toLocaleString()} {r.conv.costing_unit}</button><small>Usable yield · click to edit</small></>:r.storageUnit?<><button className="yield-missing" onClick={()=>openYield(r)}>+ Set yield</button><small>How much usable {r.defaultUnit} from 1 {r.storageUnit}?</small></>:<><b>—</b><small>Source unit required first</small></>}</span><span>{r.ready?<><b className="plate-cost">{money(r.finalCost)} / {r.finalUnit}</b><small>Used by recipes</small></>:<><b className="warn">Not ready</b><small>{r.needsYield?'Set yield to calculate':'Source cost required'}</small></>}</span><span><b>{r.used}</b><small>recipes</small></span><span className="ict-actions"><button className={r.isFlagged?'flagged-btn':''} onClick={()=>toggleFlag(r)} title={r.isFlagged?'Unflag':'Flag for review'}>⚑</button><button onClick={()=>setEditItem(r.raw)}>Edit</button><button onClick={()=>router.push('/purchase-prices')}>Prices</button><button className="danger" onClick={()=>remove(r)}>Delete</button></span></div>)}</div>}
 </main></div>
 {yieldItem&&<div className="modal-bg" onMouseDown={e=>e.target===e.currentTarget&&setYieldItem(null)}><div className="v2-modal yield-modal"><header><div><span>PLATECOST YIELD</span><h2>{yieldItem.name}</h2></div><button onClick={()=>setYieldItem(null)}>×</button></header><div className="yield-source"><span><small>SHELFENSE STORAGE COST</small><b>{money(yieldItem.storageCost)} / {yieldItem.storageUnit}</b></span><span><small>RECIPE UNIT</small><b>{yieldItem.defaultUnit}</b></span></div><form onSubmit={saveYield}><p className="yield-question">How much usable product do you get from <b>1 {yieldItem.storageUnit}</b>?</p><div className="yield-entry"><span>1 {yieldItem.storageUnit} =</span><input autoFocus type="number" step="any" min="0.0001" value={yieldQty} onChange={e=>setYieldQty(e.target.value)} placeholder="Usable qty" required/><select value={yieldUnit} onChange={e=>setYieldUnit(e.target.value)}><option value="g">g</option><option value="ml">ml</option><option value="pc">pc</option><option value="kg">kg</option><option value="L">L</option></select></div><small className="yield-help">Example: 1 can = 720 g drained olives, or 1 bottle = 750 ml usable syrup.</small><button className="primary" disabled={saving}>{saving?'Saving…':'Save Yield'}</button></form></div></div>}
 {editItem&&<div className="modal-bg" onMouseDown={e=>e.target===e.currentTarget&&setEditItem(null)}><div className="v2-modal"><header><div><span>INGREDIENT</span><h2>{editItem.id?'Edit Ingredient':'Add Ingredient'}</h2></div><button onClick={()=>setEditItem(null)}>×</button></header><form onSubmit={saveIngredient}><label>Ingredient name<input name="name" defaultValue={editItem.name||''} required/></label><div className="two"><label>Recipe unit<select name="default_unit" defaultValue={editItem.default_unit||'g'}><option>g</option><option>kg</option><option>ml</option><option>L</option><option>pc</option></select></label><label>Type<input name="ingredient_type" defaultValue={editItem.ingredient_type||'raw'}/></label></div><label>Notes<textarea name="notes" defaultValue={editItem.notes||''}/></label><button className="primary">{editItem.id?'Save Changes':'Add Ingredient'}</button></form></div></div>}
 {notice&&<div className="toast">{notice}</div>}
 </div>
}
