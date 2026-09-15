"use client";
import {useEffect,useMemo,useState} from "react";
import {createPortal} from "react-dom";
import {usePathname} from "next/navigation";

const PACKAGE_UNITS=['can','jar','bottle','bag','packet','pack','carton','tin','tub','tray','box'];
const norm=v=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ');
const qty=n=>Number.isFinite(Number(n))?Number(n).toLocaleString(undefined,{maximumFractionDigits:3}):'—';
const money=n=>Number.isFinite(Number(n))?`Rs ${Number(n).toLocaleString(undefined,{maximumFractionDigits:3})}`:'—';
function unitInfo(unit){
  const u=norm(unit);
  if(u==='kg')return['weight',1000,'g'];
  if(['g','gm','gram','grams'].includes(u))return['weight',1,'g'];
  if(['l','ltr','liter','litre'].includes(u))return['volume',1000,'ml'];
  if(u==='ml')return['volume',1,'ml'];
  if(['pc','pcs','piece','pieces','each'].includes(u))return['count',1,'pc'];
  return[u||'other',1,u||'other'];
}
function direct(from,to){const a=unitInfo(from),b=unitInfo(to);return['weight','volume','count'].includes(a[0])&&a[0]===b[0]}
function fmtDate(v){if(!v)return'';const d=new Date(v);return Number.isNaN(d.getTime())?String(v).slice(0,10):d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}

