"use client";
// Deployment refresh: integrated menu costing tabs, packaging and channel costs.
import {useEffect,useMemo,useRef,useState} from "react";
import {usePathname,useRouter} from "next/navigation";

const U=['g','kg','ml','L','pc','portion','pack'];
const money=n=>Number.isFinite(Number(n))?`Rs ${Number(n).toLocaleString(undefined,{maximumFractionDigits:2})}`:'—';
const pct=n=>Number.isFinite(Number(n))?`${Number(n).toFixed(1)}%`:'—';
function unitInfo(unit){const u=String(unit||'').trim().toLowerCase();if(u==='kg')return['weight',1000];if(['g','gm','gram','grams'].includes(u))return['weight',1];if(['l','ltr','liter','litre'].includes(u))return['volume',1000];if(u==='ml')return['volume',1];if(['pc','pcs','piece','pieces','portion','portions','each'].includes(u))return['count',1];return[u||'other',1]}
function baseQty(q,u){return Number(q||0)*unitInfo(u)[1]}
function parseMeta(v){if(!v)return{};if(typeof v==='object')return v;try{const x=JSON.parse(v||'{}');return typeof x==='object'&&x?x:{}}catch{return {}}}
function cx(...a){return a.filter(Boolean).join(' ')}

export default function CostControlApp(){
 const router=useRouter(),path=usePathname()||'/';
 const [data,setData]=useState({ingredients:[],categories:[],recipes:[],units:[],prices:[]}),[snapshots,setSnapshots]=useState([]),[costModel,setCostModel]=useState({tax_enabled:false,tax_rate:0,prices_include_tax:true,payment_fee_pct:0,delivery_commission_pct:0,other_variable_pct:0,packaging_per_order:0,monthly_overheads:[],monthly_sales_basis:0}),[workspaceName,setWorkspaceName]=useState('Workspace');
 const [loading,setLoading]=useState(true),[q,setQ]=useState(''),[modal,setModal]=useState(null),[toast,setToast]=useState('');
 const [editor,setEditor]=useState(null),[saving,setSaving]=useState(false),[editorTab,setEditorTab]=useState("food");
 const ingredients=data.ingredients||[], recipeIngredients=(data.ingredients||[]).filter(i=>!/(packag|disposable|stationery|admin|cleaning|chemical)/i.test(String(i.ingredient_category||''))), prepared=(data.recipes||[]).filter(r=>r.recipe_type==='bulk'), menus=(data.recipes||[]).filter(r=>r.recipe_type==='menu');
 const units=[...new Set([...(data.units||[]).map(x=>x.symbol).filter(Boolean),...U])];
 async function load(){setLoading(true);try{const [r,sr,cr]=await Promise.all([fetch('/api/bootstrap',{cache:'no-store'}),fetch('/api/costing-snapshots',{cache:'no-store'}),fetch('/api/cost-model',{cache:'no-store'})]);const [j,sj,cj]=await Promise.all([r.json(),sr.json(),cr.json()]);if(!j.error)setData(j);if(!sj.error)setSnapshots(sj.snapshots||[]);if(!cj.error&&cj.model)setCostModel(cj.model);if(cj?.tenant?.name)setWorkspaceName(cj.tenant.name)}finally{setLoading(false)}}
 useEffect(()=>{load();const refreshCosting=()=>load(),storageRefresh=e=>{if(e.key==='platecost:costing-updated')load()};window.addEventListener('platecost:costing-updated',refreshCosting);window.addEventListener('storage',storageRefresh);return()=>{window.removeEventListener('platecost:costing-updated',refreshCosting);window.removeEventListener('storage',storageRefresh)}},[]);
 useEffect(()=>{setQ('');setModal(null)},[path]);
 useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),2600);return()=>clearTimeout(t)},[toast]);

 function currentSection(){if(path.startsWith('/ingredients'))return'ingredients';if(path.startsWith('/purchase-prices'))return'prices';if(path.startsWith('/prepared-components')||path.startsWith('/bulk-recipes'))return'prepared';if(path.startsWith('/menu-costing')||path.startsWith('/menu-items'))return'menu';if(path.startsWith('/cost-analysis'))return'analysis';if(path.startsWith('/categories'))return'categories';return'dashboard'}
 const section=currentSection();
 function go(s){const m={dashboard:'/',ingredients:'/ingredients',prices:'/purchase-prices',prepared:'/prepared-components',packaging:'/packaging',menu:'/menu-costing',analysis:'/cost-analysis',categories:'/categories',settings:'/settings'};router.push(m[s])}

 function ingredientCostInfo(i,qty,unit){if(!i)return{cost:NaN,status:'Ingredient missing',effectiveUnit:unit};const p=i.latest_price;if(!p)return{cost:NaN,status:'No source price',effectiveUnit:unit};if(p.costing_status==='needs_yield')return{cost:NaN,status:'Needs yield',effectiveUnit:unit};const a=unitInfo(p.purchase_unit),requested=unitInfo(unit),preferred=unitInfo(i.default_unit);let effectiveUnit=unit,note='';if(a[0]!==requested[0]){if(a[0]===preferred[0]){effectiveUnit=i.default_unit;note='Using '+i.default_unit+'; '+unit+' is incompatible'}else return{cost:NaN,status:'Unit mismatch: use '+(i.default_unit||p.purchase_unit),effectiveUnit:unit}}const purchased=baseQty(p.purchase_quantity,p.purchase_unit),used=baseQty(qty,effectiveUnit);const cost=purchased>0&&Number.isFinite(Number(p.purchase_price))?Number(p.purchase_price)*(used/purchased):NaN;const baseUnit=a[0]==='weight'?'g':a[0]==='volume'?'ml':a[0]==='count'?'pc':p.purchase_unit;const rate=purchased>0?Number(p.purchase_price)/purchased:NaN;return{cost,status:Number.isFinite(cost)?'Ready':'Cost unavailable',effectiveUnit,note,rate,baseUnit}}
 function ingredientCost(i,qty,unit){return ingredientCostInfo(i,qty,unit).cost}
 function recipeCost(r,stack=[]){if(!r||stack.includes(r.id))return NaN;let total=0;for(const c of r.components_summary||[]){let v=NaN;if(c.ingredient_id)v=ingredientCost(ingredients.find(i=>i.id===c.ingredient_id),c.quantity,c.unit);else if(c.bulk_recipe_id){const b=prepared.find(x=>x.id===c.bulk_recipe_id),bc=recipeCost(b,[...stack,r.id]);if(Number.isFinite(bc)&&Number(b?.yield_quantity)>0&&unitInfo(b.yield_unit)[0]===unitInfo(c.unit)[0])v=bc*(baseQty(c.quantity,c.unit)/baseQty(b.yield_quantity,b.yield_unit))}if(!Number.isFinite(v))return NaN;total+=v}return total}
 function menuStats(r){const cost=recipeCost(r),legacy=parseMeta(r.kitchen_notes),sell=Number(r.selling_price??legacy.selling_price??0),target=Number(r.target_food_cost??legacy.target_food_cost??35),tax=costModel.tax_enabled?Number(costModel.tax_rate||0):0,netRevenue=sell>0?(costModel.tax_enabled&&costModel.prices_include_tax?sell/(1+tax/100):sell):0,variablePct=Number(costModel.payment_fee_pct||0)+Number(costModel.delivery_commission_pct||0)+Number(costModel.other_variable_pct||0),packagingCost=r?.packaging_set?Number(r.packaging_set.total_cost||0):Number(costModel.packaging_per_order||0),variableCost=netRevenue*variablePct/100+packagingCost,overheadTotal=(costModel.monthly_overheads||[]).reduce((a,x)=>a+Number(x.amount||0),0),overheadRate=Number(costModel.monthly_sales_basis||0)>0?overheadTotal/Number(costModel.monthly_sales_basis):0,overhead=netRevenue*overheadRate,contribution=sell>0&&Number.isFinite(cost)?sell-cost:NaN,operatingContribution=netRevenue>0&&Number.isFinite(cost)?netRevenue-cost-variableCost-overhead:NaN;return{cost,sell,target,food:netRevenue>0&&Number.isFinite(cost)?cost/netRevenue*100:NaN,contribution,netRevenue,variableCost,overhead,operatingContribution}}
 function unitRate(i){const p=i.latest_price;if(!p)return NaN;const qty=baseQty(p.purchase_quantity,p.purchase_unit);return qty?Number(p.purchase_price)/qty:NaN}
 function priceChange(i){const a=i.latest_price,b=i.previous_price;if(!a||!b)return NaN;const ar=Number(a.purchase_price)/baseQty(a.purchase_quantity,a.purchase_unit),br=Number(b.purchase_price)/baseQty(b.purchase_quantity,b.purchase_unit);return br?((ar-br)/br*100):NaN}

 async function remove(type,item){if(!confirm(`Delete ${item.name}?`))return;let url,opt={method:'DELETE',headers:{'Content-Type':'application/json'}};if(type==='ingredient'){url='/api/ingredients';opt.body=JSON.stringify({id:item.id})}else if(type==='category'){url='/api/categories';opt.body=JSON.stringify({id:item.id})}else url=`/api/recipes/${item.id}`;const r=await fetch(url,opt),j=await r.json();if(!r.ok)return alert(j.error||'Could not delete');setToast('Deleted');await load();setModal(null);if(type==='prepared')router.push('/prepared-components');if(type==='menu')router.push('/menu-costing')}
 async function saveIngredient(e){e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));if(modal?.item)b.id=modal.item.id;const r=await fetch('/api/ingredients',{method:modal?.item?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}),j=await r.json();if(!r.ok)return alert(j.error);setModal(null);setToast(modal?.item?'Ingredient updated':'Ingredient added');await load()}
 async function savePrice(e){e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));b.ingredient_id=modal.item.id;const r=await fetch('/api/prices',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}),j=await r.json();if(!r.ok)return alert(j.error);setModal(null);setToast('Purchase price recorded');await load()}
 async function saveCategory(e){e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));const r=await fetch('/api/categories',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}),j=await r.json();if(!r.ok)return alert(j.error);setModal(null);setToast('Category added');await load()}

 async function downloadIngredientTemplate(){const XLSX=await import('xlsx');const rows=ingredients.length?ingredients.map(i=>({'Ingredient Name':i.name,'Default Unit':i.default_unit||'g','Type':i.ingredient_type||'raw','Notes':i.notes||''})):[{'Ingredient Name':'','Default Unit':'g','Type':'raw','Notes':''}];rows.push({'Ingredient Name':'','Default Unit':'g','Type':'raw','Notes':''});const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Ingredients');XLSX.writeFile(wb,'Salted-Grills-Ingredients.xlsx')}
 async function downloadPriceTemplate(){const XLSX=await import('xlsx');const today=new Date().toISOString().slice(0,10);const rows=ingredients.map(i=>({'Ingredient Name':i.name,'Purchase Qty':'','Purchase Unit':i.latest_price?.purchase_unit||i.default_unit||'g','Purchase Price':'','Supplier':'','Price Date':today}));const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Purchase Prices');XLSX.writeFile(wb,'Salted-Grills-Purchase-Prices.xlsx')}
 async function readExcel(file,type){const XLSX=await import('xlsx');const buf=await file.arrayBuffer(),wb=XLSX.read(buf),ws=wb.Sheets[wb.SheetNames[0]],raw=XLSX.utils.sheet_to_json(ws,{defval:''});if(type==='ingredients'){const rows=raw.map(r=>({name:r['Ingredient Name']||r.name,default_unit:r['Default Unit']||r.default_unit||'g',ingredient_type:r['Type']||r.type||'raw',notes:r['Notes']||r.notes||''})).filter(r=>String(r.name||'').trim());setModal({type:'importIngredients',rows})}else{const rows=raw.map(r=>({ingredient_name:r['Ingredient Name']||r.ingredient_name,purchase_quantity:r['Purchase Qty']||r.purchase_quantity,purchase_unit:r['Purchase Unit']||r.purchase_unit,purchase_price:r['Purchase Price']||r.purchase_price,supplier:r['Supplier']||r.supplier,price_date:r['Price Date']||r.price_date})).filter(r=>String(r.ingredient_name||'').trim());setModal({type:'importPrices',rows})}}
 async function confirmImport(){const isIng=modal.type==='importIngredients',url=isIng?'/api/ingredients':'/api/prices';const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows:modal.rows})}),j=await r.json();if(!r.ok)return alert(j.error||'Import failed');setModal(null);setToast(isIng?`Ingredients imported: ${j.created||0} new, ${j.updated||0} updated`:`Prices imported: ${j.imported||0}`);await load()}


 async function startEditor(type,r=null){
  let source=r;
  if(r?.id){
   try{const response=await fetch(`/api/recipes/${r.id}`,{cache:'no-store'});const full=await response.json();if(response.ok)source=full}catch{}
  }
  const meta=parseMeta(source?.kitchen_notes),rawComponents=source?.components||source?.components_summary||[];
  setEditorTab('food');
  setEditor({
   id:source?.id||null,type,name:source?.name||'',category:source?.category||'',
   yield_quantity:source?.yield_quantity||'',yield_unit:source?.yield_unit||'g',
   selling_price:source?.selling_price??meta.selling_price??'',target_food_cost:source?.target_food_cost??meta.target_food_cost??35,
   delivery_commission_pct:source?.delivery_commission_pct??meta.delivery_commission_pct??costModel.delivery_commission_pct??0,
   payment_fee_pct:source?.payment_fee_pct??meta.payment_fee_pct??costModel.payment_fee_pct??0,
   other_variable_pct:source?.other_variable_pct??meta.other_variable_pct??costModel.other_variable_pct??0,
   delivery_fixed_cost:source?.delivery_fixed_cost??meta.delivery_fixed_cost??0,
   cost_order_type:'takeaway',
   packaging:(source?.packaging||[]).map(p=>({order_type:p.order_type,packaging_item_id:p.packaging_item_id,quantity:Number(p.quantity)||1})),
   components:rawComponents.map(c=>{const kind=c.bulk_recipe_id?'bulk':'ingredient',id=c.bulk_recipe_id||c.ingredient_id;let unit=c.unit;if(kind==='ingredient'){const ing=ingredients.find(i=>String(i.id)===String(id));if(ing&&unitInfo(unit)[0]!==unitInfo(ing.default_unit)[0])unit=ing.default_unit}return{kind,id,name:c.bulk_recipe_name||c.ingredient_name,quantity:Number(c.quantity),unit}})
  });
  router.push(type==='bulk'?`/prepared-components/${source?.id||'new'}`:`/menu-costing/${source?.id||'new'}`);
 }
 useEffect(()=>{const m=path.match(/^\/(prepared-components|bulk-recipes|menu-costing|menu-items)\/([^/]+)$/);if(!m||editor)return;const type=m[1].includes('prepared')||m[1].includes('bulk')?'bulk':'menu';if(m[2]==='new')startEditor(type);else{const r=(data.recipes||[]).find(x=>x.id===m[2]);if(r)startEditor(type,r)}},[path,data.recipes]);
 async function saveEditor(){
  if(!editor?.name.trim())return alert('Name is required');
  if(editor.type==='bulk'&&!(Number(editor.yield_quantity)>0))return alert('Usable batch yield is required');
  if(editor.type==='menu'&&!editor.category)return alert('Select a category');
  setSaving(true);
  const body={
   name:editor.name,recipe_type:editor.type,category:editor.type==='menu'?editor.category:null,
   yield_quantity:editor.type==='bulk'?editor.yield_quantity:null,yield_unit:editor.type==='bulk'?editor.yield_unit:null,
   selling_price:editor.selling_price,target_food_cost:editor.target_food_cost,status:'recorded',components:editor.components,
   packaging:editor.type==='menu'?editor.packaging:[],
   delivery_commission_pct:editor.delivery_commission_pct,payment_fee_pct:editor.payment_fee_pct,
   other_variable_pct:editor.other_variable_pct,delivery_fixed_cost:editor.delivery_fixed_cost
  };
  const r=await fetch(editor.id?`/api/recipes/${editor.id}`:'/api/recipes',{method:editor.id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),j=await r.json();
  setSaving(false);if(!r.ok)return alert(j.error||'Could not save');
  const savedType=editor.type;setEditor(null);setToast('Saved');await load();router.push(savedType==='bulk'?'/prepared-components':'/menu-costing');
 }
 function addEditorComponent(kind,id,qty,unit){const src=kind==='bulk'?prepared.find(x=>x.id===id):ingredients.find(x=>x.id===id);if(!src||!(Number(qty)>0))return;setEditor(x=>({...x,components:[...x.components,{kind,id,name:src.name,quantity:Number(qty),unit}]}))}


 const nav=[['dashboard','Overview'],['ingredients','Ingredients'],['prices','Purchase Prices'],['prepared','Bulk Recipes'],['packaging','Packaging'],['menu','Menu Costing'],['analysis','Cost Analysis'],['categories','Categories'],['settings','Settings']];
 function Header({title,sub,actions}){return <><div className="v2-head"><div><span>COST CONTROL</span><h1>{title}</h1><p>{sub}</p></div><div className="v2-actions">{actions}</div></div></>}
 function Empty({children}){return <div className="v2-empty">{children}</div>}

 function IngredientPage(){const list=ingredients.filter(i=>i.name.toLowerCase().includes(q.toLowerCase()));return <><Header title="Ingredients" sub="Maintain the ingredient master. Prices are managed separately." actions={<><button className="ghost" onClick={downloadIngredientTemplate}>Download Template</button><label className="ghost file">Import Ingredients<input type="file" accept=".xlsx,.xls,.csv" onChange={e=>e.target.files[0]&&readExcel(e.target.files[0],'ingredients')}/></label><button className="primary" onClick={()=>setModal({type:'ingredient'})}>+ Add Ingredient</button></>}/><div className="v2-toolbar"><input placeholder="Search ingredients..." value={q} onChange={e=>setQ(e.target.value)}/><b>{ingredients.length} ingredients</b></div><div className="v2-table"><div className="thead"><span>Ingredient</span><span>Default Unit</span><span>Latest Price</span><span>Unit Cost</span><span>Used In</span><span>Actions</span></div>{list.map(i=>{const used=(data.recipes||[]).filter(r=>(r.components_summary||[]).some(c=>c.ingredient_id===i.id)).length;return <div className="trow" key={i.id}><span><b>{i.name}</b><small>{i.ingredient_type||'raw'}</small></span><span>{i.default_unit}</span><span>{i.latest_price?`${money(i.latest_price.purchase_price)} / ${i.latest_price.purchase_quantity} ${i.latest_price.purchase_unit}`:<em className="bad">Missing</em>}</span><span>{Number.isFinite(unitRate(i))?`${money(unitRate(i))}/${unitInfo(i.latest_price.purchase_unit)[0]==='weight'?'g':unitInfo(i.latest_price.purchase_unit)[0]==='volume'?'ml':'pc'}`:'—'}</span><span>{used}</span><span className="row-actions"><button onClick={()=>setModal({type:'ingredient',item:i})}>Edit</button><button onClick={()=>setModal({type:'price',item:i})}>Price</button><button className="danger" onClick={()=>remove('ingredient',i)}>Delete</button></span></div>})}</div></>}

 function PricesPage(){
  const ingredientRows=(data.prices||[]).map(p=>({
    ...p,
    row_type:'ingredient',
    row_key:`ingredient-${p.id}`,
    item_name:p.ingredient_name,
    item_type:'Ingredient',
    source_date:p.price_date,
    purchase_label:`${p.purchase_quantity} ${p.purchase_unit}`,
    source_cost_label:money(p.purchase_price),
    normalized_label:p.costing_status==='needs_yield'
      ?'Needs yield'
      :(Number.isFinite(Number(p.normalized_cost))
        ?`${money(Number(p.normalized_cost))}/${p.normalized_unit||'unit'}`
        :`${money(Number(p.purchase_price)/baseQty(p.purchase_quantity,p.purchase_unit))}/${unitInfo(p.purchase_unit)[0]==='weight'?'g':unitInfo(p.purchase_unit)[0]==='volume'?'ml':'pc'}`),
    supplier_label:p.supplier||'—'
  }));
  const packagingRows=(data.packaging||[]).filter(p=>p.source_type==='shelfsense').map(p=>{
    const m=parseMeta(p.source_metadata),factor=Number(p.purchase_to_storage_factor||m.purchaseConversionFactor||1);
    const purchaseUnit=p.purchase_unit||m.purchaseUnit||m.enteredUnit||'purchase unit';
    const storageUnit=p.storage_unit||m.baseUnit||'storage unit';
    const same=String(purchaseUnit).toLowerCase()===String(storageUnit).toLowerCase();
    const supplier=typeof m.supplier==='object'?m.supplier?.name:m.supplier;
    const cost=Number(p.storage_unit_cost);
    const each=Number(p.unit_cost);
    return {
      ...p,
      row_type:'packaging',
      row_key:`packaging-${p.id}`,
      item_name:p.name,
      item_type:'Packaging',
      source_date:m.effectiveDate||p.last_source_sync_at,
      purchase_label:same?`1 ${purchaseUnit}`:`1 ${purchaseUnit} = ${Number.isFinite(factor)?factor:1} ${storageUnit}`,
      source_cost_label:Number.isFinite(cost)?`${money(cost)} / ${storageUnit}`:'—',
      normalized_label:p.costing_status==='ready'&&Number.isFinite(each)?`${money(each)} / ${p.costing_unit||'each'}`:'Needs yield',
      supplier_label:supplier||'—'
    };
  });
  const rows=[...ingredientRows,...packagingRows]
    .filter(p=>(p.item_name+' '+p.item_type+' '+p.supplier_label).toLowerCase().includes(q.toLowerCase()))
    .sort((a,b)=>new Date(b.source_date||0)-new Date(a.source_date||0)||a.item_name.localeCompare(b.item_name));
  return <><Header title="Purchase Prices" sub="ShelfSense source costs for both ingredients and packaging. PlateCost applies yield/conversion and shows the costing rate used by recipes and packaging sets." actions={<><button className="ghost sync-shelfsense-btn" onClick={()=>window.dispatchEvent(new Event('platecost:open-shelfsense'))}>Sync ShelfSense</button><button className="ghost" onClick={downloadPriceTemplate}>Download Price Template</button><label className="primary file">Import Prices<input type="file" accept=".xlsx,.xls,.csv" onChange={e=>e.target.files[0]&&readExcel(e.target.files[0],'prices')}/></label></>}/><div className="v2-toolbar"><input placeholder="Search ingredient or packaging prices..." value={q} onChange={e=>setQ(e.target.value)}/><b>{rows.length} records</b></div><div className="v2-table prices"><div className="thead"><span>Date</span><span>Item</span><span>Type</span><span>Purchase / Conversion</span><span>Source Cost</span><span>PlateCost Cost</span><span>Supplier</span></div>{rows.map(p=><div className="trow" key={p.row_key}><span>{p.source_date?String(p.source_date).slice(0,10):'—'}</span><span><b>{p.item_name}</b></span><span><small className={p.row_type==='packaging'?'source-pill shelf':'source-pill'}>{p.item_type}</small></span><span>{p.purchase_label}</span><span>{p.source_cost_label}</span><span>{p.normalized_label==='Needs yield'?<><b className="warn">Needs yield</b><small>{p.row_type==='packaging'?'Set packaging yield':'Set usable quantity first'}</small></>:<b>{p.normalized_label}</b>}</span><span>{p.supplier_label}</span></div>)}</div></>
 }

 function PreparedPage(){const list=prepared.filter(r=>r.name.toLowerCase().includes(q.toLowerCase()));return <><Header title="Prepared Components" sub="Batch-cost sauces, rice, marinades and other reusable kitchen components." actions={<button className="primary" onClick={()=>startEditor('bulk')}>+ Add Component</button>}/><div className="v2-toolbar"><input placeholder="Search prepared components..." value={q} onChange={e=>setQ(e.target.value)}/><b>{prepared.length} components</b></div><div className="v2-table prepared"><div className="thead"><span>Prepared Component</span><span>Batch Yield</span><span>Batch Cost</span><span>Cost / Unit</span><span>Used In</span><span>Actions</span></div>{list.map(r=>{const cost=recipeCost(r),used=menus.filter(m=>(m.components_summary||[]).some(c=>c.bulk_recipe_id===r.id)).length;return <div className="trow" key={r.id}><span><b>{r.name}</b><small>{r.component_count||0} ingredients</small></span><span>{r.yield_quantity||'—'} {r.yield_unit||''}</span><span>{Number.isFinite(cost)?money(cost):<em className="bad">Incomplete</em>}</span><span>{Number.isFinite(cost)&&Number(r.yield_quantity)>0?`${money(cost/baseQty(r.yield_quantity,r.yield_unit))}/${unitInfo(r.yield_unit)[0]==='weight'?'g':unitInfo(r.yield_unit)[0]==='volume'?'ml':'pc'}`:'—'}</span><span>{used}</span><span className="row-actions"><button onClick={()=>startEditor('bulk',r)}>Edit Cost</button><button className="danger" onClick={()=>remove('prepared',r)}>Delete</button></span></div>})}</div>{!list.length&&<Empty>No prepared components yet.</Empty>}</>}

 function MenuPage(){const list=menus.filter(r=>(r.name+' '+(r.category||'')).toLowerCase().includes(q.toLowerCase()));return <><Header title="Menu Costing" sub="Recipe cost stays separate from tax, variable charges and allocated overhead." actions={<button className="primary" onClick={()=>startEditor('menu')}>+ Add Menu Item</button>}/><div className="v2-toolbar"><input placeholder="Search menu costing..." value={q} onChange={e=>setQ(e.target.value)}/><b>{menus.length} menu items</b></div><div className="v2-table menu profitability"><div className="thead"><span>Menu Item</span><span>Selling Price</span><span>Recipe Cost</span><span>Food Cost %</span><span>Gross Contribution</span><span>Est. Operating Contribution</span><span>Actions</span></div>{list.map(r=>{const s=menuStats(r),bad=Number.isFinite(s.food)&&s.food>s.target;return <div className="trow" key={r.id}><span><b>{r.name}</b><small>{r.category||'—'}</small></span><span>{s.sell?money(s.sell):<em className="bad">Set price</em>}</span><span>{Number.isFinite(s.cost)?money(s.cost):<em className="bad">Incomplete</em>}</span><span><strong className={bad?'bad':'good'}>{pct(s.food)}</strong><small>Target {s.target}%</small></span><span>{money(s.contribution)}</span><span><b className={Number.isFinite(s.operatingContribution)&&s.operatingContribution<0?'bad':''}>{money(s.operatingContribution)}</b><small>{money(s.packagingCost)} packaging · {money(s.variableCost-s.packagingCost)} variable · {money(s.overhead)} overhead</small></span><span className="row-actions"><button onClick={()=>startEditor('menu',r)}>Edit Cost</button><button className="danger" onClick={()=>remove('menu',r)}>Delete</button></span></div>})}</div>{!list.length&&<Empty>No menu costing records yet. Add your first menu item.</Empty>}</>}

 function AnalysisPage(){const missing=ingredients.filter(i=>!i.latest_price),changed=ingredients.map(i=>({...i,change:priceChange(i)})).filter(i=>Number.isFinite(i.change)).sort((a,b)=>Math.abs(b.change)-Math.abs(a.change)),stats=menus.map(r=>({r,...menuStats(r)})),over=stats.filter(x=>Number.isFinite(x.food)&&x.food>x.target),incomplete=stats.filter(x=>!Number.isFinite(x.cost)||!x.sell);return <><Header title="Cost Analysis" sub="Focus attention on missing prices, cost pressure and menu items that need action."/><div className="kpis"><div><span>Missing Prices</span><b>{missing.length}</b><small>ingredients need purchase cost</small></div><div><span>Over Target</span><b>{over.length}</b><small>menu items above target food cost</small></div><div><span>Incomplete Costing</span><b>{incomplete.length}</b><small>menu items need data</small></div><div><span>Price Changes</span><b>{changed.filter(x=>Math.abs(x.change)>=5).length}</b><small>ingredients moved ≥5%</small></div></div><div className="analysis-grid"><section><h3>Largest ingredient price movements</h3>{changed.slice(0,10).map(i=><div className="analysis-row" key={i.id}><span><b>{i.name}</b><small>{i.latest_price?.supplier||'Latest purchase'}</small></span><strong className={i.change>0?'bad':'good'}>{i.change>0?'+':''}{pct(i.change)}</strong></div>)}{!changed.length&&<Empty>Add at least two prices for an ingredient to see movement.</Empty>}</section><section><h3>Menu items needing attention</h3>{[...over,...incomplete.filter(x=>!over.includes(x))].slice(0,10).map(x=><div className="analysis-row" key={x.r.id}><span><b>{x.r.name}</b><small>{Number.isFinite(x.cost)?`${money(x.cost)} cost`:'Cost incomplete'}</small></span><strong className="bad">{Number.isFinite(x.food)?pct(x.food):'Review'}</strong></div>)}{!over.length&&!incomplete.length&&<Empty>No menu item alerts.</Empty>}</section></div></>}

 function Dashboard(){
  const ingredientReady=ingredients.filter(i=>i.latest_price?.costing_status==='ready').length;
  const priced=ingredients.filter(i=>i.latest_price).length;
  const missing=Math.max(0,ingredients.length-priced);
  const needsYield=ingredients.filter(i=>i.latest_price?.costing_status==='needs_yield').length;
  const menuRows=menus.map(r=>({r,...menuStats(r)}));
  const completeMenuRows=menuRows.filter(x=>Number.isFinite(x.cost)&&x.sell>0);
  const recipeComplete=menuRows.filter(x=>Number.isFinite(x.cost)).length;
  const sellingReady=menuRows.filter(x=>x.sell>0).length;
  const packagingReady=menus.filter(r=>r.packaging_set).length;
  const healthy=completeMenuRows.filter(x=>x.food<=x.target).length;
  const watch=completeMenuRows.filter(x=>x.food>x.target&&x.food<=x.target+5).length;
  const critical=completeMenuRows.filter(x=>x.food>x.target+5||x.operatingContribution<0).length;
  const avgFood=completeMenuRows.length?completeMenuRows.reduce((a,x)=>a+x.food,0)/completeMenuRows.length:NaN;
  const avgOperating=completeMenuRows.length?completeMenuRows.reduce((a,x)=>a+x.operatingContribution,0)/completeMenuRows.length:NaN;
  const ingredientPct=ingredients.length?ingredientReady/ingredients.length*100:0;
  const menuPct=menus.length?recipeComplete/menus.length*100:0;
  const readiness=Math.round((ingredientPct*.55)+(menuPct*.45));
  const active=snapshots.find(x=>x.status==='published'),draft=snapshots.find(x=>x.status==='draft'),draftSummary=draft?.summary||{};
  const overheadTotal=(costModel.monthly_overheads||[]).reduce((a,x)=>a+Number(x.amount||0),0);
  const salesBasis=Number(costModel.monthly_sales_basis||0),overheadPct=salesBasis>0?overheadTotal/salesBasis*100:0;
  const variablePct=Number(costModel.payment_fee_pct||0)+Number(costModel.delivery_commission_pct||0)+Number(costModel.other_variable_pct||0);
  const unassignedPackaging=Math.max(0,menus.length-packagingReady);
  const movements=ingredients.map(i=>({...i,change:priceChange(i)})).filter(i=>Number.isFinite(i.change)&&Math.abs(i.change)>=.01).sort((a,b)=>Math.abs(b.change)-Math.abs(a.change)).slice(0,5);
  const risky=[...menuRows].filter(x=>x.sell>0).sort((a,b)=>{const ar=(Number.isFinite(a.operatingContribution)?-a.operatingContribution:999999)+(Number.isFinite(a.food)?Math.max(0,a.food-a.target)*100:5000),br=(Number.isFinite(b.operatingContribution)?-b.operatingContribution:999999)+(Number.isFinite(b.food)?Math.max(0,b.food-b.target)*100:5000);return br-ar}).slice(0,5);
  const actionCount=(missing?1:0)+(needsYield?1:0)+(draft?1:0)+(critical?1:0)+(unassignedPackaging?1:0)+(salesBasis<=0?1:0);
  const dateLabel=v=>v?new Date(v).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}):'—';
  const bar=(value,total)=>total?Math.max(0,Math.min(100,value/total*100)):0;
  return <div className="ops-dashboard">
   <div className="ops-dashboard-head">
    <div><span>PLATECOST · COMMAND CENTER</span><h1>Cost Control Overview</h1><p>One place to see whether your costing is reliable, what changed, and what needs action today.</p></div>
    <div className="ops-head-actions"><button className="ghost" onClick={()=>go('prices')}>Sync / Review Prices</button><button className="primary" onClick={()=>go('menu')}>Open Menu Costing</button></div>
   </div>

   <section className="ops-hero">
    <div className="ops-readiness">
      <div className="ops-score" style={{'--score':readiness}}><strong>{readiness}%</strong><span>ready</span></div>
      <div><span className="ops-kicker">COSTING READINESS</span><h2>{readiness>=90?'Costing is operational':readiness>=70?'Good progress — finish the gaps':'Costing needs setup before decisions'}</h2><p>{ingredientReady}/{ingredients.length} ingredients have kitchen cost · {recipeComplete}/{menus.length} menu items have complete recipe cost.</p></div>
    </div>
    <div className="ops-hero-status">
      <div><span>ACTIVE COSTING</span><b>{active?dateLabel(active.snapshot_date):'Not versioned'}</b><small>{active?'Published snapshot in use':'Live prices are being used'}</small></div>
      <div className={draft?'pending':''}><span>SHELFENSE REVIEW</span><b>{draft?(draftSummary.changed||0)+' changes':'Up to date'}</b><small>{draft?'Review before publishing':'No draft awaiting action'}</small></div>
      <div><span>OVERHEAD BURDEN</span><b>{salesBasis>0?pct(overheadPct):'Not set'}</b><small>{salesBasis>0?money(overheadTotal)+' / month':'Add monthly sales basis'}</small></div>
      <div className={actionCount?'attention':''}><span>ACTIONS</span><b>{actionCount}</b><small>{actionCount?'items need attention':'No immediate blockers'}</small></div>
    </div>
   </section>

   <div className="ops-grid primary-grid">
    <section className="ops-panel action-panel">
      <div className="ops-panel-head"><div><span>OPERATIONS QUEUE</span><h3>What needs action</h3></div><small>Work top-to-bottom</small></div>
      <div className="ops-action-list">
       {draft&&<button onClick={()=>go('prices')}><i className="review">01</i><span><b>Review & publish ShelfSense prices</b><small>{draftSummary.changed||0} changed · {draftSummary.increased||0} increased · {draftSummary.decreased||0} decreased</small></span><strong>Review →</strong></button>}
       {missing>0&&<button onClick={()=>go('ingredients')}><i className="warn">{draft?'02':'01'}</i><span><b>{missing} ingredients have no source price</b><small>These cannot contribute a reliable recipe cost.</small></span><strong>Fix →</strong></button>}
       {needsYield>0&&<button onClick={()=>go('ingredients')}><i className="warn">{needsYield}</i><span><b>{needsYield} ingredients need usable yield</b><small>Purchase cost exists, but kitchen unit cost cannot be calculated yet.</small></span><strong>Set yield →</strong></button>}
       {critical>0&&<button onClick={()=>go('menu')}><i className="danger">{critical}</i><span><b>{critical} menu items need margin review</b><small>Above target food cost or negative estimated operating contribution.</small></span><strong>Review →</strong></button>}
       {unassignedPackaging>0&&<button onClick={()=>go('packaging')}><i>{unassignedPackaging}</i><span><b>Packaging not assigned to {unassignedPackaging} menu items</b><small>Assign category defaults or menu overrides where takeaway/delivery packaging applies.</small></span><strong>Assign →</strong></button>}
       {salesBasis<=0&&<button onClick={()=>go('settings')}><i>!</i><span><b>Operating overhead allocation is not configured</b><small>Add monthly sales basis so operating contribution includes rent, salaries and fixed costs.</small></span><strong>Configure →</strong></button>}
       {!actionCount&&<div className="ops-clear"><b>✓ No immediate blockers</b><span>Costing data is ready for menu review.</span></div>}
      </div>
    </section>

    <section className="ops-panel coverage-panel">
      <div className="ops-panel-head"><div><span>DATA COVERAGE</span><h3>Can you trust the numbers?</h3></div><small>{ingredients.length} ingredients · {menus.length} menu items</small></div>
      <div className="coverage-list">
       <div><div><span>Ingredient prices</span><b>{priced}/{ingredients.length}</b></div><i><em style={{width:bar(priced,ingredients.length)+'%'}}/></i><small>{missing} missing</small></div>
       <div><div><span>Kitchen cost ready</span><b>{ingredientReady}/{ingredients.length}</b></div><i><em style={{width:bar(ingredientReady,ingredients.length)+'%'}}/></i><small>{needsYield} need yield</small></div>
       <div><div><span>Menu recipe costing</span><b>{recipeComplete}/{menus.length}</b></div><i><em style={{width:bar(recipeComplete,menus.length)+'%'}}/></i><small>{Math.max(0,menus.length-recipeComplete)} incomplete</small></div>
       <div><div><span>Selling prices</span><b>{sellingReady}/{menus.length}</b></div><i><em style={{width:bar(sellingReady,menus.length)+'%'}}/></i><small>{Math.max(0,menus.length-sellingReady)} missing</small></div>
       <div><div><span>Packaging assigned</span><b>{packagingReady}/{menus.length}</b></div><i><em style={{width:bar(packagingReady,menus.length)+'%'}}/></i><small>{unassignedPackaging} without a set</small></div>
      </div>
    </section>
   </div>

   <div className="ops-grid economics-grid">
    <section className="ops-panel menu-economics">
      <div className="ops-panel-head"><div><span>MENU ECONOMICS</span><h3>Current profitability picture</h3></div><button onClick={()=>go('menu')}>Open costing →</button></div>
      <div className="economics-kpis">
       <div><span>AVG FOOD COST</span><b>{pct(avgFood)}</b><small>Across {completeMenuRows.length} complete items</small></div>
       <div><span>AVG OPERATING CONTRIBUTION</span><b className={avgOperating<0?'bad':''}>{money(avgOperating)}</b><small>After variable cost + overhead</small></div>
       <div><span>WITHIN TARGET</span><b>{healthy}</b><small>{menus.length?Math.round(healthy/menus.length*100):0}% of menu</small></div>
       <div><span>WATCH / CRITICAL</span><b className={(watch+critical)>0?'bad':''}>{watch+critical}</b><small>{watch} watch · {critical} critical</small></div>
      </div>
      <div className="risk-table">
       <div className="risk-head"><span>Menu item</span><span>Food cost</span><span>Operating contribution</span><span>Status</span></div>
       {risky.length?risky.map(x=>{const state=!Number.isFinite(x.cost)||!x.sell?'Incomplete':x.operatingContribution<0?'Negative':x.food>x.target+5?'Critical':x.food>x.target?'Watch':'Healthy';return <button className="risk-row" key={x.r.id} onClick={()=>startEditor('menu',x.r)}><span><b>{x.r.name}</b><small>{x.r.category||'Uncategorized'}</small></span><span>{pct(x.food)}<small>target {x.target}%</small></span><span className={x.operatingContribution<0?'bad':''}>{money(x.operatingContribution)}</span><span><em className={'risk-pill '+state.toLowerCase()}>{state}</em></span></button>}):<div className="overview-empty">Add menu prices and recipe costs to see profitability.</div>}
      </div>
    </section>

    <section className="ops-panel cost-model-panel">
      <div className="ops-panel-head"><div><span>COST MODEL</span><h3>Business cost assumptions</h3></div><button onClick={()=>go('settings')}>Edit model →</button></div>
      <div className="model-stack">
       <div><span>Monthly overhead</span><b>{money(overheadTotal)}</b><small>{(costModel.monthly_overheads||[]).length} configured cost lines</small></div>
       <div><span>Monthly sales basis</span><b>{salesBasis>0?money(salesBasis):'Not configured'}</b><small>Used for overhead allocation</small></div>
       <div><span>Variable selling costs</span><b>{pct(variablePct)}</b><small>Payment + delivery + other</small></div>
       <div><span>Tax</span><b>{costModel.tax_enabled?pct(costModel.tax_rate):'Disabled'}</b><small>{costModel.tax_enabled?(costModel.prices_include_tax?'Selling prices include tax':'Selling prices exclude tax'):'No tax adjustment'}</small></div>
      </div>
      <div className="model-foot"><span>Estimated overhead burden</span><b>{salesBasis>0?pct(overheadPct):'—'}</b></div>
    </section>
   </div>

   <div className="ops-grid lower-grid">
    <section className="ops-panel movers-panel">
      <div className="ops-panel-head"><div><span>COST MOVEMENT</span><h3>Largest ingredient price changes</h3></div><button onClick={()=>go('analysis')}>See analysis →</button></div>
      <div className="ops-movers">{movements.length?movements.map(i=><button key={i.id} onClick={()=>go('prices')}><span><b>{i.name}</b><small>{i.latest_price?.supplier||'Latest purchase'} · {i.latest_price?.price_date?dateLabel(i.latest_price.price_date):'latest'}</small></span><strong className={i.change>0?'up':'down'}>{i.change>0?'↑':'↓'} {Math.abs(i.change).toFixed(1)}%</strong></button>):<div className="overview-empty">Price movement appears after at least two comparable purchase prices exist.</div>}</div>
    </section>
    <section className="ops-panel snapshot-panel">
      <div className="ops-panel-head"><div><span>COSTING CONTROL</span><h3>Version & review status</h3></div></div>
      <div className="snapshot-timeline">
       <div className={active?'done':''}><i>{active?'✓':'1'}</i><span><b>Published costing</b><small>{active?dateLabel(active.snapshot_date):'No costing version published yet'}</small></span></div>
       <div className={draft?'current':''}><i>{draft?'2':'✓'}</i><span><b>Latest ShelfSense review</b><small>{draft?(dateLabel(draft.snapshot_date)+' · '+(draftSummary.changed||0)+' changes awaiting review'):'No pending draft review'}</small></span></div>
       <div><i>3</i><span><b>Next action</b><small>{draft?'Review and publish when approved':missing?'Complete missing ingredient prices':'Run the next ShelfSense review when prices change'}</small></span></div>
      </div>
      <button className={draft?'primary':'ghost'} onClick={()=>go('prices')}>{draft?'Review pending snapshot':'Open Purchase Prices'}</button>
    </section>
   </div>
  </div>}
 function Categories(){return <><Header title="Categories" sub="Simple menu grouping used by Menu Costing." actions={<button className="primary" onClick={()=>setModal({type:'category'})}>+ Add Category</button>}/><div className="v2-table categories"><div className="thead"><span>Category</span><span>Menu Items</span><span>Actions</span></div>{(data.categories||[]).map(c=>{const used=menus.filter(m=>m.category===c.name).length;return <div className="trow" key={c.id}><span><b>{c.name}</b></span><span>{used}</span><span className="row-actions"><button className="danger" onClick={()=>remove('category',c)}>Delete</button></span></div>})}</div></>}


 function Editor(){
  if(!editor)return null;
  const isBulk=editor.type==='bulk';
  const cost=editor.components.reduce((a,c)=>{let v=NaN;if(c.kind==='ingredient')v=ingredientCost(ingredients.find(i=>i.id===c.id),c.quantity,c.unit);else{const r=prepared.find(x=>x.id===c.id),rc=recipeCost(r);if(Number.isFinite(rc)&&Number(r?.yield_quantity)>0&&unitInfo(r.yield_unit)[0]===unitInfo(c.unit)[0])v=rc*(baseQty(c.quantity,c.unit)/baseQty(r.yield_quantity,r.yield_unit))}return Number.isFinite(a)&&Number.isFinite(v)?a+v:NaN},0);
  const sell=Number(editor.selling_price||0),food=sell>0&&Number.isFinite(cost)?cost/sell*100:NaN;
  const selectedType=editor.cost_order_type||'takeaway';
  const packagingCost=(editor.packaging||[]).filter(p=>p.order_type===selectedType).reduce((sum,p)=>{const item=(data.packaging||[]).find(x=>String(x.id)===String(p.packaging_item_id));return sum+(Number(item?.unit_cost)||0)*Number(p.quantity||0)},0);
  const deliveryVariablePct=selectedType==='delivery'?Number(editor.delivery_commission_pct||0)+Number(editor.payment_fee_pct||0)+Number(editor.other_variable_pct||0):0;
  const channelCost=selectedType==='delivery'?sell*deliveryVariablePct/100+Number(editor.delivery_fixed_cost||0):0;
  const totalVariable=Number.isFinite(cost)?cost+packagingCost+channelCost:NaN;
  const contribution=sell>0&&Number.isFinite(totalVariable)?sell-totalVariable:NaN;
  const tabs=isBulk?[['food','Food Costing'],['summary','Cost Summary']]:[['food','Food Costing'],['packaging','Packaging'],['delivery','Delivery & Channels'],['summary','Cost Summary']];
  return <div className="editor-page">
   <div className="editor-head"><button onClick={()=>{setEditor(null);router.push(isBulk?'/prepared-components':'/menu-costing')}}>←</button><div><span>{isBulk?'PREPARED COMPONENT':'MENU COSTING'}</span><h1>{editor.id?'Edit':'Add'} {isBulk?'Prepared Component':'Menu Item'}</h1></div><button className="primary" disabled={saving} onClick={saveEditor}>{saving?'Saving...':'Save'}</button></div>
   <div className="editor-grid">
    <section className="editor-card">
     <div className="editor-basics">
      <label>{isBulk?'Component name':'Menu item name'}<input value={editor.name} onChange={e=>setEditor({...editor,name:e.target.value})}/></label>
      {isBulk?<div className="two"><label>Usable batch yield<input type="number" step="0.01" value={editor.yield_quantity} onChange={e=>setEditor({...editor,yield_quantity:e.target.value})}/></label><label>Yield unit<select value={editor.yield_unit} onChange={e=>setEditor({...editor,yield_unit:e.target.value})}>{units.map(u=><option key={u}>{u}</option>)}</select></label></div>:<div className="two"><label>Category<select value={editor.category} onChange={e=>setEditor({...editor,category:e.target.value})}><option value="">Select category</option>{data.categories.map(c=><option key={c.id}>{c.name}</option>)}</select></label><label>Selling price (Rs)<input type="number" value={editor.selling_price} onChange={e=>setEditor({...editor,selling_price:e.target.value})}/></label></div>}
     </div>
     <div className="cost-tabs">{tabs.map(([key,label])=><button type="button" key={key} className={editorTab===key?'active':''} onClick={()=>setEditorTab(key)}>{label}{!isBulk&&key==='packaging'&&<small>{(editor.packaging||[]).length}</small>}</button>)}</div>
     {editorTab==='food'&&<div className="tab-panel">
      {!isBulk&&<label>Target food cost %<input type="number" value={editor.target_food_cost} onChange={e=>setEditor({...editor,target_food_cost:e.target.value})}/></label>}
      <h3>Cost Components</h3>
      {editor.components.map((c,n)=>{let line=NaN,status='';if(c.kind==='ingredient'){const info=ingredientCostInfo(ingredients.find(i=>i.id===c.id),c.quantity,c.unit);line=info.cost;status=info.note||info.status}else if(c.kind==='bulk'){const r=prepared.find(x=>x.id===c.id),rc=recipeCost(r);if(Number.isFinite(rc)&&Number(r?.yield_quantity)>0&&unitInfo(r.yield_unit)[0]===unitInfo(c.unit)[0])line=rc*(baseQty(c.quantity,c.unit)/baseQty(r.yield_quantity,r.yield_unit));else status=Number.isFinite(rc)?'Unit mismatch':'Component cost incomplete'}return <div className="component" key={`${c.kind}-${c.id}-${n}`}><span><b>{c.name}</b><small>{c.kind==='bulk'?'Prepared Component':'Ingredient'}{status&&status!=='Ready'?' · '+status:''}</small></span><span>{c.quantity} {c.unit}</span><strong>{Number.isFinite(line)?money(line):(status||'Cost unavailable')}</strong><button onClick={()=>setEditor({...editor,components:editor.components.filter((_,x)=>x!==n)})}>×</button></div>})}
      <ComponentAdder isBulk={isBulk} ingredients={recipeIngredients} prepared={prepared} units={units} onAdd={addEditorComponent} ingredientCostInfo={ingredientCostInfo}/>
     </div>}
     {!isBulk&&editorTab==='packaging'&&<PackagingCostTab editor={editor} setEditor={setEditor} packaging={data.packaging||[]}/>}
     {!isBulk&&editorTab==='delivery'&&<div className="tab-panel delivery-panel">
      <div className="tab-intro"><span>DELIVERY & CHANNEL COSTS</span><h3>Costs applied when this item is sold for delivery</h3><p>These values are saved against this menu item. Leave them at the defaults if the restaurant-wide rates apply.</p></div>
      <div className="two"><label>Delivery commission %<input type="number" step="0.01" value={editor.delivery_commission_pct} onChange={e=>setEditor({...editor,delivery_commission_pct:e.target.value})}/></label><label>Payment fee %<input type="number" step="0.01" value={editor.payment_fee_pct} onChange={e=>setEditor({...editor,payment_fee_pct:e.target.value})}/></label></div>
      <div className="two"><label>Other variable cost %<input type="number" step="0.01" value={editor.other_variable_pct} onChange={e=>setEditor({...editor,other_variable_pct:e.target.value})}/></label><label>Fixed delivery cost (Rs)<input type="number" step="0.01" value={editor.delivery_fixed_cost} onChange={e=>setEditor({...editor,delivery_fixed_cost:e.target.value})}/></label></div>
      <div className="channel-preview"><span>Estimated delivery/channel cost at current selling price</span><b>{money(sell*(Number(editor.delivery_commission_pct||0)+Number(editor.payment_fee_pct||0)+Number(editor.other_variable_pct||0))/100+Number(editor.delivery_fixed_cost||0))}</b></div>
     </div>}
     {editorTab==='summary'&&<div className="tab-panel cost-summary-panel">
      <div className="tab-intro"><span>COST SUMMARY</span><h3>{isBulk?'Prepared component economics':'Menu item economics'}</h3><p>{isBulk?'Review the full batch cost and usable yield.':'Switch the order type to see how packaging and delivery costs affect contribution.'}</p></div>
      {!isBulk&&<div className="order-type-switch">{[['dine_in','Dine-in'],['takeaway','Takeaway'],['delivery','Delivery']].map(([k,l])=><button type="button" className={selectedType===k?'active':''} key={k} onClick={()=>setEditor({...editor,cost_order_type:k})}>{l}</button>)}</div>}
      <div className="summary-breakdown">
       <p><span>{isBulk?'Ingredient / recipe cost':'Food cost'}</span><b>{Number.isFinite(cost)?money(cost):'Incomplete'}</b></p>
       {!isBulk&&<><p><span>Packaging</span><b>{money(packagingCost)}</b></p><p><span>Delivery / channel</span><b>{money(channelCost)}</b></p><p className="total"><span>Total variable cost</span><b>{Number.isFinite(totalVariable)?money(totalVariable):'Incomplete'}</b></p><p><span>Selling price</span><b>{sell?money(sell):'—'}</b></p><p className="contribution"><span>Contribution</span><b>{money(contribution)}</b></p></>}
       {isBulk&&<><p><span>Yield</span><b>{editor.yield_quantity||'—'} {editor.yield_unit}</b></p><p className="total"><span>Cost / base unit</span><b>{Number.isFinite(cost)&&Number(editor.yield_quantity)>0?money(cost/baseQty(editor.yield_quantity,editor.yield_unit)):'—'}</b></p></>}
      </div>
     </div>}
    </section>
    <aside className="summary-card"><span>LIVE COST</span><h2>{editor.name||'Untitled'}</h2><div className="summary-big"><small>{isBulk?'Batch Cost':'Total · '+(selectedType==='dine_in'?'Dine-in':selectedType==='delivery'?'Delivery':'Takeaway')}</small><b>{Number.isFinite(isBulk?cost:totalVariable)?money(isBulk?cost:totalVariable):'Incomplete'}</b></div>{isBulk?<><p><span>Yield</span><b>{editor.yield_quantity||'—'} {editor.yield_unit}</b></p><p><span>Cost / base unit</span><b>{Number.isFinite(cost)&&Number(editor.yield_quantity)>0?money(cost/baseQty(editor.yield_quantity,editor.yield_unit)):'—'}</b></p></>:<><div className="summary-order-switch">{[['dine_in','Dine-in'],['takeaway','Takeaway'],['delivery','Delivery']].map(([k,l])=><button type="button" key={k} className={selectedType===k?'active':''} onClick={()=>setEditor({...editor,cost_order_type:k})}>{l}</button>)}</div><p><span>Food</span><b>{Number.isFinite(cost)?money(cost):'—'}</b></p><p><span>Packaging</span><b>{money(packagingCost)}</b></p><p><span>Channel</span><b>{money(channelCost)}</b></p><p><span>Selling Price</span><b>{sell?money(sell):'—'}</b></p><p><span>Contribution</span><b className={Number.isFinite(contribution)&&contribution<0?'bad':'good'}>{money(contribution)}</b></p><p><span>Food Cost</span><b className={Number.isFinite(food)&&food>Number(editor.target_food_cost)?'bad':'good'}>{pct(food)}</b></p></>}<small className="hint">Latest purchase and packaging prices are used automatically.</small></aside>
   </div>
  </div>
 }


 if(editor)return <Shell section={section} nav={nav} go={go} workspaceName={workspaceName}>{Editor()}{toast&&<div className="toast">{toast}</div>}</Shell>;
 return <Shell section={section} nav={nav} go={go} workspaceName={workspaceName}><main className="v2-main">{loading?<Empty>Loading cost-control data...</Empty>:section==='ingredients'?<IngredientPage/>:section==='prices'?<PricesPage/>:section==='prepared'?<PreparedPage/>:section==='menu'?<MenuPage/>:section==='analysis'?<AnalysisPage/>:section==='categories'?<Categories/>:<Dashboard/>}</main>{modal&&<Modal modal={modal} setModal={setModal} saveIngredient={saveIngredient} savePrice={savePrice} saveCategory={saveCategory} confirmImport={confirmImport} units={units}/>} {toast&&<div className="toast">{toast}</div>}</Shell>
}

