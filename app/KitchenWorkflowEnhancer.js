"use client";
import {useEffect} from "react";

const readFile=file=>new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(file)});
const secondsFromText=text=>{const p=String(text||'').trim().split(':').map(Number);return p.length===2&&p.every(Number.isFinite)?p[0]*60+p[1]:0};

export default function KitchenWorkflowEnhancer(){
  useEffect(()=>{
    let loadedPhotos=[];
    let stageExtras={prep:[],during:[]};
    let stepExtras={};
    let deletedKeys=new Set();
    let maxTimerSeconds=0;
    const original=window.fetch.bind(window);

    window.fetch=async(input,init={})=>{
      const url=typeof input==='string'?input:input?.url||'';
      const method=(init?.method||'GET').toUpperCase();
      let nextInit=init;
      if((method==='POST'&&url==='/api/recipes')||(method==='PUT'&&url.startsWith('/api/recipes/'))){
        try{
          const body=JSON.parse(init.body||'{}');
          const visible=secondsFromText(document.querySelector('.timer b')?.textContent);
          const secs=Math.max(visible,maxTimerSeconds);
          if(secs>0) body.cook_time_minutes=Math.max(Number(body.cook_time_minutes)||0,Math.max(1,Math.ceil(secs/60)));
          const extras=[...stageExtras.prep,...stageExtras.during,...Object.values(stepExtras).flat()];
          const existing=(body.photos||[]).filter(p=>!deletedKeys.has(p.storage_key));
          const seen=new Set(existing.map(p=>p.storage_key||p.public_url));
          for(const p of extras){const key=p.storage_key||p.public_url;if(key&&!seen.has(key)){existing.push(p);seen.add(key)}}
          body.photos=existing;
          nextInit={...init,body:JSON.stringify(body)};
        }catch{}
      }
      const response=await original(input,nextInit);
      if(method==='GET'&&/^\/api\/recipes\/[^/]+$/.test(url)){
        response.clone().json().then(j=>{
          loadedPhotos=j.photos||[];stageExtras={prep:[],during:[]};stepExtras={};deletedKeys=new Set();
          maxTimerSeconds=(Number(j.cook_time_minutes)||0)*60;
          setTimeout(sync,40);
        }).catch(()=>{});
      }
      return response;
    };

    const stageTypeForInput=input=>{
      const inputs=[...document.querySelectorAll('.photo-grid .photo input[type="file"]')];
      const ix=inputs.indexOf(input);return ix===0?'prep':ix===1?'during':null;
    };
    const photoObj=(type,url,caption='')=>({photo_type:type,storage_key:`inline:${Date.now()}:${Math.random().toString(36).slice(2)}`,public_url:url,caption});

    async function onCaptureChange(e){
      const input=e.target;if(!(input instanceof HTMLInputElement)||input.type!=='file')return;
      const type=stageTypeForInput(input);if(!type)return;
      const label=input.closest('.photo');
      const previous=label?.querySelector('img')?.src;
      if(previous&&!stageExtras[type].some(p=>p.public_url===previous)&&!loadedPhotos.some(p=>p.public_url===previous))stageExtras[type].push(photoObj(type,previous,`stage:${type}`));
      const files=[...(input.files||[])];
      for(const f of files.slice(1)){stageExtras[type].push(photoObj(type,await readFile(f),`stage:${type}`))}
      setTimeout(renderStageGallery,60);
    }

    function allStage(type){
      const base=loadedPhotos.filter(p=>p.photo_type===type&&!String(p.caption||'').startsWith('step:')&&!deletedKeys.has(p.storage_key));
      return [...base,...stageExtras[type]];
    }
    function removePhoto(p,group,index){
      if(p.storage_key&&!String(p.storage_key).startsWith('inline:'))deletedKeys.add(p.storage_key);
      if(group==='prep'||group==='during')stageExtras[group]=stageExtras[group].filter((x,i)=>!(x===p||i===index&&x.public_url===p.public_url));
      if(String(group).startsWith('step:')){const n=group.split(':')[1];stepExtras[n]=(stepExtras[n]||[]).filter(x=>x!==p)}
      renderStageGallery();renderStepMedia();
    }
    function thumb(p,group,index){
      const wrap=document.createElement('div');wrap.className='kw-thumb';
      const img=document.createElement('img');img.src=p.public_url;wrap.appendChild(img);
      const x=document.createElement('button');x.type='button';x.textContent='×';x.onclick=()=>removePhoto(p,group,index);wrap.appendChild(x);return wrap;
    }
    function renderStageGallery(){
      const grid=document.querySelector('.photo-grid');if(!grid)return;
      [...grid.querySelectorAll('.photo input[type="file"]')].slice(0,2).forEach(i=>{i.multiple=true;i.setAttribute('accept','image/*')});
      let gal=grid.parentElement?.querySelector('.kw-stage-gallery');
      if(!gal){gal=document.createElement('div');gal.className='kw-stage-gallery';grid.insertAdjacentElement('afterend',gal)}
      gal.innerHTML='';
      [['prep','Prep photos'],['during','During photos']].forEach(([type,title])=>{
        const photos=allStage(type);const sec=document.createElement('section');sec.innerHTML=`<header><b>${title}</b><span>${photos.length} saved + current tile</span></header>`;
        const strip=document.createElement('div');strip.className='kw-thumb-strip';photos.forEach((p,i)=>strip.appendChild(thumb(p,type,i)));sec.appendChild(strip);gal.appendChild(sec)
      });
    }
    async function addStepFiles(stepNo,files){
      stepExtras[stepNo]=stepExtras[stepNo]||[];
      for(const f of files)stepExtras[stepNo].push(photoObj('during',await readFile(f),`step:${stepNo}`));
      renderStepMedia();
    }
    function stepPhotos(stepNo){
      return [...loadedPhotos.filter(p=>p.photo_type==='during'&&String(p.caption||'')===`step:${stepNo}`&&!deletedKeys.has(p.storage_key)),...(stepExtras[stepNo]||[])];
    }
    function renderStepMedia(){
      const rows=[...document.querySelectorAll('.component-row.method')];
      rows.forEach((row,idx)=>{
        const stepNo=idx+1;let media=row.querySelector('.kw-step-media');if(!media){media=document.createElement('div');media.className='kw-step-media';row.appendChild(media)}
        media.innerHTML='';
        const left=document.createElement('div');left.className='kw-step-upload';
        const label=document.createElement('label');label.innerHTML='<span>＋</span> Add step photos';
        const input=document.createElement('input');input.type='file';input.accept='image/*';input.multiple=true;input.setAttribute('capture','environment');input.onchange=e=>addStepFiles(stepNo,[...(e.target.files||[])]);label.appendChild(input);left.appendChild(label);
        const photos=stepPhotos(stepNo);const count=document.createElement('small');count.textContent=photos.length?`${photos.length} photo${photos.length===1?'':'s'}`:'Optional';left.appendChild(count);media.appendChild(left);
        const strip=document.createElement('div');strip.className='kw-thumb-strip';photos.forEach((p,i)=>strip.appendChild(thumb(p,`step:${stepNo}`,i)));media.appendChild(strip)
      });
    }
    function enhanceTimer(){
      const timer=document.querySelector('.timer');if(!timer)return;
      if(!timer.querySelector('.kw-timer-note')){const n=document.createElement('div');n.className='kw-timer-note';n.textContent='Timer is saved automatically with the recipe.';timer.appendChild(n)}
      const entry=[...document.querySelectorAll('.entry-card')].find(x=>x.querySelector('#methodSecs'));
      if(entry&&!entry.querySelector('.kw-use-timer')){const b=document.createElement('button');b.type='button';b.className='kw-use-timer';b.textContent='Use current timer for this step';b.onclick=()=>{const s=secondsFromText(document.querySelector('.timer b')?.textContent);const inp=document.getElementById('methodSecs');if(inp){inp.value=s;inp.focus()}};entry.querySelector('#methodSecs')?.parentElement?.appendChild(b)}
    }
    function sync(){renderStageGallery();renderStepMedia();enhanceTimer()}

    const timerPoll=setInterval(()=>{const s=secondsFromText(document.querySelector('.timer b')?.textContent);if(s>maxTimerSeconds)maxTimerSeconds=s},800);
    const onClick=e=>{const b=e.target.closest('.timer button');if(b&&/reset/i.test(b.textContent||''))maxTimerSeconds=0};
    document.addEventListener('click',onClick);
    document.addEventListener('change',onCaptureChange,true);
    const obs=new MutationObserver(()=>sync());obs.observe(document.body,{childList:true,subtree:true});sync();
    return()=>{window.fetch=original;clearInterval(timerPoll);obs.disconnect();document.removeEventListener('click',onClick);document.removeEventListener('change',onCaptureChange,true)};
  },[]);
  return null;
}
