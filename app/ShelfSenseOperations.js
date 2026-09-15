"use client";
import {useEffect,useMemo,useState} from "react";
import {createPortal} from "react-dom";
import {usePathname} from "next/navigation";

const money=n=>Number.isFinite(Number(n))?`Rs ${Number(n).toLocaleString(undefined,{maximumFractionDigits:2})}`:'—';
const qty=n=>Number.isFinite(Number(n))?Number(n).toLocaleString(undefined,{maximumFractionDigits:3}):'—';
const pct=n=>Number.isFinite(Number(n))?`${Number(n)>0?'+':''}${Number(n).toFixed(1)}%`:'—';

export default function ShelfSenseOperations(){
  const path=usePathname()||'';
  const [target,setTarget]=useState(null),[open,setOpen]=useState(false),[tab,setTab]=useState('sync');
  const [integration,setIntegration]=useState(null),[bootstrap,setBootstrap]=useState(null),[preview,setPreview]=useState(null);
  const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [selected,setSelected]=useState(new Set()),[mapSearch,setMapSearch]=useState(''),[reviewSearch,setReviewSearch]=useState('');

  useEffect(()=>{
    if(!path.startsWith('/purchase-prices')){setTarget(null);return}
    let cancelled=false,tries=0;
    const find=()=>{if(cancelled)return;const el=document.querySelector('.v2-head .v2-actions');if(el){setTarget(el);return}if(tries++<180)requestAnimationFrame(find)};
    find();return()=>{cancelled=true};
  },[path]);

  async function refresh(){
    setLoading(true);setMessage('');
    try{
      const [i,b,p]=await Promise.all([
        fetch('/api/integrations/shelfsense',{cache:'no-store'}).then(r=>r.json()),
        fetch('/api/bootstrap',{cache:'no-store'}).then(r=>r.json()),
        fetch('/api/integrations/shelfsense/sync',{cache:'no-store'}).then(r=>r.json()),
      ]);
      setIntegration(i);setBootstrap(b);setPreview(p);setSelected(new Set());
    }catch(e){setMessage(e.message||'Could not load ShelfSense data')}
    setLoading(false);
  }
  useEffect(()=>{if(open)refresh()},[open]);

  const mappedIds=useMemo(()=>new Set((integration?.mappings||[]).map(x=>String(x.ingredient_id))),[integration]);
  const unmapped=useMemo(()=>((bootstrap?.ingredients||[]).filter(i=>!mappedIds.has(String(i.id)))),[bootstrap,mappedIds]);
  const alerts=useMemo(()=>((preview?.rows||[]).filter(r=>r.status==='new'&&r.alert)),[preview]);
  const conversionWarnings=useMemo(()=>((preview?.rows||[]).filter(r=>r.conversionWarning)),[preview]);
  const yieldNeeded=useMemo(()=>((preview?.rows||[]).filter(r=>r.needsYieldSetup)),[preview]);
  const pending=useMemo(()=>((preview?.rows||[]).filter(r=>r.status==='new')),[preview]);
  const safePending=useMemo(()=>pending.filter(r=>!r.alert&&!r.conversionWarning&&!r.needsYieldSetup&&r.sourceExternalId),[pending]);
  const reviewRows=useMemo(()=>{const q=reviewSearch.trim().toLowerCase(),rows=preview?.rows||[];return q?rows.filter(r=>`${r.ingredientName||''} ${r.externalItemName||''} ${r.supplier||''} ${r.purchaseUnit||''} ${r.sourceIssueUnit||''}`.toLowerCase().includes(q)):rows},[preview,reviewSearch]);
  const mappingRows=useMemo(()=>{const q=mapSearch.trim().toLowerCase(),rows=integration?.mappings||[];return q?rows.filter(r=>`${r.ingredient_name} ${r.external_item_name}`.toLowerCase().includes(q)):rows},[integration,mapSearch]);

  async function autoMap(){setBusy(true);setMessage('');const r=await fetch('/api/integrations/shelfsense/mappings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'auto_map'})});const j=await r.json();setMessage(r.ok?`Auto-mapped ${j.mapped||0} ingredients.`:(j.error||'Auto-map failed'));await refresh();setBusy(false)}
  async function setManual(ingredientId){setBusy(true);setMessage('');const r=await fetch('/api/integrations/shelfsense/mappings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ingredient_id:ingredientId,source_type:'manual'})});const j=await r.json();setMessage(r.ok?'Ingredient switched to manual pricing.':(j.error||'Could not change mapping'));await refresh();setBusy(false)}
  async function mapIngredient(ingredientId,externalItemId,kitchenUnit){if(!externalItemId)return;setBusy(true);setMessage('');const r=await fetch('/api/integrations/shelfsense/mappings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ingredient_id:ingredientId,source_type:'shelfsense',external_item_id:externalItemId,kitchen_unit:kitchenUnit,conversion_factor:1})});const j=await r.json();setMessage(r.ok?'ShelfSense item mapped.':(j.error||'Mapping failed'));await refresh();setBusy(false)}
  async function saveYield(row,usable){
    if(!(Number(usable)>0))return;
    setBusy(true);setMessage('');
    const r=await fetch('/api/costing-conversions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ingredient_id:row.ingredientId,purchase_unit:row.purchaseUnit,usable_quantity:Number(usable),costing_unit:row.yieldCostingUnit||row.costingUnit,source:'shelfsense'})});
    const j=await r.json();setMessage(r.ok?`Usable yield saved for ${row.ingredientName}.`:(j.error||'Could not save yield'));await refresh();setBusy(false);
  }
  async function syncIds(ids){
    const sourceIds=[...new Set(ids.map(String).filter(Boolean))];if(!sourceIds.length)return;
    setBusy(true);setMessage('');
    const r=await fetch('/api/integrations/shelfsense/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({selectedSourceIds:sourceIds,acceptedSourceIds:sourceIds})});
    const j=await r.json();
    if(!r.ok)setMessage(j.error||'Sync failed');else setMessage(`Sync complete: ${j.imported||0} purchase price${j.imported===1?'':'s'} imported${j.blockedAlerts?`, ${j.blockedAlerts} held for price review`:''}.`);
    await refresh();setBusy(false);
  }
  function toggleSelected(id){setSelected(s=>{const n=new Set(s),k=String(id);n.has(k)?n.delete(k):n.add(k);return n})}
  function selectAllSafe(){setSelected(new Set(safePending.map(r=>String(r.sourceExternalId))))}

  if(!target)return null;
  const button=createPortal(<button className="ghost ss-trigger" onClick={()=>setOpen(true)}>ShelfSense</button>,target);
  if(!open)return button;

  return <>{button}{createPortal(<div className="ss-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setOpen(false)}>
    <div className="ss-modal ss-modal-wide">
      <div className="ss-header"><div><span className="ss-kicker">LIVE COST SOURCE</span><h2>ShelfSense Cost Review</h2><p>Purchase price stays in its real purchase unit. Kitchen cost is calculated only when the usable yield is known.</p></div><button className="ss-close" onClick={()=>setOpen(false)}>×</button></div>
      <div className="ss-tabs"><button className={tab==='sync'?'active':''} onClick={()=>setTab('sync')}>Review & Sync {pending.length>0&&<b>{pending.length}</b>}</button><button className={tab==='mapping'?'active':''} onClick={()=>setTab('mapping')}>Mappings</button><button className={tab==='alerts'?'active':''} onClick={()=>setTab('alerts')}>Price Alerts {alerts.length>0&&<b>{alerts.length}</b>}</button></div>

      {loading?<div className="ss-loading">Loading ShelfSense data…</div>:<>
        <div className="ss-cards">
          <div><span>Connection</span><strong className={integration?.connected?'ok':'bad'}>{integration?.connected?'Connected':'Disconnected'}</strong><small>{integration?.integration?.lastSyncAt?`Last sync ${new Date(integration.integration.lastSyncAt).toLocaleString()}`:'No completed sync'}</small></div>
          <div><span>Mapped Ingredients</span><strong>{integration?.mappings?.length||0}</strong><small>{unmapped.length} manual / unmapped</small></div>
          <div><span>Needs Yield</span><strong className={yieldNeeded.length?'warn':'ok'}>{yieldNeeded.length}</strong><small>can / jar / packet conversions</small></div>
          <div><span>Other Review</span><strong className={(alerts.length+conversionWarnings.length)?'warn':'ok'}>{alerts.length+conversionWarnings.length}</strong><small>{conversionWarnings.length} source check · {alerts.length} price</small></div>
        </div>
        {message&&<div className="ss-message">{message}</div>}

        {tab==='sync'&&<div className="ss-section">
          <div className="ss-section-head ss-review-head"><div><h3>Review ShelfSense Purchases</h3><p>For kg/g and L/ml, Cost Control converts automatically. For cans, jars, bottles or packets, enter the usable quantity once and reuse it thereafter.</p></div><div className="ss-review-actions"><button className="ghost" disabled={busy||safePending.length===0} onClick={selectAllSafe}>Select All Ready</button><button className="primary" disabled={busy||selected.size===0} onClick={()=>syncIds([...selected])}>{busy?'Syncing…':`Sync Selected (${selected.size})`}</button></div></div>
          <div className="ss-review-tools"><input className="ss-search" placeholder="Search ingredient, supplier or unit…" value={reviewSearch} onChange={e=>setReviewSearch(e.target.value)}/><span><b>{preview?.summary?.new||0}</b> pending · <b>{yieldNeeded.length}</b> need yield · <b>{preview?.summary?.unchanged||0}</b> synced</span></div>
          <div className="ss-review-table">
            <div className="ss-review-row ss-review-table-head"><span></span><span>Ingredient</span><span>Purchase / Receipt</span><span>Issue Unit</span><span>Kitchen Cost</span><span>Current Cost</span><span>Status</span><span>Action</span></div>
            {reviewRows.map(r=><ReviewRow key={r.ingredientId} row={r} selected={selected.has(String(r.sourceExternalId))} onToggle={toggleSelected} onSync={syncIds} onManual={setManual} onSaveYield={saveYield} busy={busy}/>) }
            {!reviewRows.length&&<div className="ss-empty">No mapped ShelfSense prices found.</div>}
          </div>
        </div>}

        {tab==='mapping'&&<div className="ss-section">
          <div className="ss-section-head"><div><h3>Ingredient Mapping</h3><p>Map the same ingredient between the two products. Yield is handled separately and only when needed.</p></div><button className="ghost" disabled={busy} onClick={autoMap}>Auto-map Exact Names</button></div>
          <input className="ss-search" placeholder="Search mappings…" value={mapSearch} onChange={e=>setMapSearch(e.target.value)}/>
          <div className="ss-map-table"><div className="ss-map-head"><span>Cost Control Ingredient</span><span>ShelfSense Item</span><span>Kitchen Unit</span><span></span><span></span></div>{mappingRows.map(m=><div className="ss-map-row" key={m.ingredient_id}><span><b>{m.ingredient_name}</b></span><span>{m.external_item_name||'—'}</span><span>{m.kitchen_unit||'—'}</span><span></span><span><button onClick={()=>setManual(m.ingredient_id)} disabled={busy}>Use Manual</button></span></div>)}</div>
          {unmapped.length>0&&<div className="ss-unmapped"><h4>Manual / unmapped ingredients</h4>{unmapped.slice(0,30).map(i=><ManualMapper key={i.id} ingredient={i} items={integration?.items||[]} onMap={mapIngredient} busy={busy}/>)}</div>}
        </div>}

        {tab==='alerts'&&<div className="ss-section">
          <div className="ss-section-head"><div><h3>Kitchen Cost Change Review</h3><p>Alerts compare usable kitchen cost, not the purchase container price. Items without a usable yield are excluded until yield is set.</p></div></div>
          <div className="ss-alert-list">
            {alerts.map(r=><div className="ss-alert-row ss-alert-row-actions" key={r.sourceExternalId||r.ingredientId}><div className="ss-alert-main"><b>{r.ingredientName}</b><small>{r.purchaseUnit||'—'} → {r.costingUnit||'—'}</small></div><div><span>Current kitchen cost</span><strong>{r.previousCostingRate!=null?`${money(r.previousCostingRate)} / ${r.costingUnit}`:'—'}</strong></div><div><span>Incoming kitchen cost</span><strong>{r.costingRate!=null?`${money(r.costingRate)} / ${r.costingUnit}`:'—'}</strong></div><em className={Number(r.changePct)>0?'up':'down'}>{pct(r.changePct)}</em><button disabled={busy} onClick={()=>syncIds([r.sourceExternalId])}>Review & Sync</button><button disabled={busy} onClick={()=>setManual(r.ingredientId)}>Use Manual</button></div>)}
            {alerts.length===0&&<div className="ss-empty good">No abnormal usable-cost movements are waiting for review.</div>}
          </div>
        </div>}
      </>}
    </div>
  </div>,document.body)}</>;
}

function ReviewRow({row:r,selected,onToggle,onSync,onManual,onSaveYield,busy}){
  const [yieldQty,setYieldQty]=useState(r.yieldUsableQuantity?String(r.yieldUsableQuantity):'');
  useEffect(()=>{setYieldQty(r.yieldUsableQuantity?String(r.yieldUsableQuantity):'')},[r.yieldUsableQuantity,r.purchaseUnit]);
  const canSync=r.status==='new'&&r.sourceExternalId&&!r.conversionWarning;
  const status=r.status==='missing'?'No ShelfSense cost':r.conversionWarning?'Check source':r.needsYieldSetup?'Needs yield':r.status==='unchanged'?'Synced':r.alert?`Review ${pct(r.changePct)}`:'Ready';
  const purchaseTrail=r.sourcePurchaseFactor&&r.sourcePurchaseUnit&&r.sourceBaseUnit&&String(r.sourcePurchaseUnit).toLowerCase()!==String(r.sourceBaseUnit).toLowerCase()?`ShelfSense: 1 ${r.sourcePurchaseUnit} = ${qty(r.sourcePurchaseFactor)} ${r.sourceBaseUnit}`:'Original purchase unit';
  return <div className={`ss-review-row ${r.alert?'has-alert':''} ${r.conversionWarning||r.needsYieldSetup?'has-warning':''}`}>
    <span>{canSync&&!r.needsYieldSetup?<input type="checkbox" checked={selected} onChange={()=>onToggle(r.sourceExternalId)}/>:null}</span>
    <span className="ss-review-name"><b>{r.ingredientName}</b><small>{r.externalItemName||'ShelfSense'} · {r.supplier||'No supplier'} · {r.priceDate||'—'}</small></span>
    <span><b>{r.purchaseQuantity!=null?`${qty(r.purchaseQuantity)} ${r.purchaseUnit||''}`:'—'}</b><small>{r.purchasePrice!=null?`${money(r.purchasePrice)} total`:'No receipt value'} · {purchaseTrail}</small>{r.conversionReasons?.length>0&&<small className="bad">{r.conversionReasons.join(' · ')}</small>}</span>
    <span><b>{r.sourceIssueUnit||'—'}</b><small>Kitchen issue unit</small></span>
    <span>{r.needsYieldSetup?<><b className="bad">Yield required</b><small>1 {r.purchaseUnit} =</small><div className="ss-inline-yield"><input type="number" min="0" step="0.01" value={yieldQty} onChange={e=>setYieldQty(e.target.value)} placeholder="usable"/><span>{r.yieldCostingUnit||r.costingUnit}</span><button disabled={busy||!(Number(yieldQty)>0)} onClick={()=>onSaveYield(r,yieldQty)}>Save</button></div></>:<><b>{r.costingRate!=null?`${money(r.costingRate)} / ${r.costingUnit}`:'—'}</b><small>{r.yieldUsableQuantity?`1 ${r.purchaseUnit} = ${qty(r.yieldUsableQuantity)} ${r.yieldCostingUnit} usable`:'Automatic unit conversion'}</small></>}</span>
    <span><b>{r.previousCostingRate!=null?`${money(r.previousCostingRate)} / ${r.costingUnit}`:'—'}</b><small>{r.previousSource||'No current usable cost'}{Number.isFinite(Number(r.changePct))?` · ${pct(r.changePct)}`:''}</small></span>
    <span><em className={`ss-pill ${r.conversionWarning||r.needsYieldSetup||r.alert?'alert':r.status==='unchanged'?'synced':'safe'}`}>{status}</em></span>
    <span className="ss-row-buttons">{canSync?<button className="ss-sync-one" disabled={busy} onClick={()=>onSync([r.sourceExternalId])}>{r.needsYieldSetup?'Sync Purchase':'Sync'}</button>:<button disabled>Sync</button>}<button disabled={busy} onClick={()=>onManual(r.ingredientId)}>Manual</button></span>
  </div>
}

function ManualMapper({ingredient,items,onMap,busy}){
  const [item,setItem]=useState('');
  return <div className="ss-unmapped-row"><div><b>{ingredient.name}</b><small>Kitchen unit: {ingredient.default_unit||'—'}</small></div><select value={item} onChange={e=>setItem(e.target.value)}><option value="">Select ShelfSense item…</option>{items.map(x=><option key={x.id} value={x.id}>{x.name} · buy {x.purchaseUnit||x.unit||'unit'} · issue {x.issueUnit||x.unit||'unit'}</option>)}</select><span></span><button disabled={busy||!item} onClick={()=>onMap(ingredient.id,item,ingredient.default_unit)}>Map</button></div>
}
