import { COR_PED } from '../lib/constants.js';
import PedidoCard from '../components/PedidoCard.jsx';
import { Pill, Since, Stat } from '../components/ui.jsx';
import { useApp } from '../store.jsx';

export default function Cozinha() {
  const { pedidos } = useApp();
  const fila = pedidos.filter(p => p.status === 'novo');
  const fogo = pedidos.filter(p => p.status === 'preparando');
  const prontos = pedidos.filter(p => p.status === 'pronto');
  const espera = [...fila, ...fogo].sort((a, b) => (a.criado_em < b.criado_em ? -1 : 1))[0];
  const itensFogo = fogo.reduce((s, p) => s + p.itens.reduce((x, i) => x + i.quantidade, 0), 0);
  const cols = [['novo', 'Na fila', fila], ['preparando', 'No fogo', fogo], ['pronto', 'Prontos', prontos]];
  return (<>
    <div className="view-head"><div><p className="eyebrow">Cozinha</p><h1>Produção</h1></div></div>
    <div className="stats">
      <Stat label="Na fila" value={fila.length} c="sky" i={0} />
      <Stat label="Itens no fogo" value={itensFogo} c="amber" i={1} />
      <Stat label="Prontos" value={prontos.length} c="sage" i={2} />
      <Stat label="Maior espera" value={espera ? <Since iso={espera.criado_em} /> : '—'} c="ember" i={3} />
    </div>
    <div className="kanban">
      {cols.map(([st, label, ps], ci) => (
        <div className="col" key={st} style={{ '--i': ci + 4 }}>
          <div className="col-head"><Pill c={COR_PED[st]}>{label}</Pill><b>{ps.length}</b></div>
          {ps.length ? ps.map((p, i) => <PedidoCard key={p.id} p={p} ctx="cozinha" i={i} />) : <p className="col-empty">Nada por aqui.</p>}
        </div>
      ))}
    </div>
  </>);
}
