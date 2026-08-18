"use client";
import {useEffect} from "react";

export default function PremiumExperience(){
 useEffect(()=>{
  let stopped=false;

  function clickNav(label){
   const btn=[...document.querySelectorAll('.side-nav button')].find(b=>b.textContent?.trim().includes(label));
   btn?.click();
  }
  function clickPageAction(label){
   const btn=[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()===label);
   btn?.click();
  }
  function makeButton(label,kind,action){
   const b=document.createElement('button');
   b.className=`premium-action ${kind||''}`;
   b.textContent=label;
   b.addEventListener('click',action);
   return b;
  }
  function enhanceBrand(){
   const brand=document.querySelector('.side-brand');
   if(brand&&!brand.dataset.premium){
    brand.dataset.premium='1';
    const mark=brand.querySelector('.flame');
    if(mark){mark.textContent='SG';mark.classList.add('premium-mark')}
    const text=brand.querySelector('div:last-child');
    if(text){text.innerHTML='<b>SALTED GRILLS</b><span>COSTING LAB</span>'}
   }
   const user=document.querySelector('.side-user');
   if(user&&!user.dataset.premium){
    user.dataset.premium='1';
    const avatar=user.querySelector(':scope > div');if(avatar)avatar.textContent='SG';
    const name=user.querySelector('b');if(name)name.textContent='Salted Grills';
   }
  }
  function enhancePage(){
   if(stopped)return;
   enhanceBrand();
   const area=document.querySelector('.page-area');
   if(area&&!area.querySelector(':scope > .premium-topbar')){
    const top=document.createElement('div');top.className='premium-topbar';
    const copy=document.createElement('div');copy.className='premium-greeting';copy.innerHTML='<span>RESTAURANT COST CONTROL</span><h1>Welcome back.</h1><p>Keep ingredients, bulk recipes and menu-item costs under control.</p>';
    const actions=document.createElement('div');actions.className='premium-actions';
    actions.append(
      makeButton('Update Price','ghost',()=>clickNav('Ingredients')),
      makeButton('Add Bulk Recipe','olive',()=>{clickNav('Bulk Recipes');setTimeout(()=>clickPageAction('＋ Add Bulk Recipe'),80)}),
      makeButton('Add Menu Item','gold',()=>{clickNav('Menu Items');setTimeout(()=>clickPageAction('＋ Add Menu Item'),80)})
    );
    top.append(copy,actions);area.prepend(top);
   }
   document.body.classList.add('premium-ui');
  }

  enhancePage();
  const observer=new MutationObserver(enhancePage);
  observer.observe(document.body,{childList:true,subtree:true});
  return()=>{stopped=true;observer.disconnect();document.body.classList.remove('premium-ui')};
 },[]);
 return null;
}
