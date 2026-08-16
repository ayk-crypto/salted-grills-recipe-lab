"use client";
import {useEffect} from "react";

export default function ApprovalLockEnhancer(){
 useEffect(()=>{
  let currentId=null,currentLocked=false,pendingApprove=false;
  const originalFetch=window.fetch.bind(window);
  window.fetch=async(input,init={})=>{
   const url=typeof input==='string'?input:input?.url||'';
   const method=(init?.method||'GET').toUpperCase();
   const res=await originalFetch(input,init);
   try{
    if(method==='GET'&&/^\/api\/recipes\/[^/]+$/.test(url)&&res.ok){
     const j=await res.clone().json();currentId=j.id||url.split('/').pop();currentLocked=!!j.is_locked;
     setTimeout(apply,0);
    }
    if(pendingApprove&&res.ok&&((method==='PUT'&&/^\/api\/recipes\/[^/]+$/.test(url))||(method==='POST'&&url==='/api/recipes'))){
     const j=await res.clone().json();const id=method==='PUT'?url.split('/').pop():j?.recipe?.id;
     if(id){await originalFetch(`/api/recipes/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({is_locked:true})});currentId=id;currentLocked=true;}
     pendingApprove=false;
    }
   }catch{}
   return res;
  };

  function setNativeValue(el,value){
   const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
   const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;setter?.call(el,value);
   el.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function apply(){
   const page=document.querySelector('.editor-page');if(!page)return;
   document.querySelectorAll('.approval-lock-banner,.approve-lock-btn').forEach(x=>x.remove());
   if(currentLocked){
    const content=document.querySelector('.editor-content');if(content){const b=document.createElement('div');b.className='approval-lock-banner';b.innerHTML='<strong>🔒 Approved & locked</strong><span>This kitchen standard is protected from accidental changes.</span>';content.prepend(b);}
    page.querySelectorAll('input,select,textarea,.entry-primary,.type-grid button,.mini-link,.component-row button,.photo').forEach(el=>{if(!el.closest('.editor-actions')){el.disabled=true;el.style.pointerEvents='none';}});
    return;
   }
   const finishActive=[...document.querySelectorAll('.wizard button')].some(b=>b.classList.contains('active')&&b.textContent.toLowerCase().includes('finish'));
   if(!finishActive)return;
   const footer=document.querySelector('.editor-footer');if(!footer)return;
   const save=[...footer.querySelectorAll('button')].find(b=>/save recipe/i.test(b.textContent));if(!save)return;
   save.textContent='Save Draft';save.classList.remove('continue');
   const approve=document.createElement('button');approve.className='continue approve-lock-btn';approve.textContent='✓ Approve & Lock Recipe';
   approve.onclick=()=>{
    const status=[...page.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='approved'));
    if(status)setNativeValue(status,'approved');
    pendingApprove=true;setTimeout(()=>save.click(),0);
   };
   footer.appendChild(approve);
  }
  const mo=new MutationObserver(()=>requestAnimationFrame(apply));mo.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});apply();
  return()=>{mo.disconnect();window.fetch=originalFetch};
 },[]);
 return null;
}
