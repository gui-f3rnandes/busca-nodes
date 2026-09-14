import React, {useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import data from './nodes_data.json';
import './styles.css';

const fields=[['Cidade / POP','Cidade_POP'],['OLT','OLT'],['PON','PON'],['VLAN','VLAN'],['Quantidade de clientes','Qtd_Clientes'],['DSW / Uplink','DSW_Uplink'],['DIO','DIO'],['Observação','Observacao'],['IP de gerência','IP_Gerencia'],['Equipamento','Equipamento']];
const normalize=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const exactFields=['VLAN','PON','OLT','Cidade_POP','Bairro','Equipamento'];
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
 const [q,setQ]=useState(''),[tech,setTech]=useState('ALL'),[city,setCity]=useState(''),[open,setOpen]=useState(null);
 const cities=useMemo(()=>[...new Set(data.map(x=>x.Cidade_POP).filter(Boolean))].sort(),[]);
 const filtered=useMemo(()=>{
   const nq=normalize(q);
   const list=data.filter(x=>{
     const matchesTech=tech==='ALL'||x.Tecnologia===tech; const matchesCity=!city||x.Cidade_POP===city;
     const hay=normalize(Object.values(x).join(' ')); return matchesTech&&matchesCity&&(!q||hay.includes(nq));
   });
   if(!nq) return list;
   return list.map((item,idx)=>({item,idx,score:matchScore(item,q)})).sort((a,b)=>a.score-b.score||a.idx-b.idx).map(x=>x.item);
 },[q,tech,city]);
 return <div className="wrap">
  <header className="top"><div className="eyebrow-row"><span className="dot"/> NR Telecom — infraestrutura EPON / GPON</div><h1>Busca de nodes</h1><div className="sub">Digite um node, VLAN, OLT ou bairro para encontrar a linha correspondente, com todos os dados daquele ponto.</div></header>
  <div className="searchbar"><input value={q} onChange={e=>{setQ(e.target.value);setOpen(null)}} placeholder="ex.: 1031, VLAN 620, G8PSX-01-LME, Panorama…" autoComplete="off" spellCheck="false"/>{q&&<button className="clear" onClick={()=>setQ('')} aria-label="Limpar">×</button>}</div>
  <div className="hint">Busca por parte do texto ou número — funciona mesmo digitando só um dos dois números em nodes combinados (ex. "93 / 27").</div>
  <div className="filters">{[['ALL','Todas as tecnologias'],['GPON','GPON'],['EPON','EPON']].map(([t,label])=><button key={t} className={`chip ${tech===t?'active':''}`} data-tech={t} onClick={()=>{setTech(t);setOpen(null)}}>{t!=='ALL'&&<span className="swatch"/>}{label}</button>)}<select className="city-select" value={city} onChange={e=>{setCity(e.target.value);setOpen(null)}}><option value="">Todas as cidades / POPs</option>{cities.map(c=><option key={c}>{c}</option>)}</select></div>
  <div className="meta-row"><span>{data.length.toLocaleString('pt-BR')} nodes carregados</span><span className="count">{filtered.length.toLocaleString('pt-BR')} resultado(s)</span></div>
  <div className="results">{filtered.slice(0,500).map((item,i)=><article key={`${item.Node}-${i}`} className={`card ${item.Tecnologia.toLowerCase()} ${open===i?'open':''}`}><button className="card-head" onClick={()=>setOpen(open===i?null:i)}><div className="card-id"><div className="node"><span className="tech-dot"/>{highlight(item.Node,q)}</div><div className="bairro">{highlight(item.Bairro,q)}</div></div><div className="card-right"><span className={`badge ${item.Tecnologia.toLowerCase()}`}>{item.Tecnologia}</span><span className="vlan-tag">VLAN {highlight(item.VLAN,q)}</span><span className="caret">▶</span></div></button><div className="card-summary-row"><span>OLT: <b>{highlight(item.OLT,q)}</b></span><span>PON: <b>{highlight(item.PON,q)}</b></span><span>Clientes: <b>{highlight(item.Qtd_Clientes,q)}</b></span></div>{open===i&&<div className="card-detail"><div className="grid">{fields.map(([label,key])=><div className={`field ${key==='Observacao'?'obs':''}`} key={key}><div className="lbl">{label}</div><div className={`val ${!item[key]?'empty':''}`}>{item[key]?highlight(item[key],q):'Não informado'}</div></div>)}</div></div>}</article>)}</div>
  {!filtered.length&&<div className="empty-state"><div className="big">⌕</div><p>Nenhum node encontrado com esses filtros.</p></div>}{filtered.length>500&&<div className="too-many">Exibindo os primeiros 500 resultados. Refine sua busca para encontrar um ponto específico.</div>}
  <footer><span>Base unificada: dados carregados de <code>nodes_data.json</code>.</span><span>Projeto Vite + React</span></footer>
 </div>
}
createRoot(document.getElementById('root')).render(<App/>);
