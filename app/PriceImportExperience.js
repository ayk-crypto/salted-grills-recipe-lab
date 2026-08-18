"use client";
import {useEffect,useState} from "react";
import * as XLSX from "xlsx";

const REQUIRED=["Ingredient Name","Purchase Qty","Purchase Unit","Purchase Price","Supplier","Price Date"];
const keyMap={
 "ingredient name":"ingredient_name","ingredient":"ingredient_name","item":"ingredient_name","name":"ingredient_name",
 "purchase qty":"purchase_quantity","purchase quantity":"purchase_quantity","qty":"purchase_quantity","quantity":"purchase_quantity",
 "purchase unit":"purchase_unit","unit":"purchase_unit",
 "purchase price":"purchase_price","price":"purchase_price","cost":"purchase_price",
 "supplier":"supplier","vendor":"supplier",
 "price date":"price_date","date":"price_date"
};
function norm(v){return String(v||"").trim().toLowerCase()}
function today(){return new Date().toISOString().slice(0,10)}
function money(v){const n=Number(v);return Number.isFinite(n)?`Rs ${n.toLocaleString(undefined,{maximumFractionDigits:2})}`:"—"}

export default function PriceImportExperience(){
 const [open,setOpen]=useState(false),[rows,setRows]=useState([]),[ingredients,setIngredients]=useState([]),[importing,setImporting]=useState(false),[result,setResult]=useState(null);
 const [history,setHistory]=useState(null),[historyRows,setHistoryRows]=useState([]),[historyLoading,setHistoryLoading]=useState(false);

 useEffect(()=>{fetch('/api/bootstrap',{cache:'no-store'}).then(r=>r.json()).then(j=>setIngredients(j.ingredients||[])).catch(()=>{})},[]);
 useEffect(()=>{
  let observer;
  function enhance(){
   const head=[...document.querySelectorAll('.page-head')].find(h=>h.querySelector('h1')?.textContent?.trim()==='Ingredients');
   if(head&&!head.dataset.importReady){
    head.dataset.importReady='1';
    const wrap=document.createElement('div');wrap.className='price-import-actions';
    const template=document.createElement('button');template.textContent='Download Template';template.className='price-template-btn';template.onclick=()=>downloadTemplate();
    const importer=document.createElement('button');importer.textContent='Import Prices';importer.className='price-import-btn';importer.onclick=()=>{setResult(null);setRows([]);setOpen(true)};
    const existing=head.querySelector(':scope > button');
    if(existing){wrap.append(template,importer,existing);head.appendChild(wrap)}else{wrap.append(template,importer);head.appendChild(wrap)}
   }
   document.querySelectorAll('.simple-modal.wide').forEach(modal=>{
    if(modal.dataset.historyReady)return;
    const name=modal.querySelector('header h2')?.textContent?.trim();
    const ingredient=ingredients.find(i=>i.name===name);
    if(!ingredient)return;
    modal.dataset.historyReady='1';
    const primary=modal.querySelector('.primary');
    const btn=document.createElement('button');btn.type='button';btn.className='price-history-btn';btn.textContent='View Price History';
    btn.onclick=()=>loadHistory(ingredient);
    if(primary)primary.insertAdjacentElement('beforebegin',btn);else modal.appendChild(btn);
   })
  }
  enhance();observer=new MutationObserver(enhance);observer.observe(document.body,{childList:true,subtree:true});return()=>observer.disconnect()
 },[ingredients]);

 function downloadTemplate(){
  if(!ingredients.length){alert('Ingredients are still loading. Please try again in a moment.');return}
  const templateRows=[...ingredients]
   .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')))
   .map(i=>({
    "Ingredient Name":i.name,
    "Purchase Qty":"",
    "Purchase Unit":i.default_unit||"",
    "Purchase Price":"",
    "Supplier":"",
    "Price Date":today()
   }));
  const ws=XLSX.utils.json_to_sheet(templateRows,{header:REQUIRED});
  ws['!cols']=[{wch:30},{wch:14},{wch:16},{wch:16},{wch:24},{wch:14}];
  ws['!freeze']={xSplit:0,ySplit:1};
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Price Updates');
  XLSX.writeFile(wb,`Salted-Grills-Ingredient-Prices-${today()}.xlsx`);
 }

 async function readFile(file){
  if(!file)return;
  setResult(null);
  try{
   const data=await file.arrayBuffer();const wb=XLSX.read(data,{type:'array',cellDates:true});const ws=wb.Sheets[wb.SheetNames[0]];
   const raw=XLSX.utils.sheet_to_json(ws,{defval:"",raw:false});
   const parsed=raw.map((r,index)=>{
    const out={_row:index+2};Object.entries(r).forEach(([k,v])=>{const mapped=keyMap[norm(k)];if(mapped)out[mapped]=v});
    if(out.price_date){const d=new Date(out.price_date);if(!Number.isNaN(d.getTime()))out.price_date=d.toISOString().slice(0,10)}
    if(!out.price_date)out.price_date=today();
    const match=ingredients.find(i=>norm(i.name)===norm(out.ingredient_name));
    out._match=match||null;out._valid=!!match&&Number(out.purchase_quantity)>0&&Number(out.purchase_price)>0&&!!String(out.purchase_unit||'').trim();
    out._status=!match?'Ingredient not found':!out._valid?'Missing/invalid value':'Ready';return out
   }).filter(r=>r.ingredient_name||r.purchase_price||r.purchase_quantity);
   setRows(parsed)
  }catch(e){alert('Could not read this file. Please use an .xlsx, .xls or .csv file.')}
 }

 async function runImport(){
  const valid=rows.filter(r=>r._valid);if(!valid.length)return;
  setImporting(true);setResult(null);
  const payload=valid.map(({_row,_match,_valid,_status,...r})=>r);
  try{const res=await fetch('/api/prices',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows:payload})});const j=await res.json();if(!res.ok)throw new Error(j.error||'Import failed');setResult(j);if(j.imported>0)setTimeout(()=>window.location.reload(),900)}catch(e){setResult({error:e.message})}finally{setImporting(false)}
 }

 async function loadHistory(ingredient){
  setHistory(ingredient);setHistoryRows([]);setHistoryLoading(true);
  try{const r=await fetch(`/api/prices?ingredient_id=${encodeURIComponent(ingredient.id)}`,{cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error);setHistoryRows(j)}catch(e){setHistoryRows([])}finally{setHistoryLoading(false)}
 }

 const ready=rows.filter(r=>r._valid).length,errors=rows.length-ready;
 return <>
  {open&&<div className="price-import-backdrop"><div className="price-import-modal"><header><div><small>PRICE MANAGEMENT</small><h2>Import Ingredient Prices</h2><p>Upload Excel or CSV. Nothing is saved until you confirm the preview.</p></div><button onClick={()=>setOpen(false)}>×</button></header>
   <div className="price-import-drop"><input type="file" accept=".xlsx,.xls,.csv" onChange={e=>readFile(e.target.files?.[0])}/><span>⇧</span><b>Choose Excel or CSV file</b><small>Supports .xlsx, .xls and .csv</small></div>
   {rows.length>0&&<><div className="price-import-stats"><div><b>{rows.length}</b><span>Rows</span></div><div className="ok"><b>{ready}</b><span>Ready</span></div><div className={errors?'bad':''}><b>{errors}</b><span>Needs attention</span></div></div>
    <div className="price-import-table-wrap"><table className="price-import-table"><thead><tr><th>Row</th><th>Ingredient</th><th>Qty</th><th>Unit</th><th>Price</th><th>Supplier</th><th>Date</th><th>Status</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i} className={r._valid?'':'invalid'}><td>{r._row}</td><td>{r.ingredient_name||'—'}</td><td>{r.purchase_quantity||'—'}</td><td>{r.purchase_unit||'—'}</td><td>{money(r.purchase_price)}</td><td>{r.supplier||'—'}</td><td>{r.price_date}</td><td><span>{r._status}</span></td></tr>)}</tbody></table></div>
    <div className="price-import-note"><b>Historical tracking is on.</b><span>Each imported row is saved as a new dated price record. Existing prices are kept for history.</span></div>
    {result&&<div className={`price-import-result ${result.error?'error':''}`}>{result.error?result.error:`Imported ${result.imported} price update${result.imported===1?'':'s'}.`}</div>}
    <footer><button className="secondary" onClick={()=>setOpen(false)}>Cancel</button><button className="primary" disabled={!ready||importing} onClick={runImport}>{importing?'Importing…':`Import ${ready} Price${ready===1?'':'s'}`}</button></footer></>}
  </div></div>}
  {history&&<div className="price-import-backdrop"><div className="price-history-modal"><header><div><small>PRICE HISTORY</small><h2>{history.name}</h2><p>Chronological purchase-price records used to understand costing changes over time.</p></div><button onClick={()=>setHistory(null)}>×</button></header>
   {historyLoading?<div className="history-empty">Loading price history…</div>:historyRows.length?<div className="history-list">{historyRows.map((r,i)=>{const unitCost=Number(r.purchase_price)/Number(r.purchase_quantity||1);return <div className="history-entry" key={r.id||i}><div className="history-dot"></div><div><b>{r.price_date}</b><span>{r.supplier||'Supplier not recorded'}</span></div><div><b>{money(Number(r.purchase_price))}</b><span>for {r.purchase_quantity} {r.purchase_unit} · {money(unitCost)}/{r.purchase_unit}</span></div>{i===0&&<em>Current</em>}</div>})}</div>:<div className="history-empty">No historical prices recorded yet.</div>}
  </div></div>}
 </>
}
