"use client";
import {useEffect} from "react";

export default function NavigationCoordinator(){
  useEffect(()=>{
    const onClick=e=>{
      const btn=e.target.closest?.('.side-nav button');
      if(!btn)return;

      // AutosaveRecovery continuously preserves the active recipe. Leaving through
      // app navigation must therefore not trigger the editor's destructive close path.
      // Let the requested sidebar action update the underlying view, then remove the
      // editor overlay without clicking its close/back buttons.
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

      const editor=document.querySelector('.editor-page');
      if(editor){
        editor.style.display='none';
        editor.setAttribute('aria-hidden','true');
        // The sidebar button's React handler runs in this same click and changes the
        // destination view. A small delayed cleanup prevents a stale editor overlay
        // from intercepting taps while preserving the autosaved recovery draft.
        setTimeout(()=>{
          const stale=document.querySelector('.editor-page[aria-hidden="true"]');
          if(stale) stale.style.pointerEvents='none';
        },0);
      }
    };
    document.addEventListener('click',onClick,true);
    return()=>document.removeEventListener('click',onClick,true);
  },[]);
  return null;
}
