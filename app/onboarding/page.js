"use client";
import {useState} from "react";

export default function OnboardingPage(){
 const[token,setToken]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function claim(e){e.preventDefault();setBusy(true);setError("");try{const r=await fetch("/api/bootstrap-owner",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token})}),j=await r.json();if(!r.ok)throw new Error(j.error||"Could not activate workspace");window.location.href="/"}catch(err){setError(err.message)}finally{setBusy(false)}}
 async function signout(){await fetch("/api/auth/sign-out",{method:"POST"});window.location.href="/login"}
 return <main className="auth-page"><section className="auth-card"><div className="auth-brand"><div className="auth-mark">PC</div><div><b>PLATECOST</b><span>Secure Workspace Setup</span></div></div><h1>Activate Salted Grills</h1><p>Your account is authenticated. Enter the one-time owner activation code to claim the existing Salted Grills workspace.</p>{error&&<div className="auth-error">{error}</div>}<form onSubmit={claim}><label>Owner activation code<input value={token} onChange={e=>setToken(e.target.value)} autoComplete="off" required/></label><button disabled={busy}>{busy?"Activating…":"Activate workspace"}</button></form><button className="auth-switch" onClick={signout}>Sign out</button></section></main>
}
