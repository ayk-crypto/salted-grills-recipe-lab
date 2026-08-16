"use client";
import {useEffect,useState} from "react";
export default function AppFeedback(){
 const [message,setMessage]=useState("");
 useEffect(()=>{const original=window.alert;window.alert=(value)=>setMessage(String(value||"Something went wrong"));return()=>{window.alert=original}},[]);
 if(!message)return null;
 return <div className="app-feedback-backdrop" role="presentation" onClick={()=>setMessage("")}><div className="app-feedback" role="alertdialog" aria-modal="true" onClick={e=>e.stopPropagation()}><div className="app-feedback-icon">!</div><div><small>SALTED GRILLS</small><h3>Couldn’t complete that</h3><p>{message}</p></div><button onClick={()=>setMessage("")}>Got it</button></div></div>;
}
