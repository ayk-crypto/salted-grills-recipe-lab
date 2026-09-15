"use client";
import {useEffect} from "react";
import {usePathname} from "next/navigation";

function replaceText(root,from,to){
  if(!root)return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  nodes.forEach(n=>{if(n.nodeValue?.includes(from))n.nodeValue=n.nodeValue.replaceAll(from,to)});
}

export default function CostControlUX(){
  const path=usePathname()||'/';
  useEffect(()=>{
    let raf=0;
    const apply=()=>{
      cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{
        document.querySelectorAll('.v2-side nav button').forEach(b=>{if(b.textContent?.trim()==='Prepared Components')b.textContent='Bulk Recipes'});

        if(path.startsWith('/prepared-components')||path.startsWith('/bulk-recipes')){
          const main=document.querySelector('.v2-main');
          const h1=main?.querySelector('.v2-head h1');if(h1&&h1.textContent==='Prepared Components')h1.textContent='Bulk Recipes';
          const sub=main?.querySelector('.v2-head p');if(sub&&sub.textContent?.includes('Batch-cost sauces'))sub.textContent='Create reusable batch recipes such as sauces, rice, marinades and other prepared items. Their unit cost can be used inside menu costing.';
          main?.querySelectorAll('button').forEach(b=>{if(b.textContent?.trim()==='+ Add Component')b.textContent='+ Add Bulk Recipe'});
          const search=main?.querySelector('.v2-toolbar input');if(search&&search.placeholder==='Search prepared components...')search.placeholder='Search bulk recipes...';
          const firstHeader=main?.querySelector('.v2-table.prepared .thead span:first-child');if(firstHeader&&firstHeader.textContent==='Prepared Component')firstHeader.textContent='Bulk Recipe';
          replaceText(main,'prepared component','bulk recipe');
          replaceText(main,'Prepared component','Bulk Recipe');
        }

        if(path==='/menu-costing'||path==='/menu-items'){
          const main=document.querySelector('.v2-main');
          const toolbar=main?.querySelector('.v2-toolbar');
          if(toolbar&&!main.querySelector('[data-costing-help="1"]')){
            const help=document.createElement('div');help.className='costing-help';help.dataset.costingHelp='1';
            help.innerHTML='<div><b>Cost a menu item</b><span>Select any menu item below and open its cost sheet. You can combine raw Ingredients and reusable Bulk Recipes in the same item.</span></div><span>Bulk Recipes are costed separately and their portion cost is calculated automatically from the batch yield.</span>';
            toolbar.parentNode.insertBefore(help,toolbar);
          }
          main?.querySelectorAll('.v2-table.menu .trow').forEach(row=>{
            const edit=[...row.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Edit Cost'||b.textContent?.trim()==='Open Cost Sheet');
            if(edit&&edit.textContent!=='Open Cost Sheet')edit.textContent='Open Cost Sheet';
            if(edit&&!row.dataset.costRowClick){row.dataset.costRowClick='1';row.addEventListener('click',e=>{if(e.target.closest('button,input,label,a'))return;edit.click()})}
          });
        }

        if(/^\/(menu-costing|menu-items)\/[^/]+$/.test(path)){
          const adder=document.querySelector('.editor-page .adder');
          if(adder&&!adder.dataset.costSourceGuide){
            adder.dataset.costSourceGuide='1';
            const guide=document.createElement('div');guide.className='cost-source-guide';
            guide.innerHTML='<div><b>Ingredient</b><span>Use a purchased/raw item from the Ingredient Master. Enter the quantity used and Cost Control calculates the cost from the latest purchase price.</span></div><div><b>Bulk Recipe</b><span>Use a pre-costed batch such as sauce, marinade or boiled rice. Enter grams/ml/pcs used and its portion cost is calculated from the batch yield automatically.</span></div>';
            adder.parentNode.insertBefore(guide,adder);
          }
          replaceText(document.querySelector('.editor-page'),'prepared bulk component','Bulk Recipe');
          replaceText(document.querySelector('.editor-page'),'prepared component','Bulk Recipe');
          replaceText(document.querySelector('.editor-page'),'Prepared component','Bulk Recipe');
          replaceText(document.querySelector('.editor-page'),'Ingredient or Bulk Recipe component','Ingredient or Bulk Recipe');
        }
      });
    };
    apply();
    const obs=new MutationObserver(apply);obs.observe(document.body,{childList:true,subtree:true});
    return()=>{cancelAnimationFrame(raf);obs.disconnect()};
  },[path]);
  return null;
}
