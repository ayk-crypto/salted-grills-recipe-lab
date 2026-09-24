"use client";
import {useEffect,useMemo,useState} from "react";
import {createPortal} from "react-dom";
import {usePathname} from "next/navigation";

function clean(v){return String(v??"").trim()}
function key(v){return clean(v).toLowerCase()}

export default function BulkRecipeImportActions(){
  const path=usePathname()||"/";
  const active=path==="/prepared-components"||path==="/bulk-recipes";
  const [target,setTarget]=useState(null);
  const [ingredients,setIngredients]=useState([]);
  const [bulkRecipes,setBulkRecipes]=useState([]);
  const [rows,setRows]=useState(null);
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState(null);

  useEffect(()=>{
    if(!active){setTarget(null);setRows(null);setResult(null);return;}
    let cancelled=false;
    const find=()=>{if(cancelled)return;const el=document.querySelector(".v2-head .v2-actions");if(el)setTarget(el);else requestAnimationFrame(find)};
    find();
    fetch("/api/bootstrap",{cache:"no-store"}).then(r=>r.json()).then(j=>{
      if(cancelled||j.error)return;
      setIngredients(j.ingredients||[]);
      setBulkRecipes((j.recipes||[]).filter(r=>r.recipe_type==="bulk"));
    }).catch(()=>{});
    return()=>{cancelled=true};
  },[active]);

  async function downloadTemplate(){
    const XLSX=await import("xlsx");
    const template=[{
      "Recipe Name":"",
      "Batch Yield":"",
      "Yield Unit":"g",
      "Component Type":"ingredient",
      "Ingredient / Bulk Recipe":"",
      "Quantity":"",
      "Unit":"g",
      "Notes":""
    }];
    const ws=XLSX.utils.json_to_sheet(template);
    ws["!cols"]=[{wch:26},{wch:14},{wch:12},{wch:18},{wch:30},{wch:12},{wch:12},{wch:28}];

    const instructions=[
      {"Field":"Recipe Name","Required":"Yes","How to use":"Repeat the same recipe name on every component row."},
      {"Field":"Batch Yield","Required":"Yes","How to use":"Usable finished batch quantity. Repeat it for each row of that recipe."},
      {"Field":"Yield Unit","Required":"Yes","How to use":"Examples: g, kg, ml, L, pc, portion."},
      {"Field":"Component Type","Required":"Yes","How to use":"Use ingredient for normal ingredients or bulk for another prepared recipe."},
      {"Field":"Ingredient / Bulk Recipe","Required":"Yes","How to use":"Must exactly match an existing PlateCost ingredient or bulk recipe name."},
      {"Field":"Quantity","Required":"Yes","How to use":"Quantity used in this batch."},
      {"Field":"Unit","Required":"Yes","How to use":"Unit used for this component."},
      {"Field":"Notes","Required":"No","How to use":"Optional kitchen/import note."}
    ];
    const wi=XLSX.utils.json_to_sheet(instructions);
    wi["!cols"]=[{wch:28},{wch:12},{wch:78}];

    const refs=[
      ...ingredients.map(i=>({"Type":"ingredient","Available Name":i.name,"Default Unit":i.default_unit||""})),
      ...bulkRecipes.map(r=>({"Type":"bulk","Available Name":r.name,"Default Unit":r.yield_unit||""}))
    ];
    const wr=XLSX.utils.json_to_sheet(refs.length?refs:[{"Type":"","Available Name":"","Default Unit":""}]);
    wr["!cols"]=[{wch:16},{wch:36},{wch:16}];

    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,"Bulk Recipes");
    XLSX.utils.book_append_sheet(wb,wi,"Instructions");
    XLSX.utils.book_append_sheet(wb,wr,"Available Components");
    XLSX.writeFile(wb,"PlateCost-Bulk-Recipe-Import-Template.xlsx");
  }

  async function readFile(file){
    const XLSX=await import("xlsx");
    const buf=await file.arrayBuffer(),wb=XLSX.read(buf);
    const sheetName=wb.SheetNames.find(n=>key(n)==="bulk recipes")||wb.SheetNames[0];
    const raw=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{defval:""});
    const parsed=raw.map((r,index)=>({
      source_row:index+2,
      recipe_name:r["Recipe Name"]||r["Bulk Recipe"]||r.recipe_name||r.name||"",
      yield_quantity:r["Batch Yield"]??r["Yield Quantity"]??r.yield_quantity??"",
      yield_unit:r["Yield Unit"]||r.yield_unit||"",
      component_type:r["Component Type"]||r.component_type||"ingredient",
      component_name:r["Ingredient / Bulk Recipe"]||r["Ingredient Name"]||r["Component Name"]||r.component_name||r.ingredient_name||"",
      quantity:r["Quantity"]??r.quantity??"",
      unit:r["Unit"]||r.unit||"",
      notes:r["Notes"]||r.notes||""
    })).filter(r=>clean(r.recipe_name)||clean(r.component_name));
    setRows(parsed);
    setResult(null);
  }

  const groups=useMemo(()=>{
    if(!rows)return[];
    const map=new Map();
    for(const row of rows){
      const k=key(row.recipe_name)||("row-"+row.source_row);
      if(!map.has(k))map.set(k,{name:clean(row.recipe_name)||"(blank recipe)",yield_quantity:row.yield_quantity,yield_unit:row.yield_unit,rows:[]});
      const g=map.get(k);g.rows.push(row);
      if(!g.yield_quantity&&row.yield_quantity)g.yield_quantity=row.yield_quantity;
      if(!g.yield_unit&&row.yield_unit)g.yield_unit=row.yield_unit;
    }
    return [...map.values()];
  },[rows]);

  async function importRows(){
    if(!rows?.length)return;
    setBusy(true);setResult(null);
    try{
      const r=await fetch("/api/recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({import_type:"bulk",rows})});
      const j=await r.json();
      setResult(r.ok?j:{error:j.error||"Import failed",details:j.details});
      if(r.ok)setTimeout(()=>window.location.reload(),1800);
    }catch(e){setResult({error:"Import failed. Please try again."})}
    finally{setBusy(false)}
  }

  const controls=useMemo(()=>target?createPortal(<>
    <button className="ghost" onClick={downloadTemplate}>Download Recipe Template</button>
    <label className="ghost file">Import Recipes<input type="file" accept=".xlsx,.xls,.csv" onChange={e=>e.target.files?.[0]&&readFile(e.target.files[0])}/></label>
  </>,target):null,[target,ingredients,bulkRecipes]);

  if(!active)return null;
  return <>{controls}{rows&&<div className="modal-bg" onMouseDown={e=>e.target===e.currentTarget&&!busy&&setRows(null)}>
    <div className="v2-modal">
      <header><div><span>COST CONTROL</span><h2>Import Bulk Recipes</h2></div><button disabled={busy} onClick={()=>setRows(null)}>×</button></header>
      <div className="import-summary"><b>{groups.length}</b><span>recipes · {rows.length} component rows ready to review</span></div>
      <div className="preview">{groups.slice(0,10).map((g,i)=><div key={i}><b>{g.name}</b><span>{g.yield_quantity||"—"} {g.yield_unit||""} yield · {g.rows.length} components</span></div>)}</div>
      {groups.length>10&&<p><small>+ {groups.length-10} more recipes</small></p>}
      {result?.error&&<p className="bad">{result.error}{result.details?(" · "+result.details):""}</p>}
      {result&&!result.error&&<><p className="good">Created {result.created||0} · Updated {result.updated||0} · Skipped {result.skipped||0}</p>{result.results?.some(x=>x.status==="skipped")&&<div className="preview">{result.results.filter(x=>x.status==="skipped").slice(0,6).map((x,i)=><div key={i}><b>{x.name||"Recipe skipped"}</b><span>{x.reason}</span></div>)}</div>}</>}
      <button className="primary" disabled={busy||!rows.length||!!result&&!result.error} onClick={importRows}>{busy?"Importing...":result&&!result.error?"Imported":"Confirm Import"}</button>
    </div>
  </div>}</>;
}
