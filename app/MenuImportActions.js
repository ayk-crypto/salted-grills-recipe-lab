"use client";
import {useEffect,useMemo,useState} from "react";
import {createPortal} from "react-dom";
import {usePathname} from "next/navigation";

function parseMeta(v){try{const x=JSON.parse(v||"{}");return x&&typeof x==="object"?x:{}}catch{return {}}}

export default function MenuImportActions(){
  const path=usePathname()||"/";
  const active=path==="/menu-costing"||path==="/menu-items";
  const [target,setTarget]=useState(null);
  const [menus,setMenus]=useState([]);
  const [rows,setRows]=useState(null);
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState(null);

  useEffect(()=>{
    if(!active){setTarget(null);setRows(null);setResult(null);return;}
    let cancelled=false;
    const find=()=>{if(cancelled)return;const el=document.querySelector('.v2-head .v2-actions');if(el)setTarget(el);else requestAnimationFrame(find)};
    find();
    fetch('/api/bootstrap',{cache:'no-store'}).then(r=>r.json()).then(j=>{
      if(cancelled||j.error)return;
      setMenus((j.recipes||[]).filter(r=>r.recipe_type==='menu'));
    }).catch(()=>{});
    return()=>{cancelled=true};
  },[active]);

  async function downloadTemplate(){
    const XLSX=await import('xlsx');
    const existing=menus.map(r=>{const m=parseMeta(r.kitchen_notes);return {
      'Menu Item Name':r.name,
      'Category':r.category||'',
      'Selling Price':m.selling_price||'',
      'Target Food Cost %':m.target_food_cost||35
    }});
    const rowsOut=existing.length?existing:[{'Menu Item Name':'','Category':'','Selling Price':'','Target Food Cost %':35}];
    rowsOut.push({'Menu Item Name':'','Category':'','Selling Price':'','Target Food Cost %':35});
    const ws=XLSX.utils.json_to_sheet(rowsOut),wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'Menu Items');
    XLSX.writeFile(wb,'Salted-Grills-Menu-Items.xlsx');
  }

  async function readFile(file){
    const XLSX=await import('xlsx');
    const buf=await file.arrayBuffer(),wb=XLSX.read(buf),ws=wb.Sheets[wb.SheetNames[0]];
    const raw=XLSX.utils.sheet_to_json(ws,{defval:''});
    const parsed=raw.map(r=>({
      name:r['Menu Item Name']||r['Item Name']||r.name||'',
      category:r['Category']||r.category||'',
      selling_price:r['Selling Price']??r.selling_price??'',
      target_food_cost:r['Target Food Cost %']??r['Target Food Cost']??r.target_food_cost??35
    })).filter(r=>String(r.name||'').trim());
    setRows(parsed);setResult(null);
  }

  async function importRows(){
    if(!rows?.length)return;
    setBusy(true);
    const r=await fetch('/api/recipes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({import_type:'menu',rows})});
    const j=await r.json();
    setBusy(false);
    if(!r.ok){setResult({error:j.error||'Import failed'});return;}
    setResult(j);
    setTimeout(()=>window.location.reload(),1200);
  }

  const controls=useMemo(()=> target?createPortal(<>
    <button className="ghost" onClick={downloadTemplate}>Download Menu Template</button>
    <label className="ghost file">Import Menu Items<input type="file" accept=".xlsx,.xls,.csv" onChange={e=>e.target.files?.[0]&&readFile(e.target.files[0])}/></label>
  </>,target):null,[target,menus]);

  if(!active)return null;
  return <>{controls}{rows&&<div className="modal-bg" onMouseDown={e=>e.target===e.currentTarget&&!busy&&setRows(null)}><div className="v2-modal"><header><div><span>COST CONTROL</span><h2>Import Menu Items</h2></div><button disabled={busy} onClick={()=>setRows(null)}>×</button></header><div className="import-summary"><b>{rows.length}</b><span>menu rows ready to import</span></div><div className="preview">{rows.slice(0,10).map((r,i)=><div key={i}><b>{r.name}</b><span>{r.category||'No category'} · {r.selling_price?`Rs ${r.selling_price}`:'price blank'} · target {r.target_food_cost||35}%</span></div>)}</div>{result?.error&&<p className="bad">{result.error}</p>}{result&&!result.error&&<p className="good">Created {result.created||0} · Updated {result.updated||0} · Skipped {result.skipped||0}</p>}<button className="primary" disabled={busy||!!result&&!result.error} onClick={importRows}>{busy?'Importing...':result&&!result.error?'Imported':'Confirm Import'}</button></div></div>}</>;
}
