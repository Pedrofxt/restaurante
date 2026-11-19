import { useState } from 'react';
import { COR_PED, PED_ST } from '../lib/constants.js';
import { etaPedido, first, fmtPrev, hhmm, itensAtivos, minutosAte, pad, tempoItem } from '../lib/utils.js';
import { NA_FILA, filaPosicoes, mesaNum } from '../lib/derive.js';
import { Icon } from '../components/Icons.jsx';
import { ItemTags } from '../components/PedidoCard.jsx';
import { Pill, Stat, useTick } from '../components/ui.jsx';
import { useApp } from '../store.jsx';
import { useShell } from '../shellContext.js';

const ORDENS = [['chegada', 'Ordem de chegada'], ['demorados', 'Mais demorados'], ['rapidos', 'Mais rápidos']];

function Restante({ eta }) {
  const m = minutosAte(eta.max), mi = minutosAte(eta.min);
  if (m < 0) return <span className="late-t">atrasado {Math.abs(m)} min</span>;
  if (mi <= 0) return <span>a qualquer momento (até {m} min)</span>;
  return <span>faltam {mi === m ? m : `${mi}–${m}`} min</span>;
}

export default function Fila() {
  useTick();
  const { pedidos, mesas, cardapio, profile, can } = useApp();
  const { abrir } = useShell();
  const [modo, setModo] = useState('pedidos');
  const [ordem, setOrdem] = useState('chegada');
  const [soMeus, setSoMeus] = useState(false);
  const pos = filaPosicoes(pedidos);
  const garcom = profile.papel === 'garcom';
  const podeEditar = can('garcom', 'admin');

  const comEta = pedidos
    .filter(p => NA_FILA.includes(p.status) && !p.pago)
    .map(p => ({ p, eta: etaPedido(cardapio, p), pos: pos.get(p.id) }))
    .filter(x => x.eta);
  const visiveis = comEta.filter(x => !soMeus || x.p.garcom_id === profile.id);
  const dur = x => x.eta.max - new Date(x.p.criado_em).getTime();
  const lista = [...visiveis].sort((a, b) => ordem === 'chegada' ? a.pos - b.pos : ordem === 'demorados' ? dur(b) - dur(a) || a.pos - b.pos : dur(a) - dur(b) || a.pos - b.pos);
  const prontos = pedidos.filter(p => p.status === 'pronto' && !p.pago && (!soMeus || p.garcom_id === profile.id));

  const proximo = [...comEta].sort((a, b) => a.eta.max - b.eta.max)[0];
  const atrasados = comEta.filter(x => x.eta.max < Date.now()).length;
  const mediaMin = comEta.length ? Math.round(comEta.reduce((s, x) => s + dur(x), 0) / comEta.length / 60000) : 0;

  /* agrupado por produto: o que a cozinha tem que fazer, com tempo de cada produto */
  const porProduto = (() => {
    const m = new Map();
    for (const x of visiveis) for (const it of itensAtivos(x.p)) {
      const k = it.item_id ?? it.nome;
      const g = m.get(k) || { nome: it.nome, item_id: it.item_id, qtd: 0, mesas: [], primeiro: Infinity };
      g.qtd += it.quantidade;
      g.mesas.push({ pos: x.pos, mesa: mesaNum(mesas, x.p.mesa_id), qtd: it.quantidade, obs: it.observacao, status: x.p.status });
      g.primeiro = Math.min(g.primeiro, x.pos);
      m.set(k, g);
    }
    const arr = [...m.values()].map(g => ({ ...g, t: tempoItem(cardapio, g.item_id) }));
    return arr.sort((a, b) => ordem === 'chegada' ? a.primeiro - b.primeiro : ordem === 'demorados' ? b.t[1] - a.t[1] || a.primeiro - b.primeiro : a.t[1] - b.t[1] || a.primeiro - b.primeiro);
  })();

  return (<>
    <div className="view-head"><div><p className="eyebrow">Fila · {comEta.length} pedidos na cozinha</p><h1>Fila de pedidos</h1></div>
      <div className="chips">
        <button className={`chip ${modo === 'pedidos' ? 'on' : ''}`} onClick={() => setModo('pedidos')}>Por pedido</button>
        <button className={`chip ${modo === 'produtos' ? 'on' : ''}`} onClick={() => setModo('produtos')}>Por produto</button>
        {garcom && <button className={`chip ${soMeus ? 'on' : ''}`} onClick={() => setSoMeus(v => !v)}>Só os meus</button>}
      </div></div>
    <div className="stats">
      <Stat label="Na fila" value={comEta.filter(x => x.p.status === 'novo').length} c="sky" i={0} />
      <Stat label="Em preparo" value={comEta.filter(x => x.p.status === 'preparando').length} c="amber" i={1} />
      <Stat label="Tempo médio previsto" value={comEta.length ? `${mediaMin} min` : '—'} c="sage" i={2} />
      <Stat label={atrasados ? 'Atrasados' : 'Próximo a ficar pronto'} value={atrasados ? atrasados : proximo ? `Mesa ${pad(mesaNum(mesas, proximo.p.mesa_id))}` : '—'} c="ember" i={3} />
    </div>
    <div className="toolbar">
      <div className="seg seg-ordem">{ORDENS.map(([k, l]) => <button key={k} className={ordem === k ? 'on' : ''} onClick={() => setOrdem(k)}>{l}</button>)}</div>
      <span className="mute sm-txt" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="clock" size={13} />As previsões seguem os tempos do cardápio e se atualizam quando eles mudam.</span>
    </div>

    {modo === 'pedidos' ? <>
      <div className="fila">
        {lista.map((x, i) => {
          const { p, eta } = x;
          const total = dur(x), passado = Date.now() - new Date(p.criado_em).getTime();
          const pct = Math.max(2, Math.min(100, (passado / total) * 100));
          const atrasado = eta.max < Date.now();
          return (
            <div className={`fila-row${atrasado ? ' late' : ''}`} key={p.id} style={{ '--i': i }}>
              <div className="fila-pos">{x.pos}<small>na fila</small></div>
              <div className="fila-main">
                <h3>Mesa {pad(mesaNum(mesas, p.mesa_id))} <Pill c={COR_PED[p.status]}>{PED_ST[p.status]}</Pill>
                  <small>Pedido {p.id}{p.garcom?.nome ? ` · ${first(p.garcom.nome)}` : ''} · feito às {hhmm(p.criado_em)}</small></h3>
                <div className="fila-itens">
                  {(p.itens || []).map(it => {
                    const t = tempoItem(cardapio, it.item_id);
                    return (
                      <span key={it.id} className={`fi${it.status === 'cancelado' ? ' cancel' : ''}${it.adicionado_em ? ' add' : ''}`} title={it.observacao || ''}>
                        <b>{it.quantidade}×</b>{it.nome}<em>{fmtPrev(t)}</em>{it.status !== 'cancelado' && <ItemTags it={it} />}
                      </span>
                    );
                  })}
                </div>
                <div className="bar" style={{ '--c': atrasado ? 'var(--ember)' : `var(--${COR_PED[p.status]})` }}><i style={{ width: `${pct}%` }} /></div>
              </div>
              <div className="fila-eta">
                <div><span>pronto entre</span><strong>{hhmm(eta.min)}–{hhmm(eta.max)}</strong><Restante eta={eta} /></div>
                {podeEditar && <div className="fila-acts"><button className="btn btn-ghost sm" onClick={() => abrir('pedido', { id: p.id })}><Icon name="edit" size={14} />Editar</button></div>}
              </div>
            </div>
          );
        })}
        {!lista.length && <div className="empty"><Icon name="list" size={30} /><p>Nenhum pedido na cozinha agora.</p></div>}
      </div>
      {prontos.length > 0 && <>
        <div className="fila-sec"><h2>Prontos para servir</h2><Pill c="sage">{prontos.length}</Pill></div>
        <div className="fila">
          {prontos.map((p, i) => (
            <div className="fila-row" key={p.id} style={{ '--i': i }}>
              <div className="fila-pos" style={{ color: 'var(--sage)' }}><Icon name="check" size={26} /><small>pronto</small></div>
              <div className="fila-main"><h3>Mesa {pad(mesaNum(mesas, p.mesa_id))} <small>Pedido {p.id}{p.garcom?.nome ? ` · ${first(p.garcom.nome)}` : ''}</small></h3>
                <div className="fila-itens">{itensAtivos(p).map(it => <span key={it.id} className="fi"><b>{it.quantidade}×</b>{it.nome}</span>)}</div></div>
              <div className="fila-eta"><span>aguardando o garçom</span></div>
            </div>
          ))}
        </div>
      </>}
    </> : (
      <div className="fila">
        {porProduto.map((g, i) => (
          <div className="fila-row" key={g.item_id ?? g.nome} style={{ '--i': i }}>
            <div className="fila-pos">{g.qtd}<small>{g.qtd > 1 ? 'unidades' : 'unidade'}</small></div>
            <div className="fila-main">
              <h3>{g.nome}</h3>
              <div className="fila-itens">
                {g.mesas.sort((a, b) => a.pos - b.pos).map((m, k) => (
                  <span key={k} className="fi" title={m.obs || ''}><b>#{m.pos}</b>Mesa {pad(m.mesa)} · {m.qtd}×{m.obs && <em>{m.obs}</em>}{m.status === 'preparando' && <em>no fogo</em>}</span>
                ))}
              </div>
            </div>
            <div className="fila-eta"><span>tempo de preparo</span><strong>{fmtPrev(g.t)}</strong></div>
          </div>
        ))}
        {!porProduto.length && <div className="empty"><Icon name="layers" size={30} /><p>Nenhum produto em preparo agora.</p></div>}
      </div>
    )}
  </>);
}
