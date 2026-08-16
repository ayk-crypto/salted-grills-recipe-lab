"use client";
import {useEffect,useState} from "react";

const findNavButton=(label)=>[...document.querySelectorAll('.side-nav button')].find(b=>b.textContent.trim().toLowerCase().includes(label.toLowerCase()));

export default function NativeBottomNav(){
  const [more,setMore]=useState(false);
  const [active,setActive]=useState('home');

  useEffect(()=>{
    const sync=()=>{
      const activeBtn=document.querySelector('.side-nav button.active');
      const text=(activeBtn?.textContent||'').toLowerCase();
      if(text.includes('dashboard'))setActive('home');
      else if(text.includes('recipe'))setActive('recipes');
      else if(text.includes('ingredient'))setActive('ingredients');
      else setActive('more');
    };
    const obs=new MutationObserver(sync);
    obs.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class'],childList:true});
    sync();
    return()=>obs.disconnect();
  },[]);

  const go=(key,label)=>{
    setMore(false);
    setActive(key);
    findNavButton(label)?.click();
  };

  return <>
    <nav className="v2-bottom-nav" aria-label="Primary navigation">
      <button className={active==='home'?'active':''} onClick={()=>go('home','Dashboard')}><i>⌂</i><span>Home</span></button>
      <button className={active==='recipes'?'active':''} onClick={()=>go('recipes','All Recipes')}><i>▣</i><span>Recipes</span></button>
      <button className={active==='ingredients'?'active':''} onClick={()=>go('ingredients','Ingredients')}><i>♨</i><span>Ingredients</span></button>
      <button className={active==='more'?'active':''} onClick={()=>setMore(true)}><i>•••</i><span>More</span></button>
    </nav>
    {more&&<div className="v2-sheet-backdrop" onClick={()=>setMore(false)}>
      <section className="v2-more-sheet" onClick={e=>e.stopPropagation()}>
        <div className="v2-sheet-handle"/>
        <header><div><small>Salted Grills</small><h2>More</h2></div><button onClick={()=>setMore(false)}>×</button></header>
        <div className="v2-more-grid">
          <button onClick={()=>go('more','Menu Recipes')}><i>♨</i><span><b>Menu Recipes</b><small>Customer dishes</small></span></button>
          <button onClick={()=>go('more','Bulk Recipes')}><i>▤</i><span><b>Bulk Recipes</b><small>Kitchen prep</small></span></button>
          <button onClick={()=>go('more','My Drafts')}><i>♧</i><span><b>Drafts</b><small>Continue work</small></span></button>
          <button onClick={()=>go('more','Categories')}><i>◫</i><span><b>Categories</b><small>Recipe groups</small></span></button>
          <button onClick={()=>go('more','Packaging')}><i>▱</i><span><b>Packaging</b><small>Boxes & disposables</small></span></button>
          <button onClick={()=>go('more','Units')}><i>⌁</i><span><b>Units</b><small>Measurement master</small></span></button>
          <button onClick={()=>go('more','Ingredient Prices')}><i>₨</i><span><b>Costing</b><small>Ingredient prices</small></span></button>
        </div>
      </section>
    </div>}
  </>;
}
