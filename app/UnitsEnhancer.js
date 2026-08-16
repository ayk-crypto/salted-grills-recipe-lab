"use client";
import {useEffect,useMemo,useState} from "react";

export default function UnitsEnhancer(){
  const [units,setUnits]=useState([]),[showMaster,setShowMaster]=useState(false),[showAdd,setShowAdd]=useState(false),[query,setQuery]=useState('');
  async function reload(){try{const r=await fetch('/api/units',{cache:'no-store'});const j=await r.json();if(Array.isArray(j))setUnits(j)}catch{}}
  useEffect(()=>{reload()},[]);

  useEffect(()=>{
    function sync(){
      const nav=document.querySelector('.side-nav');
      if(nav&&!nav.querySelector('[data-units-nav]')){
        const packaging=nav.querySelector('[data-packaging-nav]');
        const categories=[...nav.querySelectorAll('button')].find(b=>b.textContent.trim().includes('Categories'));
        const btn=document.createElement('button');btn.dataset.unitsNav='1';btn.innerHTML='<i>↔</i>Units';btn.onclick=()=>setShowMaster(true);
        (packaging||categories)?.insertAdjacentElement('afterend',btn);
      }
      const selects=[...document.querySelectorAll('select#unit')];
      selects.forEach(sel=>{
        const current=sel.value;
        const options=units.length?units:[];
        if(options.length){sel.innerHTML=options.map(u=>`<option value="${u.symbol}">${u.symbol} — ${u.name}</option>`).join('');if(options.some(u=>u.symbol===current))sel.value=current}
        const field=sel.closest('.form-field');
        if(field&&!field.querySelector('.unit-add-link')){
          const b=document.createElement('button');b.type='button';b.className='unit-add-link';b.textContent='＋ Add custom unit';b.onclick=()=>setShowAdd(true);field.appendChild(b)
        }
      });
      const finishSelect=[...document.querySelectorAll('.editor-content select')].find(s=>s!==document.getElementById('unit')&&s.closest('.double')&&[...s.options].some(o=>o.value==='portion'));
      if(finishSelect&&units.length){const current=finishSelect.value;finishSelect.innerHTML=units.map(u=>`<option value="${u.symbol}">${u.symbol} — ${u.name}</option>`).join('');if(units.some(u=>u.symbol===current))finishSelect.value=current}
    }
    const obs=new MutationObserver(sync);obs.observe(document.body,{childList:true,subtree:true});sync();return()=>obs.disconnect();
  },[units]);

  async function saveUnit(e){e.preventDefault();const body=Object.fromEntries(new FormData(e.currentTarget));const r=await fetch('/api/units',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)return alert(j.error||'Could not save unit');setShowAdd(false);await reload();setTimeout(()=>{const sel=document.getElementById('unit');if(sel)sel.value=j.symbol},80)}
  async function removeUnit(u){if(!confirm(`Remove “${u.symbol} — ${u.name}” from active units?`))return;const r=await fetch('/api/units',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:u.id})});const j=await r.json();if(!r.ok)return alert(j.error||'Could not remove unit');await reload()}
  const filtered=useMemo(()=>units.filter(u=>(u.name+' '+u.symbol+' '+(u.unit_group||'')).toLowerCase().includes(query.toLowerCase())),[units,query]);

  return <>
    {showMaster&&<div className="units-master"><div className="units-page"><div className="units-head"><div><small>MASTER DATA</small><h1>Units</h1><p>Maintain the measurements available while building recipes.</p></div><div><button onClick={()=>setShowAdd(true)}>＋ Add Unit</button><button className="units-close" onClick={()=>setShowMaster(false)}>×</button></div></div><div className="units-search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search units"/></div><div className="units-grid">{filtered.map(u=><div className="unit-card" key={u.id}><div className="unit-symbol">{u.symbol}</div><div><b>{u.name}</b><span>{u.unit_group||'Custom unit'}</span></div><button onClick={()=>removeUnit(u)} title="Remove unit">×</button></div>)}</div></div></div>}
    {showAdd&&<div className="unit-modal"><form onSubmit={saveUnit}><header><div><small>MASTER DATA</small><h2>Add Unit</h2><p>Create a unit once and reuse it in every recipe.</p></div><button type="button" onClick={()=>setShowAdd(false)}>×</button></header><div className="unit-form"><label>Unit name</label><input name="name" placeholder="e.g. Ladle" required autoFocus/><label>Symbol / short name</label><input name="symbol" placeholder="e.g. ladle" required/><label>Group</label><select name="unit_group" defaultValue="count"><option value="weight">Weight</option><option value="volume">Volume</option><option value="count">Count</option><option value="custom">Custom</option></select><button>Save Unit</button></div></form></div>}
  </>;
}
