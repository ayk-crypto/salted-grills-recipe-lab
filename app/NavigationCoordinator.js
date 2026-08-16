"use client";
import {useEffect} from "react";

export default function NavigationCoordinator(){
  useEffect(()=>{
    const onClick=e=>{
      const btn=e.target.closest?.('.side-nav button');
      if(!btn)return;
      const target=btn.dataset.unitsNav?'units':btn.dataset.packagingNav?'packaging':'main';

      // Tell independently-rendered master screens to close when another section is selected.
      window.dispatchEvent(new CustomEvent('sg:navigate',{detail:{target}}));

      // The recipe editor is a top-level render state. Let its sidebar handler select
      // the destination first, then close the editor so that destination becomes visible.
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
