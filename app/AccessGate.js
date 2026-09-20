"use client";
import {useEffect,useState} from "react";
import {usePathname} from "next/navigation";

export default function AccessGate({children}){
 const pathname=usePathname(),[ready,setReady]=useState(pathname==="/login"||pathname==="/onboarding");
 useEffect(()=>{
  if(pathname==="/login"||pathname==="/onboarding"){setReady(true);return}
  let active=true;
  fetch("/api/me",{cache:"no-store"}).then(async r=>({ok:r.ok,j:await r.json().catch(()=>({}))})).then(({ok,j})=>{
    if(!active)return;
    if(!ok||!j.authenticated){window.location.href="/login";return}
    if(!j.membership){window.location.href="/onboarding";return}
    setReady(true);
  }).catch(()=>{if(active)window.location.href="/login"});
  return()=>{active=false};
 },[pathname]);
 if(!ready)return <div className="auth-loading">Loading PlateCost…</div>;
 return children;
}