export default function CostingConversionUX(){
  const path=usePathname()||'';
  const [host,setHost]=useState(null),[ingredientName,setIngredientName]=useState(''),[purchaseUnit,setPurchaseUnit]=useState('');
  const [bootstrap,setBootstrap]=useState(null),[usable,setUsable]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');

  useEffect(()=>{
    if(!path.startsWith('/ingredients')){setHost(null);return}
    let stopped=false,observer=null,form=null,select=null,localHost=null;
    const onUnit=()=>{if(select)setPurchaseUnit(select.value)};
    const scan=()=>{
      if(stopped)return;
      const modal=document.querySelector('.v2-modal'),title=modal?.querySelector('header h2')?.textContent||'';
      if(!modal||!title.startsWith('Record Price · ')){
        if(localHost?.isConnected)localHost.remove();
        localHost=null;setHost(null);setIngredientName('');return;
      }
      const name=title.replace('Record Price · ','').trim();
      form=modal.querySelector('form');select=form?.querySelector('select[name="purchase_unit"]');
      if(select){
        PACKAGE_UNITS.forEach(u=>{if(![...select.options].some(o=>norm(o.value)===u)){const o=document.createElement('option');o.value=u;o.textContent=u;select.appendChild(o)}});
        select.removeEventListener('change',onUnit);select.addEventListener('change',onUnit);
      }
      if(!localHost||!localHost.isConnected){
        localHost=document.createElement('div');localHost.className='costing-conversion-host';
        if(form)form.parentNode.insertBefore(localHost,form);
      }
      setHost(localHost);setIngredientName(name);
      if(select)setPurchaseUnit(select.value);
    };
    scan();observer=new MutationObserver(scan);observer.observe(document.body,{subtree:true,childList:true});
    return()=>{stopped=true;observer.disconnect();if(select)select.removeEventListener('change',onUnit);if(localHost?.isConnected)localHost.remove()}
  },[path]);

  async function load(){
    if(!ingredientName)return;
    const j=await fetch('/api/bootstrap',{cache:'no-store'}).then(r=>r.json()).catch(()=>null);
    if(j)setBootstrap(j);
  }
  useEffect(()=>{if(host&&ingredientName)load()},[host,ingredientName]);

  const ingredient=useMemo(()=>bootstrap?.ingredients?.find(i=>norm(i.name)===norm(ingredientName)),[bootstrap,ingredientName]);
  const latestPurchaseUnit=ingredient?.latest_price?.display_purchase_unit||ingredient?.latest_price?.source_purchase_unit||'';
  const activePurchaseUnit=useMemo(()=>{
    if(latestPurchaseUnit&&!direct(latestPurchaseUnit,ingredient?.default_unit))return norm(latestPurchaseUnit);
    return norm(purchaseUnit||latestPurchaseUnit||ingredient?.default_unit);
  },[purchaseUnit,latestPurchaseUnit,ingredient]);
  const conversion=useMemo(()=>ingredient?.costing_conversions?.find(c=>norm(c.purchase_unit)===activePurchaseUnit),[ingredient,activePurchaseUnit]);
  const needsYield=ingredient&&activePurchaseUnit&&!direct(activePurchaseUnit,ingredient.default_unit);
  useEffect(()=>{setUsable(conversion?.usable_quantity?String(conversion.usable_quantity):'');setMessage('')},[conversion?.id,activePurchaseUnit]);

  async function save(){
    if(!ingredient||!activePurchaseUnit||!(Number(usable)>0))return;
    setBusy(true);setMessage('');
    const r=await fetch('/api/costing-conversions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ingredient_id:ingredient.id,purchase_unit:activePurchaseUnit,usable_quantity:Number(usable),costing_unit:ingredient.default_unit,source:ingredient.latest_price?.source==='shelfsense'?'shelfsense':'manual'})});
    const j=await r.json();
    if(!r.ok){setMessage(j.error||'Could not save yield');setBusy(false);return}
    setMessage('Saved. Costing will now use the usable yield.');
    setBusy(false);setTimeout(()=>window.location.reload(),500);
  }

  useEffect(()=>{
    if(!path.startsWith('/purchase-prices'))return;
    let stopped=false,observer=null,raf=0,data=null;
    const patch=()=>{
      if(stopped||!data)return;
      const table=document.querySelector('.v2-table.prices');if(!table)return;
      const used=new Set();
      table.querySelectorAll(':scope > .trow').forEach(row=>{
        const c=row.children;if(!c||c.length<6)return;
        const date=String(c[0]?.textContent||'').slice(0,10),name=norm(c[1]?.textContent);
        const idx=(data.prices||[]).findIndex((x,i)=>!used.has(i)&&norm(x.ingredient_name)===name&&String(x.price_date||'').slice(0,10)===date);
        if(idx<0)return;used.add(idx);const p=data.prices[idx];
        const cell=c[4];
        if(p.costing_status==='needs_yield'){
          cell.innerHTML='<em class="costing-needs-yield">Needs yield</em><small class="source-purchase-meta">Set usable quantity first</small>';
        }else if(Number.isFinite(Number(p.normalized_cost))){
          cell.innerHTML='';const b=document.createElement('span');b.className='source-purchase-value';b.textContent=`${money(p.normalized_cost)}/${p.normalized_unit||''}`;cell.appendChild(b);
        }
      });
    };
    fetch('/api/bootstrap',{cache:'no-store'}).then(r=>r.json()).then(j=>{data=j;patch();observer=new MutationObserver(()=>{if(!raf)raf=requestAnimationFrame(()=>{raf=0;patch()})});observer.observe(document.body,{subtree:true,childList:true,characterData:true})}).catch(()=>{});
    return()=>{stopped=true;if(observer)observer.disconnect();if(raf)cancelAnimationFrame(raf)}
  },[path]);

  if(!host||!ingredient)return null;
  const directInfo=direct(activePurchaseUnit,ingredient.default_unit);
  return createPortal(<div className={`costing-conversion-box ${needsYield&&!conversion?'needs-setup':''}`}>
    <div className="costing-conversion-head"><div><span>COSTING CONVERSION</span><b>{directInfo?'Automatic':'Usable yield'}</b></div>{conversion&&<em>Saved</em>}</div>
    {directInfo?<p><strong>{activePurchaseUnit}</strong> converts automatically to <strong>{ingredient.default_unit}</strong>. No setup needed.</p>:<>
      <p>Tell Cost Control only one thing: how much usable product you actually get from <strong>1 {activePurchaseUnit||'purchase unit'}</strong>.</p>
      <div className="costing-yield-line"><span>1 {activePurchaseUnit}</span><span>=</span><input type="number" min="0" step="0.01" value={usable} onChange={e=>setUsable(e.target.value)} placeholder="Usable qty"/><b>{ingredient.default_unit} usable</b><button type="button" onClick={save} disabled={busy||!(Number(usable)>0)}>{busy?'Saving…':conversion?'Update':'Save Yield'}</button></div>
      {!conversion&&<small>Until this is set, Cost Control will keep the purchase price but will not calculate a per-{ingredient.default_unit} recipe cost.</small>}
      {conversion&&<small>Costing rule: 1 {activePurchaseUnit} = {qty(conversion.usable_quantity)} {conversion.costing_unit} usable.</small>}
    </>}
    {ingredient.latest_price?.display_purchase_price!=null&&<div className="costing-conversion-context">Latest purchase: {money(ingredient.latest_price.display_purchase_price)} / {qty(ingredient.latest_price.display_purchase_quantity)} {ingredient.latest_price.display_purchase_unit}{ingredient.latest_price.price_date?` · ${fmtDate(ingredient.latest_price.price_date)}`:''}</div>}
    {message&&<div className="costing-conversion-message">{message}</div>}
  </div>,host);
}
