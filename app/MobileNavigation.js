"use client";
import {useEffect,useState} from "react";

export default function MobileNavigation(){
  const [open,setOpen]=useState(false);

  useEffect(()=>{
    document.body.classList.toggle('mobile-nav-open',open);
    return()=>document.body.classList.remove('mobile-nav-open');
  },[open]);

  useEffect(()=>{
    const closeOnNav=e=>{
      if(e.target.closest?.('.side-nav button')) setOpen(false);
    };
    const closeOnEscape=e=>{
      if(e.key==='Escape') setOpen(false);
    };
    document.addEventListener('click',closeOnNav);
    document.addEventListener('keydown',closeOnEscape);
    return()=>{
      document.removeEventListener('click',closeOnNav);
      document.removeEventListener('keydown',closeOnEscape);
    };
  },[]);

  return <>
    <button
      type="button"
      className="mobile-menu-button"
      aria-label={open?'Close navigation':'Open navigation'}
      aria-expanded={open}
      onClick={()=>setOpen(v=>!v)}
    >
      <span></span><span></span><span></span>
    </button>
    <button
      type="button"
      aria-label="Close navigation"
      className={`mobile-nav-backdrop ${open?'show':''}`}
      onClick={()=>setOpen(false)}
    />
  </>;
}
