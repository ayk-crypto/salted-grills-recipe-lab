"use client";
import {useEffect} from "react";

const secondsFromText=text=>{const p=String(text||'').trim().split(':').map(Number);return p.length===2&&p.every(Number.isFinite)?p[0]*60+p[1]:0};

export default function MethodStepFix(){
  useEffect(()=>{
    let pending=[];
    let editorOpen=false;
    const originalFetch=window.fetch.bind(window);

    function render(){
      const entry=[...document.querySelectorAll('.entry-card')].find(x=>x.querySelector('#methodText'));
      if(!entry)return;
      let wrap=entry.parentElement?.querySelector('.msf-pending-steps');
      if(!wrap){
        wrap=document.createElement('div');
        wrap.className='components msf-pending-steps';
        entry.insertAdjacentElement('beforebegin',wrap);
      }
      wrap.innerHTML='';
      pending.forEach((s,idx)=>{
        const row=document.createElement('div');row.className='component-row method msf-step';
        const no=document.createElement('i');no.textContent=String(document.querySelectorAll('.component-row.method:not(.msf-step)').length+idx+1);
        const text=document.createElement('div');
        const b=document.createElement('b');b.textContent=s.instruction;
        const span=document.createElement('span');span.textContent=s.duration_seconds?`${s.duration_seconds} sec`:'No time set';
        text.append(b,span);
        const del=document.createElement('button');del.type='button';del.textContent='×';del.onclick=()=>{pending.splice(idx,1);render()};
        row.append(no,text,del);wrap.appendChild(row);
      });
    }

    function addCurrentStep(){
      const text=document.getElementById('methodText');
      const secs=document.getElementById('methodSecs');
      const instruction=String(text?.value||'').trim();
      if(!instruction){text?.focus();return false}
      const duration=Number(secs?.value||0);
      pending.push({instruction,duration_seconds:Number.isFinite(duration)&&duration>0?duration:null});
      if(text)text.value='';if(secs)secs.value='';
      render();
      return true;
    }

    window.fetch=async(input,init={})=>{
      const url=typeof input==='string'?input:input?.url||'';
      const method=(init?.method||'GET').toUpperCase();
      let nextInit=init;
      if((method==='POST'&&url==='/api/recipes')||(method==='PUT'&&url.startsWith('/api/recipes/'))){
        try{
          const body=JSON.parse(init.body||'{}');
          if(pending.length){body.steps=[...(body.steps||[]),...pending];nextInit={...init,body:JSON.stringify(body)}}
        }catch{}
      }
      const response=await originalFetch(input,nextInit);
      if(method==='GET'&&/^\/api\/recipes\/[^/]+$/.test(url))pending=[];
      if(((method==='POST'&&url==='/api/recipes')||(method==='PUT'&&url.startsWith('/api/recipes/')))&&response.ok)pending=[];
      return response;
    };

    const click=e=>{
      const btn=e.target.closest('button.entry-primary');
      if(btn&&btn.closest('.entry-card')?.querySelector('#methodText')){
        e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
        addCurrentStep();
        return;
      }
      const use=e.target.closest('.kw-use-timer');
      if(use){
        const val=secondsFromText(document.querySelector('.timer b')?.textContent);
        const secs=document.getElementById('methodSecs');
        if(secs)secs.value=val||'';
      }
    };
    document.addEventListener('click',click,true);

    const sync=()=>{
      const editor=!!document.querySelector('.editor-page');
      if(editor&&!editorOpen){
        const title=document.querySelector('.editor-title h1')?.textContent||'';
        if(title.includes('New Recipe'))pending=[];
      }
      editorOpen=editor;
      render();
    };
    const obs=new MutationObserver(sync);obs.observe(document.body,{childList:true,subtree:true});sync();
    return()=>{window.fetch=originalFetch;document.removeEventListener('click',click,true);obs.disconnect()};
  },[]);
  return null;
}
