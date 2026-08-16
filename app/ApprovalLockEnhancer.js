"use client";
import {useEffect} from "react";

export default function ApprovalLockEnhancer(){
 useEffect(()=>{
  let currentId=null,currentLocked=false,pendingApprove=false;
  const originalFetch=window.fetch.bind(window);

  window.fetch=async(input,init={})=>{
   const url=typeof input==='string'?input:input?.url||'';
   const method=(init?.method||'GET').toUpperCase();
   let nextInit=init;

   if(pendingApprove&&((method==='PUT'&&/^\/api\/recipes\/[^/]+$/.test(url))||(method==='POST'&&url==='/api/recipes'))){
    try{
     const body=init?.body?JSON.parse(init.body):{};
     nextInit={...init,headers:{...(init?.headers||{}),'Content-Type':'application/json'},body:JSON.stringify({...body,status:'approved'})};
    }catch{}
   }

   const res=await originalFetch(input,nextInit);
   try{
    if(method==='GET'&&/^\/api\/recipes\/[^/]+$/.test(url)&&res.ok){
     const j=await res.clone().json();
     currentId=j.id||url.split('/').pop();
     currentLocked=!!j.is_locked;
     setTimeout(apply,0);
    }

    if(pendingApprove&&res.ok&&((method==='PUT'&&/^\/api\/recipes\/[^/]+$/.test(url))||(method==='POST'&&url==='/api/recipes'))){
     const j=await res.clone().json();
     const id=method==='PUT'?url.split('/').pop():j?.recipe?.id;
     if(id){
      const lockRes=await originalFetch(`/api/recipes/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({is_locked:true})});
      if(lockRes.ok){currentId=id;currentLocked=true;}
     }
     pendingApprove=false;
    }
   }catch{pendingApprove=false}
   return res;
  };

  function applyLockedState(page){
   page.classList.add('recipe-locked');
   let banner=page.querySelector('.approval-lock-banner');
   if(!banner){
    const content=page.querySelector('.editor-content');
    if(content){
     banner=document.createElement('div');
     banner.className='approval-lock-banner';
     banner.innerHTML='<div class="approval-lock-icon">🔒</div><div><strong>Approved kitchen standard</strong><span>This recipe is locked to prevent accidental changes.</span></div>';
     content.prepend(banner);
    }
   }
   page.querySelectorAll('input,select,textarea,.entry-primary,.type-grid button,.mini-link,.component-row button,.photo').forEach(el=>{
    if(!el.closest('.editor-actions')){el.disabled=true;el.style.pointerEvents='none';}
   });
  }

  function apply(){
   const page=document.querySelector('.editor-page');
   if(!page)return;

   if(currentLocked){
    page.classList.remove('finish-step-active');
    page.querySelector('.approve-lock-btn')?.remove();
    applyLockedState(page);
    return;
   }

   page.classList.remove('recipe-locked');
   const banner=page.querySelector('.approval-lock-banner');
   if(banner)banner.remove();

   const finishActive=[...page.querySelectorAll('.wizard button')].some(b=>b.classList.contains('active')&&(b.textContent||'').toLowerCase().includes('finish'));
   page.classList.toggle('finish-step-active',finishActive);
   const footer=page.querySelector('.editor-footer');
   if(!footer)return;

   const statusSelect=[...page.querySelectorAll('.editor-content select')].find(s=>[...s.options].some(o=>o.value==='approved'));
   const statusField=statusSelect?.closest('.form-field');
   if(statusField)statusField.classList.toggle('finish-status-field',finishActive);

   const approveExisting=footer.querySelector('.approve-lock-btn');
   if(!finishActive){
    approveExisting?.remove();
    footer.querySelector('.draft-final-btn')?.classList.remove('draft-final-btn');
    return;
   }

   const buttons=[...footer.querySelectorAll('button:not(.approve-lock-btn)')];
   const save=buttons.find(b=>/save recipe|save draft/i.test(b.textContent||''));
   if(!save)return;

   save.textContent='Save Draft';
   save.classList.add('draft-final-btn');

   if(!approveExisting){
    const approve=document.createElement('button');
    approve.type='button';
    approve.className='continue approve-lock-btn';
    approve.innerHTML='<span class="approve-lock-mark">✓</span><span><b>Approve & Lock</b><small>Final kitchen standard</small></span>';
    approve.onclick=()=>{
     if(approve.disabled)return;
     approve.disabled=true;
     approve.classList.add('is-saving');
     approve.querySelector('b').textContent='Approving…';
     pendingApprove=true;
     save.click();
     setTimeout(()=>{
      if(document.body.contains(approve)){
       approve.disabled=false;
       approve.classList.remove('is-saving');
       const b=approve.querySelector('b');if(b)b.textContent='Approve & Lock';
       pendingApprove=false;
      }
     },8000);
    };
    footer.appendChild(approve);
   }
  }

  const mo=new MutationObserver(()=>requestAnimationFrame(apply));
  mo.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  apply();
  return()=>{mo.disconnect();window.fetch=originalFetch};
 },[]);
 return null;
}
