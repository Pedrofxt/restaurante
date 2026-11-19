import { api } from '../lib/api.js';
import { ATIVOS, COR_PED, PED_ST } from '../lib/constants.js';
import { brl, etaPedido, first, fmtPrev, hhmm, pad, previsao } from '../lib/utils.js';
import { filaPosicoes, mesaNum } from '../lib/derive.js';
import { Icon } from './Icons.jsx';
import { AsyncButton, Pill, Timer, useTick } from './ui.jsx';
import { useApp } from '../store.jsx';
import { useShell } from '../shellContext.js';

export function ItemTags({ it }) {
  if (it.status === 'cancelado') return <span className="tag" style={{ '--c': 'var(--ember)' }}>cancelado</span>;
  return <>
    {it.adicionado_em && <span className="tag" style={{ '--c': 'var(--sky)' }}>+ adicionado {hhmm(it.adicionado_em)}</span>}
    {it.alterado_em && <span className="tag" style={{ '--c': 'var(--amber)' }}>alterado</span>}
  </>;
}

export default function PedidoCard({ p, ctx, i = 0 }) {
  useTick();
  const { mesas, pedidos, cardapio, firstLoad, seen, can, refresh } = useApp();
  const { abrir } = useShell();
  const isNew = !firstLoad && !seen.current.has(p.id);
  const ativo = ATIVOS.includes(p.status);
  const vigia = p.status !== 'pronto';
  const pr = previsao(cardapio, p.itens) || [10, 20];
  const eta = etaPedido(cardapio, p);
  const pos = filaPosicoes(pedidos).get(p.id);
  const ini = new Date(p.criado_em).getTime();
  const mudar = st => async () => { await api.setStatusPedido(p.id, st); await refresh(); };
  const btn = (st, label, cls = 'btn-primary', icon = 'check') => (
    <AsyncButton key={st} className={`btn ${cls} sm`} onClick={mudar(st)}><Icon name={icon} size={14} />{label}</AsyncButton>
  );
  const podeEditar = ctx !== 'cozinha' && can('garcom', 'admin') && ATIVOS.includes(p.status) && !p.pago;

  const acts = [];
  if (ctx === 'cozinha') {
    if (p.status === 'novo') acts.push(btn('preparando', 'Iniciar preparo', 'btn-primary', 'flame'));
    if (p.status === 'preparando') acts.push(btn('pronto', 'Marcar pronto'));
    if (p.status === 'pronto') acts.push(<span key="ag" className="mute sm-txt">Aguardando o garçom</span>);
  } else if (can('garcom', 'admin')) {
    if (podeEditar) acts.push(<button key="ed" className="btn btn-ghost sm" onClick={() => abrir('pedido', { id: p.id, voltarMesa: ctx === 'comanda' ? p.mesa_id : null })}><Icon name="edit" size={14} />Editar</button>);
    if (p.status === 'novo') acts.push(btn('cancelado', 'Cancelar', 'btn-ghost', 'x'));
    if (p.status === 'pronto') acts.push(btn('entregue', 'Marcar entregue'));
  }

  return (
    <article className={`ticket st-${p.status}${isNew ? ' is-new' : ''}`} style={{ '--c': `var(--${COR_PED[p.status]})`, '--i': i }}>
      <header className="t-head">
        <div>
          <span className="t-mesa">{pos && <span className="t-pos" title="Posição na fila da cozinha">#{pos}</span>}Mesa {pad(mesaNum(mesas, p.mesa_id))}</span>
          <span className="t-id">Pedido {p.id}{p.garcom?.nome ? ` · ${first(p.garcom.nome)}` : ''}</span>
        </div>
        <div className="t-meta">
          <Pill c={COR_PED[p.status]}>{PED_ST[p.status]}</Pill>
          {ativo && eta && <Timer iso={p.criado_em} min={vigia ? (eta.min - ini) / 60000 : null} max={vigia ? (eta.max - ini) / 60000 : null} />}
          {ativo && vigia && eta && <span className="prev">{fmtPrev(pr)} · pronto até <b>{hhmm(eta.max)}</b></span>}
        </div>
      </header>
      <ul>
        {(p.itens || []).map(it => (
          <li key={it.id} className={it.status === 'cancelado' ? 'cancel' : ''}><b>{it.quantidade}×</b>
            <div><span>{it.nome}</span><ItemTags it={it} />{it.observacao && <em className="obs">{it.observacao}</em>}</div>
            {ctx === 'comanda' && <span className="mute">{it.status === 'cancelado' ? '—' : brl(it.quantidade * it.preco)}</span>}</li>
        ))}
      </ul>
      {p.observacao && <p className="t-obs"><Icon name="note" size={13} /><span>{p.observacao}</span></p>}
      {acts.length > 0 && <footer className="t-acts">{acts}</footer>}
    </article>
  );
}
