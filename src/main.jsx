import React, {useMemo, useState, useRef, useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import defaultData from './nodes_data.json';
import './styles.css';

const API_URL='/api/nodes';

const fields=[['Cidade / POP','Cidade_POP'],['OLT','OLT'],['PON','PON'],['VLAN','VLAN'],['Quantidade de clientes','Qtd_Clientes'],['DSW / Uplink','DSW_Uplink'],['DIO','DIO'],['Observação','Observacao'],['Equipamento','Equipamento'],['IP de gerência','IP_Gerencia'],['Usuário de gerência','Usuario_Gerencia'],['Senha de gerência','Senha_Gerencia'],['Outras infos de gerência','Info_Gerencia']];
const allFields=[['Node','Node'],['Bairro','Bairro'],['Tecnologia','Tecnologia'],...fields];
function emptyDraft(){ const d={}; allFields.forEach(([,key])=>d[key]=''); return d; }
const normalize=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const exactFields=['VLAN','PON','OLT','Cidade_POP','Bairro','Equipamento','IP_Gerencia'];
const copyableFields=['DIO','IP_Gerencia','Usuario_Gerencia','Senha_Gerencia'];
const freeTextKeys=['Observacao','Info_Gerencia'];
const DESCRIPTION_MAX=300;
// Campos (e rótulos) que entram no botão "Copiar tudo" do card. Campos vazios são omitidos.
const copySummaryFields=[['Node','Node'],['Bairro','Bairro'],['VLAN','VLAN'],['OLT','OLT'],['Porta','PON'],['DIO','DIO']];
// Na cópia, a porta vai só com o número final ("1/1/3" -> "3").
function portNumber(pon){ return String(pon).split('/').pop().trim(); }
// Ordenação "natural" das PONs ("2" antes de "10", "1/15/2" antes de "1/15/10").
const natKey=s=>String(s??'').split(/[^0-9]+/).filter(Boolean).map(Number);
function cmpNat(a,b){ const A=natKey(a),B=natKey(b); for(let i=0;i<Math.max(A.length,B.length);i++){ const d=(A[i]??-1)-(B[i]??-1); if(d) return d; } return 0; }
// Porta livre/sem uso não conta como node em uso.
const isUsed=item=>{ const n=normalize(item.Node).trim(); return n!==''&&n!=='-'&&n!=='sem uso'; };
const HOME_KEY='busca-nodes:home';
function loadHomePrefs(){ try{ return JSON.parse(localStorage.getItem(HOME_KEY))||{}; }catch(e){ return {}; } }
// Tudo numa linha só, cada campo separado por espaços.
function buildCopyText(item){
  return copySummaryFields
    .map(([label,key])=>[label,key==='PON'?portNumber(item[key]??''):String(item[key]??'').trim()])
    .filter(([,v])=>v)
    .map(([label,v])=>`${label}: ${v}`)
    .join('   ');
}

function matchScore(item,q){
  const nq=normalize(q); if(!nq) return 99;
  const nodeNorm=normalize(item.Node);
  if(nodeNorm===nq) return 0; // node é exatamente o termo buscado
  const nodeParts=nodeNorm.split(/[^a-z0-9]+/).filter(Boolean);
  if(nodeParts.includes(nq)) return 1; // node combinado (ex. "5 / 7") tem uma parte exata
  if(nodeNorm.startsWith(nq)) return 2; // node começa com o termo
  if(exactFields.some(f=>normalize(item[f])===nq)) return 3; // outro campo bate exatamente
  if(nodeNorm.includes(nq)) return 4; // node contém o termo em algum lugar
  return 5; // só bateu em outro campo, de forma aproximada
}
function highlight(value,q){
  const text=String(value??''); if(!q.trim()) return text;
  const parts=text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`,'ig'));
  return parts.map((p,i)=>normalize(p)===normalize(q)?<mark key={i}>{p}</mark>:p);
}

function App(){
 // Começa exibindo a base empacotada no projeto (carregamento instantâneo) e, em seguida,
 // busca a base "oficial" publicada em /api/nodes (a mesma para todos os visitantes do site).
 const [data,setData]=useState(defaultData);
 const [serverVersion,setServerVersion]=useState(null); // versão da base que serviu de base pras edições atuais
 const [q,setQ]=useState(''),[tech,setTech]=useState('ALL'),[city,setCity]=useState(''),[open,setOpen]=useState(null);
 const [showPass,setShowPass]=useState(false);
 const [ioMsg,setIoMsg]=useState(null); // {type:'ok'|'error', text}
 const [dirty,setDirty]=useState(false); // true = há alterações importadas ainda não publicadas para todos
 const [saving,setSaving]=useState(false);
 const [editing,setEditing]=useState(null); // {index:number|null, draft:{...}} — index null = adicionando um node novo
 const [showDraftPass,setShowDraftPass]=useState(false);
 const [copiedKey,setCopiedKey]=useState(null); // qual campo mostrou "Copiado!" por último
 const [history,setHistory]=useState(null); // lista do histórico de publicações, quando o painel está aberto
 const [historyLoading,setHistoryLoading]=useState(false);
 const [publishing,setPublishing]=useState(null); // janela "Salvar para todos": {description, password, error} ou null
 const [showPublishPass,setShowPublishPass]=useState(false);
 const [menuOpen,setMenuOpen]=useState(false); // menu dropdown da navbar (só aparece em telas pequenas)
 const [openPop,setOpenPop]=useState(()=>loadHomePrefs().pop||null); // POP aberto no quadro da página inicial
 const [openOlt,setOpenOlt]=useState(()=>loadHomePrefs().olt||null); // OLT aberta dentro do POP
 const [openRow,setOpenRow]=useState(null); // linha (PON) com os detalhes abertos
 const [recent,setRecent]=useState(null); // últimas publicações, para a faixa "Últimas alterações"
 const fileInputRef=useRef(null);

 function loadFromServer(){
   return fetch(API_URL).then(r=>{ if(!r.ok) throw new Error('resposta '+r.status); return r.json(); })
     .then(body=>{
       const nodes=body?.nodes;
       if(Array.isArray(nodes)&&nodes.length){ setData(nodes); setServerVersion(body.version??null); setDirty(false); }
     });
 }

 function loadRecent(){
   // Se a API não existir (ex.: "vite dev" puro), a faixa simplesmente não aparece.
   return fetch(`${API_URL}?history=1`).then(r=>{ if(!r.ok) throw new Error('resposta '+r.status); return r.json(); })
     .then(body=>setRecent((body.history||[]).slice(0,4))).catch(()=>{});
 }

 useEffect(()=>{
   // Se /api/nodes não existir (ex.: rodando "vite dev" puro, sem "vercel dev"), mantém a base
   // empacotada silenciosamente — não há necessidade de incomodar o usuário com esse detalhe.
   loadFromServer().catch(()=>{});
   loadRecent();
 },[]);

 const cities=useMemo(()=>[...new Set(data.map(x=>x.Cidade_POP).filter(Boolean))].sort(),[data]);
 const filtered=useMemo(()=>{
   const nq=normalize(q);
   const list=data.filter(x=>{
     const matchesTech=tech==='ALL'||x.Tecnologia===tech; const matchesCity=!city||x.Cidade_POP===city;
     const hay=normalize(Object.values(x).join(' ')); return matchesTech&&matchesCity&&(!q||hay.includes(nq));
   });
   if(!nq) return list;
   return list.map((item,idx)=>({item,idx,score:matchScore(item,q)})).sort((a,b)=>a.score-b.score||a.idx-b.idx).map(x=>x.item);
 },[q,tech,city,data]);

 // Quadro da página inicial: POP -> OLT -> PONs (respeitando os filtros de tecnologia e cidade).
 const board=useMemo(()=>{
   const pops=new Map();
   data.forEach((item,idx)=>{
     if(tech!=='ALL'&&item.Tecnologia!==tech) return;
     if(city&&item.Cidade_POP!==city) return;
     const popName=item.Cidade_POP||'Sem POP', oltName=item.OLT||'Sem OLT';
     if(!pops.has(popName)) pops.set(popName,{name:popName,olts:new Map(),techs:new Set(),nodes:0});
     const pop=pops.get(popName);
     if(!pop.olts.has(oltName)) pop.olts.set(oltName,{name:oltName,rows:[],techs:new Set(),used:0});
     const olt=pop.olts.get(oltName);
     olt.rows.push({item,idx});
     if(item.Tecnologia){ pop.techs.add(item.Tecnologia); olt.techs.add(item.Tecnologia); }
     if(isUsed(item)){ olt.used++; pop.nodes++; }
   });
   return [...pops.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).map(pop=>({...pop,olts:[...pop.olts.values()].map(olt=>({...olt,rows:olt.rows.sort((a,b)=>cmpNat(a.item.PON,b.item.PON)||a.idx-b.idx)}))}));
 },[data,tech,city]);

 useEffect(()=>{ try{ localStorage.setItem(HOME_KEY,JSON.stringify({pop:openPop,olt:openOlt})); }catch(e){} },[openPop,openOlt]);

 function resetView(){ setQ(''); setTech('ALL'); setCity(''); setOpen(null); setOpenRow(null); }

 function flashMsg(type,text){ setIoMsg({type,text}); setTimeout(()=>setIoMsg(m=>m&&m.text===text?null:m),5000); }

 function handleExport(){
   const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
   const url=URL.createObjectURL(blob);
   const a=document.createElement('a');
   const stamp=new Date().toISOString().slice(0,10);
   a.href=url; a.download=`nodes_data_${stamp}.json`;
   document.body.appendChild(a); a.click(); a.remove();
   URL.revokeObjectURL(url);
   flashMsg('ok',`Exportado: ${data.length.toLocaleString('pt-BR')} nodes.`);
 }

 function handleImportClick(){ fileInputRef.current?.click(); }

 function handleImportFile(e){
   const file=e.target.files&&e.target.files[0];
   if(!file) return;
   const reader=new FileReader();
   reader.onload=ev=>{
     try{
       const parsed=JSON.parse(ev.target.result);
       if(!Array.isArray(parsed)||!parsed.length) throw new Error('o arquivo precisa ser uma lista (array) de nodes, com pelo menos 1 item');
       setData(parsed);
       setDirty(true); // só fica visível neste navegador até alguém clicar em "Salvar para todos"
       resetView();
       flashMsg('ok',`Arquivo carregado: ${parsed.length.toLocaleString('pt-BR')} nodes. Clique em "Salvar para todos" para publicar no site.`);
     }catch(err){
       flashMsg('error',`Falha ao importar: ${err.message}`);
     }
   };
   reader.onerror=()=>flashMsg('error','Falha ao ler o arquivo selecionado.');
   reader.readAsText(file,'utf-8');
   e.target.value=''; // permite reimportar o mesmo arquivo depois, se necessário
 }

 function handleDiscard(){
   if(dirty&&!window.confirm('Isso descarta o que foi importado (ainda não publicado) e recarrega a base atual do site. Continuar?')) return;
   loadFromServer().then(()=>flashMsg('ok','Base recarregada a partir do site.'))
     .catch(()=>flashMsg('error','Não foi possível recarregar do servidor agora.'));
 }

 // "Salvar para todos": abre uma janela pedindo uma breve descrição das alterações (que vai
 // para o histórico) e a senha. Se der erro (senha errada, conflito...), a janela continua
 // aberta com a mensagem, sem perder o que foi digitado.
 function handlePublish(){ setShowPublishPass(false); setPublishing({description:'',password:'',error:''}); }
 function closePublish(){ if(!saving) setPublishing(null); }
 function updatePublishField(key,value){ setPublishing(p=>p&&({...p,[key]:value,error:''})); }
 function confirmPublish(){
   if(!publishing||saving) return;
   const description=publishing.description.trim();
   if(!description){ setPublishing(p=>p&&({...p,error:'Descreva brevemente o que foi alterado antes de publicar.'})); return; }
   if(!publishing.password){ setPublishing(p=>p&&({...p,error:'Informe a senha para publicar.'})); return; }
   setSaving(true);
   fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json','X-Edit-Password':publishing.password},body:JSON.stringify({action:'publish',nodes:data,baseVersion:serverVersion,description})})
     .then(async r=>{
       const body=await r.json().catch(()=>({}));
       if(!r.ok) throw new Error(body.error||`erro ${r.status}`);
       setDirty(false);
       setServerVersion(body.version??null);
       setPublishing(null);
       loadRecent();
       flashMsg('ok',`Publicado! Todos os visitantes já veem esta base (${body.count?.toLocaleString('pt-BR')} nodes).`);
     })
     .catch(err=>setPublishing(p=>p&&({...p,error:`Falha ao publicar: ${err.message}`})))
     .finally(()=>setSaving(false));
 }

 // Histórico: lista as últimas publicações e permite restaurar uma delas (com a mesma senha
 // de publicar). Restaurar primeiro arquiva o estado atual, então nada se perde no processo.
 function openHistory(){
   setHistory([]); setHistoryLoading(true);
   fetch(`${API_URL}?history=1`).then(r=>r.json()).then(body=>setHistory(body.history||[]))
     .catch(()=>flashMsg('error','Não foi possível carregar o histórico agora.'))
     .finally(()=>setHistoryLoading(false));
 }
 function closeHistory(){ setHistory(null); }
 function formatHistoryDate(iso){
   try{ return new Date(iso).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}); }catch(e){ return iso; }
 }
 function restoreHistory(id){
   if(!window.confirm('Isso substitui a base publicada atualmente por essa versão antiga (o estado atual fica salvo no histórico, nada se perde). Continuar?')) return;
   const password=window.prompt('Senha para restaurar esta versão:');
   if(password===null) return;
   fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json','X-Edit-Password':password},body:JSON.stringify({action:'restore',id})})
     .then(async r=>{
       const body=await r.json().catch(()=>({}));
       if(!r.ok) throw new Error(body.error||`erro ${r.status}`);
       closeHistory();
       return loadFromServer();
     })
     .then(()=>{loadRecent();flashMsg('ok','Versão restaurada e publicada.');})
     .catch(err=>flashMsg('error',`Falha ao restaurar: ${err.message}`));
 }

 function copyField(key,value){
   if(!value) return;
   navigator.clipboard?.writeText(String(value)).then(()=>{
     setCopiedKey(key);
     setTimeout(()=>setCopiedKey(k=>k===key?null:k),1500);
   }).catch(()=>flashMsg('error','Não foi possível copiar (o navegador bloqueou o acesso à área de transferência).'));
 }

 // Adicionar/editar: abre um rascunho local (comparando com o dado atual). Nada disso toca
 // o servidor — só marca "dirty", igual a uma importação. Quem revisa clica em "Salvar para
 // todos" (já existente) quando quiser publicar tudo de uma vez.
 function openAddForm(){ setShowDraftPass(false); setEditing({index:null,draft:emptyDraft()}); }
 function openEditForm(item){ setShowDraftPass(false); setEditing({index:data.indexOf(item),draft:{...item}}); }
 function closeEditForm(){ setEditing(null); }
 function updateDraftField(key,value){ setEditing(e=>e&&({...e,draft:{...e.draft,[key]:value}})); }

 function applyEditForm(){
   if(!editing) return;
   const node=(editing.draft.Node||'').trim();
   if(!node){ flashMsg('error','Preencha ao menos o campo "Node" antes de salvar.'); return; }
   const vlan=(editing.draft.VLAN||'').trim();
   const nodeKey=node.toLowerCase();
   const vlanKey=vlan.toLowerCase();
   // Um mesmo node pode existir em VLANs diferentes. Só há duplicidade quando a
   // combinação de node e VLAN se repete.
   const duplicate=nodeKey!=='-'&&data.some((it,i)=>i!==editing.index
     &&String(it.Node||'').trim().toLowerCase()===nodeKey
     &&String(it.VLAN||'').trim().toLowerCase()===vlanKey);
   if(duplicate){ flashMsg('error',`Já existe um node "${node}" nessa mesma VLAN${vlan?` (${vlan})`:' não informada'}. Escolha um nome diferente ou confira se a VLAN está certa.`); return; }
   const clean={...editing.draft,Node:node};
   if(editing.index===null||editing.index<0){
     setData(prev=>[...prev,clean]);
     flashMsg('ok',`Node "${node}" adicionado. Clique em "Salvar para todos" para publicar.`);
   }else{
     setData(prev=>prev.map((it,i)=>i===editing.index?clean:it));
     flashMsg('ok',`Node "${node}" atualizado. Clique em "Salvar para todos" para publicar.`);
   }
   setDirty(true);
   setOpenRow(null);
   setOpen(null); // índices do card aberto podem não bater mais depois da alteração
   setEditing(null);
 }

 // Mini botão de copiar usado nos cards (ao lado de node, bairro, OLT e VLAN).
 const copyIcon=(key,value,title)=>value?<button type="button" className={`copy-btn sm ${copiedKey===key?'done':''}`} onClick={e=>{e.stopPropagation();copyField(key,value)}} onKeyDown={e=>e.stopPropagation()} title={title}>{copiedKey===key?'✓':'⧉'}</button>:null;

 // Detalhes completos de um node (usado nos cards da busca e nas linhas do quadro).
 const renderDetail=(item,prefix)=><div className="card-detail"><div className="grid">{fields.map(([label,key])=>{const raw=item[key];const masked=key==='Senha_Gerencia'&&raw&&!showPass;const copyable=copyableFields.includes(key);return <div className={`field ${freeTextKeys.includes(key)?'obs':''}`} key={key}><div className="lbl">{label}</div><div className="val-row"><div className={`val ${!raw?'empty':''}`}>{!raw?'Não informado':masked?'••••••••':highlight(raw,q)}</div>{copyable&&raw&&<button type="button" className="copy-btn" onClick={()=>copyField(`${prefix}-${key}`,raw)} title="Copiar">{copiedKey===`${prefix}-${key}`?'✓':'⧉'}</button>}</div></div>})}</div></div>;


 // ----- Página inicial: quadro de POPs -> OLTs -> PONs + últimas alterações -----
 const totalOlts=board.reduce((n,p)=>n+p.olts.length,0);
 const totalNodes=board.reduce((n,p)=>n+p.nodes,0);
 const techBadges=techs=>[...techs].sort().map(t=><span key={t} className={`badge sm ${t.toLowerCase()}`}>{t}</span>);
 function togglePop(name,elId){
   if(openPop===name){ setOpenPop(null); return; }
   setOpenPop(name); setOpenOlt(null); setOpenRow(null);
   setTimeout(()=>document.getElementById(elId)?.scrollIntoView({behavior:'smooth',block:'start'}),60);
 }
 const toggleOlt=key=>{ setOpenOlt(o=>o===key?null:key); setOpenRow(null); };
 const keyAct=fn=>e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); fn(); } };
 const homeView=<div className="home">
   <div className="meta-row"><span>{data.length.toLocaleString('pt-BR')} nodes carregados</span><span className="count">{board.length} POP{board.length===1?'':'s'} · {totalOlts} OLT{totalOlts===1?'':'s'} · {totalNodes.toLocaleString('pt-BR')} em uso</span></div>
   <div className="pop-grid">{board.map((pop,pi)=>{
     const active=openPop===pop.name, elId=`pop-${pi}`;
     return <React.Fragment key={pop.name}>
       <button type="button" id={elId} className={`pop-card ${active?'active':''}`} aria-expanded={active} onClick={()=>togglePop(pop.name,elId)}>
         <span className="pop-name">{pop.name}</span>
         <span className="pop-meta"><span><b>{pop.nodes.toLocaleString('pt-BR')}</b> nodes</span><span><b>{pop.olts.length}</b> OLT{pop.olts.length===1?'':'s'}</span></span>
         <span className="pop-foot"><span className="pop-techs">{techBadges(pop.techs)}</span><span className="caret">▶</span></span>
       </button>
       {active&&<div className="pop-panel">
         <div className="pop-panel-head"><h3>{pop.name}</h3><button type="button" className="link-btn" onClick={()=>setOpenPop(null)}>Fechar ✕</button></div>
         {pop.olts.map(olt=>{
           const oKey=`${pop.name}||${olt.name}`, isOpen=openOlt===oKey;
           return <div className={`olt-block ${isOpen?'open':''}`} key={oKey}>
             <div className="olt-head" role="button" tabIndex={0} aria-expanded={isOpen} onClick={()=>toggleOlt(oKey)} onKeyDown={keyAct(()=>toggleOlt(oKey))}>
               <span className="caret">▶</span>
               <span className="olt-name">{olt.name}</span>{copyIcon(`${oKey}-olt`,olt.name,'Copiar OLT')}
               <span className="olt-meta">{olt.used}/{olt.rows.length} PONs em uso</span>
               {techBadges(olt.techs)}
             </div>
             {isOpen&&<div className="pon-table">
               <div className="pon-row pon-header"><span>PON</span><span>Node</span><span>Bairro</span><span>VLAN</span><span/></div>
               {olt.rows.map(({item,idx})=>{
                 const rk=`${oKey}#${idx}`, rowOpen=openRow===rk, used=isUsed(item);
                 return <div className={`pon-item ${used?'':'unused'} ${rowOpen?'open':''}`} key={rk}>
                   <div className="pon-row" role="button" tabIndex={0} aria-expanded={rowOpen} onClick={()=>setOpenRow(rowOpen?null:rk)} onKeyDown={keyAct(()=>setOpenRow(rowOpen?null:rk))}>
                     <span className="pon-port">{item.PON||'—'}</span>
                     <span className="pon-node">{item.Node||'—'}{copyIcon(`${rk}-node`,item.Node,'Copiar node')}</span>
                     <span className="pon-bairro">{item.Bairro}{copyIcon(`${rk}-bairro`,item.Bairro,'Copiar bairro')}</span>
                     <span className="pon-vlan">{item.VLAN||'—'}{copyIcon(`${rk}-vlan`,item.VLAN,'Copiar VLAN')}</span>
                     <span className="pon-actions">
                       <button type="button" className={`copy-btn sm ${copiedKey===`${rk}-all`?'done':''}`} onClick={e=>{e.stopPropagation();copyField(`${rk}-all`,buildCopyText(item))}} onKeyDown={e=>e.stopPropagation()} title="Copiar node, bairro, VLAN, OLT, porta e DIO">{copiedKey===`${rk}-all`?'✓ Copiado':'⧉ Tudo'}</button>
                       <button type="button" className="edit-btn" onClick={e=>{e.stopPropagation();openEditForm(item)}} onKeyDown={e=>e.stopPropagation()} title="Editar este node">✎</button>
                     </span>
                   </div>
                   {rowOpen&&renderDetail(item,rk)}
                 </div>;
               })}
             </div>}
           </div>;
         })}
       </div>}
     </React.Fragment>;
   })}</div>
   {!board.length&&<div className="empty-state"><div className="big">⌕</div><p>Nenhum POP com esses filtros.</p></div>}
   {recent&&recent.length>0&&<section className="recent">
     <div className="recent-head"><h2>Últimas alterações</h2><button type="button" className="link-btn" onClick={openHistory}>Ver histórico completo</button></div>
     <ul>{recent.map(h=><li key={h.version||h.id}>
       <span className="recent-date">{formatHistoryDate(h.publishedAt||h.uploadedAt)}{h.current&&<span className="badge-current">Atual</span>}</span>
       <span className={`recent-desc ${h.description?'':'empty'}`}>{h.description||'Sem descrição'}</span>
     </li>)}</ul>
   </section>}
 </div>;

 return <>
 {menuOpen&&<div className="navbar-scrim" onClick={()=>setMenuOpen(false)}/>}
 <nav className="navbar">
   <img className="navbar-logo" src="/logo.png" alt="NR Conexões"/>
   <button type="button" className="navbar-toggle" onClick={()=>setMenuOpen(o=>!o)} aria-expanded={menuOpen} aria-controls="navbar-menu" aria-label={menuOpen?'Fechar menu':'Abrir menu'}>{menuOpen?'✕':'☰'}{dirty&&!menuOpen&&<span className="pending-dot"/>}</button>
   <div id="navbar-menu" className={`navbar-actions ${menuOpen?'open':''}`} onClick={()=>setMenuOpen(false)}>
     <input type="file" accept="application/json,.json" ref={fileInputRef} onChange={handleImportFile} style={{display:'none'}}/>
     <button className="chip io add" onClick={openAddForm} title="Adicionar um novo node à base">+ Novo node</button>
     <button className="chip io" onClick={handleImportClick} title="Carregar uma base .json neste navegador (ainda não fica visível para outras pessoas)">⭱ Importar JSON</button>
     <button className="chip io" onClick={handleExport} title="Baixar a base atual em um arquivo .json">⭳ Exportar JSON</button>
     {dirty&&<button className="chip io publish" onClick={handlePublish} disabled={saving} title="Torna esta base a versão oficial do site, visível para todos os visitantes">{saving?'Publicando…':'✓ Salvar para todos'}</button>}
     {dirty&&<button className="chip io" onClick={handleDiscard} title="Descarta o que foi importado e recarrega a base publicada atualmente">Descartar alterações</button>}
     <button className="chip io" onClick={openHistory} title="Ver publicações anteriores e restaurar uma delas, se precisar">🕘 Histórico</button>
     <button className="chip io" onClick={()=>setShowPass(s=>!s)} title="Mostrar ou ocultar as senhas de gerência nos detalhes de cada node">{showPass?'🔓 Ocultar senhas':'🔒 Mostrar senhas'}</button>
   </div>
 </nav>
 <div className="wrap">
  <header className="top"><div className="eyebrow-row"><span className="dot"/> NR Conexões — infraestrutura EPON / GPON</div><h1>Busca de nodes</h1><div className="sub">Digite um node, VLAN, OLT ou bairro para encontrar a linha correspondente, com todos os dados daquele ponto.</div></header>
  <div className="sticky-search">
   <div className="searchbar"><input value={q} onChange={e=>{setQ(e.target.value);setOpen(null)}} placeholder="ex.: 1031, VLAN 620, G8PSX-01-LME, Panorama…" autoComplete="off" spellCheck="false"/>{q&&<button className="clear" onClick={()=>setQ('')} aria-label="Limpar">×</button>}</div>
   <div className="hint">Busca por parte do texto ou número — funciona mesmo digitando só um dos dois números em nodes combinados (ex. "93 / 27").</div>
   <div className="filters">{[['ALL','Todas as tecnologias'],['GPON','GPON'],['EPON','EPON']].map(([t,label])=><button key={t} className={`chip ${tech===t?'active':''}`} data-tech={t} onClick={()=>{setTech(t);setOpen(null)}}>{t!=='ALL'&&<span className="swatch"/>}{label}</button>)}<select className="city-select" value={city} onChange={e=>{setCity(e.target.value);setOpen(null);setOpenRow(null);if(e.target.value){setOpenPop(e.target.value);}}}><option value="">Todas as cidades / POPs</option>{cities.map(c=><option key={c}>{c}</option>)}</select></div>
  </div>
  {dirty&&<div className="io-msg pending">Você importou uma base neste navegador que ainda não foi publicada. Clique em "Salvar para todos" para que ela valha para todo mundo que acessa o site.</div>}
  {ioMsg&&<div className={`io-msg ${ioMsg.type}`}>{ioMsg.text}</div>}
  {!q.trim()?homeView:<>
  <div className="meta-row"><span>{data.length.toLocaleString('pt-BR')} nodes carregados</span><span className="count">{filtered.length.toLocaleString('pt-BR')} resultado(s)</span></div>
  <div className="results">{filtered.slice(0,500).map((item,i)=><article key={`${item.Node}-${i}`} className={`card ${(item.Tecnologia||'').toLowerCase()} ${open===i?'open':''}`}>
    <div className="card-head" role="button" tabIndex={0} onClick={()=>setOpen(open===i?null:i)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setOpen(open===i?null:i)}}}>
      <div className="card-id"><div className="node"><span className="tech-dot"/>NODE {highlight(item.Node,q)}{copyIcon(`${i}-node`,item.Node,'Copiar node')}</div><div className="bairro-row"><div className="bairro">{highlight(item.Bairro,q)}</div>{copyIcon(`${i}-bairro`,item.Bairro,'Copiar bairro')}</div></div>
      <div className="card-right">
        <span className={`badge ${(item.Tecnologia||'').toLowerCase()}`}>{item.Tecnologia}</span>
        <span className="vlan-group"><span className="vlan-tag">VLAN {highlight(item.VLAN,q)}</span>{copyIcon(`${i}-vlan`,item.VLAN,'Copiar VLAN')}</span>
        <button className="edit-btn" onClick={e=>{e.stopPropagation();openEditForm(item)}} title="Editar este node">✎</button>
        <span className="caret">▶</span>
      </div>
    </div>
    <div className="card-summary-row"><span>Cidade/POP: <b>{highlight(item.Cidade_POP,q)}</b></span><span className="has-copy">OLT: <b>{highlight(item.OLT,q)}</b>{copyIcon(`${i}-olt`,item.OLT,'Copiar OLT')}</span><span>PON: <b>{highlight(item.PON,q)}</b></span><span>Clientes: <b>{highlight(item.Qtd_Clientes,q)}</b></span><span className="has-copy sum-vlan">VLAN: <b>{highlight(item.VLAN,q)}</b>{copyIcon(`${i}-vlan`,item.VLAN,'Copiar VLAN')}</span></div>
    <div className="card-actions"><button type="button" className={`copy-btn copy-all ${copiedKey===`${i}-all`?'done':''}`} onClick={()=>copyField(`${i}-all`,buildCopyText(item))} title="Copiar node, bairro, VLAN, OLT, porta e DIO"><span>{copiedKey===`${i}-all`?'✓':'⧉'}</span><span className="copy-txt">{copiedKey===`${i}-all`?'Copiado':'Copiar tudo'}</span></button></div>
    {open===i&&renderDetail(item,String(i))}
  </article>)}</div>
  {!filtered.length&&<div className="empty-state"><div className="big">⌕</div><p>Nenhum node encontrado com esses filtros.</p></div>}{filtered.length>500&&<div className="too-many">Exibindo os primeiros 500 resultados. Refine sua busca para encontrar um ponto específico.</div>}
  </>}
  <footer><span>Base compartilhada, publicada via <code>/api/nodes</code> (Vercel Blob).</span><span>Projeto Vite + React</span></footer>
 </div>
 {editing&&<div className="modal-backdrop" onClick={closeEditForm}>
   <div className="modal" onClick={e=>e.stopPropagation()}>
     <div className="modal-head">
       <h2>{editing.index===null||editing.index<0?'Novo node':`Editando: ${data[editing.index]?.Node||''}`}</h2>
       <button className="modal-close" onClick={closeEditForm} aria-label="Fechar">×</button>
     </div>
     <div className="compare">
       <div className="compare-col">
         <div className="compare-label">Antes</div>
         {editing.index===null||editing.index<0
           ?<div className="compare-empty">Node novo — ainda não existe na base.</div>
           :<div className="compare-card">{allFields.map(([label,key])=>{const raw=data[editing.index]?.[key];const masked=key==='Senha_Gerencia'&&raw&&!showDraftPass;return <div className="field" key={key}><div className="lbl">{label}</div><div className={`val ${!raw?'empty':''}`}>{!raw?'Não informado':masked?'••••••••':raw}</div></div>})}</div>}
       </div>
       <div className="compare-col">
         <div className="compare-label">Depois (editando)</div>
         <div className="compare-form">{allFields.map(([label,key])=>{
           if(key==='Tecnologia') return <label className="form-field" key={key}><span>{label}</span><select value={editing.draft[key]||''} onChange={e=>updateDraftField(key,e.target.value)}><option value="">—</option><option value="GPON">GPON</option><option value="EPON">EPON</option></select></label>;
           if(key==='Cidade_POP') return <label className="form-field" key={key}><span>{label}</span><select value={editing.draft[key]||''} onChange={e=>updateDraftField(key,e.target.value)}><option value="">—</option>{cities.map(c=><option key={c} value={c}>{c}</option>)}</select></label>;
           if(key==='Observacao'||key==='Info_Gerencia') return <label className="form-field" key={key}><span>{label}</span><textarea rows={2} value={editing.draft[key]||''} onChange={e=>updateDraftField(key,e.target.value)}/></label>;
           if(key==='Senha_Gerencia') return <label className="form-field" key={key}><span>{label}</span><div className="pass-input"><input type={showDraftPass?'text':'password'} value={editing.draft[key]||''} onChange={e=>updateDraftField(key,e.target.value)}/><button type="button" onClick={()=>setShowDraftPass(s=>!s)}>{showDraftPass?'ocultar':'mostrar'}</button></div></label>;
           return <label className="form-field" key={key}><span>{label}{key==='Node'?' *':''}</span><input value={editing.draft[key]||''} onChange={e=>updateDraftField(key,e.target.value)}/></label>;
         })}</div>
       </div>
     </div>
     <div className="modal-actions">
       <button className="chip" onClick={closeEditForm}>Cancelar</button>
       <button className="chip io publish" onClick={applyEditForm}>{editing.index===null||editing.index<0?'Adicionar':'Aplicar alteração'}</button>
     </div>
   </div>
 </div>}
 {publishing&&<div className="modal-backdrop" onClick={closePublish}>
   <div className="modal modal-narrow" onClick={e=>e.stopPropagation()}>
     <div className="modal-head">
       <h2>Salvar para todos</h2>
       <button className="modal-close" onClick={closePublish} aria-label="Fechar">×</button>
     </div>
     <p className="publish-note">Isto torna a base atual a versão oficial do site, visível para todos. Descreva brevemente o que mudou — esse texto aparece no histórico.</p>
     <div className="publish-form">
       <label className="form-field"><span>O que foi alterado? *</span><textarea rows={3} autoFocus maxLength={DESCRIPTION_MAX} value={publishing.description} onChange={e=>updatePublishField('description',e.target.value)} placeholder="ex.: Adicionado node 1045 (Panorama); corrigida a VLAN do node 93 / 27"/></label>
       <div className="char-count">{publishing.description.length}/{DESCRIPTION_MAX}</div>
       <label className="form-field"><span>Senha para publicar *</span><div className="pass-input"><input type={showPublishPass?'text':'password'} value={publishing.password} onChange={e=>updatePublishField('password',e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();confirmPublish()}}} autoComplete="off"/><button type="button" onClick={()=>setShowPublishPass(v=>!v)}>{showPublishPass?'ocultar':'mostrar'}</button></div></label>
       {publishing.error&&<div className="io-msg error">{publishing.error}</div>}
     </div>
     <div className="modal-actions">
       <button className="chip" onClick={closePublish} disabled={saving}>Cancelar</button>
       <button className="chip io publish" onClick={confirmPublish} disabled={saving}>{saving?'Publicando…':'Publicar'}</button>
     </div>
   </div>
 </div>}
 {history&&<div className="modal-backdrop" onClick={closeHistory}>
   <div className="modal modal-narrow" onClick={e=>e.stopPropagation()}>
     <div className="modal-head">
       <h2>Histórico de publicações</h2>
       <button className="modal-close" onClick={closeHistory} aria-label="Fechar">×</button>
     </div>
     {historyLoading&&<div className="compare-empty">Carregando…</div>}
     {!historyLoading&&!history.length&&<div className="compare-empty">Ainda não há publicações registradas.</div>}
     {!historyLoading&&history.length>0&&<div className="history-list">{history.map(h=><div className="history-row" key={h.version||h.id}>
       <div className="history-info">
         <div className="history-date">{formatHistoryDate(h.publishedAt||h.uploadedAt)}{h.current&&<span className="badge-current">Versão atual</span>}</div>
         <div className={`history-desc ${h.description?'':'empty'}`}>{h.description||'Sem descrição'}</div>
       </div>
       {!h.current&&<button className="chip io" onClick={()=>restoreHistory(h.id)}>Restaurar esta versão</button>}
     </div>)}</div>}
   </div>
 </div>}
 </>
}
createRoot(document.getElementById('root')).render(<App/>);
