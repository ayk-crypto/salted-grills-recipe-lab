"use client";
import {useEffect} from "react";

function isEditable(el){
  if(!el)return false;
  if(el.matches?.('textarea'))return true;
  if(!el.matches?.('input'))return false;
  return !['checkbox','radio','file','button','submit','reset','range','color'].includes(String(el.type||'text').toLowerCase());
}

function escapeValue(v){
  try{return CSS.escape(String(v||''))}catch{return String(v||'').replace(/["\\]/g,'\\$&')}
}

function selectorFor(el){
  const tag=el.tagName.toLowerCase();
  if(el.id)return `#${escapeValue(el.id)}`;
  if(el.name)return `${tag}[name="${escapeValue(el.name)}"]`;
  if(el.getAttribute('placeholder'))return `${tag}[placeholder="${escapeValue(el.getAttribute('placeholder'))}"]`;
  const form=el.closest('form,.v2-modal,.editor-page,.safety-dialog,.ss-panel');
  if(!form)return null;
  const candidates=[...form.querySelectorAll('input,textarea')].filter(isEditable);
  const index=candidates.indexOf(el);
  if(index<0)return null;
  const marker=form.classList.contains('editor-page')?'.editor-page':form.classList.contains('v2-modal')?'.v2-modal':form.classList.contains('ss-panel')?'.ss-panel':'form';
  return `${marker} input,${marker} textarea|${index}`;
}

function findTarget(sel){
  if(!sel)return null;
  if(sel.includes('|')){
    const [query,rawIndex]=sel.split('|');
    return [...document.querySelectorAll(query)].filter(isEditable)[Number(rawIndex)]||null;
  }
  try{return document.querySelector(sel)}catch{return null}
}

export default function AppInputFocusGuard(){
  useEffect(()=>{
    let last=null,raf=0;
    const remember=(el)=>{
      if(!isEditable(el))return;
      last={
        selector:selectorFor(el),
        name:el.name||'',
        placeholder:el.getAttribute('placeholder')||'',
        value:el.value,
        start:typeof el.selectionStart==='number'?el.selectionStart:null,
        end:typeof el.selectionEnd==='number'?el.selectionEnd:null,
        path:location.pathname,
        at:Date.now(),
      };
    };
    const restore=()=>{
      raf=0;
      if(!last||Date.now()-last.at>900||last.path!==location.pathname)return;
      const active=document.activeElement;
      if(active&&active!==document.body&&active!==document.documentElement&&isEditable(active))return;
      const target=findTarget(last.selector);
      if(!target||!isEditable(target)||target.disabled||target.readOnly)return;
      if(target.value!==last.value)return;
      try{
        target.focus({preventScroll:true});
        if(last.start!==null&&typeof target.setSelectionRange==='function')target.setSelectionRange(last.start,last.end??last.start);
      }catch{}
    };
    const schedule=()=>{if(!raf)raf=requestAnimationFrame(restore)};
    const onInput=(e)=>{if(isEditable(e.target)){remember(e.target);queueMicrotask(schedule)}};
    const onKey=(e)=>{if(e.key==='Tab'||e.key==='Escape'||e.key==='Enter'&&e.target?.tagName==='INPUT')last=null;else if(isEditable(e.target))remember(e.target)};
    const onPointer=(e)=>{if(!isEditable(e.target))last=null};
    const onFocus=(e)=>{if(isEditable(e.target))remember(e.target)};
    const observer=new MutationObserver(()=>{if(last&&Date.now()-last.at<900)schedule()});
    observer.observe(document.documentElement,{childList:true,subtree:true});
    document.addEventListener('input',onInput,true);
    document.addEventListener('keydown',onKey,true);
    document.addEventListener('pointerdown',onPointer,true);
    document.addEventListener('focusin',onFocus,true);
    return()=>{
      observer.disconnect();
      cancelAnimationFrame(raf);
      document.removeEventListener('input',onInput,true);
      document.removeEventListener('keydown',onKey,true);
      document.removeEventListener('pointerdown',onPointer,true);
      document.removeEventListener('focusin',onFocus,true);
    };
  },[]);
  return null;
}