function Shell({children,section,nav,go,workspaceName}){
 const [menuOpen,setMenuOpen]=useState(false);
 useEffect(()=>{document.body.classList.toggle('v2-nav-open',menuOpen);return()=>document.body.classList.remove('v2-nav-open')},[menuOpen]);
 useEffect(()=>{setMenuOpen(false)},[section]);
 const groups=[
  {label:'HOME',keys:['dashboard']},
  {label:'COST WORKFLOW',keys:['ingredients','prices','prepared','packaging','menu']},
  {label:'INSIGHTS',keys:['analysis']},
  {label:'MANAGE',keys:['categories','settings']}
 ];
 const byKey=new Map(nav.map(x=>[x[0],x]));
 const openPage=k=>{go(k);setMenuOpen(false)};
 return <div className="v2-shell">
  <div className="v2-mobile-bar"><button type="button" className="v2-menu-toggle" aria-label={menuOpen?'Close menu':'Open menu'} aria-expanded={menuOpen} onClick={()=>setMenuOpen(v=>!v)}><span></span><span></span><span></span></button><div><b>PlateCost</b><span>{nav.find(x=>x[0]===section)?.[1]||'Overview'}</span></div></div>
  <button type="button" aria-label="Close menu" className={`v2-nav-backdrop ${menuOpen?'show':''}`} onClick={()=>setMenuOpen(false)}/>
  <aside className={`v2-side ${menuOpen?'mobile-open':''}`}><div className="brand"><div className="product-mark">PC</div><b className="product-name">PLATECOST</b><span className="product-tagline">RESTAURANT COST CONTROL</span><section className="workspace-switch"><small>WORKSPACE</small><strong>{workspaceName||'Workspace'}</strong></section></div><nav>{groups.map(g=><div className="v2-nav-group" data-nav-group={g.label.toLowerCase().replace(/\s+/g,'-')} key={g.label}><div className="v2-nav-group-title">{g.label}</div>{g.keys.map(k=>{const item=byKey.get(k);if(!item)return null;return <button key={k} className={section===k?'active':''} onClick={()=>openPage(k)}>{item[1]}</button>})}</div>)}</nav><footer><b>PlateCost</b><span>Restaurant costing</span></footer></aside>
  <div className="v2-work">{children}</div>
 </div>
}
function ComponentAdder({isBulk,ingredients,prepared,units,onAdd,ingredientCostInfo}){
 const[kind,setKind]=useState('ingredient'),[id,setId]=useState(''),[qty,setQty]=useState(''),[unit,setUnit]=useState('g'),[query,setQuery]=useState(''),[open,setOpen]=useState(false);
 const comboRef=useRef(null);
 useEffect(()=>{
  if(!open)return;
  const closeIfOutside=(event)=>{if(comboRef.current&&!comboRef.current.contains(event.target))setOpen(false)};
  document.addEventListener('pointerdown',closeIfOutside,true);
  return()=>document.removeEventListener('pointerdown',closeIfOutside,true);
 },[open]);
 const options=kind==='ingredient'?ingredients:prepared;
 const filtered=options.filter(x=>!query.trim()||String(x.name||'').toLowerCase().includes(query.trim().toLowerCase())).slice(0,60);
 const optionLabel=x=>{if(kind!=='ingredient')return x.name;const info=ingredientCostInfo?.(x,1,x.default_unit||'g');if(Number.isFinite(info?.rate))return x.name+' · '+money(info.rate)+'/'+info.baseUnit;return x.name+' · '+(info?.status||'No price')};
 function choose(src){setId(src.id);setQuery(src.name);setOpen(false);setUnit(kind==='ingredient'?(src.default_unit||'g'):(src.yield_unit||'g'))}
 return <div className="adder"><div className="three"><label>Type<select value={kind} onChange={e=>{setKind(e.target.value);setId('');setQuery('')}}><option value="ingredient">Ingredient</option>{!isBulk&&<option value="bulk">Prepared Component</option>}</select></label><label>Component<div className="component-combobox" ref={comboRef}><input value={query} placeholder="Type to search..." onFocus={()=>setOpen(true)} onChange={e=>{setQuery(e.target.value);setId('');setOpen(true)}}/>{open&&<div className="component-options">{filtered.length?filtered.map(x=><button type="button" key={x.id} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(x)}><b>{x.name}</b><span>{kind==='ingredient'?(x.ingredient_category||'Uncategorized'):'Prepared Component'}</span><em>{optionLabel(x).replace(x.name+' · ','')}</em></button>):<div className="component-no-match">No matching {kind==='ingredient'?'ingredients':'components'}</div>}</div>}</div></label><label>Quantity<input type="number" step="0.01" value={qty} onChange={e=>setQty(e.target.value)}/></label></div><div className="two"><label>Unit<select value={unit} onChange={e=>setUnit(e.target.value)}>{units.map(u=><option key={u}>{u}</option>)}</select></label><button className="primary add" disabled={!id||!(Number(qty)>0)} onClick={()=>{onAdd(kind,id,qty,unit);setId('');setQty('');setQuery('')}}>+ Add Cost Component</button></div></div>
}

