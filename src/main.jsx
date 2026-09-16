import React, { useMemo, useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import defaultData from './nodes_data.json';
import './styles.css';

const API_URL = '/api/nodes';

const fields = [['Cidade / POP', 'Cidade_POP'], ['OLT', 'OLT'], ['PON', 'PON'], ['VLAN', 'VLAN'], ['Quantidade de clientes', 'Qtd_Clientes'], ['DSW / Uplink', 'DSW_Uplink'], ['DIO', 'DIO'], ['Observação', 'Observacao'], ['Equipamento', 'Equipamento'], ['IP de gerência', 'IP_Gerencia'], ['Usuário de gerência', 'Usuario_Gerencia'], ['Senha de gerência', 'Senha_Gerencia'], ['Outras infos de gerência', 'Info_Gerencia']];
const allFields = [['Node', 'Node'], ['Bairro', 'Bairro'], ['Tecnologia', 'Tecnologia'], ...fields];
function emptyDraft() { const d = {}; allFields.forEach(([, key]) => d[key] = ''); return d; }
const normalize = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const exactFields = ['VLAN', 'PON', 'OLT', 'Cidade_POP', 'Bairro', 'Equipamento', 'IP_Gerencia'];
const freeTextKeys = ['Observacao', 'Info_Gerencia'];

function matchScore(item, q) {
  const nq = normalize(q); if (!nq) return 99;
  const nodeNorm = normalize(item.Node);
  if (nodeNorm === nq) return 0; // node é exatamente o termo buscado
  const nodeParts = nodeNorm.split(/[^a-z0-9]+/).filter(Boolean);
  if (nodeParts.includes(nq)) return 1; // node combinado (ex. "5 / 7") tem uma parte exata
  if (nodeNorm.startsWith(nq)) return 2; // node começa com o termo
  if (exactFields.some(f => normalize(item[f]) === nq)) return 3; // outro campo bate exatamente
  if (nodeNorm.includes(nq)) return 4; // node contém o termo em algum lugar
  return 5; // só bateu em outro campo, de forma aproximada
}
function highlight(value, q) {
  const text = String(value ?? ''); if (!q.trim()) return text;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'));
  return parts.map((p, i) => normalize(p) === normalize(q) ? <mark key={i}>{p}</mark> : p);
}

function App() {
  // Começa exibindo a base empacotada no projeto (carregamento instantâneo) e, em seguida,
  // busca a base "oficial" publicada em /api/nodes (a mesma para todos os visitantes do site).
  const [data, setData] = useState(defaultData);
  const [q, setQ] = useState(''), [tech, setTech] = useState('ALL'), [city, setCity] = useState(''), [open, setOpen] = useState(null);
  const [showPass, setShowPass] = useState(false);
  const [ioMsg, setIoMsg] = useState(null); // {type:'ok'|'error', text}
  const [dirty, setDirty] = useState(false); // true = há alterações importadas ainda não publicadas para todos
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null); // {index:number|null, draft:{...}} — index null = adicionando um node novo
  const [showDraftPass, setShowDraftPass] = useState(false);
  const fileInputRef = useRef(null);

  function loadFromServer() {
    return fetch(API_URL).then(r => { if (!r.ok) throw new Error('resposta ' + r.status); return r.json(); })
      .then(parsed => { if (Array.isArray(parsed) && parsed.length) { setData(parsed); setDirty(false); } });
  }

  useEffect(() => {
    // Se /api/nodes não existir (ex.: rodando "vite dev" puro, sem "vercel dev"), mantém a base
    // empacotada silenciosamente — não há necessidade de incomodar o usuário com esse detalhe.
    loadFromServer().catch(() => { });
  }, []);

  const cities = useMemo(() => [...new Set(data.map(x => x.Cidade_POP).filter(Boolean))].sort(), [data]);
  const filtered = useMemo(() => {
    const nq = normalize(q);
    const list = data.filter(x => {
      const matchesTech = tech === 'ALL' || x.Tecnologia === tech; const matchesCity = !city || x.Cidade_POP === city;
      const hay = normalize(Object.values(x).join(' ')); return matchesTech && matchesCity && (!q || hay.includes(nq));
    });
    if (!nq) return list;
    return list.map((item, idx) => ({ item, idx, score: matchScore(item, q) })).sort((a, b) => a.score - b.score || a.idx - b.idx).map(x => x.item);
  }, [q, tech, city, data]);

  function resetView() { setQ(''); setTech('ALL'); setCity(''); setOpen(null); }

  function flashMsg(type, text) { setIoMsg({ type, text }); setTimeout(() => setIoMsg(m => m && m.text === text ? null : m), 5000); }

  function handleExport() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url; a.download = `nodes_data_${stamp}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    flashMsg('ok', `Exportado: ${data.length.toLocaleString('pt-BR')} nodes.`);
  }

  function handleImportClick() { fileInputRef.current?.click(); }

  function handleImportFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!Array.isArray(parsed) || !parsed.length) throw new Error('o arquivo precisa ser uma lista (array) de nodes, com pelo menos 1 item');
        setData(parsed);
        setDirty(true); // só fica visível neste navegador até alguém clicar em "Salvar para todos"
        resetView();
        flashMsg('ok', `Arquivo carregado: ${parsed.length.toLocaleString('pt-BR')} nodes. Clique em "Salvar para todos" para publicar no site.`);
      } catch (err) {
        flashMsg('error', `Falha ao importar: ${err.message}`);
      }
    };
    reader.onerror = () => flashMsg('error', 'Falha ao ler o arquivo selecionado.');
    reader.readAsText(file, 'utf-8');
    e.target.value = ''; // permite reimportar o mesmo arquivo depois, se necessário
  }

  function handleDiscard() {
    if (dirty && !window.confirm('Isso descarta o que foi importado (ainda não publicado) e recarrega a base atual do site. Continuar?')) return;
    loadFromServer().then(() => flashMsg('ok', 'Base recarregada a partir do site.'))
      .catch(() => flashMsg('error', 'Não foi possível recarregar do servidor agora.'));
  }

  function handlePublish() {
    const password = window.prompt('Senha para publicar esta base para todos os visitantes do site:');
    if (password === null) return; // cancelou
    setSaving(true);
    fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Edit-Password': password }, body: JSON.stringify(data) })
      .then(async r => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || `erro ${r.status}`);
        setDirty(false);
        flashMsg('ok', `Publicado! Todos os visitantes já veem esta base (${body.count?.toLocaleString('pt-BR')} nodes).`);
      })
      .catch(err => flashMsg('error', `Falha ao publicar: ${err.message}`))
      .finally(() => setSaving(false));
  }

  // Adicionar/editar: abre um rascunho local (comparando com o dado atual). Nada disso toca
  // o servidor — só marca "dirty", igual a uma importação. Quem revisa clica em "Salvar para
  // todos" (já existente) quando quiser publicar tudo de uma vez.
  function openAddForm() { setShowDraftPass(false); setEditing({ index: null, draft: emptyDraft() }); }
  function openEditForm(item) { setShowDraftPass(false); setEditing({ index: data.indexOf(item), draft: { ...item } }); }
  function closeEditForm() { setEditing(null); }
  function updateDraftField(key, value) { setEditing(e => e && ({ ...e, draft: { ...e.draft, [key]: value } })); }

  function applyEditForm() {
    if (!editing) return;
    const node = (editing.draft.Node || '').trim();
    if (!node) { flashMsg('error', 'Preencha ao menos o campo "Node" antes de salvar.'); return; }
    const clean = { ...editing.draft, Node: node };
    if (editing.index === null || editing.index < 0) {
      setData(prev => [...prev, clean]);
      flashMsg('ok', `Node "${node}" adicionado. Clique em "Salvar para todos" para publicar.`);
    } else {
      setData(prev => prev.map((it, i) => i === editing.index ? clean : it));
      flashMsg('ok', `Node "${node}" atualizado. Clique em "Salvar para todos" para publicar.`);
    }
    setDirty(true);
    setOpen(null); // índices do card aberto podem não bater mais depois da alteração
    setEditing(null);
  }

  return <>
    <div className="wrap">
      <header className="top"><div className="eyebrow-row"><span className="dot" /> NR Conexões — infraestrutura EPON / GPON</div><h1>Busca de Nodes</h1><div className="sub">Digite um node, VLAN, OLT ou bairro para encontrar a linha correspondente, com todos os dados daquele ponto.</div></header>
      <div className="searchbar"><input value={q} onChange={e => { setQ(e.target.value); setOpen(null) }} placeholder="ex.: 1031, VLAN 620, G8PSX-01-LME, Panorama…" autoComplete="off" spellCheck="false" />{q && <button className="clear" onClick={() => setQ('')} aria-label="Limpar">×</button>}</div>
      <div className="hint">Busca por parte do texto ou número — funciona mesmo digitando só um dos dois números em nodes combinados (ex. "93 / 27").</div>
      <div className="filters">{[['ALL', 'Todas as tecnologias'], ['GPON', 'GPON'], ['EPON', 'EPON']].map(([t, label]) => <button key={t} className={`chip ${tech === t ? 'active' : ''}`} data-tech={t} onClick={() => { setTech(t); setOpen(null) }}>{t !== 'ALL' && <span className="swatch" />}{label}</button>)}<select className="city-select" value={city} onChange={e => { setCity(e.target.value); setOpen(null) }}><option value="">Todas as cidades / POPs</option>{cities.map(c => <option key={c}>{c}</option>)}</select></div>
      <div className="toolbar">
        <input type="file" accept="application/json,.json" ref={fileInputRef} onChange={handleImportFile} style={{ display: 'none' }} />
        <button className="chip io add" onClick={openAddForm} title="Adicionar um novo node à base">+ Novo node</button>
        <button className="chip io" onClick={handleImportClick} title="Carregar uma base .json neste navegador (ainda não fica visível para outras pessoas)">⭱ Importar JSON</button>
        <button className="chip io" onClick={handleExport} title="Baixar a base atual em um arquivo .json">⭳ Exportar JSON</button>
        {dirty && <button className="chip io publish" onClick={handlePublish} disabled={saving} title="Torna esta base a versão oficial do site, visível para todos os visitantes">{saving ? 'Publicando…' : '✓ Salvar para todos'}</button>}
        {dirty && <button className="chip io" onClick={handleDiscard} title="Descarta o que foi importado e recarrega a base publicada atualmente">Descartar alterações</button>}
        <button className="chip io" onClick={() => setShowPass(s => !s)} title="Mostrar ou ocultar as senhas de gerência nos detalhes de cada node">{showPass ? '🔓 Ocultar senhas' : '🔒 Mostrar senhas'}</button>
      </div>
      {dirty && <div className="io-msg pending">Você importou uma base neste navegador que ainda não foi publicada. Clique em "Salvar para todos" para que ela valha para todo mundo que acessa o site.</div>}
      {ioMsg && <div className={`io-msg ${ioMsg.type}`}>{ioMsg.text}</div>}
      <div className="meta-row"><span>{data.length.toLocaleString('pt-BR')} nodes carregados</span><span className="count">{filtered.length.toLocaleString('pt-BR')} resultado(s)</span></div>
      <div className="results">{filtered.slice(0, 500).map((item, i) => <article key={`${item.Node}-${i}`} className={`card ${(item.Tecnologia || '').toLowerCase()} ${open === i ? 'open' : ''}`}>
        <div className="card-head" role="button" tabIndex={0} onClick={() => setOpen(open === i ? null : i)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(open === i ? null : i) } }}>
          <div className="card-id"><div className="node"><span className="tech-dot" />NODE {highlight(item.Node, q)}</div><div className="bairro">{highlight(item.Bairro, q)}</div></div>
          <div className="card-right">
            <span className={`badge ${(item.Tecnologia || '').toLowerCase()}`}>{item.Tecnologia}</span>
            <span className="vlan-tag">VLAN {highlight(item.VLAN, q)}</span>
            <button className="edit-btn" onClick={e => { e.stopPropagation(); openEditForm(item) }} title="Editar este node">✎</button>
            <span className="caret">▶</span>
          </div>
        </div>
        <div className="card-summary-row"><span>Cidade/POP: <b>{highlight(item.Cidade_POP,q)}</b></span><span>OLT: <b>{highlight(item.OLT,q)}</b></span><span>PON: <b>{highlight(item.PON,q)}</b></span><span>Clientes: <b>{highlight(item.Qtd_Clientes,q)}</b></span></div>
        {open === i && <div className="card-detail"><div className="grid">{fields.map(([label, key]) => { const raw = item[key]; const masked = key === 'Senha_Gerencia' && raw && !showPass; return <div className={`field ${freeTextKeys.includes(key) ? 'obs' : ''}`} key={key}><div className="lbl">{label}</div><div className={`val ${!raw ? 'empty' : ''}`}>{!raw ? 'Não informado' : masked ? '••••••••' : highlight(raw, q)}</div></div> })}</div></div>}
      </article>)}</div>
      {!filtered.length && <div className="empty-state"><div className="big">⌕</div><p>Nenhum node encontrado com esses filtros.</p></div>}{filtered.length > 500 && <div className="too-many">Exibindo os primeiros 500 resultados. Refine sua busca para encontrar um ponto específico.</div>}
      <footer><span>Base compartilhada, publicada via <code>/api/nodes</code> (Vercel Blob).</span><span>Projeto Vite + React</span></footer>
    </div>
    {editing && <div className="modal-backdrop" onClick={closeEditForm}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{editing.index === null || editing.index < 0 ? 'Novo node' : `Editando: ${data[editing.index]?.Node || ''}`}</h2>
          <button className="modal-close" onClick={closeEditForm} aria-label="Fechar">×</button>
        </div>
        <div className="compare">
          <div className="compare-col">
            <div className="compare-label">Antes</div>
            {editing.index === null || editing.index < 0
              ? <div className="compare-empty">Node novo — ainda não existe na base.</div>
              : <div className="compare-card">{allFields.map(([label, key]) => { const raw = data[editing.index]?.[key]; const masked = key === 'Senha_Gerencia' && raw && !showDraftPass; return <div className="field" key={key}><div className="lbl">{label}</div><div className={`val ${!raw ? 'empty' : ''}`}>{!raw ? 'Não informado' : masked ? '••••••••' : raw}</div></div> })}</div>}
          </div>
          <div className="compare-col">
            <div className="compare-label">Depois (editando)</div>
            <div className="compare-form">{allFields.map(([label, key]) => {
              if (key === 'Tecnologia') return <label className="form-field" key={key}><span>{label}</span><select value={editing.draft[key] || ''} onChange={e => updateDraftField(key, e.target.value)}><option value="">—</option><option value="GPON">GPON</option><option value="EPON">EPON</option></select></label>;
              if(key==='Cidade_POP') return <label className="form-field" key={key}><span>{label}</span><select value={editing.draft[key]||''} onChange={e=>updateDraftField(key,e.target.value)}><option value="">—</option>{cities.map(c=><option key={c} value={c}>{c}</option>)}</select></label>;
              if (key === 'Observacao' || key === 'Info_Gerencia') return <label className="form-field" key={key}><span>{label}</span><textarea rows={2} value={editing.draft[key] || ''} onChange={e => updateDraftField(key, e.target.value)} /></label>;
              if (key === 'Senha_Gerencia') return <label className="form-field" key={key}><span>{label}</span><div className="pass-input"><input type={showDraftPass ? 'text' : 'password'} value={editing.draft[key] || ''} onChange={e => updateDraftField(key, e.target.value)} /><button type="button" onClick={() => setShowDraftPass(s => !s)}>{showDraftPass ? 'ocultar' : 'mostrar'}</button></div></label>;
              return <label className="form-field" key={key}><span>{label}{key === 'Node' ? ' *' : ''}</span><input value={editing.draft[key] || ''} onChange={e => updateDraftField(key, e.target.value)} /></label>;
            })}</div>
          </div>
        </div>
        <div className="modal-actions">
          <button className="chip" onClick={closeEditForm}>Cancelar</button>
          <button className="chip io publish" onClick={applyEditForm}>{editing.index === null || editing.index < 0 ? 'Adicionar' : 'Aplicar alteração'}</button>
        </div>
      </div>
    </div>}
  </>
}
createRoot(document.getElementById('root')).render(<App />);
