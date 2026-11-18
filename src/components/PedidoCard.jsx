import { api } from '../lib/api.js';
import { ATIVOS, COR_PED, PED_ST } from '../lib/constants.js';
import { brl, first, fmtPrev, pad, previsao } from '../lib/utils.js';
import { mesaNum } from '../lib/derive.js';
import { Icon } from './Icons.jsx';
import { AsyncButton, Pill, Timer } from './ui.jsx';
import { useApp } from '../store.jsx';

export default function PedidoCard({ p, ctx, i = 0 }) {
  const { mesas, cardapio, firstLoad, seen, can, refresh } = useApp();
  const isNew = !firstLoad && !seen.current.has(p.id);
  const ativo = ATIVOS.includes(p.status);
  const vigia = p.status !== 'pronto';
  const pr = previsao(cardapio, p.itens) || [10, 20];
  const mudar = st => async () => { await api.setStatusPedido(p.id, st); await refresh(); };
  const btn = (st, label, cls = 'btn-primary', icon = 'check') => (
    <AsyncButton key={st} className={`btn ${cls} sm`} onClick={mudar(st)}><Icon name={icon} size={14} />{label}</AsyncButton>
  );

  const acts = [];
  if (ctx === 'cozinha') {
    if (p.status === 'novo') acts.push(btn('preparando', 'Iniciar preparo', 'btn-primary', 'flame'));
    if (p.status === 'preparando') acts.push(btn('pronto', 'Marcar pronto'));
    if (p.status === 'pronto') acts.push(<span key="ag" className="mute sm-txt">Aguardando o garçom</span>);
  } else if (can('garcom', 'admin')) {
    if (p.status === 'novo') acts.push(btn('cancelado', 'Cancelar', 'btn-ghost', 'x'));
    if (p.status === 'pronto') acts.push(btn('entregue', 'Marcar entregue'));
  }

  return (
    <article className={`ticket st-${p.status}${isNew ? ' is-new' : ''}`} style={{ '--c': `var(--${COR_PED[p.status]})`, '--i': i }}>
      <header className="t-head">
        <div><span className="t-mesa">Mesa {pad(mesaNum(mesas, p.mesa_id))}</span><span className="t-id">#{p.id}{p.garcom?.nome ? ` · ${first(p.garcom.nome)}` : ''}</span></div>
        <div className="t-meta">
          <Pill c={COR_PED[p.status]}>{PED_ST[p.status]}</Pill>
          {ativo && <Timer iso={p.criado_em} min={vigia ? pr[0] : null} max={vigia ? pr[1] : null} />}
          {ativo && vigia && <span className="prev">previsão {fmtPrev(pr)}</span>}
        </div>
      </header>
      <ul>
        {(p.itens || []).map(it => (
          <li key={it.id}><b>{it.quantidade}×</b><div><span>{it.nome}</span>{it.observacao && <em className="obs">{it.observacao}</em>}</div>
            {ctx === 'comanda' && <span className="mute">{brl(it.quantidade * it.preco)}</span>}</li>
        ))}
      </ul>
      {p.observacao && <p className="t-obs"><Icon name="note" size={13} /><span>{p.observacao}</span></p>}
      {acts.length > 0 && <footer className="t-acts">{acts}</footer>}
    </article>
  );
}
