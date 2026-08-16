"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {createPortal} from "react-dom";

const orderTypes=[['dine_in','Dine-in'],['takeaway','Takeaway'],['delivery','Delivery']];

export default function PackagingEnhancer(){
  const [items,setItems]=useState([]),[showMaster,setShowMaster]=useState(false),[target,setTarget]=useState(null);
  const [assignments,setAssignments]=useState([]),[orderType,setOrderType]=useState('takeaway'),[recipeType,setRecipeType]=useState('menu');
  const [editing,setEditing]=useState(null),[query,setQuery]=useState('');
  const assignmentsRef=useRef(assignments), recipeTypeRef=useRef(recipeType), editorWasOpen=useRef(false);
  useEffect(()=>{assignmentsRef.current=assignments},[assignments]);
  useEffect(()=>{recipeTypeRef.current=recipeType},[recipeType]);

  async function reload(){try{const r=await fetch('/api/bootstrap',{cache:'no-store'});const j=await r.json();setItems(j.packaging||[])}catch{}}
  useEffect(()=>{reload()},[]);

  useEffect(()=>{
    const navHandler=e=>{
      const target=e.detail?.target;
      if(target==='packaging'){setShowMaster(true);setEditing(null)}
      else {setShowMaster(false);setEditing(null)}
    };
    window.addEventListener('sg:navigate',navHandler);
    return()=>window.removeEventListener('sg:navigate',navHandler);
  },[]);

  useEffect(()=>{
    const original=window.fetch.bind(window);
    window.fetch=async (input,init={})=>{
      const url=typeof input==='string'?input:input?.url||'';
      const method=(init?.method||'GET').toUpperCase();
      let nextInit=init;
      if((method==='POST'&&url==='/api/recipes')||(method==='PUT'&&url.startsWith('/api/recipes/'))){
        try{const body=JSON.parse(init.body||'{}');body.packaging=recipeTypeRef.current==='menu'?assignmentsRef.current:[];nextInit={...init,body:JSON.stringify(body)}}catch{}
      }
      const response=await original(input,nextInit);
      if(method==='GET'&&/^\/api\/recipes\/[^/]+$/.test(url)){
        response.clone().json().then(j=>{setAssignments((j.packaging||[]).map(p=>({order_type:p.order_type,packaging_item_id:p.packaging_item_id,quantity:Number(p.quantity)})));setRecipeType(j.recipe_type||'menu')}).catch(()=>{});
      }
      return response;
    };
    return()=>{window.fetch=original};
  },[]);

  useEffect(()=>{
    function sync(){
      const nav=document.querySelector('.side-nav');
      if(nav&&!nav.querySelector('[data-packaging-nav]')){
        const categories=[...nav.querySelectorAll('button')].find(b=>b.textContent.trim().includes('Categories'));
        const btn=document.createElement('button');btn.dataset.packagingNav='1';btn.innerHTML='<i>▦</i>Packaging';
        btn.onclick=()=>setShowMaster(true);categories?.insertAdjacentElement('afterend',btn);
      }
      const editor=document.querySelector('.editor-page');
      if(editor&&!editorWasOpen.current){
        const title=editor.querySelector('.editor-title h1')?.textContent||'';
        if(title.includes('New Recipe')){setAssignments([]);setRecipeType('menu')}
      }
      editorWasOpen.current=!!editor;
      const finish=document.querySelector('.editor-content');
      const finishHeading=[...(finish?.querySelectorAll('h2')||[])].some(h=>h.textContent.includes('Finish the kitchen standard'));
      setTarget(finishHeading?finish:null);
    }
    const obs=new MutationObserver(sync);obs.observe(document.body,{childList:true,subtree:true});sync();
    const click=e=>{
      const b=e.target.closest('.type-grid>button');if(b){const txt=b.textContent||'';setRecipeType(txt.includes('Bulk Recipe')?'bulk':'menu')}
      const nav=e.target.closest('.side-nav button');if(nav&&!nav.dataset.packagingNav)setShowMaster(false);
    };
    document.addEventListener('click',click);
    return()=>{obs.disconnect();document.removeEventListener('click',click)};
  },[]);

  async function saveItem(e){e.preventDefault();const body=Object.fromEntries(new FormData(e.currentTarget));if(editing?.id)body.id=editing.id;const r=await fetch('/api/packaging',{method:editing?.id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)return alert(j.error||'Could not save packaging');setEditing(null);await reload()}
  async function removeItem(item){if(!confirm(`Remove “${item.name}” from Packaging?`))return;const r=await fetch('/api/packaging',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:item.id})});const j=await r.json();if(!r.ok)return alert(j.error||'Could not remove packaging');setAssignments(a=>a.filter(x=>x.packaging_item_id!==item.id));await reload()}
  function addAssignment(){const id=document.getElementById('packItem')?.value,qty=Number(document.getElementById('packQty')?.value||1);if(!id||qty<=0)return;setAssignments(a=>[...a,{order_type:orderType,packaging_item_id:id,quantity:qty}]);document.getElementById('packQty').value='1'}
  const filtered=useMemo(()=>items.filter(i=>i.name.toLowerCase().includes(query.toLowerCase())),[items,query]);
  const typeAssignments=assignments.filter(a=>a.order_type===orderType);
  const total=typeAssignments.reduce((s,a)=>{const i=items.find(x=>x.id===a.packaging_item_id);return s+(Number(i?.unit_cost)||0)*Number(a.quantity||0)},0);

  return <>
    {showMaster&&<div className="pkg-master">
      <div className="pkg-page"><div className="pkg-head"><div><small>MASTER DATA</small><h1>Packaging</h1><p>Boxes, bags, cups, tissues and other per-order disposables.</p></div><button onClick={()=>setEditing({})}>＋ Add Packaging</button></div>
      <div className="pkg-search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search packaging"/><button onClick={()=>setShowMaster(false)}>×</button></div>
      <div className="pkg-grid">{filtered.map(i=><div className="pkg-card" key={i.id}><div className="pkg-icon">▦</div><div><b>{i.name}</b><span>{i.unit_cost!=null?`Rs ${Number(i.unit_cost).toFixed(2)} each`:'Price not added yet'}</span>{i.purchase_price!=null&&<small>{i.purchase_quantity} {i.purchase_unit} · Rs {Number(i.purchase_price).toLocaleString()}</small>}</div><button className="pkg-edit" onClick={()=>setEditing(i)}>Edit</button><button className="pkg-delete" onClick={()=>removeItem(i)}>×</button></div>)}</div></div>
    </div>}
    {editing&&<div className="pkg-modal"><form onSubmit={saveItem}><header><div><small>PACKAGING</small><h2>{editing.id?'Edit Packaging':'Add Packaging'}</h2></div><button type="button" onClick={()=>setEditing(null)}>×</button></header><div className="pkg-form"><label>Name</label><input name="name" defaultValue={editing.name||''} required autoFocus/><div className="pkg-two"><div><label>Purchase quantity</label><input name="purchase_quantity" type="number" step="0.01" defaultValue={editing.purchase_quantity||''} placeholder="e.g. 100"/></div><div><label>Purchase unit</label><select name="purchase_unit" defaultValue={editing.purchase_unit||'pcs'}><option>pcs</option><option>pack</option><option>packet</option><option>carton</option><option>kg</option></select></div></div><label>Purchase price (PKR)</label><input name="purchase_price" type="number" step="0.01" defaultValue={editing.purchase_price||''} placeholder="e.g. 2800"/><small className="pkg-hint">Unit cost is calculated automatically from purchase price ÷ purchase quantity.</small><label>Notes</label><textarea name="notes" defaultValue={editing.notes||''}/><button className="pkg-save">Save Packaging</button></div></form></div>}
    {target&&recipeType==='menu'&&createPortal(<section className="pkg-recipe"><div className="pkg-recipe-title"><div><span>SERVING & PACKAGING</span><h3>How is this item packed?</h3><p>Food costing stays separate. Add the packaging used for each order type.</p></div><b>Rs {total.toFixed(2)} <small>{orderTypes.find(x=>x[0]===orderType)?.[1]} packaging</small></b></div><div className="pkg-tabs">{orderTypes.map(([k,l])=><button key={k} className={orderType===k?'active':''} onClick={()=>setOrderType(k)}>{l}<small>{assignments.filter(a=>a.order_type===k).length}</small></button>)}</div><div className="pkg-assigned">{typeAssignments.length?typeAssignments.map((a,n)=>{const i=items.find(x=>x.id===a.packaging_item_id);return <div key={`${a.packaging_item_id}-${n}`}><span>{n+1}</span><p><b>{i?.name||'Packaging item'}</b><small>{i?.unit_cost!=null?`Rs ${Number(i.unit_cost).toFixed(2)} each`:'Price pending'}</small></p><strong>{a.quantity} ×</strong><em>{i?.unit_cost!=null?`Rs ${(Number(i.unit_cost)*a.quantity).toFixed(2)}`:'—'}</em><button onClick={()=>setAssignments(x=>x.filter((_,ix)=>!(x[ix]===a)))}>×</button></div>}):<div className="pkg-empty">No packaging added for {orderTypes.find(x=>x[0]===orderType)?.[1]}.</div>}</div><div className="pkg-add"><select id="packItem"><option value="">Select packaging item</option>{items.map(i=><option value={i.id} key={i.id}>{i.name}{i.unit_cost!=null?` — Rs ${Number(i.unit_cost).toFixed(2)}`:''}</option>)}</select><input id="packQty" type="number" min="0.01" step="0.01" defaultValue="1"/><button onClick={addAssignment}>＋ Add</button></div><button className="pkg-manage" onClick={()=>setShowMaster(true)}>Manage packaging master & prices</button></section>,target)}
  </>;
}
