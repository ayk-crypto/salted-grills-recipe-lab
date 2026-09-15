"use client";
import {useEffect,useMemo,useState} from "react";
import {createPortal} from "react-dom";
import {usePathname} from "next/navigation";

const money=n=>Number.isFinite(Number(n))?`Rs ${Number(n).toLocaleString(undefined,{maximumFractionDigits:2})}`:'—';
const pct=n=>Number.isFinite(Number(n))?`${Number(n)>0?'+':''}${Number(n).toFixed(1)}%`:'—';

export default function ShelfSenseOperations(){
  const path=usePathname()||'';
  const [target,setTarget]=useState(null),[open,setOpen]=useState(false),[tab,setTab]=useState('sync');
  const [integration,setIntegration]=useState(null),[bootstrap,setBootstrap]=useState(null),[preview,setPreview]=useState(null);
  const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [approved,setApproved]=useState(new Set()),[mapSearch,setMapSearch]=useState('');

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
      setIntegration(i);setBootstrap(b);setPreview(p);
      setApproved(new Set());
    }catch(e){setMessage(e.message||'Could not load ShelfSense data')}
    setLoading(false);
  }

  useEffect(()=>{if(open)refresh()},[open]);

  const mappedIds=useMemo(()=>new Set((integration?.mappings||[]).map(x=>String(x.ingredient_id))),[integration]);
  const unmapped=useMemo(()=>((bootstrap?.ingredients||[]).filter(i=>!mappedIds.has(String(i.id)))),[bootstrap,mappedIds]);
  const alerts=useMemo(()=>((preview?.rows||[]).filter(r=>r.status==='new'&&r.alert)),[preview]);
  const safeNew=useMemo(()=>((preview?.rows||[]).filter(r=>r.status==='new'&&!r.alert)),[preview]);
  const mappingRows=useMemo(()=>{
    const q=mapSearch.trim().toLowerCase();
    const rows=integration?.mappings||[];
    return q?rows.filter(r=>`${r.ingredient_name} ${r.external_item_name}`.toLowerCase().includes(q)):rows;
  },[integration,mapSearch]);

  async function autoMap(){
    setBusy(true);setMessage('');
    const r=await fetch('/api/integrations/shelfsense/mappings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'auto_map'})});
    const j=await r.json();
    if(!r.ok)setMessage(j.error||'Auto-map failed');else setMessage(`Auto-mapped ${j.mapped||0} ingredients.`);
    await refresh();setBusy(false);
  }

  async function setManual(ingredientId){
    setBusy(true);setMessage('');
    const r=await fetch('/api/integrations/shelfsense/mappings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ingredient_id:ingredientId,source_type:'manual'})});
    const j=await r.json();
    if(!r.ok)setMessage(j.error||'Could not change mapping');else setMessage('Ingredient switched to manual pricing.');
    await refresh();setBusy(false);
  }

  async function mapIngredient(ingredientId,externalItemId,kitchenUnit,conversionFactor){
    if(!externalItemId)return;
    setBusy(true);setMessage('');
    const r=await fetch('/api/integrations/shelfsense/mappings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ingredient_id:ingredientId,source_type:'shelfsense',external_item_id:externalItemId,kitchen_unit:kitchenUnit,conversion_factor:Number(conversionFactor||1)})});
    const j=await r.json();
    if(!r.ok)setMessage(j.error||'Mapping failed');else setMessage('ShelfSense item mapped.');
    await refresh();setBusy(false);
  }

  async function sync(){
    setBusy(true);setMessage('');
    const acceptedSourceIds=[...approved];
    const r=await fetch('/api/integrations/shelfsense/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({acceptedSourceIds})});
    const j=await r.json();
    if(!r.ok)setMessage(j.error||'Sync failed');else setMessage(`Sync complete: ${j.imported||0} prices imported${j.blockedAlerts?`, ${j.blockedAlerts} abnormal price${j.blockedAlerts===1?'':'s'} held for approval`:''}.`);
    await refresh();setBusy(false);
    window.dispatchEvent(new Event('focus'));
  }

  function toggleApproval(id){setApproved(s=>{const n=new Set(s);n.has(String(id))?n.delete(String(id)):n.add(String(id));return n})}

  if(!target)return null;
  const button=createPortal(<button className="ghost ss-trigger" onClick={()=>setOpen(true)}>ShelfSense</button>,target);
  if(!open)return button;

  return <>{button}{createPortal(<div className="ss-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setOpen(false)}>
    <div className="ss-modal">
      <div className="ss-header">
        <div><span className="ss-kicker">LIVE COST SOURCE</span><h2>ShelfSense Control</h2><p>Sync purchase costs, manage ingredient mappings and review abnormal price movements before they affect menu costing.</p></div>
        <button className="ss-close" onClick={()=>setOpen(false)}>×</button>
      </div>

      <div className="ss-tabs">
        <button className={tab==='sync'?'active':''} onClick={()=>setTab('sync')}>Sync</button>
        <button className={tab==='mapping'?'active':''} onClick={()=>setTab('mapping')}>Mappings</button>
        <button className={tab==='alerts'?'active':''} onClick={()=>setTab('alerts')}>Price Alerts {alerts.length>0&&<b>{alerts.length}</b>}</button>
      </div>

      {loading?<div className="ss-loading">Loading ShelfSense data…</div>:<>
        <div className="ss-cards">
          <div><span>Connection</span><strong className={integration?.connected?'ok':'bad'}>{integration?.connected?'Connected':'Disconnected'}</strong><small>{integration?.integration?.lastSyncAt?`Last sync ${new Date(integration.integration.lastSyncAt).toLocaleString()}`:'No completed sync'}</small></div>
          <div><span>Mapped Ingredients</span><strong>{integration?.mappings?.length||0}</strong><small>{unmapped.length} still manual / unmapped</small></div>
          <div><span>New Safe Prices</span><strong>{safeNew.length}</strong><small>Ready to import</small></div>
          <div><span>Price Alerts</span><strong className={alerts.length?'warn':'ok'}>{alerts.length}</strong><small>≥ {preview?.alertThresholdPct||25}% movement</small></div>
        </div>

        {message&&<div className="ss-message">{message}</div>}

        {tab==='sync'&&<div className="ss-section">
          <div className="ss-section-head"><div><h3>Purchase Cost Sync</h3><p>Safe new costs import automatically. Abnormal movements stay blocked until you approve them.</p></div><button className="primary" disabled={busy||!integration?.connected} onClick={sync}>{busy?'Syncing…':'Sync ShelfSense'}</button></div>
          <div className="ss-summary-row"><span><b>{preview?.summary?.mapped||0}</b> mapped</span><span><b>{preview?.summary?.new||0}</b> new</span><span><b>{preview?.summary?.unchanged||0}</b> unchanged</span><span><b>{preview?.summary?.missing||0}</b> missing cost</span></div>
          <div className="ss-list">
            {(preview?.rows||[]).filter(r=>r.status==='new').slice(0,18).map(r=><div className="ss-list-row" key={r.ingredientId}>
              <div><b>{r.ingredientName}</b><small>{r.supplier||'ShelfSense'} · {r.priceDate}</small></div>
              <div className="ss-right"><strong>{money(r.purchasePrice)}/{r.purchaseUnit}</strong>{r.alert?<em className="ss-pill alert">Review {pct(r.changePct)}</em>:<em className="ss-pill safe">Safe</em>}</div>
            </div>)}
            {(preview?.rows||[]).filter(r=>r.status==='new').length===0&&<div className="ss-empty">No new ShelfSense purchase costs waiting.</div>}
          </div>
        </div>}

        {tab==='mapping'&&<div className="ss-section">
          <div className="ss-section-head"><div><h3>Ingredient Mapping</h3><p>Only map items where the kitchen unit conversion is reliable. Packet, bottle and can items can stay manual until their actual content size is known.</p></div><button className="ghost" disabled={busy} onClick={autoMap}>Auto-map Exact Names</button></div>
          <input className="ss-search" placeholder="Search mappings…" value={mapSearch} onChange={e=>setMapSearch(e.target.value)}/>
          <div className="ss-map-table">
            <div className="ss-map-head"><span>Cost Control Ingredient</span><span>ShelfSense Item</span><span>Kitchen Unit</span><span>Factor</span><span></span></div>
            {mappingRows.map(m=><div className="ss-map-row" key={m.ingredient_id}><span><b>{m.ingredient_name}</b></span><span>{m.external_item_name||'—'}</span><span>{m.kitchen_unit||'—'}</span><span>{Number(m.conversion_factor||1)}</span><span><button onClick={()=>setManual(m.ingredient_id)} disabled={busy}>Use Manual</button></span></div>)}
          </div>
          {unmapped.length>0&&<div className="ss-unmapped"><h4>Unmapped ingredients</h4>{unmapped.slice(0,20).map(i=><ManualMapper key={i.id} ingredient={i} items={integration?.items||[]} onMap={mapIngredient} busy={busy}/>)}</div>}
        </div>}

        {tab==='alerts'&&<div className="ss-section">
          <div className="ss-section-head"><div><h3>Price Change Approval</h3><p>These costs differ by at least {preview?.alertThresholdPct||25}% from the latest Cost Control price. They will not import unless selected.</p></div><button className="primary" disabled={busy||alerts.length===0} onClick={sync}>{busy?'Applying…':`Sync Approved (${approved.size})`}</button></div>
          <div className="ss-alert-list">
            {alerts.map(r=><label className="ss-alert-row" key={r.sourceExternalId||r.ingredientId}>
              <input type="checkbox" checked={approved.has(String(r.sourceExternalId))} onChange={()=>toggleApproval(r.sourceExternalId)}/>
              <div className="ss-alert-main"><b>{r.ingredientName}</b><small>{r.supplier||'ShelfSense'} · {r.priceDate}</small></div>
              <div><span>Current</span><strong>{r.previousPrice!=null?`${money(r.previousPrice)} / ${r.previousQuantity} ${r.previousUnit}`:'—'}</strong></div>
              <div><span>Incoming</span><strong>{money(r.purchasePrice)} / {r.purchaseUnit}</strong></div>
              <em className={Number(r.changePct)>0?'up':'down'}>{pct(r.changePct)}</em>
            </label>)}
            {alerts.length===0&&<div className="ss-empty good">No abnormal ShelfSense price movements are waiting for approval.</div>}
          </div>
        </div>}
      </>}
    </div>
  </div>,document.body)}</>;
}

function ManualMapper({ingredient,items,onMap,busy}){
  const [item,setItem]=useState(''),[factor,setFactor]=useState('1');
  return <div className="ss-unmapped-row">
    <div><b>{ingredient.name}</b><small>Kitchen unit: {ingredient.default_unit||'—'}</small></div>
    <select value={item} onChange={e=>setItem(e.target.value)}><option value="">Select ShelfSense item…</option>{items.map(x=><option key={x.id} value={x.id}>{x.name} · {x.unit||'unit'}</option>)}</select>
    <input type="number" step="0.0001" min="0.0001" value={factor} onChange={e=>setFactor(e.target.value)} title="Conversion factor"/>
    <button disabled={busy||!item} onClick={()=>onMap(ingredient.id,item,ingredient.default_unit,factor)}>Map</button>
  </div>
}
