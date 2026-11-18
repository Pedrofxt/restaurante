import { useState } from 'react';
import { api } from '../lib/api.js';
import { brl, fmtPrev, traduz } from '../lib/utils.js';
import { Icon } from '../components/Icons.jsx';
import { toast } from '../components/Toasts.jsx';
import { Pill, Switch } from '../components/ui.jsx';
import { useApp } from '../store.jsx';

export default function Produtos({ onNovo, onEditar }) {
  const { cardapio, refresh } = useApp();
  const [cat, setCat] = useState('Todos');
  const [busca, setBusca] = useState('');
  const cats = ['Todos', ...new Set(cardapio.map(c => c.categoria))];
  const catAtual = cats.includes(cat) ? cat : 'Todos';
  const q = busca.trim().toLowerCase();
  const list = cardapio.filter(c => (catAtual === 'Todos' || c.categoria === catAtual) && (!q || `${c.nome} ${c.descricao || ''}`.toLowerCase().includes(q)));
  const off = cardapio.filter(c => !c.ativo).length;

  const ativar = async (c, v) => {
    try { await api.ativarProduto(c.id, v); toast(v ? 'Produto disponível no cardápio' : 'Produto marcado como indisponível', 'ok'); }
    catch (e) { toast(traduz(e), 'err'); }
    refresh();
  };

  return (<>
    <div className="view-head"><div><p className="eyebrow">Cardápio · {cardapio.length} produtos{off ? ` · ${off} indisponíveis` : ''}</p><h1>Produtos</h1></div>
      <button className="btn btn-primary" onClick={() => onNovo({ ativo: true, categoria: catAtual !== 'Todos' ? catAtual : '', tempo_min: 10, tempo_max: 20 })}>
        <Icon name="plus" size={18} /><span>Novo produto</span></button></div>
    <div className="toolbar">
      <div className="search"><Icon name="search" size={16} /><input type="search" placeholder="Buscar produto…" value={busca} onChange={e => setBusca(e.target.value)} autoComplete="off" /></div>
      <div className="chips">{cats.map(c => <button key={c} className={`chip ${catAtual === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}</div>
    </div>
    <div className="prod-grid">
      {list.map((c, i) => (
        <article className={`prod${c.ativo ? '' : ' off'}`} key={c.id} style={{ '--i': i }}>
          <div className="prod-img">
            {c.foto_url ? <img src={c.foto_url} alt={c.nome} loading="lazy" /> : <span className="ph"><Icon name="dish" size={42} /></span>}
            <Pill c={c.ativo ? 'sage' : 'ember'}>{c.ativo ? c.categoria : 'Indisponível'}</Pill>
          </div>
          <div className="prod-body">
            <strong>{c.nome}</strong><p>{c.descricao || ''}</p>
            <span className="ptime"><Icon name="clock" size={12} /> {fmtPrev([c.tempo_min ?? 10, c.tempo_max ?? 20])}</span>
            <div className="prod-foot"><span className="price">{brl(c.preco)}</span>
              <div className="acts">
                <Switch checked={!!c.ativo} onChange={e => ativar(c, e.target.checked)} label="Disponível" title="Disponível no cardápio" />
                <button className="icon-btn sm" onClick={() => onEditar({ ...c })} aria-label={`Editar ${c.nome}`}><Icon name="edit" size={15} /></button>
              </div></div>
          </div>
        </article>
      ))}
      {!list.length && <div className="empty" style={{ gridColumn: '1/-1' }}><Icon name="book" size={30} /><p>Nenhum produto encontrado.</p></div>}
    </div>
  </>);
}
