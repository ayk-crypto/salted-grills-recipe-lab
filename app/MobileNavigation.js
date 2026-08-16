"use client";
import {useEffect,useState} from "react";

export default function MobileNavigation(){
  const [open,setOpen]=useState(false);

  useEffect(()=>{
    const apply=()=>{
      document.documentElement.classList.toggle('mobile-nav-open',open);
      document.body.classList.toggle('mobile-nav-open',open);
      document.body.dataset.mobileNav=open?'open':'closed';
    };
    apply();
    return()=>{
      document.documentElement.classList.remove('mobile-nav-open');
      document.body.classList.remove('mobile-nav-open');
      delete document.body.dataset.mobileNav;
    };
  },[open]);

  useEffect(()=>{
    const closeOnNav=e=>{
      if(e.target.closest?.('.side-nav button')) setOpen(false);
    };
    const closeOnEscape=e=>{
      if(e.key==='Escape') setOpen(false);
    };
    const closeOnResize=()=>{
      if(window.innerWidth>820) setOpen(false);
    };
    document.addEventListener('click',closeOnNav);
    document.addEventListener('keydown',closeOnEscape);
    window.addEventListener('resize',closeOnResize);
    return()=>{
      document.removeEventListener('click',closeOnNav);
      document.removeEventListener('keydown',closeOnEscape);
      window.removeEventListener('resize',closeOnResize);
    };
  },[]);

  function toggleMenu(e){
    e.preventDefault();
    e.stopPropagation();
    setOpen(v=>!v);
  }

  return <>
    <button
      type="button"
      className={`mobile-menu-button ${open?'is-open':''}`}
      aria-label={open?'Close navigation':'Open navigation'}
      aria-expanded={open}
      onClick={toggleMenu}
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
