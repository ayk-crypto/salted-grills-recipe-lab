"use client";
import {useState} from "react";

export default function LoginPage(){
 const[mode,setMode]=useState("signin"),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function submit(e){
  e.preventDefault();setBusy(true);setError("");
  const data=Object.fromEntries(new FormData(e.currentTarget));
  const endpoint=mode==="signin"?"/api/auth/sign-in/email":"/api/auth/sign-up/email";
  try{
   const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:data.email,password:data.password,name:data.name||data.email})});
   const j=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(j.message||j.error||"Authentication failed");
   window.location.href=mode==="signin"?"/":"/onboarding";
  }catch(err){setError(err.message||"Authentication failed")}finally{setBusy(false)}
 }
 return <main className="auth-page"><section className="auth-card"><div className="auth-brand"><div className="auth-mark">PC</div><div><b>PLATECOST</b><span>Restaurant Cost Control</span></div></div><h1>{mode==="signin"?"Sign in":"Create account"}</h1><p>{mode==="signin"?"Access your PlateCost workspace.":"Create your secure PlateCost account."}</p>{error&&<div className="auth-error">{error}</div>}<form onSubmit={submit}>{mode==="signup"&&<label>Name<input name="name" autoComplete="name" required/></label>}<label>Email<input name="email" type="email" autoComplete="email" required/></label><label>Password<input name="password" type="password" minLength="8" autoComplete={mode==="signin"?"current-password":"new-password"} required/></label><button disabled={busy}>{busy?"Please wait…":mode==="signin"?"Sign in":"Create account"}</button></form><button className="auth-switch" onClick={()=>{setMode(mode==="signin"?"signup":"signin");setError("")}}>{mode==="signin"?"New to PlateCost? Create an account":"Already have an account? Sign in"}</button></section></main>
}
