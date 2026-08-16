"use client";
import {useEffect} from "react";

export default function DeleteEnhancer(){
  useEffect(()=>{
    let busy=false;
    const enhance=()=>{
      if(busy)return;
      const heading=document.querySelector('.page-head h1')?.textContent?.trim();
      const config=heading==='Ingredients'
        ? {selector:'.ingredient-grid .ingredient', endpoint:'/api/ingredients', label:'ingredient'}
        : heading==='Categories'
          ? {selector:'.category-grid .category-card', endpoint:'/api/categories', label:'category'}
          : null;
      if(!config)return;
      document.querySelectorAll(config.selector).forEach(card=>{
        if(card.querySelector('.master-delete'))return;
        const name=card.querySelector('b')?.textContent?.trim();
        if(!name)return;
        const btn=document.createElement('button');
        btn.type='button';
        btn.className='master-delete';
        btn.setAttribute('aria-label',`Delete ${name}`);
        btn.title=`Delete ${name}`;
        btn.textContent='×';
        btn.addEventListener('click',async(e)=>{
          e.preventDefault();e.stopPropagation();
          if(!window.confirm(`Delete ${config.label} “${name}”?`))return;
          btn.disabled=true;busy=true;
          try{
            const res=await fetch(config.endpoint,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
            const j=await res.json();
            if(!res.ok)throw new Error(j.error||'Could not delete');
            card.remove();
            window.dispatchEvent(new CustomEvent('master-data-deleted',{detail:{type:config.label,name}}));
          }catch(err){window.alert(err.message||'Could not delete');btn.disabled=false}
          finally{busy=false}
        });
        card.appendChild(btn);
      });
    };
    enhance();
    const observer=new MutationObserver(()=>requestAnimationFrame(enhance));
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[]);
  return null;
}
