import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { COR_PED, PED_ST } from '../lib/constants.js';
import { brl, etaPedido, fmtPrev, hhmm, pad } from '../lib/utils.js';
import { filaPosicoes, mesaNum } from '../lib/derive.js';
import { Icon } from '../components/Icons.jsx';
import { toast } from '../components/Toasts.jsx';
import { ItemTags } from '../components/PedidoCard.jsx';
import { AsyncButton, Pill } from '../components/ui.jsx';
import { useApp } from '../store.jsx';
import { useShell } from '../shellContext.js';

/* Alterar, cancelar ou adicionar itens de um pedido já enviado.
   O pedido continua na mesma posição da fila do restaurante. */
export default function PedidoEditor({ pedidoId, voltarMesa, onClose }) {
  const { pedidos, mesas, cardapio, refresh } = useApp();
  const { abrir } = useShell();
  const ultimo = useRef(null);
  const [cat, setCat] = useState('Todos');
  const [novos, setNovos] = useState([]);
  const [obsEd, setObsEd] = useState({});
  const [confirmar, setConfirmar] = useState(null);
  useEffect(() => { if (confirmar == null) return; const t = setTimeout(() => setConfirmar(null), 4000); return () => clearTimeout(t); }, [confirmar]);

  const atual = pedidos.find(x => x.id === pedidoId);
  if (atual) ultimo.current = atual;
  const p = atual || ultimo.current;
  if (!p) return null;

  const pos = filaPosicoes(pedidos).get(p.id);
  const eta = etaPedido(cardapio, p);
  const editavel = ['novo', 'preparando'].includes(p.status) && !p.pago;
  const aceitaAdicao = ['novo', 'preparando', 'pronto'].includes(p.status) && !p.pago;

  const mudarQtd = async (it, d) => {
    const n = it.quantidade + d; if (n < 1 || n > 99) return;
    await api.editarItem(it.id, n, it.observacao); await refresh();
  };
  const salvarObs = async it => {
    const v = obsEd[it.id];
    if (v === undefined || v.trim() === (it.observacao || '')) return;
    await api.editarItem(it.id, it.quantidade, v);
    setObsEd(o => { const n = { ...o }; delete n[it.id]; return n; });
    toast('Observação atualizada', 'ok'); await refresh();
  };
  const cancelar = async it => {
    if (confirmar !== it.id) { setConfirmar(it.id); return; }
    setConfirmar(null);
    const ultimoAtivo = p.itens.filter(i => i.status !== 'cancelado').length === 1;
    await api.cancelarItem(it.id);
    toast(ultimoAtivo ? 'Último item cancelado: o pedido foi cancelado' : `${it.nome} cancelado`, 'ok');
    await refresh();
  };

  const disp = cardapio.filter(c => c.ativo);
  const cats = ['Todos', ...new Set(disp.map(c => c.categoria))];
  const catAtual = cats.includes(cat) ? cat : 'Todos';
  const items = disp.filter(c => catAtual === 'Todos' || c.categoria === catAtual);
  const add = c => setNovos(l => l.some(x => x.item_id === c.id) ? l.map(x => (x.item_id === c.id ? { ...x, qtd: x.qtd + 1 } : x)) : [...l, { item_id: c.id, nome: c.nome, preco: Number(c.preco), qtd: 1, obs: '' }]);
  const qtdNovo = (id, d) => setNovos(l => l.map(x => (x.item_id === id ? { ...x, qtd: x.qtd + d } : x)).filter(x => x.qtd > 0));
  const totalNovos = novos.reduce((s, x) => s + x.qtd * x.preco, 0);
  const nNovos = novos.reduce((s, x) => s + x.qtd, 0);

  const enviar = async () => {
    if (!novos.length) return;
    const voltou = p.status === 'pronto';
    await api.adicionarItens(p.id, novos.map(x => ({ item_id: x.item_id, qtd: x.qtd, obs: x.obs })));
    setNovos([]);
    toast(voltou ? 'Itens adicionados: o pedido voltou para a cozinha, na mesma posição' : 'Itens adicionados ao pedido, sem mudar a posição na fila', 'ok');
    await refresh();
  };

  return (<>
    <div className="d-head">
      <div><p className="eyebrow">Pedido {p.id}{pos ? ` · #${pos} na fila` : ''}</p><h2>Mesa {pad(mesaNum(mesas, p.mesa_id))}</h2></div>
      <div className="d-head-acts">
        {voltarMesa && <button className="icon-btn" onClick={() => abrir('mesa', { id: voltarMesa, aba: 'comanda' })} aria-label="Voltar para a mesa" title="Voltar para a mesa"><Icon name="arrow" size={16} /></button>}
        <button className="icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
      </div>
    </div>
    <div className="ed-head-info">
      <Pill c={COR_PED[p.status]}>{PED_ST[p.status]}</Pill>
      {eta && ['novo', 'preparando'].includes(p.status) && <span className="mute sm-txt"><Icon name="clock" size={12} /> pronto entre <b>{hhmm(eta.min)}</b> e <b>{hhmm(eta.max)}</b></span>}
      <span className="mute sm-txt">feito às {hhmm(p.criado_em)}</span>
    </div>
    <div className="d-body enter">
      <p className="ed-note"><Icon name="alert" size={15} /><span>As alterações valem só para este pedido e <b>não mudam a posição dele na fila</b>. A cozinha vê o que foi alterado, cancelado ou adicionado.</span></p>
      {!editavel && aceitaAdicao && <p className="ed-note"><Icon name="check" size={15} /><span>Este pedido já está pronto: os itens dele não podem mais ser alterados, mas você ainda pode adicionar itens (ele volta para a cozinha, na mesma posição).</span></p>}
      {!aceitaAdicao && <p className="ed-note"><Icon name="x" size={15} /><span>Este pedido já foi {p.status === 'cancelado' ? 'cancelado' : 'entregue'}. Para pedir mais, faça um pedido novo na mesa.</span></p>}

      <div className="ed-sec">Itens do pedido</div>
      {(p.itens || []).map(it => {
        const ativo = it.status !== 'cancelado';
        const t = cardapio.find(c => c.id === it.item_id);
        return (
          <div key={it.id} className={`ed-item${ativo ? '' : ' cancel'}`}>
            {editavel && ativo ? (
              <div className="qty">
                <AsyncButton onClick={() => mudarQtd(it, -1)} disabled={it.quantidade <= 1} aria-label="Menos"><Icon name="minus" size={14} /></AsyncButton>
                <b>{it.quantidade}</b>
                <AsyncButton onClick={() => mudarQtd(it, 1)} aria-label="Mais"><Icon name="plus" size={14} /></AsyncButton>
              </div>
            ) : <b className="ed-q">{it.quantidade}×</b>}
            <div>
              <div className="ed-name">{it.nome}<ItemTags it={it} /></div>
              <span className="mute sm-txt">{ativo ? brl(it.quantidade * it.preco) : '—'}{t ? ` · ${fmtPrev([t.tempo_min ?? 10, t.tempo_max ?? 20])}` : ''}</span>
              {editavel && ativo ? (
                <div className="ed-obs">
                  <input value={obsEd[it.id] ?? it.observacao ?? ''} placeholder="Observação (ex.: sem cebola)"
                    onChange={e => { const v = e.target.value; setObsEd(o => ({ ...o, [it.id]: v })); }}
                    onBlur={() => salvarObs(it).catch(err => toast(err.message, 'err'))}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
                </div>
              ) : it.observacao && <em className="obs">{it.observacao}</em>}
            </div>
            {editavel && ativo && (
              <AsyncButton className={`icon-btn sm${confirmar === it.id ? ' danger' : ''}`} onClick={() => cancelar(it)} aria-label="Cancelar item" title="Cancelar item">
                <Icon name="trash" size={14} />{confirmar === it.id && <span>Cancelar?</span>}
              </AsyncButton>
            )}
          </div>
        );
      })}

      {aceitaAdicao && <>
        <div className="ed-sec">Adicionar itens a este pedido</div>
        <div className="chips cats">{cats.map(c => <button key={c} className={`chip ${catAtual === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}</div>
        <div className="menu compact">
          {items.map((c, i) => {
            const q = novos.find(x => x.item_id === c.id)?.qtd || 0;
            return (
              <div className={`menu-item${q ? ' in' : ''}`} key={c.id} style={{ '--i': i }}>
                <div className="mi-main">
                  <div className="thumb">{c.foto_url ? <img src={c.foto_url} alt="" loading="lazy" /> : <Icon name="dish" size={22} />}</div>
                  <div><strong>{c.nome}</strong><span className="price">{brl(c.preco)} <em className="ptime">· {fmtPrev([c.tempo_min ?? 10, c.tempo_max ?? 20])}</em></span></div>
                </div>
                <button className="add" onClick={() => add(c)} aria-label={`Adicionar ${c.nome}`}>{q ? <b key={q}>{q}</b> : <Icon name="plus" size={18} />}</button>
              </div>
            );
          })}
        </div>
      </>}
    </div>
    {aceitaAdicao && (
      <div className="cart">
        {nNovos > 0 ? (
          <div className="cart-lines">
            {novos.map(x => (
              <div className="line" key={x.item_id}>
                <div className="qty">
                  <button onClick={() => qtdNovo(x.item_id, -1)} aria-label="Menos"><Icon name="minus" size={14} /></button>
                  <b>{x.qtd}</b>
                  <button onClick={() => qtdNovo(x.item_id, 1)} aria-label="Mais"><Icon name="plus" size={14} /></button>
                </div>
                <div className="line-name"><span>{x.nome}</span>
                  <input className="line-obs" value={x.obs} placeholder="Observação (opcional)" onChange={e => { const v = e.target.value; setNovos(l => l.map(y => (y.item_id === x.item_id ? { ...y, obs: v } : y))); }} />
                </div>
                <span />
                <span className="line-price">{brl(x.qtd * x.preco)}</span>
              </div>
            ))}
          </div>
        ) : <p className="cart-empty">Toque em <b>+</b> para adicionar itens a este pedido.</p>}
        <AsyncButton className="btn btn-primary btn-block" disabled={!nNovos} onClick={enviar}>
          <Icon name="plus" size={16} /><span>Adicionar ao pedido</span><span className="sp" /><b>{nNovos ? brl(totalNovos) : ''}</b>
        </AsyncButton>
      </div>
    )}
  </>);
}