function PackagingCostTab({editor,setEditor,packaging}){
 const [orderType,setOrderType]=useState('takeaway'),[itemId,setItemId]=useState(''),[qty,setQty]=useState('1');
 const rows=(editor.packaging||[]).filter(p=>p.order_type===orderType);
 const add=()=>{if(!itemId||!(Number(qty)>0))return;setEditor(x=>({...x,packaging:[...(x.packaging||[]),{order_type:orderType,packaging_item_id:itemId,quantity:Number(qty)}]}));setItemId('');setQty('1')};
 const remove=(index)=>setEditor(x=>{let seen=-1;return{...x,packaging:(x.packaging||[]).filter(p=>{if(p.order_type!==orderType)return true;seen++;return seen!==index})}});
 const total=rows.reduce((s,p)=>{const item=packaging.find(x=>String(x.id)===String(p.packaging_item_id));return s+(Number(item?.unit_cost)||0)*Number(p.quantity||0)},0);
 return <div className="tab-panel packaging-tab">
  <div className="tab-intro"><span>PACKAGING</span><h3>Packaging by order type</h3><p>Assign only what this menu item actually uses. Packaging prices continue to come from the Packaging master.</p></div>
  <div className="order-type-switch">{[['dine_in','Dine-in'],['takeaway','Takeaway'],['delivery','Delivery']].map(([k,l])=><button type="button" className={orderType===k?'active':''} key={k} onClick={()=>setOrderType(k)}>{l}<small>{(editor.packaging||[]).filter(p=>p.order_type===k).length}</small></button>)}</div>
  <div className="packaging-lines">{rows.length?rows.map((p,n)=>{const item=packaging.find(x=>String(x.id)===String(p.packaging_item_id)),line=(Number(item?.unit_cost)||0)*Number(p.quantity||0);return <div key={`${p.packaging_item_id}-${n}`}><span><b>{item?.name||'Packaging item'}</b><small>{item?.unit_cost!=null?`${money(item.unit_cost)} each`:'Price pending'}</small></span><strong>{p.quantity} ×</strong><em>{money(line)}</em><button type="button" onClick={()=>remove(n)}>×</button></div>}):<div className="packaging-empty">No packaging assigned for this order type.</div>}</div>
  <div className="packaging-add-row"><select value={itemId} onChange={e=>setItemId(e.target.value)}><option value="">Select packaging item</option>{packaging.map(i=><option key={i.id} value={i.id}>{i.name}{i.unit_cost!=null?` — ${money(i.unit_cost)}`:''}</option>)}</select><input type="number" min="0.01" step="0.01" value={qty} onChange={e=>setQty(e.target.value)}/><button type="button" className="primary" disabled={!itemId||!(Number(qty)>0)} onClick={add}>+ Add</button></div>
  <div className="packaging-total"><span>{orderType==='dine_in'?'Dine-in':orderType==='delivery'?'Delivery':'Takeaway'} packaging cost</span><b>{money(total)}</b></div>
  {!packaging.length&&<button type="button" className="ghost" onClick={()=>window.location.assign('/packaging')}>Add packaging items first</button>}
 </div>
}
function Modal({modal,setModal,saveIngredient,savePrice,saveCategory,confirmImport,units}){return <div className="modal-bg" onMouseDown={e=>e.target===e.currentTarget&&setModal(null)}><div className="v2-modal"><header><div><span>COST CONTROL</span><h2>{modal.type==='ingredient'?(modal.item?'Edit Ingredient':'Add Ingredient'):modal.type==='price'?`Record Price · ${modal.item.name}`:modal.type==='category'?'Add Category':modal.type==='importIngredients'?'Import Ingredients':'Import Purchase Prices'}</h2></div><button onClick={()=>setModal(null)}>×</button></header>{modal.type==='ingredient'?<form onSubmit={saveIngredient}><label>Ingredient name<input name="name" defaultValue={modal.item?.name||''} required autoFocus/></label><div className="two"><label>Default unit<select name="default_unit" defaultValue={modal.item?.default_unit||'g'}>{units.map(u=><option key={u}>{u}</option>)}</select></label><label>Type<select name="ingredient_type" defaultValue={modal.item?.ingredient_type||'raw'}><option value="raw">Raw</option><option value="prepared">Prepared</option></select></label></div><label>Notes<textarea name="notes" defaultValue={modal.item?.notes||''}/></label><button className="primary">Save Ingredient</button></form>:modal.type==='price'?<form onSubmit={savePrice}><div className="two"><label>Purchase quantity<input name="purchase_quantity" type="number" step="0.01" required/></label><label>Purchase unit<select name="purchase_unit" defaultValue={modal.item?.default_unit||'g'}>{units.map(u=><option key={u}>{u}</option>)}</select></label></div><label>Total purchase price (Rs)<input name="purchase_price" type="number" step="0.01" required/></label><div className="two"><label>Supplier<input name="supplier"/></label><label>Price date<input name="price_date" type="date" defaultValue={new Date().toISOString().slice(0,10)}/></label></div><button className="primary">Record Purchase Price</button></form>:modal.type==='category'?<form onSubmit={saveCategory}><label>Category name<input name="name" required autoFocus/></label><button className="primary">Save Category</button></form>:<><div className="import-summary"><b>{modal.rows.length}</b><span>rows ready to import</span></div><div className="preview">{modal.rows.slice(0,8).map((r,i)=><div key={i}><b>{r.name||r.ingredient_name}</b><span>{modal.type==='importIngredients'?`${r.default_unit} · ${r.ingredient_type}`:`${r.purchase_quantity||'—'} ${r.purchase_unit||''} · ${r.purchase_price?money(r.purchase_price):'price missing'}`}</span></div>)}</div><button className="primary" onClick={confirmImport}>Confirm Import</button></>}</div></div>}
