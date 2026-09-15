"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {usePathname} from "next/navigation";

function parseMeta(v){try{const x=JSON.parse(v||"{}");return x&&typeof x==="object"?x:{}}catch{return {}}}

export default function BulkMenuActions(){
  const path=usePathname()||"/";
  const active=path==="/menu-costing"||path==="/menu-items";
  const [menus,setMenus]=useState([]);
  const [categories,setCategories]=useState([]);
  const [selected,setSelected]=useState(()=>new Set());
  const [anchor,setAnchor]=useState(null);
  const [modal,setModal]=useState(null);
  const [busy,setBusy]=useState(false);
  const observerRef=useRef(null);

  const byName=useMemo(()=>new Map(menus.map(m=>[String(m.name||"").trim().toLowerCase(),m])),[menus]);

  useEffect(()=>{
    if(!active){setSelected(new Set());setModal(null);setAnchor(null);return;}
    let cancelled=false;
    fetch('/api/bootstrap',{cache:'no-store'}).then(r=>r.json()).then(j=>{
      if(cancelled||j.error)return;
      setMenus((j.recipes||[]).filter(r=>r.recipe_type==='menu'));
      setCategories(j.categories||[]);
    }).catch(()=>{});
    return()=>{cancelled=true};
  },[active]);

  useEffect(()=>{
    if(!active||!menus.length)return;
    let cancelled=false;
    const enhance=()=>{
      if(cancelled)return;
      const table=document.querySelector('.v2-table.menu');
      if(!table){requestAnimationFrame(enhance);return;}
      let a=document.querySelector('[data-bulk-menu-anchor="1"]');
      if(!a){a=document.createElement('div');a.dataset.bulkMenuAnchor='1';table.parentNode.insertBefore(a,table)}
      setAnchor(a);

      const header=table.querySelector('.thead');
      const firstHeader=header?.children?.[0];
      if(firstHeader&&!firstHeader.querySelector('.bulk-master-check')){
        const label=document.createElement('label');label.className='bulk-master-check';
        const cb=document.createElement('input');cb.type='checkbox';cb.setAttribute('aria-label','Select all visible menu items');
        const txt=document.createElement('span');txt.textContent='';
        label.append(cb,txt);firstHeader.prepend(label);
        cb.addEventListener('change',()=>{
          const ids=[...table.querySelectorAll('.trow[data-menu-id]')].map(r=>r.dataset.menuId).filter(Boolean);
          setSelected(prev=>{const next=new Set(prev);ids.forEach(id=>cb.checked?next.add(id):next.delete(id));return next});
        });
      }

      table.querySelectorAll('.trow').forEach(row=>{
        const name=row.querySelector('span:first-child b')?.textContent?.trim();
        const item=byName.get(String(name||'').toLowerCase());
        if(!item)return;
        row.dataset.menuId=item.id;
        const first=row.children?.[0];
        if(first&&!first.querySelector('.bulk-row-check')){
          const label=document.createElement('label');label.className='bulk-row-check';
          const cb=document.createElement('input');cb.type='checkbox';cb.setAttribute('aria-label',`Select ${item.name}`);
          cb.addEventListener('click',e=>e.stopPropagation());
          cb.addEventListener('change',()=>setSelected(prev=>{const next=new Set(prev);cb.checked?next.add(item.id):next.delete(item.id);return next}));
          label.append(cb);first.prepend(label);
        }
      });
    };
    enhance();
    observerRef.current=new MutationObserver(()=>enhance());
    observerRef.current.observe(document.body,{childList:true,subtree:true});
    return()=>{cancelled=true;observerRef.current?.disconnect();observerRef.current=null;document.querySelector('[data-bulk-menu-anchor="1"]')?.remove()};
  },[active,menus,byName]);

  useEffect(()=>{
    if(!active)return;
    document.querySelectorAll('.v2-table.menu .trow[data-menu-id]').forEach(row=>{
      const cb=row.querySelector('.bulk-row-check input');if(cb)cb.checked=selected.has(row.dataset.menuId);
      row.classList.toggle('bulk-selected',selected.has(row.dataset.menuId));
    });
    const table=document.querySelector('.v2-table.menu');
    const visible=[...document.querySelectorAll('.v2-table.menu .trow[data-menu-id]')].map(r=>r.dataset.menuId);
    const master=table?.querySelector('.bulk-master-check input');
    if(master){const count=visible.filter(id=>selected.has(id)).length;master.checked=visible.length>0&&count===visible.length;master.indeterminate=count>0&&count<visible.length}
  },[selected,active]);

  async function applyBulkEdit(e){
    e.preventDefault();
    const f=new FormData(e.currentTarget);
    const body={ids:[...selected]};
    if(f.get('apply_category'))body.category=f.get('category')||'';
    if(f.get('apply_price'))body.selling_price=f.get('selling_price');
    if(f.get('apply_target'))body.target_food_cost=f.get('target_food_cost');
    if(Object.keys(body).length===1)return alert('Choose at least one field to update.');
    setBusy(true);
    const r=await fetch('/api/menu-bulk',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),j=await r.json();
    setBusy(false);
    if(!r.ok)return alert(j.error||'Bulk update failed');
    setModal(null);setSelected(new Set());window.location.reload();
  }

  async function bulkDelete(){
    setBusy(true);
    const r=await fetch('/api/menu-bulk',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:[...selected]})}),j=await r.json();
    setBusy(false);
    if(!r.ok)return alert(j.error||'Bulk delete failed');
    setModal(null);setSelected(new Set());window.location.reload();
  }

  if(!active)return null;
  const bar=anchor&&selected.size?createPortal(<div className="bulk-menu-bar">
    <div><b>{selected.size}</b><span>menu item{selected.size===1?'':'s'} selected</span></div>
    <div className="bulk-menu-actions">
      <button className="ghost" onClick={()=>setModal('edit')}>Bulk Edit</button>
      <button className="bulk-danger" onClick={()=>setModal('delete')}>Bulk Delete</button>
      <button className="bulk-clear" onClick={()=>setSelected(new Set())}>Clear Selection</button>
    </div>
  </div>,anchor):null;

  return <>{bar}
    {modal==='edit'&&<div className="modal-bg" onMouseDown={e=>e.target===e.currentTarget&&!busy&&setModal(null)}><div className="v2-modal bulk-edit-modal"><header><div><span>COST CONTROL</span><h2>Bulk Edit {selected.size} Menu Items</h2></div><button disabled={busy} onClick={()=>setModal(null)}>×</button></header><p className="bulk-note">Only the fields you tick below will be changed. Existing ingredients and prepared components will stay untouched.</p><form onSubmit={applyBulkEdit}>
      <label className="bulk-field"><span><input type="checkbox" name="apply_category"/> Change category</span><select name="category" defaultValue=""><option value="">Select category...</option>{categories.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}</select></label>
      <label className="bulk-field"><span><input type="checkbox" name="apply_price"/> Set selling price</span><input name="selling_price" type="number" min="0" step="0.01" placeholder="Rs"/></label>
      <label className="bulk-field"><span><input type="checkbox" name="apply_target"/> Set target food cost %</span><input name="target_food_cost" type="number" min="0.1" max="100" step="0.1" defaultValue="35"/></label>
      <button className="primary" disabled={busy}>{busy?'Updating...':`Update ${selected.size} Items`}</button>
    </form></div></div>}
    {modal==='delete'&&<div className="modal-bg" onMouseDown={e=>e.target===e.currentTarget&&!busy&&setModal(null)}><div className="v2-modal bulk-delete-modal"><header><div><span>COST CONTROL</span><h2>Delete {selected.size} Menu Items?</h2></div><button disabled={busy} onClick={()=>setModal(null)}>×</button></header><p>This will remove the selected items from active Menu Costing. Their historical database records are retained as inactive.</p><div className="bulk-confirm-actions"><button className="ghost" disabled={busy} onClick={()=>setModal(null)}>Cancel</button><button className="bulk-danger" disabled={busy} onClick={bulkDelete}>{busy?'Deleting...':`Delete ${selected.size} Items`}</button></div></div></div>}
  </>;
}
