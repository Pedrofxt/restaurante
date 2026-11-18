import { ATIVOS, COR_MESA, MESA_ST } from '../lib/constants.js';
import { brl, pad } from '../lib/utils.js';
import { pedidosDaMesa, totalMesa } from '../lib/derive.js';
import { Icon } from '../components/Icons.jsx';
import { Pill, Since, Stat } from '../components/ui.jsx';
import { useApp } from '../store.jsx';

function MesaCard({ m, i, onOpen }) {
  const { pedidos } = useApp();
  const ativos = pedidosDaMesa(pedidos, m.id).filter(p => ATIVOS.includes(p.status));
  const prontos = ativos.filter(p => p.status === 'pronto').length;
  const total = totalMesa(pedidos, m.id);
  return (
    <button className={`mesa${prontos ? ' ready' : ''}`} data-s={m.status} style={{ '--i': i + 4 }} onClick={onOpen}>
      {prontos > 0 && <span className="ready-tag">{prontos > 1 ? `${prontos} prontos` : 'Pronto'}</span>}
      <div className="mesa-top">
        <Pill c={COR_MESA[m.status]}>{MESA_ST[m.status]}</Pill>
        <span className="seats" title={`${m.pessoas ? m.pessoas + ' pessoas · ' : ''}${m.lugares} lugares`}>
          <Icon name={m.pessoas ? 'users' : 'user'} size={13} />{m.pessoas ? `${m.pessoas}/${m.lugares}` : m.lugares}
        </span>
      </div>
      <div className="num">{pad(m.numero)}</div>
      <div className="mesa-foot">
        {m.status === 'livre' ? <span className="mute">Disponível</span> : <>
          <span>{total ? brl(total) : m.status === 'reservada' ? 'Reservada' : '—'}</span>
          {m.aberta_em && <Since className="mute" iso={m.aberta_em} />}
        </>}
        {ativos.length > 0 && <span className="dots">{ativos.map(p => <i key={p.id} className={`d-${p.status}`} />)}</span>}
      </div>
    </button>
  );
}

export default function Salao({ filtro, setFiltro, onOpenMesa, onNovaMesa }) {
  const { mesas, pedidos, can } = useApp();
  const c = { livre: 0, ocupada: 0, conta: 0, reservada: 0 };
  mesas.forEach(m => { c[m.status]++; });
  const ativos = pedidos.filter(p => ATIVOS.includes(p.status));
  const filtros = [['todas', 'Todas', mesas.length], ...Object.entries(MESA_ST).map(([k, v]) => [k, v, c[k]])];
  const list = mesas.filter(m => filtro === 'todas' || m.status === filtro);
  const gerente = can('admin');
  return (<>
    <div className="view-head"><div><p className="eyebrow">Salão</p><h1>Mesas</h1></div>
      <div className="chips">{filtros.map(([k, l, n]) => <button key={k} className={`chip ${filtro === k ? 'on' : ''}`} onClick={() => setFiltro(k)}>{l}<small>{n}</small></button>)}</div></div>
    <div className="stats">
      <Stat label="Livres" value={c.livre} c="sage" i={0} />
      <Stat label="Em atendimento" value={c.ocupada + c.conta} c="amber" i={1} />
      <Stat label="Pedidos na cozinha" value={ativos.filter(p => p.status !== 'pronto').length} c="sky" i={2} />
      <Stat label="Prontos para servir" value={ativos.filter(p => p.status === 'pronto').length} c="ember" i={3} />
    </div>
    <div className="grid-mesas">
      {list.map((m, i) => <MesaCard key={m.id} m={m} i={i} onOpen={() => onOpenMesa(m.id)} />)}
      {gerente && filtro === 'todas' && <button className="mesa-add" style={{ '--i': list.length + 4 }} onClick={onNovaMesa}><span><Icon name="plus" size={22} /></span>Nova mesa</button>}
      {!list.length && !(gerente && filtro === 'todas') && <p className="mute">Nenhuma mesa neste filtro.</p>}
    </div>
  </>);
}
