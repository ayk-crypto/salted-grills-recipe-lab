"use client";
import {useEffect} from "react";

const readFile=file=>new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(file)});

export default function KitchenWorkflowEnhancer(){
  useEffect(()=>{
    let loadedPhotos=[];
    let stageExtras={prep:[],during:[]};
    let stepExtras={};
    let deletedKeys=new Set();
    let scheduled=false;
    const original=window.fetch.bind(window);

    const photoObj=(type,url,caption='')=>({photo_type:type,storage_key:`inline:${Date.now()}:${Math.random().toString(36).slice(2)}`,public_url:url,caption});

    window.fetch=async(input,init={})=>{
      const url=typeof input==='string'?input:input?.url||'';
      const method=(init?.method||'GET').toUpperCase();
      let nextInit=init;

      if((method==='POST'&&url==='/api/recipes')||(method==='PUT'&&url.startsWith('/api/recipes/'))){
        try{
          const body=JSON.parse(init.body||'{}');
          const extras=[...stageExtras.prep,...stageExtras.during,...Object.values(stepExtras).flat()];
          const existing=(body.photos||[]).filter(p=>!deletedKeys.has(p.storage_key));
          const seen=new Set(existing.map(p=>p.storage_key||p.public_url));
          for(const p of extras){
            const key=p.storage_key||p.public_url;
            if(key&&!seen.has(key)){existing.push(p);seen.add(key)}
          }
          body.photos=existing;
          nextInit={...init,body:JSON.stringify(body)};
        }catch{}
      }

      const response=await original(input,nextInit);
      if(method==='GET'&&/^\/api\/recipes\/[^/]+$/.test(url)){
        response.clone().json().then(j=>{
          loadedPhotos=j.photos||[];
          stageExtras={prep:[],during:[]};
          stepExtras={};
          deletedKeys=new Set();
          scheduleSync();
        }).catch(()=>{});
      }
      return response;
    };

    function scheduleSync(){
      if(scheduled)return;
      scheduled=true;
      requestAnimationFrame(()=>{
        scheduled=false;
        renderStageGallery();
        renderStepMedia();
      });
    }

    const stageTypeForInput=input=>{
      const inputs=[...document.querySelectorAll('.photo-grid .photo input[type="file"]')];
      const ix=inputs.indexOf(input);
      return ix===0?'prep':ix===1?'during':null;
    };

    async function onCaptureChange(e){
      const input=e.target;
      if(!(input instanceof HTMLInputElement)||input.type!=='file')return;
      const type=stageTypeForInput(input);
      if(!type)return;
      const files=[...(input.files||[])];
      if(files.length>1){
        for(const f of files.slice(1)) stageExtras[type].push(photoObj(type,await readFile(f),`stage:${type}`));
      }
      scheduleSync();
    }

    function allStage(type){
      const base=loadedPhotos.filter(p=>p.photo_type===type&&!String(p.caption||'').startsWith('step:')&&!deletedKeys.has(p.storage_key));
      return [...base,...stageExtras[type]];
    }

    function removePhoto(p,group){
      if(p.storage_key&&!String(p.storage_key).startsWith('inline:'))deletedKeys.add(p.storage_key);
      if(group==='prep'||group==='during') stageExtras[group]=stageExtras[group].filter(x=>x!==p);
      if(String(group).startsWith('step:')){
        const n=group.split(':')[1];
        stepExtras[n]=(stepExtras[n]||[]).filter(x=>x!==p);
      }
      scheduleSync();
    }

    function thumb(p,group){
      const wrap=document.createElement('div');
      wrap.className='kw-thumb';
      const img=document.createElement('img');img.src=p.public_url;img.alt='Step reference';wrap.appendChild(img);
      const x=document.createElement('button');x.type='button';x.setAttribute('aria-label','Remove photo');x.textContent='×';x.onclick=()=>removePhoto(p,group);wrap.appendChild(x);
      return wrap;
    }

    function renderStageGallery(){
      const grid=document.querySelector('.photo-grid');
      if(!grid)return;
      [...grid.querySelectorAll('.photo input[type="file"]')].slice(0,2).forEach(i=>{i.multiple=true;i.setAttribute('accept','image/*')});
      let gal=grid.parentElement?.querySelector(':scope > .kw-stage-gallery');
      if(!gal){
        gal=document.createElement('div');
        gal.className='kw-stage-gallery';
        grid.insertAdjacentElement('afterend',gal);
      }
      const signature=JSON.stringify(['prep','during'].map(t=>allStage(t).map(p=>p.storage_key||p.public_url)));
      if(gal.dataset.signature===signature)return;
      gal.dataset.signature=signature;
      gal.innerHTML='';
      [['prep','Prep photos'],['during','During photos']].forEach(([type,title])=>{
        const photos=allStage(type);
        const sec=document.createElement('section');
        const header=document.createElement('header');
        const b=document.createElement('b');b.textContent=title;
        const span=document.createElement('span');span.textContent=`${photos.length} additional photo${photos.length===1?'':'s'}`;
        header.append(b,span);sec.appendChild(header);
        const strip=document.createElement('div');strip.className='kw-thumb-strip';
        photos.forEach(p=>strip.appendChild(thumb(p,type)));
        sec.appendChild(strip);gal.appendChild(sec);
      });
    }

    async function addStepFiles(stepNo,files){
      if(!files.length)return;
      stepExtras[stepNo]=stepExtras[stepNo]||[];
      for(const f of files) stepExtras[stepNo].push(photoObj('during',await readFile(f),`step:${stepNo}`));
      scheduleSync();
    }

    function stepPhotos(stepNo){
      return [
        ...loadedPhotos.filter(p=>p.photo_type==='during'&&String(p.caption||'')===`step:${stepNo}`&&!deletedKeys.has(p.storage_key)),
        ...(stepExtras[stepNo]||[])
      ];
    }

    function renderStepMedia(){
      const rows=[...document.querySelectorAll('.component-row.method')];
      rows.forEach((row,idx)=>{
        const stepNo=idx+1;
        let media=row.querySelector(':scope > .kw-step-media');
        if(!media){
          media=document.createElement('div');
          media.className='kw-step-media';
          row.appendChild(media);
        }
        const photos=stepPhotos(stepNo);
        const signature=photos.map(p=>p.storage_key||p.public_url).join('|');
        if(media.dataset.signature===signature)return;
        media.dataset.signature=signature;
        media.innerHTML='';

        const head=document.createElement('div');head.className='kw-step-media-head';
        const text=document.createElement('div');
        const title=document.createElement('b');title.textContent='Step photos';
        const hint=document.createElement('small');hint.textContent='Optional · add one or more reference images';
        text.append(title,hint);

        const label=document.createElement('label');label.className='kw-step-photo-button';
        const plus=document.createElement('span');plus.textContent='＋';
        const labelText=document.createElement('strong');labelText.textContent=photos.length?'Add more':'Take / Add Photo';
        label.append(plus,labelText);
        const input=document.createElement('input');input.type='file';input.accept='image/*';input.multiple=true;
        input.onchange=e=>addStepFiles(stepNo,[...(e.target.files||[])]);
        label.appendChild(input);
        head.append(text,label);
        media.appendChild(head);

        if(photos.length){
          const strip=document.createElement('div');strip.className='kw-thumb-strip kw-step-thumbs';
          photos.forEach(p=>strip.appendChild(thumb(p,`step:${stepNo}`)));
          media.appendChild(strip);
        }
      });
    }

    const observer=new MutationObserver(mutations=>{
      const relevant=mutations.some(m=>{
        const el=m.target instanceof Element?m.target:m.target?.parentElement;
        if(!el)return true;
        if(el.closest('.kw-stage-gallery,.kw-step-media'))return false;
        return !!el.closest('.editor-page')||[...m.addedNodes].some(n=>n instanceof Element&&n.matches?.('.editor-page,.component-row.method,.photo-grid'));
      });
      if(relevant)scheduleSync();
    });
    observer.observe(document.body,{childList:true,subtree:true});
    document.addEventListener('change',onCaptureChange,true);
    scheduleSync();

    return()=>{
      window.fetch=original;
      observer.disconnect();
      document.removeEventListener('change',onCaptureChange,true);
    };
  },[]);
  return null;
}
