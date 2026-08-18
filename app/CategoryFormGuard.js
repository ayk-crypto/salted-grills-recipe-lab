"use client";
import {useEffect} from "react";

export default function CategoryFormGuard(){
 useEffect(()=>{
  const clean=()=>{
   document.querySelectorAll('.simple-modal').forEach(modal=>{
    const title=modal.querySelector('header h2')?.textContent?.trim();
    if(title!=='Add Category')return;
    modal.querySelectorAll('.form-field').forEach(field=>{
      const label=field.querySelector('label')?.textContent?.trim()||'';
      if(label.startsWith('Description'))field.remove();
    });
   });
  };
  clean();
  const observer=new MutationObserver(clean);
  observer.observe(document.body,{childList:true,subtree:true});
  return()=>observer.disconnect();
 },[]);
 return null;
}
