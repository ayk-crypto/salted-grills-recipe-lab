"use client";
import {useEffect} from "react";

export default function NavigationCoordinator(){
  useEffect(()=>{
    const onClick=e=>{
      const btn=e.target.closest?.('.side-nav button');
      if(!btn)return;

      // Recipe editing is continuously protected by AutosaveRecovery. Navigation should
      // therefore feel like normal app navigation, not a destructive action. The draft
      // remains recoverable from My Drafts / the recovery control after leaving.
      const target=btn.dataset.unitsNav?'units':btn.dataset.packagingNav?'packaging':'main';

      if(target!=='units'){
        document.querySelector('.unit-modal header button')?.click();
        document.querySelector('.units-master .units-close')?.click();
      }
      if(target!=='packaging'){
        document.querySelector('.pkg-modal header button')?.click();
        document.querySelector('.pkg-master .pkg-search button:last-child')?.click();
      }
      window.dispatchEvent(new CustomEvent('sg:navigate',{detail:{target}}));

      if(document.querySelector('.editor-page')){
        const close=document.querySelector('.editor-page .close-x');
        if(close) setTimeout(()=>close.click(),0);
      }
    };
    document.addEventListener('click',onClick,true);
    return()=>document.removeEventListener('click',onClick,true);
  },[]);
  return null;
}
