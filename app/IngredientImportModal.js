"use client";
import {useEffect,useMemo,useState} from "react";

function inferUnit(item){
  const raw=String(item?.issueUnit||item?.unit||item?.baseUnit||item?.purchaseUnit||"").trim().toLowerCase();
  if(["kg","g","gm","gram","grams"].includes(raw))return"g";
  if(["l","ltr","liter","litre","ml"].includes(raw))return"ml";
  return"pc";
}
export default function IngredientImportModal({open,onClose,onImported,onExcel}){
  const [mode,setMode]=useState("choose"),[state,setState]=useState({loading:false,connected:null,items:[],mappings:[],error:""});
  const [q,setQ]=useState(""),[category,setCategory]=useState("all"),[selected,setSelected]=useState({}),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  async function loadShelfSense(){
    setMode("shelfsense");setState(s=>({...s,loading:true,error:""}));setMessage("");
    try{
      const r=await fetch("/api/integrations/shelfsense",{cache:"no-store"}),j=await r.json();
      if(!r.ok)throw new Error(j.error||"Could not load ShelfSense");
      setState({loading:false,connected:Boolean(j.connected),items:j.items||[],mappings:j.mappings||[],error:j.error||""});
    }catch(e){setState({loading:false,connected:false,items:[],mappings:[],error:e.message})}
  }
  useEffect(()=>{if(!open){setMode("choose");setQ("");setCategory("all");setSelected({});setMessage("")}},[open]);
  const importedIds=useMemo(()=>new Set((state.mappings||[]).filter(x=>x.source_type==="shelfsense"&&x.external_item_id).map(x=>String(x.external_item_id))),[state.mappings]);
  const categories=useMemo(()=>[...new Set((state.items||[]).map(x=>String(x.category||"Uncategorized")))].sort((a,b)=>a.localeCompare(b)),[state.items]);
  const visible=useMemo(()=>{const s=q.trim().toLowerCase();return(state.items||[]).filter(x=>category==="all"||String(x.category||"Uncategorized")===category).filter(x=>!s||((x.name||"")+" "+(x.category||"")+" "+(x.unit||"")+" "+(x.purchaseUnit||"")).toLowerCase().includes(s))},[state.items,q,category]);
  const available=(state.items||[]).filter(x=>!importedIds.has(String(x.id)));
  const selectedItems=available.filter(x=>selected[x.id]);
  function toggle(id){setSelected(s=>({...s,[id]:!s[id]}))}
  function selectVisible(){setSelected(s=>{const next={...s};for(const x of visible)if(!importedIds.has(String(x.id)))next[x.id]=true;return next})}
  function selectCategory(){if(category==="all")return selectVisible();setSelected(s=>{const next={...s};for(const x of state.items)if(String(x.category||"Uncategorized")===category&&!importedIds.has(String(x.id)))next[x.id]=true;return next})}
  function selectAll(){const next={};for(const x of available)next[x.id]=true;setSelected(next)}
  async function importSelected(items){
    if(!items.length)return;
    setBusy(true);setMessage("");
    try{
      const payload=items.map(x=>({external_item_id:x.id,kitchen_unit:inferUnit(x)}));
      const r=await fetch("/api/integrations/shelfsense/mappings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"bulk_add",items:payload})}),j=await r.json();
      if(!r.ok)throw new Error(j.error||"Could not import from ShelfSense");
      const errors=(j.results||[]).filter(x=>x.status==="error");
      setMessage(`${j.mapped||0} item(s) imported to PlateCost.${errors.length?" "+errors.length+" item(s) need attention.":""}`);
      setSelected({});
      await loadShelfSense();
      onImported?.();
    }catch(e){setMessage(e.message)}finally{setBusy(false)}
  }
  if(!open)return null;
  return <div className="ingredient-import-bg" onMouseDown={e=>e.target===e.currentTarget&&onClose?.()}><div className="ingredient-import-modal">
    <header><div><span>IMPORT INGREDIENTS</span><h2>{mode==="choose"?"Choose import source":mode==="excel"?"Import from Excel":"Import from ShelfSense"}</h2></div><button onClick={onClose}>×</button></header>
    {message&&<div className="ingredient-import-message">{message}</div>}
    {mode==="choose"&&<div className="ingredient-import-choices">
      <button onClick={()=>setMode("excel")}><b>Excel File</b><span>Upload an .xlsx, .xls or .csv ingredient list.</span><em>Choose Excel →</em></button>
      <button onClick={loadShelfSense}><b>ShelfSense</b><span>Browse the connected ShelfSense inventory and choose exactly what belongs in PlateCost.</span><em>Browse ShelfSense →</em></button>
    </div>}
    {mode==="excel"&&<div className="ingredient-excel-import"><p>Select your ingredient file. Existing ingredient names will be updated; new names will be added.</p><label className="ingredient-file-drop"><b>Choose Excel / CSV file</b><span>.xlsx, .xls or .csv</span><input type="file" accept=".xlsx,.xls,.csv" onChange={e=>{const file=e.target.files?.[0];if(file){onExcel?.(file);onClose?.()}}}/></label><button className="ghost" onClick={()=>setMode("choose")}>← Back</button></div>}
    {mode==="shelfsense"&&<div className="ingredient-shelf-import">
      {state.loading?<div className="ingredient-import-empty">Loading ShelfSense inventory…</div>:!state.connected?<div className="ingredient-not-connected"><b>ShelfSense is not connected</b><p>Connect this workspace to ShelfSense first, then return here to import inventory items.</p><div><button className="ghost" onClick={()=>setMode("choose")}>← Back</button><button className="primary" onClick={()=>{window.location.href="/settings"}}>Open Settings</button></div></div>:<>
        <div className="ingredient-import-summary"><div><small>SHELFENSE ITEMS</small><b>{state.items.length}</b></div><div><small>ALREADY IMPORTED</small><b>{importedIds.size}</b></div><div><small>AVAILABLE</small><b>{available.length}</b></div><div><small>SELECTED</small><b>{selectedItems.length}</b></div></div>
        <div className="ingredient-import-tools"><input placeholder="Search item, category or unit…" value={q} onChange={e=>setQ(e.target.value)}/><select value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All categories</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
        <div className="ingredient-select-actions"><button onClick={selectVisible}>Select visible</button><button onClick={selectCategory}>Select category</button><button onClick={selectAll}>Select all available</button><button onClick={()=>setSelected({})}>Clear</button></div>
        <div className="ingredient-import-list"><div className="ingredient-import-row head"><span></span><span>Item</span><span>Category</span><span>ShelfSense Unit</span><span>Recipe Unit</span><span>Status</span></div>{visible.map(x=>{const imported=importedIds.has(String(x.id));return <label className={"ingredient-import-row "+(imported?"imported":"")} key={x.id}><span><input type="checkbox" disabled={imported} checked={Boolean(selected[x.id])} onChange={()=>toggle(x.id)}/></span><span><b>{x.name}</b></span><span>{x.category||"Uncategorized"}</span><span>{x.purchaseUnit||x.unit||"—"} → {x.unit||"—"}</span><span>{inferUnit(x)}</span><span>{imported?"Imported":"Available"}</span></label>})}</div>
        <footer><div><b>{selectedItems.length} selected</b><span>Import All adds every ShelfSense item not already in PlateCost.</span></div><div><button className="ghost" onClick={()=>setMode("choose")}>← Back</button><button className="ghost" disabled={busy||!available.length} onClick={()=>importSelected(available)}>{busy?"Importing…":"Import All ("+available.length+")"}</button><button className="primary" disabled={busy||!selectedItems.length} onClick={()=>importSelected(selectedItems)}>{busy?"Importing…":"Import Selected ("+selectedItems.length+")"}</button></div></footer>
      </>}
    </div>}
  </div></div>
}
