"use client";
import {useEffect,useState} from "react";

function textOf(el){return String(el?.textContent||"").replace(/\s+/g," ").trim()}
function itemName(el){
  return textOf(el?.closest?.('.trow')?.querySelector('span:first-child b')) ||
    textOf(document.querySelector('.editor-head h1')) ||
    textOf(el?.closest?.('.v2-modal')?.querySelector('h2')) || '';
}

export default function SafetyConfirmation(){
  const [pending,setPending]=useState(null);
  const [checked,setChecked]=useState(false);

  useEffect(()=>{
    const originalConfirm=window.confirm;
    window.confirm=()=>{
      if(window.__sgSafetyApproved){window.__sgSafetyApproved=false;return true;}
      return false;
    };

    const describeClick=(button)=>{
      const text=textOf(button);
      const name=itemName(button);
      if(button.closest('.component') && (text==='×'||text==='x'||text==='✕')){
        return {kind:'delete',title:'Remove cost component?',message:`Remove ${name||'this component'} from the current cost sheet? The change is not final until you save the cost sheet.`};
      }
      if(text==='Delete'||/^Delete \d+ Item/.test(text)){
        return {kind:'delete',title:'Confirm deletion',message:name?`You are about to delete “${name}”. Please review this action carefully before continuing.`:'You are about to delete selected cost-control records. Please review this action carefully before continuing.'};
      }
      if(text==='Confirm Import'){
        return {kind:'change',title:'Confirm import',message:'Please confirm that you have reviewed the import preview and want to apply these records to Cost Control.'};
      }
      if(text==='Save' && button.closest('.editor-page')){
        return {kind:'change',title:'Confirm cost-sheet changes',message:`Save the changes to ${name||'this cost sheet'}? Existing costing will be replaced by the values currently shown in the editor.`};
      }
      return null;
    };

    const onClick=(e)=>{
      const button=e.target.closest?.('button');
      if(!button)return;
      if(button.dataset.sgConfirmed==='1'){delete button.dataset.sgConfirmed;return;}
      const info=describeClick(button);
      if(!info)return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      setChecked(false);
      setPending({...info,type:'click',button});
    };

    const onSubmit=(e)=>{
      const form=e.target;
      if(!(form instanceof HTMLFormElement))return;
      if(form.dataset.sgConfirmed==='1'){delete form.dataset.sgConfirmed;return;}
      if(!form.closest('.v2-modal,.editor-page'))return;
      if(form.closest('[data-safety-dialog="1"]'))return;
      const heading=textOf(form.closest('.v2-modal')?.querySelector('h2'))||textOf(document.querySelector('.editor-head h1'))||'this record';
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      setChecked(false);
      setPending({type:'submit',form,submitter:e.submitter||null,kind:'change',title:'Review & confirm changes',message:`You are about to apply changes to ${heading}. Please verify the information before confirming.`});
    };

    document.addEventListener('click',onClick,true);
    document.addEventListener('submit',onSubmit,true);
    return()=>{
      document.removeEventListener('click',onClick,true);
      document.removeEventListener('submit',onSubmit,true);
      window.confirm=originalConfirm;
      window.__sgSafetyApproved=false;
    };
  },[]);

  function close(){setPending(null);setChecked(false)}
  function approve(){
    if(!pending||!checked)return;
    const action=pending;
    close();
    requestAnimationFrame(()=>{
      window.__sgSafetyApproved=true;
      if(action.type==='submit'){
        action.form.dataset.sgConfirmed='1';
        action.form.requestSubmit(action.submitter||undefined);
      }else if(action.button){
        action.button.dataset.sgConfirmed='1';
        action.button.click();
      }
      setTimeout(()=>{window.__sgSafetyApproved=false},100);
    });
  }

  if(!pending)return null;
  const destructive=pending.kind==='delete';
  return <div className="safety-backdrop" data-safety-dialog="1" onMouseDown={e=>e.target===e.currentTarget&&close()}>
    <div className={`safety-dialog ${destructive?'destructive':''}`} role="dialog" aria-modal="true" aria-labelledby="safety-title">
      <div className="safety-icon">{destructive?'!':'✓'}</div>
      <div className="safety-copy">
        <span>COST CONTROL · REVIEW REQUIRED</span>
        <h2 id="safety-title">{pending.title}</h2>
        <p>{pending.message}</p>
      </div>
      <label className="safety-check"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/><span>I have reviewed this action and want to continue.</span></label>
      <div className="safety-actions"><button className="ghost" onClick={close}>Cancel</button><button className={destructive?'safety-danger':'primary'} disabled={!checked} onClick={approve}>{destructive?'Confirm Delete':'Confirm Change'}</button></div>
      <small>This confirmation is the checker step for the same signed-in user and helps prevent accidental changes.</small>
    </div>
  </div>;
}
