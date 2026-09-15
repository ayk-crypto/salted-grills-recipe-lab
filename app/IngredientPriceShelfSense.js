"use client";
import {useEffect,useMemo,useState} from "react";
import {createPortal} from "react-dom";
import {usePathname} from "next/navigation";

const money=n=>Number.isFinite(Number(n))?`Rs ${Number(n).toLocaleString(undefined,{maximumFractionDigits:2})}`:'—';
const norm=v=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ');
const receiptDate=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})};
function unitInfo(unit){
  const u=norm(unit);
  if(u==='kg')return['weight',1000];
  if(['g','gm','gram','grams'].includes(u))return['weight',1];
  if(['l','ltr','liter','litre'].includes(u))return['volume',1000];
  if(u==='ml')return['volume',1];
  if(['pc','pcs','piece','pieces','portion','portions','each'].includes(u))return['count',1];
  return[u||'other',1];
}
function conversionFactor(fromUnit,toUnit){
  const from=unitInfo(fromUnit),to=unitInfo(toUnit);
  if(from[0]!==to[0])return null;
  return to[1]/from[1];
}

export default function IngredientPriceShelfSense(){
  const path=usePathname()||'';
  const [target,setTarget]=useState(null),[ingredientName,setIngredientName]=useState('');
  const [state,setState]=useState({loading:false,error:'',integration:null,bootstrap:null,preview:null});
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');

  useEffect(()=>{
    if(!path.startsWith('/ingredients')){setTarget(null);setIngredientName('');return}
    let mounted=true,host=null;
    const scan=()=>{
      if(!mounted)return;
      const modal=document.querySelector('.v2-modal');
      const h2=modal?.querySelector('header h2');
      const text=h2?.textContent||'';
      if(!modal||!text.startsWith('Record Price · ')){
        if(host?.isConnected)host.remove();
        host=null;setTarget(null);setIngredientName('');return;
      }
      const name=text.replace('Record Price · ','').trim();
      const form=modal.querySelector('form');
      if(!form)return;
      if(!host||!host.isConnected){
        host=document.createElement('div');host.className='ingredient-price-ss-host';
        form.parentNode.insertBefore(host,form);
      }
      setTarget(host);setIngredientName(name);
    };
    scan();
    const observer=new MutationObserver(scan);
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
    return()=>{mounted=false;observer.disconnect();if(host?.isConnected)host.remove()}
  },[path]);

  async function load(){
    if(!ingredientName)return;
    setState(s=>({...s,loading:true,error:''}));setMessage('');
    try{
      const [integration,bootstrap,preview]=await Promise.all([
        fetch('/api/integrations/shelfsense',{cache:'no-store'}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error||'ShelfSense unavailable');return j}),
        fetch('/api/bootstrap',{cache:'no-store'}).then(r=>r.json()),
        fetch('/api/integrations/shelfsense/sync',{cache:'no-store'}).then(r=>r.json()),
      ]);
      setState({loading:false,error:'',integration,bootstrap,preview});
    }catch(e){setState({loading:false,error:e.message||'Could not load ShelfSense',integration:null,bootstrap:null,preview:null})}
  }
  useEffect(()=>{if(target&&ingredientName)load()},[target,ingredientName]);

  const ingredient=useMemo(()=>state.bootstrap?.ingredients?.find(i=>norm(i.name)===norm(ingredientName)),[state.bootstrap,ingredientName]);
  const row=useMemo(()=>state.preview?.rows?.find(r=>ingredient&&String(r.ingredientId)===String(ingredient.id)),[state.preview,ingredient]);
  const mapping=useMemo(()=>state.integration?.mappings?.find(m=>ingredient&&String(m.ingredient_id)===String(ingredient.id)&&m.source_type==='shelfsense'),[state.integration,ingredient]);
  const exactItem=useMemo(()=>state.integration?.items?.find(i=>norm(i.name)===norm(ingredientName)),[state.integration,ingredientName]);
  const quickFactor=useMemo(()=>ingredient&&exactItem?conversionFactor(exactItem.unit||exactItem.issueUnit,ingredient.default_unit):null,[ingredient,exactItem]);

  async function syncRow(r){
    if(!r?.sourceExternalId)return;
    setBusy(true);setMessage('');
    try{
      const res=await fetch('/api/integrations/shelfsense/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({selectedSourceIds:[String(r.sourceExternalId)],acceptedSourceIds:[String(r.sourceExternalId)]})});
      const j=await res.json();
      if(!res.ok)throw new Error(j.error||'Sync failed');
      if(j.blockedConversions)throw new Error('ShelfSense conversion needs review before this price can be synced.');
      setMessage(j.imported?`Synced ${j.imported} ShelfSense price.`:'ShelfSense price is already up to date.');
      setTimeout(()=>window.location.reload(),650);
    }catch(e){setMessage(e.message||'Sync failed');setBusy(false)}
  }

  async function mapAndSync(){
    if(!ingredient||!exactItem||!quickFactor)return;
    setBusy(true);setMessage('');
    try{
      const mapRes=await fetch('/api/integrations/shelfsense/mappings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ingredient_id:ingredient.id,source_type:'shelfsense',external_item_id:exactItem.id,kitchen_unit:ingredient.default_unit,conversion_factor:quickFactor})});
      const mapJson=await mapRes.json();if(!mapRes.ok)throw new Error(mapJson.error||'Could not map ShelfSense item');
      const pRes=await fetch('/api/integrations/shelfsense/sync',{cache:'no-store'});const p=await pRes.json();
      const next=p.rows?.find(r=>String(r.ingredientId)===String(ingredient.id));
      if(!next)throw new Error('ShelfSense mapping saved, but no purchase cost is available yet.');
      if(next.conversionWarning)throw new Error(`Mapped, but conversion needs review: ${(next.conversionReasons||[]).join(', ')||'unit conversion is inconsistent'}.`);
      await syncRow(next);
    }catch(e){setMessage(e.message||'Could not sync ShelfSense price');setBusy(false)}
  }

  if(!target)return null;
  let body=null;
  if(state.loading)body=<div className="ipss-loading">Checking ShelfSense…</div>;
  else if(state.error||!state.integration?.connected)body=<div className="ipss-note">ShelfSense is not available for this ingredient right now.</div>;
  else if(row){
    const status=row.conversionWarning?'Check conversion':row.status==='new'?(row.alert?'Price review required':'New price available'):row.status==='unchanged'?'Up to date':'No ShelfSense cost';
    body=<div className="ipss-card">
      <div className="ipss-top"><div><span>SHELFSENSE</span><b>{status}</b><small>Receipt date: {receiptDate(row.priceDate)}</small></div>{row.status==='new'&&!row.conversionWarning&&<button type="button" className="ipss-sync" disabled={busy} onClick={()=>syncRow(row)}>{busy?'Syncing…':'Sync Price'}</button>}</div>
      <div className="ipss-grid">
        <div><small>Purchase / Receipt</small><strong>{row.sourceEnteredQty!=null?`${row.sourceEnteredQty} ${row.sourceEnteredUnit||row.sourcePurchaseUnit||''}`:(row.sourcePurchaseUnit||'—')}</strong><em>{row.sourcePurchaseFactor&&row.sourcePurchaseUnit!==row.sourceBaseUnit?`1 ${row.sourcePurchaseUnit} = ${row.sourcePurchaseFactor} ${row.sourceBaseUnit}`:'Source receipt unit'}</em>{row.sourceReceiptTotal!=null&&<em>Receipt value ≈ {money(row.sourceReceiptTotal)} · {receiptDate(row.priceDate)}</em>}</div>
        <div><small>Issue Unit</small><strong>{row.sourceIssueUnit||'—'}</strong><em>Kitchen issue</em></div>
        <div><small>Costing Unit</small><strong>{money(row.purchasePrice)} / {row.purchaseUnit||ingredient?.default_unit||'—'}</strong><em>From receipt dated {receiptDate(row.priceDate)}</em></div>
      </div>
      {row.conversionWarning&&<div className="ipss-warning">⚠ {(row.conversionReasons||[]).join(' · ')||'ShelfSense unit conversion needs review.'} Use the manual form below until corrected.</div>}
      {row.alert&&row.status==='new'&&!row.conversionWarning&&<div className="ipss-warning">Price changed {Number(row.changePct).toFixed(1)}% from the current Cost Control price. Review before syncing.</div>}
    </div>;
  }else if(!mapping&&exactItem&&quickFactor){
    body=<div className="ipss-card"><div className="ipss-top"><div><span>SHELFSENSE</span><b>Exact item found</b><small>{exactItem.name} · buy {exactItem.purchaseUnit||exactItem.unit||'—'} · issue {exactItem.issueUnit||exactItem.unit||'—'}</small></div><button type="button" className="ipss-sync" disabled={busy} onClick={mapAndSync}>{busy?'Working…':'Map & Sync'}</button></div><div className="ipss-note">This ingredient is not mapped yet. The exact ShelfSense name matches, so you can map it here and pull its latest price.</div></div>;
  }else if(!mapping){
    body=<div className="ipss-card"><div className="ipss-top"><div><span>SHELFSENSE</span><b>Not mapped</b></div></div><div className="ipss-note">No safe exact ShelfSense match was found. Keep this price manual or map the ingredient from Purchase Prices → ShelfSense.</div></div>;
  }else body=<div className="ipss-note">No ShelfSense purchase cost is available for this mapped ingredient.</div>;

  return createPortal(<div className="ipss-wrap"><div className="ipss-divider"><span>Use ShelfSense or enter manually</span></div>{body}{message&&<div className={message.toLowerCase().includes('synced')?'ipss-success':'ipss-message'}>{message}</div>}<div className="ipss-manual-label">Manual price entry</div></div>,target);
}
