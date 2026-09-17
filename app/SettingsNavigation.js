"use client";
import {useEffect} from "react";
import {usePathname,useRouter} from "next/navigation";

export default function SettingsNavigation(){
  const path=usePathname()||'/';
  const router=useRouter();

  useEffect(()=>{
    if(path.startsWith('/settings'))return;
    let cancelled=false;
    const applyBrand=(workspaceName='Workspace')=>{
      if(cancelled)return;
      const brand=document.querySelector('.v2-side .brand');
      if(brand){
        brand.innerHTML='';
        const mark=document.createElement('div');
        mark.className='product-mark';
        mark.textContent='PC';
        const name=document.createElement('b');
        name.className='product-name';
        name.textContent='PLATECOST';
        const tagline=document.createElement('span');
        tagline.className='product-tagline';
        tagline.textContent='RESTAURANT COST CONTROL';
        const workspace=document.createElement('section');
        workspace.className='workspace-switch';
        const label=document.createElement('small');
        label.textContent='WORKSPACE';
        const value=document.createElement('strong');
        value.textContent=workspaceName||'Workspace';
        workspace.append(label,value);
        brand.append(mark,name,tagline,workspace);
      }
      const footer=document.querySelector('.v2-side footer');
      if(footer){footer.innerHTML='<b>PlateCost</b><span>Restaurant costing</span>'}
    };

    applyBrand();
    fetch('/api/integrations/shelfsense',{cache:'no-store'})
      .then(r=>r.ok?r.json():null)
      .then(j=>{if(j?.tenant?.name)applyBrand(j.tenant.name)})
      .catch(()=>{});

    const nav=document.querySelector('.v2-side nav');
    let settingsButton=null;
    if(nav&&!nav.querySelector('[data-settings-nav="1"]')){
      settingsButton=document.createElement('button');
      settingsButton.type='button';
      settingsButton.dataset.settingsNav='1';
      settingsButton.textContent='Settings';
      settingsButton.addEventListener('click',()=>router.push('/settings'));
      nav.appendChild(settingsButton);
    }
    return()=>{cancelled=true;settingsButton?.remove()};
  },[path,router]);
  return null;
}
