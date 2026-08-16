"use client";
import {useEffect} from "react";

export default function NavigationCoordinator(){
  useEffect(()=>{
    let editorOpen=false;
    let dirty=false;

    const syncEditor=()=>{
      const open=!!document.querySelector('.editor-page');
      if(open&&!editorOpen) dirty=false;
      if(!open) dirty=false;
      editorOpen=open;
    };
    const observer=new MutationObserver(syncEditor);
    observer.observe(document.body,{childList:true,subtree:true});
    syncEditor();

    const markDirty=e=>{
      if(!document.querySelector('.editor-page'))return;
      if(e.target.closest?.('.editor-page')) dirty=true;
    };
    document.addEventListener('input',markDirty,true);
    document.addEventListener('change',markDirty,true);
    document.addEventListener('click',e=>{
      if(!document.querySelector('.editor-page'))return;
      if(e.target.closest?.('.type-grid button,.entry-primary,.component-row button,.photo,.pkg-recipe button,.kw-use-timer,.timer button')) dirty=true;
    },true);

    const onClick=e=>{
      const btn=e.target.closest?.('.side-nav button');
      if(!btn)return;

      if(document.querySelector('.editor-page')&&dirty){
        const leave=window.confirm('This recipe has unsaved changes. Leave this screen and discard those changes?');
        if(!leave){
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return;
        }
        dirty=false;
      }

      const target=btn.dataset.unitsNav?'units':btn.dataset.packagingNav?'packaging':'main';

      if(target!=='units'){
        document.querySelector('.unit-modal header button')?.click();
        document.querySelector('.units-master .units-close')?.click();
      }
      if(target!=='packaging'){
        document.querySelector('.pkg-modal header button')?.click();
        document.querySelector('.pkg-master .pkg-search button:last-child')?.click();
      }
      window.dispatchEvent(new CustomEvent('sg:navigate',{detail:{target}}));

      if(document.querySelector('.editor-page')){
        const close=document.querySelector('.editor-page .close-x');
        if(close) setTimeout(()=>close.click(),0);
      }
    };
    document.addEventListener('click',onClick,true);
    return()=>{
      observer.disconnect();
      document.removeEventListener('input',markDirty,true);
      document.removeEventListener('change',markDirty,true);
      document.removeEventListener('click',onClick,true);
    };
  },[]);
  return null;
}
