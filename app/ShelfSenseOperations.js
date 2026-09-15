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
    const find=()=>{
      if(cancelled)return;
      const el=document.querySelector('.v2-head .v2-actions');
      if(el){setTarget(el);return}
      if(tries++<180)requestAnimationFrame(find);
    };
    find();
    return()=>{cancelled=true};
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
  const pending=useMemo(()=>((preview?.rows||[]).filter(r=>r.status==='new')),[preview]);
  const safePending=useMemo(()=>pending.filter(r=>!r.alert&&!r.conversionWarning&&r.sourceExternalId),[pending]);
  const reviewRows=useMemo(()=>{
    const q=reviewSearch.trim().toLowerCase();
    const rows=preview?.rows||[];
    return q?rows.filter(r=>`${r.ingredientName||''} ${r.externalItemName||''} ${r.supplier||''} ${r.sourcePurchaseUnit||''} ${r.sourceIssueUnit||''}`.toLowerCase().includes(q)):rows;
  },[preview,reviewSearch]);
  const mappingRows=useMemo(()=>{
    const q=mapSearch.trim().toLowerCase(),rows=integration?.mappings||[];
    return q?rows.filter(r=>`${r.ingredient_name} ${r.external_item_name}`.toLowerCase().includes(q)):rows;
  },[integration,mapSearch]);

  async function autoMap(){
    setBusy(true);setMessage('');
    const r=await fetch('/api/integrations/shelfsense/mappings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'auto_map'})});
    const j=await r.json();
    setMessage(r.ok?`Auto-mapped ${j.mapped||0} ingredients.`:(j.error||'Auto-map failed'));
    await refresh();setBusy(false);
  }
  async function setManual(ingredientId){
    setBusy(true);setMessage('');
    const r=await fetch('/api/integrations/shelfsense/mappings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ingredient_id:ingredientId,source_type:'manual'})});
    const j=await r.json();
    setMessage(r.ok?'Ingredient switched to manual pricing.':(j.error||'Could not change mapping'));
    await refresh();setBusy(false);
  }
  async function mapIngredient(ingredientId,externalItemId,kitchenUnit,conversionFactor){
    if(!externalItemId)return;
    setBusy(true);setMessage('');
    const r=await fetch('/api/integrations/shelfsense/mappings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ingredient_id:ingredientId,source_type:'shelfsense',external_item_id:externalItemId,kitchen_unit:kitchenUnit,conversion_factor:Number(conversionFactor||1)})});
    const j=await r.json();
    setMessage(r.ok?'ShelfSense item mapped.':(j.error||'Mapping failed'));
    await refresh();setBusy(false);
  }

  async function syncIds(ids){
    const sourceIds=[...new Set(ids.map(String).filter(Boolean))];
    if(!sourceIds.length)return;
    setBusy(true);setMessage('');
    const r=await fetch('/api/integrations/shelfsense/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({selectedSourceIds:sourceIds,acceptedSourceIds:sourceIds})});
    const j=await r.json();
    if(!r.ok)setMessage(j.error||'Sync failed');
    else setMessage(`Sync complete: ${j.imported||0} price${j.imported===1?'':'s'} imported${j.blockedConversions?`, ${j.blockedConversions} held for conversion review`:''}${j.blockedAlerts?`, ${j.blockedAlerts} held for price review`:''}.`);
    await refresh();setBusy(false);
  }
  function toggleSelected(id){setSelected(s=>{const n=new Set(s),k=String(id);n.has(k)?n.delete(k):n.add(k);return n})}
  function selectAllSafe(){setSelected(new Set(safePending.map(r=>String(r.sourceExternalId))))}

  if(!target)return null;
  const button=createPortal(<button className="ghost ss-trigger" onClick={()=>setOpen(true)}>ShelfSense</button>,target);
  if(!open)return button;

  return <>{button}{createPortal(<div className="ss-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setOpen(false)}>
    <div className="ss-modal ss-modal-wide">
      <div className="ss-header">
        <div><span className="ss-kicker">LIVE COST SOURCE</span><h2>ShelfSense Cost Review</h2><p>Review the original purchase, issue and kitchen units before allowing a ShelfSense cost into menu costing.</p></div>
        <button className="ss-close" onClick={()=>setOpen(false)}>×</button>
      </div>
      <div className="ss-tabs">
        <button className={tab==='sync'?'active':''} onClick={()=>setTab('sync')}>Review & Sync {pending.length>0&&<b>{pending.length}</b>}</button>
        <button className={tab==='mapping'?'active':''} onClick={()=>setTab('mapping')}>Mappings</button>
        <button className={tab==='alerts'?'active':''} onClick={()=>setTab('alerts')}>Price Alerts {alerts.length>0&&<b>{alerts.length}</b>}</button>
      </div>

      {loading?<div className="ss-loading">Loading ShelfSense data…</div>:<>
        <div className="ss-cards">
          <div><span>Connection</span><strong className={integration?.connected?'ok':'bad'}>{integration?.connected?'Connected':'Disconnected'}</strong><small>{integration?.integration?.lastSyncAt?`Last sync ${new Date(integration.integration.lastSyncAt).toLocaleString()}`:'No completed sync'}</small></div>
          <div><span>Mapped Ingredients</span><strong>{integration?.mappings?.length||0}</strong><small>{unmapped.length} manual / unmapped</small></div>
          <div><span>Pending Review</span><strong>{pending.length}</strong><small>{safePending.length} safe to select</small></div>
          <div><span>Needs Attention</span><strong className={(alerts.length+(preview?.summary?.conversionWarnings||0))?'warn':'ok'}>{alerts.length+(preview?.summary?.conversionWarnings||0)}</strong><small>price / conversion review</small></div>
        </div>
        {message&&<div className="ss-message">{message}</div>}

        {tab==='sync'&&<div className="ss-section">
          <div className="ss-section-head ss-review-head"><div><h3>Review ShelfSense Prices</h3><p>Nothing on this screen syncs automatically. Check the unit trail, select only the rows you trust, then sync them. Use Manual keeps the ingredient outside ShelfSense costing.</p></div><div className="ss-review-actions"><button className="ghost" disabled={busy||safePending.length===0} onClick={selectAllSafe}>Select All Safe</button><button className="primary" disabled={busy||selected.size===0} onClick={()=>syncIds([...selected])}>{busy?'Syncing…':`Sync Selected (${selected.size})`}</button></div></div>
          <div className="ss-review-tools"><input className="ss-search" placeholder="Search ingredient, supplier or unit…" value={reviewSearch} onChange={e=>setReviewSearch(e.target.value)}/><span><b>{preview?.summary?.new||0}</b> pending · <b>{preview?.summary?.unchanged||0}</b> synced · <b>{preview?.summary?.missing||0}</b> no cost</span></div>
          <div className="ss-review-table">
            <div className="ss-review-row ss-review-table-head"><span></span><span>Ingredient</span><span>Purchase / Receipt</span><span>Issue Unit</span><span>Kitchen / Cost</span><span>Current Cost</span><span>Status</span><span>Action</span></div>
            {reviewRows.map(r=><ReviewRow key={r.ingredientId} row={r} selected={selected.has(String(r.sourceExternalId))} onToggle={toggleSelected} onSync={syncIds} onManual={setManual} busy={busy}/>) }
            {!reviewRows.length&&<div className="ss-empty">No mapped ShelfSense prices found.</div>}
          </div>
        </div>}

        {tab==='mapping'&&<div className="ss-section">
          <div className="ss-section-head"><div><h3>Ingredient Mapping</h3><p>Map only when the ShelfSense item represents the same ingredient. Costing can remain manual whenever a carton/packet conversion is unclear.</p></div><button className="ghost" disabled={busy} onClick={autoMap}>Auto-map Exact Names</button></div>
          <input className="ss-search" placeholder="Search mappings…" value={mapSearch} onChange={e=>setMapSearch(e.target.value)}/>
          <div className="ss-map-table">
            <div className="ss-map-head"><span>Cost Control Ingredient</span><span>ShelfSense Item</span><span>Kitchen Unit</span><span>Factor</span><span></span></div>
            {mappingRows.map(m=><div className="ss-map-row" key={m.ingredient_id}><span><b>{m.ingredient_name}</b></span><span>{m.external_item_name||'—'}</span><span>{m.kitchen_unit||'—'}</span><span>{Number(m.conversion_factor||1)}</span><span><button onClick={()=>setManual(m.ingredient_id)} disabled={busy}>Use Manual</button></span></div>)}
          </div>
          {unmapped.length>0&&<div className="ss-unmapped"><h4>Manual / unmapped ingredients</h4>{unmapped.slice(0,30).map(i=><ManualMapper key={i.id} ingredient={i} items={integration?.items||[]} onMap={mapIngredient} busy={busy}/>)}</div>}
        </div>}

        {tab==='alerts'&&<div className="ss-section">
          <div className="ss-section-head"><div><h3>Price Change Review</h3><p>These pending ShelfSense costs differ by at least {preview?.alertThresholdPct||25}% from the latest Cost Control price. Sync them individually after checking the unit trail.</p></div></div>
          <div className="ss-alert-list">
            {alerts.map(r=><div className="ss-alert-row ss-alert-row-actions" key={r.sourceExternalId||r.ingredientId}>
              <div className="ss-alert-main"><b>{r.ingredientName}</b><small>{r.sourcePurchaseUnit||'—'} → {r.sourceIssueUnit||'—'} → {r.purchaseUnit||'—'}</small></div>
              <div><span>Current</span><strong>{r.previousPrice!=null?`${money(r.previousPrice)} / ${r.previousQuantity} ${r.previousUnit}`:'—'}</strong></div>
              <div><span>Incoming</span><strong>{money(r.purchasePrice)} / {r.purchaseUnit}</strong></div>
              <em className={Number(r.changePct)>0?'up':'down'}>{pct(r.changePct)}</em>
              <button disabled={busy} onClick={()=>syncIds([r.sourceExternalId])}>Review & Sync</button>
              <button disabled={busy} onClick={()=>setManual(r.ingredientId)}>Use Manual</button>
            </div>)}
            {alerts.length===0&&<div className="ss-empty good">No abnormal ShelfSense price movements are waiting for review.</div>}
          </div>
        </div>}
      </>}
    </div>
  </div>,document.body)}</>;
}

function ReviewRow({row:r,selected,onToggle,onSync,onManual,busy}){
  const canSync=r.status==='new'&&r.sourceExternalId&&!r.conversionWarning;
  const purchaseTrail=r.sourcePurchaseFactor&&r.sourcePurchaseUnit&&r.sourceBaseUnit&&String(r.sourcePurchaseUnit).toLowerCase()!==String(r.sourceBaseUnit).toLowerCase()
    ?`1 ${r.sourcePurchaseUnit} = ${qty(r.sourcePurchaseFactor)} ${r.sourceBaseUnit}`
    :r.sourcePurchaseUnit&&r.sourceBaseUnit?`${r.sourcePurchaseUnit} → ${r.sourceBaseUnit}`:'Conversion not available';
  const status=r.status==='missing'?'No ShelfSense cost':r.status==='unchanged'?'Synced':r.conversionWarning?'Check conversion':r.alert?`Review ${pct(r.changePct)}`:'Ready';
  return <div className={`ss-review-row ${r.alert?'has-alert':''} ${r.conversionWarning?'has-warning':''}`}>
    <span>{canSync?<input type="checkbox" checked={selected} onChange={()=>onToggle(r.sourceExternalId)}/>:null}</span>
    <span className="ss-review-name"><b>{r.ingredientName}</b><small>{r.externalItemName||'ShelfSense'} · {r.supplier||'No supplier'} · {r.priceDate||'—'}</small></span>
    <span><b>{r.sourceEnteredQty!=null?`${qty(r.sourceEnteredQty)} ${r.sourceEnteredUnit||r.sourcePurchaseUnit||''}`:(r.sourcePurchaseUnit||'—')}</b><small>{purchaseTrail}</small>{r.sourceReceiptTotal!=null&&<small>Receipt value ≈ {money(r.sourceReceiptTotal)}</small>}</span>
    <span><b>{r.sourceIssueUnit||'—'}</b><small>Kitchen issue unit</small></span>
    <span><b>{money(r.purchasePrice)} / {r.purchaseUnit||'—'}</b><small>Base: {r.sourceBaseQty!=null?`${qty(r.sourceBaseQty)} `:''}{r.sourceBaseUnit||'—'}</small></span>
    <span><b>{r.previousPrice!=null?`${money(r.previousPrice)} / ${r.previousQuantity} ${r.previousUnit}`:'—'}</b><small>{r.previousSource||'No current price'}{Number.isFinite(Number(r.changePct))?` · ${pct(r.changePct)}`:''}</small></span>
    <span><em className={`ss-pill ${r.status==='unchanged'?'synced':r.alert||r.conversionWarning?'alert':'safe'}`}>{status}</em></span>
    <span className="ss-row-buttons">{canSync?<button className="ss-sync-one" disabled={busy} onClick={()=>onSync([r.sourceExternalId])}>Sync</button>:<button disabled>Sync</button>}<button disabled={busy} onClick={()=>onManual(r.ingredientId)}>Manual</button></span>
  </div>
}

function ManualMapper({ingredient,items,onMap,busy}){
  const [item,setItem]=useState(''),[factor,setFactor]=useState('1');
  return <div className="ss-unmapped-row">
    <div><b>{ingredient.name}</b><small>Kitchen unit: {ingredient.default_unit||'—'}</small></div>
    <select value={item} onChange={e=>setItem(e.target.value)}><option value="">Select ShelfSense item…</option>{items.map(x=><option key={x.id} value={x.id}>{x.name} · buy {x.purchaseUnit||x.unit||'unit'} · issue {x.issueUnit||x.unit||'unit'} · base {x.unit||'unit'}</option>)}</select>
    <input type="number" step="0.0001" min="0.0001" value={factor} onChange={e=>setFactor(e.target.value)} title="Cost Control mapping factor"/>
    <button disabled={busy||!item} onClick={()=>onMap(ingredient.id,item,ingredient.default_unit,factor)}>Map</button>
  </div>
}
