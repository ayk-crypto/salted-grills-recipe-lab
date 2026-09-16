"use client";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";

const NAV=[['/','Overview'],['/ingredients','Ingredients'],['/purchase-prices','Purchase Prices'],['/prepared-components','Bulk Recipes'],['/menu-costing','Menu Costing'],['/cost-analysis','Cost Analysis'],['/categories','Categories'],['/settings','Settings']];

export default function SettingsPage(){
  const router=useRouter();
  const [tab,setTab]=useState('workspace');
  const [state,setState]=useState({loading:true,error:'',connected:false,tenant:null,integration:null,mappings:[],items:[]});
  const [form,setForm]=useState({base_url:'https://shelfsense-0qgb.onrender.com',token:''});
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');

  async function load(){
    setState(s=>({...s,loading:true,error:''}));
    try{
      const r=await fetch('/api/integrations/shelfsense',{cache:'no-store'}),j=await r.json();
      if(!r.ok)throw new Error(j.error||'Could not load settings');
      setState({loading:false,error:'',connected:Boolean(j.connected),tenant:j.tenant||null,integration:j.integration||null,mappings:j.mappings||[],items:j.items||[]});
    }catch(e){setState(s=>({...s,loading:false,error:e.message}))}
  }
  useEffect(()=>{load()},[]);

  async function connect(e){
    e.preventDefault();setBusy(true);setNotice('');
    try{
      const r=await fetch('/api/integrations/shelfsense',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)}),j=await r.json();
      if(!r.ok)throw new Error(j.error||'Connection failed');
      setForm(x=>({...x,token:''}));setNotice(`ShelfSense connected. ${j.itemCount||0} items available.`);await load();
    }catch(e){setNotice(e.message)}finally{setBusy(false)}
  }
  async function disconnect(){
    if(!window.confirm('Disconnect ShelfSense from this workspace? Existing historical prices will remain in Cost Control.'))return;
    setBusy(true);setNotice('');
    try{
      const r=await fetch('/api/integrations/shelfsense',{method:'DELETE'}),j=await r.json();
      if(!r.ok)throw new Error(j.error||'Could not disconnect');
      setNotice('ShelfSense disconnected.');await load();
    }catch(e){setNotice(e.message)}finally{setBusy(false)}
  }

  const tenantName=state.tenant?.name||'Salted Grills';
  return <div className="v2-shell settings-shell">
    <aside className="v2-side"><div className="brand"><div>SG</div><b>SALTED<br/>GRILLS</b><span>COST CONTROL</span></div><nav>{NAV.map(([href,label])=><button key={href} className={href==='/settings'?'active':''} onClick={()=>router.push(href)}>{label}</button>)}</nav><footer><b>Workspace Settings</b><span>SaaS administration</span></footer></aside>
    <div className="v2-work"><main className="v2-main settings-main">
      <div className="v2-head"><div><span>SAAS ADMINISTRATION</span><h1>Settings</h1><p>Manage this workspace, users and external integrations.</p></div></div>
      <div className="settings-tabs"><button className={tab==='workspace'?'active':''} onClick={()=>setTab('workspace')}>Workspace</button><button className={tab==='users'?'active':''} onClick={()=>setTab('users')}>Users</button><button className={tab==='integrations'?'active':''} onClick={()=>setTab('integrations')}>Integrations & APIs</button></div>
      {state.error&&<div className="settings-alert bad">{state.error}</div>}{notice&&<div className="settings-alert">{notice}</div>}

      {tab==='workspace'&&<section className="settings-grid">
        <article className="settings-card"><span>WORKSPACE</span><h2>{tenantName}</h2><p>This is the active Cost Control workspace. All ingredients, prices, recipes, mappings and integrations are scoped to this tenant.</p><dl><div><dt>Status</dt><dd>Active</dd></div><div><dt>Tenant ID</dt><dd>{state.tenant?.id||'Loading…'}</dd></div></dl></article>
        <article className="settings-card"><span>SAAS READINESS</span><h2>Tenant isolation is enabled</h2><p>Cost Control already resolves data through the active tenant and stores ShelfSense integration credentials per workspace.</p><div className="settings-note">Authentication and role enforcement should be the next platform layer before multiple restaurant companies are onboarded.</div></article>
      </section>}

      {tab==='users'&&<section className="settings-grid">
        <article className="settings-card wide"><span>USER MANAGEMENT</span><div className="settings-card-head"><div><h2>Workspace users</h2><p>Manage who can access Cost Control and what they are allowed to change.</p></div><button className="primary" disabled title="Enable authentication first">+ Invite User</button></div>
          <div className="settings-user-row"><div className="settings-avatar">A</div><div><b>Workspace Owner</b><small>Current Salted Grills deployment</small></div><span className="settings-role">Owner</span><span className="settings-status">Active</span></div>
          <div className="settings-note">The settings surface is ready, but real user invitations and permission enforcement are intentionally not faked here. The current deployment still resolves a configured default tenant rather than a signed-in user session. The next SaaS step is authentication plus Owner / Admin / Manager / Viewer roles.</div>
        </article>
      </section>}

      {tab==='integrations'&&<section className="settings-grid">
        <article className="settings-card wide"><span>INTEGRATIONS & APIS</span><div className="settings-card-head"><div><h2>ShelfSense</h2><p>Inventory purchasing data source for ingredient price history and costing review.</p></div><div className={`connection-pill ${state.connected?'connected':''}`}>{state.loading?'Checking…':state.connected?'Connected':'Not connected'}</div></div>
          {state.connected?<div className="integration-details"><dl><div><dt>External workspace</dt><dd>{state.integration?.externalTenantId||'—'}</dd></div><div><dt>Mapped ingredients</dt><dd>{state.mappings.length}</dd></div><div><dt>Available items</dt><dd>{state.items.length}</dd></div><div><dt>Last sync</dt><dd>{state.integration?.lastSyncAt?new Date(state.integration.lastSyncAt).toLocaleString():'Not yet synced'}</dd></div><div><dt>Last status</dt><dd>{state.integration?.lastSyncStatus||'Connected'}</dd></div></dl><div className="settings-actions"><button className="ghost" onClick={()=>router.push('/purchase-prices')}>Open Price Sync</button><button className="danger" disabled={busy} onClick={disconnect}>Disconnect</button></div></div>
          :<form className="integration-form" onSubmit={connect}><label>API Base URL<input value={form.base_url} onChange={e=>setForm({...form,base_url:e.target.value})} placeholder="https://..." required/></label><label>Connection Token<input type="password" value={form.token} onChange={e=>setForm({...form,token:e.target.value})} placeholder="Paste ShelfSense integration token" required/></label><button className="primary" disabled={busy}>{busy?'Connecting…':'Connect ShelfSense'}</button><small>The token is validated against ShelfSense before it is stored encrypted for this workspace.</small></form>}
        </article>
        <article className="settings-card"><span>API MANAGEMENT</span><h2>Connection-first design</h2><p>External systems belong here instead of inside operational pages. Cost Control pages should consume approved integrations, not expose credentials.</p><div className="settings-note">Next integrations can follow the same pattern: provider, connection status, credential storage, mappings, last sync and disconnect controls.</div></article>
      </section>}
    </main></div>
  </div>;
}
