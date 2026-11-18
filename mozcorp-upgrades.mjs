// SPDX-License-Identifier: GPL-3.0-only
// A trusted, generic proposal desk. It never reads a world, private desk, file or vault.
const AREAS = new Map([
  ['world_shell', 'Navigation and layout'],
  ['fiction_surface', 'Fictional creative tools'],
  ['upgrade_studio', 'Proposal and review workflow'],
  ['local_first_boundary', 'Local data boundaries']
]);
const STATUS = {PENDING_REVIEW:'Awaiting review',APPROVED:'Approved for a manual release',DECLINED:'Declined',DEPLOYED:'Deployment recorded',ROLLED_BACK:'Rollback recorded'};
const fail = message => { throw new Error(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function string(value, max, label) { if (typeof value !== 'string' || value.length > max) fail('Invalid '+label+'.'); return value; }
function bounded(value, min, max, label) { const result=string(value,max,label).trim(); if(result.length<min)fail(label+' needs '+min+'–'+max+' characters.');return result; }
const when = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Time not recorded';
let instance = 0;

export function validateUpgradeState(value) {
  if(!object(value)||typeof value.scope!=='string'||!value.scope||value.scope.length>200||!Number.isSafeInteger(value.revision)||value.revision<0||!object(value.settings)||typeof value.settings.enabled!=='boolean'||typeof value.configured!=='boolean'||!Number.isInteger(value.dailyLimit)||value.dailyLimit<1||value.dailyLimit>50)fail('The upgrade desk returned an invalid state. Refresh before making changes.');
  string(value.model,200,'AI model');bounded(value.consentVersion,1,100,'consent version');
  if(!Array.isArray(value.proposals)||value.proposals.length>200||!Array.isArray(value.audit)||value.audit.length>1000)fail('The upgrade history exceeds its display limits.');
  if(value.modules!==undefined&&(!Array.isArray(value.modules)||value.modules.length>20||value.modules.some(m=>!object(m)||!AREAS.has(m.id)||typeof m.label!=='string'||m.label.length>200||typeof m.boundary!=='string'||m.boundary.length>2000)))fail('The upgrade area list is invalid.');
  for(const p of value.proposals){
    if(!object(p)||typeof p.id!=='string'||!p.id||p.id.length>160||!AREAS.has(p.moduleId)||!Object.hasOwn(STATUS,p.status)||!Number.isSafeInteger(p.currentVersion)||p.currentVersion<1||!Array.isArray(p.versions)||!p.versions.length||p.versions.length>100||!p.versions.some(v=>v.version===p.currentVersion))fail('A saved proposal is incomplete. Refresh before reviewing it.');
    string(p.baseRelease,120,'proposal base release');
    for(const v of p.versions){
      if(!object(v)||!Number.isSafeInteger(v.version)||v.version<1||!object(v.proposal))fail('A saved proposal version is incomplete.');
      string(v.requestText,4000,'saved instruction');string(v.model,200,'proposal model');string(v.baseRelease,120,'version base release');
      const q=v.proposal;string(q.title,180,'proposal title');string(q.summary,6000,'proposal summary');string(q.privacyImpact,4000,'privacy impact');string(q.rollbackPlan,4000,'rollback plan');
      if(!['LOW','MEDIUM','HIGH'].includes(q.riskLevel)||!Array.isArray(q.proposedChanges)||q.proposedChanges.length>12||!Array.isArray(q.reviewChecklist)||q.reviewChecklist.length>16)fail('A saved proposal has invalid review details.');
      for(const c of q.proposedChanges){if(!object(c))fail('Invalid saved change.');string(c.area,160,'change area');string(c.change,2000,'proposed change');string(c.rationale,2000,'change rationale');}
      for(const item of q.reviewChecklist)string(item,500,'review check');
    }
  }
  for(const event of value.audit)if(!object(event)||typeof event.eventType!=='string'||event.eventType.length>200||event.metadata!==undefined&&!object(event.metadata))fail('The upgrade audit trail is invalid.');
  return value;
}

export function makeUpgradeExport(value) {
  const state=validateUpgradeState(value);
  const scalar=value=>value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)?value:null;
  const pick=(object,keys)=>Object.fromEntries(keys.filter(key=>object[key]!==undefined).map(key=>[key,scalar(object[key])]));
  const proposal=q=>({...pick(q,['title','summary','privacyImpact','rollbackPlan','riskLevel']),proposedChanges:q.proposedChanges.map(c=>pick(c,['area','change','rationale'])),reviewChecklist:[...q.reviewChecklist]});
  const safeAuditKeys=['version','moduleId','baseRelease','model','riskLevel','enabled','consentVersion','deploymentReference','rollbackReference','requestHash','source','manual','deletedVersions','reason','retained'];
  return{format:'doodletick-mozcorp-upgrade-export',version:1,exportedAt:new Date().toISOString(),state:{
    ...pick(state,['scope','revision','generation','configured','model','dailyLimit','consentVersion']),
    settings:pick(state.settings,['enabled','consentAt','updatedAt']),
    modules:(state.modules||[]).map(m=>pick(m,['id','label','boundary'])),
    proposals:state.proposals.map(p=>({...pick(p,['id','moduleId','baseRelease','status','currentVersion','approvedVersion','deploymentReference','rollbackReference','createdAt','updatedAt','approvedAt','deployedAt','rolledBackAt']),versions:p.versions.map(v=>({...pick(v,['id','proposalId','version','requestText','requestHash','baseRelease','model','providerRequestId','createdAt']),proposal:proposal(v.proposal)}))})),
    audit:state.audit.map(event=>({...pick(event,['id','proposalId','versionId','eventType','createdAt']),metadata:pick(event.metadata||{},safeAuditKeys)}))
  }};
}

export function createMozCorpUpgrades({container,request,setStatus}={}) {
  if(!container||typeof request!=='function')throw new TypeError('The upgrade desk needs a container and a request function.');
  const doc=container.ownerDocument||globalThis.document,prefix='moz-upgrades-'+(++instance);
  let state=null,working=false,visible=false,destroyed=false,readPromise=null,readTicket=0,revisionTarget=null,changeSequence=0;
  const fields={},changeRows=[],staticListeners=[];
  const node=(tag,text,className)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=String(text);if(className)el.className=className;return el;};
  const root=node('section',undefined,'moz-upgrades');root.setAttribute('aria-label','Upgrade proposals');
  const title=node('h2','Upgrade proposals');
  const introduction=node('p','Write and review a proposal in this browser. Approval and release records only record decisions.','moz-upgrade-note');
  const message=node('p','Opening the proposal desk…','moz-upgrade-note');message.setAttribute('role','status');message.setAttribute('aria-live','polite');
  const configuration=node('p','Checking AI configuration…','moz-upgrade-note');
  const headingActions=node('div',undefined,'moz-upgrade-actions');
  const button=(label,action)=>{const el=node('button',label,'button quiet');el.type='button';el.dataset.upAction=action;return el;};
  const refreshButton=button('Refresh proposals','refresh'),exportButton=button('Export proposals','export');headingActions.append(refreshButton,exportButton);
  root.append(title,introduction,message,configuration,headingActions);

  function listen(el,type,handler){el.addEventListener(type,handler);staticListeners.push(()=>el.removeEventListener(type,handler));}
  function notify(text,error=false){if(destroyed)return;message.textContent=String(text).slice(0,2400);message.className=error?'moz-upgrade-note moz-upgrade-error':'moz-upgrade-note';message.setAttribute('role',error?'alert':'status');try{setStatus?.(message.textContent,error);}catch{}}
  function field(name,label,{tag='input',type='text',max,min,required=false,parent,help}={}){
    const wrap=node('label',undefined,'moz-upgrade-field'),caption=node('span',label),input=node(tag);
    input.id=prefix+'-'+name;input.dataset.upField=name;input.name=name;
    if(tag==='input')input.type=type;
    if(max!==undefined)input.maxLength=max;if(min!==undefined)input.minLength=min;input.required=required;
    if(tag==='textarea')input.rows=3;
    wrap.htmlFor=input.id;wrap.append(caption,input);
    if(help){const hint=node('small',help,'moz-upgrade-note');hint.id=input.id+'-help';input.setAttribute('aria-describedby',hint.id);wrap.append(hint);}
    fields[name]=input;(parent||proposalForm).append(wrap);return input;
  }
  const settingsForm=node('form',undefined,'moz-upgrade-form'),settingsLegend=node('h3','AI request preference');
  settingsForm.append(settingsLegend);
  const enabledLabel=node('label',undefined,'check-line'),enabled=node('input');enabled.type='checkbox';enabled.id=prefix+'-enabled';enabled.dataset.upField='enabled';enabledLabel.append(enabled,node('span','Allow external AI proposal requests from this Keeper'));
  const settingsSave=button('Save AI preference','settings');settingsSave.type='submit';settingsForm.append(enabledLabel,settingsSave);
  settingsForm.hidden = true; root.append(settingsForm);

  const proposalForm=node('form',undefined,'moz-upgrade-form'),formTitle=node('h3','New proposal'),revisionNote=node('p','','moz-upgrade-note');
  proposalForm.append(formTitle,revisionNote);
  const mode=field('mode','Proposal method',{tag:'select'});mode.parentElement.hidden=true;mode.append(node('option','Manual proposal'),node('option','AI proposal'));mode.children[0].value='manual';mode.children[1].value='ai';mode.value='manual';
  const moduleId=field('moduleId','Upgrade area',{tag:'select'});for(const [id,label]of AREAS){const option=node('option',label);option.value=id;moduleId.append(option);}moduleId.value='world_shell';
  const boundary=node('p','','moz-upgrade-note');proposalForm.append(boundary);
  const instruction=field('instruction','Instruction or change request',{tag:'textarea',min:16,max:4000,required:true,help:'Describe the proposed work in 16–4,000 characters. This field is kept with its proposal version.'});
  const baseRelease=field('baseRelease','Base release reference',{min:3,max:120,required:true,help:'Identify the version this proposal starts from, such as 0.11b.'});
  const manual=node('fieldset',undefined,'moz-upgrade-manual');manual.append(node('legend','Your written proposal'));
  const manualTitle=field('title','Proposal title',{parent:manual,min:3,max:180,required:true});
  const summary=field('summary','Summary',{parent:manual,tag:'textarea',min:16,max:6000,required:true});
  const changes=node('div',undefined,'moz-upgrade-changes');manual.append(node('h4','Proposed changes'),changes);
  const addChange=button('Add another change','add-change');manual.append(addChange);
  const privacy=field('privacyImpact','Privacy impact',{parent:manual,tag:'textarea',max:4000,required:true});
  const checklist=field('reviewChecklist','Review checklist, one check per line',{parent:manual,tag:'textarea',max:8015,required:true,help:'Add 1–16 concrete checks, up to 500 characters each.'});
  const rollback=field('rollbackPlan','Rollback plan',{parent:manual,tag:'textarea',max:4000,required:true});
  const risk=field('riskLevel','Risk level',{parent:manual,tag:'select',required:true});for(const level of ['LOW','MEDIUM','HIGH']){const option=node('option',level[0]+level.slice(1).toLowerCase());option.value=level;risk.append(option);}risk.value='LOW';
  proposalForm.append(manual);
  const consentLabel=node('label',undefined,'check-line'),consent=node('input');consent.type='checkbox';consent.id=prefix+'-consent';consent.dataset.upField='consent';
  consentLabel.append(consent,node('span','For this request, I allow the selected upgrade area, my instruction and the base release reference to be sent to the configured AI provider. World saves, desk notes, uploaded files and vault contents are excluded.'));
  const externalNote=node('p','','moz-upgrade-note');proposalForm.append(consentLabel,externalNote);
  const submit=button('Save manual proposal','propose');submit.type='submit';submit.className='button primary';
  const cancelRevision=button('Start a separate proposal','cancel-revision');cancelRevision.hidden=true;
  const formActions=node('div',undefined,'moz-upgrade-actions');formActions.append(submit,cancelRevision);proposalForm.append(formActions);root.append(proposalForm);
  const history=node('section',undefined,'moz-upgrade-history'),audit=node('section',undefined,'moz-upgrade-audit');root.append(history,audit);container.replaceChildren(root);

  function addChangeRow(value={area:'',change:'',rationale:''}){
    if(changeRows.length>=12){notify('A proposal holds up to 12 changes.',true);return;}
    const row=node('fieldset',undefined,'moz-upgrade-change');row.append(node('legend','Change '+(changeRows.length+1)));
    const inputs={};
    const changeId=++changeSequence;
    for(const [name,label,max]of [['area','Area',160],['change','Change',2000],['rationale','Why this change?',2000]]){
      const labelNode=node('label'),input=node(name==='area'?'input':'textarea');input.id=prefix+'-change-'+changeId+'-'+name;input.maxLength=max;input.required=true;if(name==='area')input.type='text';else input.rows=2;input.value=typeof value[name]==='string'?value[name]:'';input.dataset.upField='change-'+name;labelNode.htmlFor=input.id;labelNode.append(node('span',label),input);row.append(labelNode);inputs[name]=input;
    }
    const remove=button('Remove this change','remove-change');row.append(remove);
    const entry={row,inputs,remove};changeRows.push(entry);changes.append(row);
    remove.addEventListener('click',()=>{if(working||changeRows.length===1)return;const index=changeRows.indexOf(entry);if(index>=0)changeRows.splice(index,1);row.remove();updateControls();});updateControls();
  }
  addChangeRow();

  function updateControls(){
    if(destroyed)return;
    const ready=!!state&&!working;
    for(const input of root.querySelectorAll('input,textarea,select,button'))input.disabled=!ready;
    refreshButton.disabled=working||!!readPromise;
    enabled.disabled=!ready;settingsSave.disabled=!ready;
    mode.children[1].disabled=!state?.configured;
    if(!state?.configured&&mode.value==='ai')mode.value='manual';
    const useAI=mode.value==='ai';manual.hidden=useAI;consentLabel.hidden=!useAI;externalNote.hidden=!useAI;
    for(const input of manual.querySelectorAll('input,textarea,select')){input.disabled=!ready||useAI;input.required=!useAI;}
    consent.disabled=!ready||!useAI||!state?.configured||!state?.settings.enabled;
    submit.textContent=useAI?(revisionTarget?'Request AI revision':'Request AI proposal'):(revisionTarget?'Save manual revision':'Save manual proposal');
    submit.disabled=!ready||useAI&&(!state.configured||!state.settings.enabled||!consent.checked);
    for(const row of changeRows)row.remove.disabled=!ready||changeRows.length===1;addChange.disabled=!ready||changeRows.length>=12;
    moduleId.disabled=!ready||!!revisionTarget;
    cancelRevision.hidden=!revisionTarget;revisionNote.textContent=revisionTarget?'This saves a new version of the selected proposal. It returns to review; earlier approval does not apply.':'';
    formTitle.textContent=revisionTarget?'Revise proposal':'New proposal';
    const selected=state?.modules?.find(m=>m.id===moduleId.value);boundary.textContent=selected?.boundary||'Only the instruction and selected proposal area are used. Existing world, desk and vault data is excluded.';
    externalNote.textContent=!state?.configured?'An AI provider key is not configured. Use a manual proposal.':!state.settings.enabled?'Save the AI request preference above before asking for an AI draft.':'Each AI request needs its own instruction-only consent. Other proposal fields are not sent.';
  }
  function apply(value){state=validateUpgradeState(value);enabled.checked=state.settings.enabled;configuration.textContent=state.configured?'AI is configured · model '+state.model+' · up to '+state.dailyLimit+' requests per day. Manual proposals also work.':'This public desk uses manual proposals. Live AI proposals are available in an opted-in Keeper.';renderHistory();renderAudit();updateControls();}
  async function refresh(){
    if(destroyed)return;if(working)return state;if(readPromise)return readPromise;
    const ticket=++readTicket;
    readPromise=Promise.resolve().then(()=>request('GET')).then(result=>{if(!destroyed&&ticket===readTicket){apply(result);notify('Proposal history loaded from this browser.');}return result;}).catch(error=>{if(!destroyed&&ticket===readTicket)notify(error.message||'Could not read the proposal history.',true);throw error;}).finally(()=>{if(ticket===readTicket){readPromise=null;updateControls();}});
    updateControls();return readPromise;
  }
  async function mutate(payload,success,after){
    if(destroyed||working)return false;if(!state)fail('Refresh the upgrade desk before making changes.');
    working=true;updateControls();
    try{
      const result=await request('POST',{...payload,scope:state.scope,revision:state.revision});
      if(destroyed)return false;
      apply(result);after?.();notify(success);return true;
    }catch(error){if(!destroyed)notify(error.message||'The upgrade action could not be saved. Your draft remains here.',true);return false;}
    finally{working=false;updateControls();}
  }
  function readManual(){
    const review=checklist.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(review.length<1||review.length>16)fail('Add 1–16 review checks.');
    return{title:bounded(manualTitle.value,3,180,'Proposal title'),summary:bounded(summary.value,16,6000,'Summary'),proposedChanges:changeRows.map(({inputs})=>({area:bounded(inputs.area.value,1,160,'Change area'),change:bounded(inputs.change.value,1,2000,'Proposed change'),rationale:bounded(inputs.rationale.value,1,2000,'Change rationale')})),privacyImpact:bounded(privacy.value,1,4000,'Privacy impact'),reviewChecklist:review.map(x=>bounded(x,1,500,'Review check')),rollbackPlan:bounded(rollback.value,1,4000,'Rollback plan'),riskLevel:risk.value};
  }
  function resetConsent(){consent.checked=false;updateControls();}
  function resetProposal(){revisionTarget=null;instruction.value='';consent.checked=false;updateControls();}
  function prepareRevision(proposal){
    if(working)return;const version=proposal.versions.find(v=>v.version===proposal.currentVersion),p=version.proposal;
    revisionTarget=proposal.id;moduleId.value=proposal.moduleId;baseRelease.value=proposal.baseRelease;instruction.value='';consent.checked=false;
    mode.value=version.model==='manual'?'manual':state.configured?'ai':'manual';
    manualTitle.value=p.title;summary.value=p.summary;privacy.value=p.privacyImpact;checklist.value=p.reviewChecklist.join('\n');rollback.value=p.rollbackPlan;risk.value=p.riskLevel;
    changeRows.splice(0);changes.replaceChildren();for(const change of p.proposedChanges)addChangeRow(change);if(!changeRows.length)addChangeRow();
    notify('Write a fresh instruction for the next version. Existing versions stay in the history.');updateControls();instruction.focus();
  }
  function actionButton(parent,label,action,handler){const el=button(label,action);el.addEventListener('click',()=>{if(!working)Promise.resolve().then(handler).catch(error=>notify(error.message,true));});parent.append(el);return el;}
  function showProposal(parent,version){
    const p=version.proposal;parent.append(node('p',p.summary));
    const changesList=node('ol');for(const change of p.proposedChanges){const item=node('li');item.append(node('strong',change.area),node('p',change.change),node('p','Reason: '+change.rationale));changesList.append(item);}parent.append(changesList);
    parent.append(node('h4','Privacy impact'),node('p',p.privacyImpact),node('h4','Review checklist'));
    const checks=node('ul');for(const check of p.reviewChecklist)checks.append(node('li',check));parent.append(checks,node('h4','Rollback plan'),node('p',p.rollbackPlan),node('p','Risk: '+p.riskLevel.toLowerCase()));
    const source=node('details');source.append(node('summary','Saved instruction and proposal method'),node('p',version.model==='manual'?'Written manually. No AI provider was used.':'AI draft · '+version.model),node('p','Base release: '+version.baseRelease),node('pre',version.requestText));parent.append(source);
  }
  function referenceForm(parent,p,{label,buttonText,action,key}){
    const form=node('form',undefined,'moz-upgrade-form'),wrap=node('label'),input=node('input');input.type='text';input.minLength=3;input.maxLength=160;input.required=true;input.id=prefix+'-'+action+'-'+p.id;input.dataset.upField=key;wrap.htmlFor=input.id;wrap.append(node('span',label),input);
    const save=button(buttonText,action);save.type='submit';form.append(wrap,save);form.addEventListener('submit',event=>{event.preventDefault();if(working)return;try{const value=bounded(input.value,3,160,label);mutate({action,proposalId:p.id,...(action==='record_deployment'?{version:p.currentVersion}:{}),[key]:value},action==='record_deployment'?'Deployment reference saved. This desk did not install code.':'Rollback reference saved. This desk did not restore code.');}catch(error){notify(error.message,true);}});parent.append(form);
  }
  function renderHistory(){
    history.replaceChildren(node('h3','Saved proposals'));
    if(!state.proposals.length){history.append(node('p','No proposals yet. Write one to start a review.'));return;}
    for(const p of state.proposals){
      const version=p.versions.find(v=>v.version===p.currentVersion),card=node('article',undefined,'moz-upgrade-card');card.dataset.proposalId=p.id;
      card.append(node('h4',version.proposal.title),node('p',STATUS[p.status]+' · version '+p.currentVersion+' · base '+p.baseRelease),node('p','Updated '+when(p.updatedAt),'moz-upgrade-note'));
      showProposal(card,version);
      const actions=node('div',undefined,'moz-upgrade-actions');
      if(p.status==='PENDING_REVIEW'){
        actionButton(actions,'Approve version '+p.currentVersion,'approve',()=>mutate({action:'approve',proposalId:p.id,version:p.currentVersion},'Version '+p.currentVersion+' approved for a separate manual release.'));
        actionButton(actions,'Decline version '+p.currentVersion,'decline',()=>mutate({action:'decline',proposalId:p.id,version:p.currentVersion},'Version '+p.currentVersion+' declined.'));
      }
      if(p.status!=='DEPLOYED')actionButton(actions,'Revise proposal','revise',()=>prepareRevision(p));
      actionButton(actions,'Delete stored proposal','delete',()=>{if(!globalThis.confirm?.('Delete the stored instruction and all proposal versions? Metadata-only audit events remain.'))return;return mutate({action:'delete',proposalId:p.id},'Stored proposal deleted. Audit metadata remains.',()=>{if(revisionTarget===p.id)revisionTarget=null;});});
      card.append(actions);
      if(p.status==='APPROVED'&&p.approvedVersion===p.currentVersion)referenceForm(card,p,{label:'Completed deployment reference',buttonText:'Record completed deployment',action:'record_deployment',key:'deploymentReference'});
      if(p.deploymentReference)card.append(node('p','Recorded deployment: '+p.deploymentReference));
      if(p.status==='DEPLOYED')referenceForm(card,p,{label:'Restored release reference',buttonText:'Record completed rollback',action:'record_rollback',key:'rollbackReference'});
      if(p.rollbackReference)card.append(node('p','Recorded rollback: '+p.rollbackReference));
      const versions=node('details');versions.append(node('summary','All '+p.versions.length+' saved version'+(p.versions.length===1?'':'s')));
      for(const v of [...p.versions].sort((a,b)=>b.version-a.version)){const entry=node('details');entry.append(node('summary','Version '+v.version+' · '+when(v.createdAt)));showProposal(entry,v);versions.append(entry);}card.append(versions);history.append(card);
    }
  }
  function renderAudit(){
    audit.replaceChildren(node('h3','Review and release records'));
    if(!state.audit.length){audit.append(node('p','No review or release records yet.'));return;}
    const list=node('ol');for(const event of state.audit.slice(0,100)){const meta=event.metadata||{},parts=[when(event.createdAt),event.eventType.replace(/[._]/g,' ')];if(Number.isSafeInteger(meta.version))parts.push('version '+meta.version);for(const key of ['baseRelease','deploymentReference','rollbackReference'])if(typeof meta[key]==='string')parts.push(meta[key].slice(0,160));list.append(node('li',parts.join(' · ')));}audit.append(list);
  }
  listen(refreshButton,'click',()=>{refresh().catch(()=>{});});
  listen(exportButton,'click',()=>{
    if(!state||working)return;
    try{const exported=makeUpgradeExport(state),url=URL.createObjectURL(new Blob([JSON.stringify(exported,null,2)],{type:'application/json'})),link=node('a');link.href=url;link.download='mozcorp-upgrade-proposals.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);notify('Proposal versions and audit records exported. Provider credentials are excluded.');}catch(error){notify(error.message||'The proposal export could not be created.',true);}
  });
  listen(settingsForm,'submit',event=>{event.preventDefault();mutate({action:'settings',enabled:enabled.checked},enabled.checked?'AI request preference enabled. Each AI request still needs its own consent.':'AI request preference disabled. Manual proposals remain available.',resetConsent);});
  listen(proposalForm,'submit',event=>{
    event.preventDefault();if(working)return;
    try{
      if(!state)fail('Refresh the proposal desk first.');
      const common={moduleId:moduleId.value,instruction:bounded(instruction.value,16,4000,'Instruction'),baseRelease:bounded(baseRelease.value,3,120,'Base release'),...(revisionTarget?{proposalId:revisionTarget}:{})};
      if(mode.value==='ai'){
        if(!state.configured)fail('AI is not configured. Choose a manual proposal.');if(!state.settings.enabled)fail('Enable the AI request preference before asking for a draft.');if(!consent.checked)fail('Confirm instruction-only consent for this AI request.');
        mutate({action:'propose',...common,consent:{version:state.consentVersion,sendInstruction:true,dataScope:'instruction-only'}},'AI proposal saved for review. The running app has not been changed.',resetProposal);
      }else mutate({action:'propose_manual',...common,proposal:readManual()},'Manual proposal saved for review. No AI provider was contacted.',resetProposal);
    }catch(error){notify(error.message,true);}
  });
  listen(mode,'change',resetConsent);listen(moduleId,'change',resetConsent);listen(instruction,'input',resetConsent);listen(baseRelease,'input',resetConsent);listen(consent,'change',updateControls);
  listen(addChange,'click',()=>addChangeRow());listen(cancelRevision,'click',()=>{revisionTarget=null;consent.checked=false;updateControls();notify('The next save will create a separate proposal. Existing versions remain unchanged.');});
  updateControls();
  return{
    refresh,
    setVisible(value){visible=!!value;if(visible&&!state&&!destroyed)refresh().catch(()=>{});},
    destroy(){if(destroyed)return;destroyed=true;readTicket++;for(const remove of staticListeners)remove();container.replaceChildren();}
  };
}
