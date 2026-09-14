import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import data from './nodes_data.json';
import './styles.css';

const fields = [
  ['Cidade / POP', 'Cidade_POP'],
  ['OLT', 'OLT'],
  ['PON', 'PON'],
  ['VLAN', 'VLAN'],
  ['Quantidade de clientes', 'Qtd_Clientes'],
  ['DSW / Uplink', 'DSW_Uplink'],
  ['DIO', 'DIO'],
  ['Observação', 'Observacao'],
  ['IP de gerência', 'IP_Gerencia'],
  ['Equipamento', 'Equipamento'],
];

const normalize = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const textOf = (value) => String(value ?? '').trim();


function getQueryParts(query) {
  const normalized = normalize(query);
  const withoutNodeLabel = normalized.replace(/^node\s*[-#:]?\s*/, '').trim();
  return {
    normalized,
    withoutNodeLabel,
    isNodeQuery: /^node\s*[-#:]?\s*\d+$/.test(normalized),
    isNumericQuery: /^\d+$/.test(normalized),
  };
}

function scoreItem(item, query) {
  const { normalized, withoutNodeLabel, isNodeQuery, isNumericQuery } = getQueryParts(query);
  if (!normalized) return 0;

  const node = normalize(item.Node);
  const values = [
    normalize(item.Bairro),
    normalize(item.Cidade_POP),
    normalize(item.OLT),
    normalize(item.PON),
    normalize(item.VLAN),
    normalize(item.Qtd_Clientes),
    normalize(item.DSW_Uplink),
    normalize(item.DIO),
    normalize(item.Observacao),
    normalize(item.IP_Gerencia),
    normalize(item.Equipamento),
  ];

  // Para pesquisas numéricas, a correspondência no campo Node tem prioridade
  // absoluta. Assim, "1" encontra primeiro o Node 1, depois 10, 100 etc.,
  // sem fazer os Nodes 21, 31 ou VLANs com o número subirem indevidamente.
  if (isNodeQuery || isNumericQuery) {
    const nodeTerm = withoutNodeLabel || normalized;
    if (node === nodeTerm) return 100000;
    if (node.startsWith(nodeTerm) && nodeTerm) return 90000 - node.length;
    if (node.includes(nodeTerm) && nodeTerm) return 70000 - node.indexOf(nodeTerm) * 10 - node.length;
  }

  let best = 0;
  for (const value of values) {
    if (!value) continue;

    if (value === normalized) best = Math.max(best, 80000);
    if (value.startsWith(normalized)) best = Math.max(best, 60000 - value.length);

    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wordBoundary = new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`);
    if (wordBoundary.test(value)) best = Math.max(best, 50000 - value.length);

    const position = value.indexOf(normalized);
    if (position >= 0) best = Math.max(best, 30000 - position * 20 - value.length);
  }

  // Correspondências em outros campos continuam válidas, mas ficam abaixo
  // das correspondências no próprio Node quando a busca é numérica.
  if (isNumericQuery || isNodeQuery) best = Math.min(best, 20000);
  return best;
}

function highlight(value, query) {
  const source = textOf(value);
  const term = textOf(query);
  if (!term) return source || '—';

  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'ig');
  return source.split(regex).map((part, index) =>
    regex.test(part) ? <mark key={`${part}-${index}`}>{part}</mark> : <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>,
  );
}

function App() {
  const [query, setQuery] = useState('');
  const [technology, setTechnology] = useState('TODAS');
  const [city, setCity] = useState('TODAS');
  const [openNode, setOpenNode] = useState(null);

  const cities = useMemo(
    () => [...new Set(data.map((item) => textOf(item.Cidade_POP)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [],
  );

  const results = useMemo(() => {
    const normalizedQuery = normalize(query);
    return data
      .filter((item) => technology === 'TODAS' || normalize(item.Tecnologia) === normalize(technology))
      .filter((item) => city === 'TODAS' || textOf(item.Cidade_POP) === city)
      .map((item, index) => ({ item, index, score: scoreItem(item, query) }))
      .filter(({ score }) => !normalizedQuery || score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        // Mantém a ordem original dos dados quando a relevância empata.
        return a.index - b.index;
      })
      .map(({ item }) => item);
  }, [query, technology, city]);

  const visibleResults = results.slice(0, 500);

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">INVENTÁRIO DE REDE</p>
          <h1>Busca de Nodes</h1>
          <p className="subtitle">Consulte informações de Nodes EPON e GPON.</p>
        </div>
        <div className="hero-mark" aria-hidden="true">⌘</div>
      </header>

      <section className="search-panel">
        <label htmlFor="search">Pesquisar node, bairro, VLAN, OLT, PON ou qualquer informação</label>
        <input
          id="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ex.: Node 10, São Jorge, VLAN 1150..."
          autoComplete="off"
        />
        <div className="filter-row">
          <div className="chips" aria-label="Filtrar por tecnologia">
            {['TODAS', 'GPON', 'EPON'].map((option) => (
              <button
                type="button"
                className={`chip ${technology === option ? 'active' : ''}`}
                key={option}
                onClick={() => setTechnology(option)}
              >
                {option}
              </button>
            ))}
          </div>
          <select value={city} onChange={(event) => setCity(event.target.value)} aria-label="Filtrar por cidade ou POP">
            <option value="TODAS">Todas as cidades / POPs</option>
            {cities.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
      </section>

      <div className="result-summary">
        <strong>{results.length.toLocaleString('pt-BR')}</strong> resultado(s)
        {query && <span> · ordenados por relevância</span>}
      </div>

      <section className="results" aria-live="polite">
        {visibleResults.map((item) => {
          const nodeId = `${item.Tecnologia}-${item.Node}-${item.Cidade_POP}`;
          const isOpen = openNode === nodeId;
          return (
            <article className={`node-card ${isOpen ? 'expanded' : ''}`} key={nodeId}>
              <button type="button" className="node-header" onClick={() => setOpenNode(isOpen ? null : nodeId)} aria-expanded={isOpen}>
                <div className="node-title">
                  <span className="node-label">NODE</span>
                  <strong>{highlight(item.Node, query)}</strong>
                  <span className={`tech-badge ${normalize(item.Tecnologia) === 'epon' ? 'epon' : 'gpon'}`}>{item.Tecnologia}</span>
                </div>
                <div className="node-location">{highlight(item.Bairro, query)}<span className="chevron">{isOpen ? '−' : '+'}</span></div>
              </button>
              <div className="node-meta">
                <span><b>VLAN</b> {highlight(item.VLAN, query)}</span>
                <span><b>OLT</b> {highlight(item.OLT, query)}</span>
                <span><b>PON</b> {highlight(item.PON, query)}</span>
                <span><b>Clientes</b> {highlight(item.Qtd_Clientes, query)}</span>
              </div>
              {isOpen && (
                <div className="details-grid">
                  {fields.map(([label, key]) => (
                    <div className="detail" key={key}>
                      <span className="detail-label">{label}</span>
                      <span className="detail-value">{highlight(item[key], query)}</span>
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
        {results.length === 0 && <div className="empty">Nenhum resultado encontrado. Tente outro termo ou remova algum filtro.</div>}
        {results.length > 500 && <p className="limit-warning">Exibindo os primeiros 500 resultados mais relevantes.</p>}
      </section>

      <footer>Busca de Nodes · EPON / GPON</footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
