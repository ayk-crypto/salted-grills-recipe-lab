"use client";
import {useEffect,useRef} from "react";
import {usePathname,useRouter} from "next/navigation";

const routes={
  home:"/",
  menu:"/menu-items",
  bulk:"/bulk-recipes",
  ingredients:"/ingredients",
  categories:"/categories"
};

function text(el){return (el?.textContent||"").replace(/\s+/g," ").trim()}
function findSidebar(label){return [...document.querySelectorAll('.side-nav button')].find(b=>text(b).includes(label))}
function findButton(label){return [...document.querySelectorAll('button')].find(b=>text(b)===label || text(b).includes(label))}
function viewFromPath(path){
  if(path.startsWith('/menu-items'))return 'menu';
  if(path.startsWith('/bulk-recipes'))return 'bulk';
  if(path.startsWith('/ingredients'))return 'ingredients';
  if(path.startsWith('/categories'))return 'categories';
  return 'home';
}

export default function RouteExperience(){
  const pathname=usePathname();
  const router=useRouter();
  const applying=useRef(false);
  const lastPath=useRef('');

  useEffect(()=>{
    let stopped=false,timer;
    async function applyRoute(){
      if(stopped||applying.current)return;
      const path=pathname||'/';
      if(lastPath.current===path && document.querySelector('.layout'))return;
      applying.current=true;
      try{
        const view=viewFromPath(path);
        const labels={home:'Dashboard',menu:'Menu Items',bulk:'Bulk Recipes',ingredients:'Ingredients',categories:'Categories'};
        const side=findSidebar(labels[view]);
        if(side && !side.classList.contains('active'))side.click();

        if(path==='/menu-items/new' || path==='/bulk-recipes/new'){
          await new Promise(r=>setTimeout(r,60));
          const add=findButton(path.startsWith('/menu-items')?'Add Menu Item':'Add Bulk Recipe');
          if(add && !document.querySelector('.cost-editor'))add.click();
        } else {
          const m=path.match(/^\/(menu-items|bulk-recipes)\/([^/]+)$/);
          if(m && m[2]!=='new'){
            await new Promise(r=>setTimeout(r,80));
            const id=decodeURIComponent(m[2]);
            try{
              const res=await fetch(`/api/recipes/${id}`,{cache:'no-store'});
              const recipe=await res.json();
              if(res.ok && !document.querySelector('.cost-editor')){
                const cards=[...document.querySelectorAll('.cost-card')];
                const card=cards.find(c=>text(c.querySelector('.cost-card-main b'))===recipe.name);
                card?.click();
              }
            }catch{}
          }
        }
        lastPath.current=path;
      } finally { applying.current=false; }
    }
    timer=setTimeout(applyRoute,0);
    return()=>{stopped=true;clearTimeout(timer)};
  },[pathname]);

  useEffect(()=>{
    let data={recipes:[]};
    fetch('/api/bootstrap',{cache:'no-store'}).then(r=>r.json()).then(j=>{if(!j.error)data=j}).catch(()=>{});

    const onClick=e=>{
      const button=e.target.closest('button,.cost-card,.editor-title>button');
      if(!button)return;
      if(applying.current)return;

      if(button.closest('.side-nav')){
        const t=text(button);
        const next=t.includes('Dashboard')?routes.home:t.includes('Menu Items')?routes.menu:t.includes('Bulk Recipes')?routes.bulk:t.includes('Ingredients')?routes.ingredients:t.includes('Categories')?routes.categories:null;
        if(next && next!==window.location.pathname)router.push(next,{scroll:false});
        return;
      }

      const t=text(button);
      if(t.includes('Add Menu Item')){ if(window.location.pathname!=='/menu-items/new')router.push('/menu-items/new',{scroll:false}); return; }
      if(t.includes('Add Bulk Recipe')){ if(window.location.pathname!=='/bulk-recipes/new')router.push('/bulk-recipes/new',{scroll:false}); return; }

      const card=button.closest('.cost-card');
      if(card){
        const name=text(card.querySelector('.cost-card-main b'));
        const icon=card.querySelector('.list-icon');
        const type=icon?.classList.contains('bulk')?'bulk':'menu';
        const recipe=(data.recipes||[]).find(r=>r.name===name&&r.recipe_type===type);
        if(recipe){
          const next=`/${type==='bulk'?'bulk-recipes':'menu-items'}/${recipe.id}`;
          if(window.location.pathname!==next)router.push(next,{scroll:false});
        }
        return;
      }

      if(button.matches('.editor-title>button')){
        const isBulk=text(document.querySelector('.editor-title small')).includes('BULK');
        router.push(isBulk?'/bulk-recipes':'/menu-items',{scroll:false});
      }
    };

    document.addEventListener('click',onClick,true);
    return()=>document.removeEventListener('click',onClick,true);
  },[router]);

  useEffect(()=>{
    const observer=new MutationObserver(()=>{
      if(applying.current)return;
      const editor=document.querySelector('.cost-editor');
      if(!editor)return;
      const heading=text(editor.querySelector('.editor-title h1'));
      const isBulk=heading.includes('Bulk Recipe');
      const isNew=heading.startsWith('Add ');
      if(isNew){
        const wanted=isBulk?'/bulk-recipes/new':'/menu-items/new';
        if(window.location.pathname!==wanted)window.history.replaceState({},'',wanted);
      }
    });
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[]);

  return null;
}
