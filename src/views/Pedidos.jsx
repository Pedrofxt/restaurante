import { useState } from 'react';
import { COR_PED } from '../lib/constants.js';
import PedidoCard from '../components/PedidoCard.jsx';
import { Pill } from '../components/ui.jsx';
import { useApp } from '../store.jsx';

const COLS = [['pronto', 'Prontos para servir'], ['preparando', 'Em preparo'], ['novo', 'Aguardando cozinha']];

export default function Pedidos() {
  const { pedidos, profile } = useApp();
  const [soMeus, setSoMeus] = useState(false);
  const list = pedidos.filter(p => !soMeus || p.garcom_id === profile.id);
  const entregues = list.filter(p => p.status === 'entregue').length;
  return (<>
    <div className="view-head"><div><p className="eyebrow">Garçom · {entregues} entregues hoje</p><h1>Pedidos</h1></div>
      <div className="chips">
        <button className={`chip ${!soMeus ? 'on' : ''}`} onClick={() => setSoMeus(false)}>Todos</button>
        <button className={`chip ${soMeus ? 'on' : ''}`} onClick={() => setSoMeus(true)}>Só os meus</button>
      </div></div>
    <div className="kanban">
      {COLS.map(([st, label], ci) => {
        const ps = list.filter(p => p.status === st);
        if (st === 'pronto') ps.sort((a, b) => (a.atualizado_em < b.atualizado_em ? -1 : 1));
        return (
          <div className="col" key={st} style={{ '--i': ci }}>
            <div className="col-head"><Pill c={COR_PED[st]}>{label}</Pill><b>{ps.length}</b></div>
            {ps.length ? ps.map((p, i) => <PedidoCard key={p.id} p={p} ctx="pedidos" i={i} />) : <p className="col-empty">Nada por aqui.</p>}
          </div>
        );
      })}
    </div>
  </>);
}
