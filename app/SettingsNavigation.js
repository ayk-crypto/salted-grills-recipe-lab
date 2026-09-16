"use client";
import {useEffect} from "react";
import {usePathname,useRouter} from "next/navigation";

export default function SettingsNavigation(){
  const path=usePathname()||'/';
  const router=useRouter();
  useEffect(()=>{
    if(path.startsWith('/settings'))return;
    const nav=document.querySelector('.v2-side nav');
    if(!nav||nav.querySelector('[data-settings-nav="1"]'))return;
    const b=document.createElement('button');
    b.type='button';
    b.dataset.settingsNav='1';
    b.textContent='Settings';
    b.addEventListener('click',()=>router.push('/settings'));
    nav.appendChild(b);
    return()=>b.remove();
  },[path,router]);
  return null;
}
