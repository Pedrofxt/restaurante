import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { ATIVOS, COR_MESA, MESA_ST } from '../lib/constants.js';
import { brl, fmtPrev, pad, previsao } from '../lib/utils.js';
import { pedidosDaMesa, totalMesa } from '../lib/derive.js';
import { Icon } from '../components/Icons.jsx';
import { toast } from '../components/Toasts.jsx';
import { AsyncButton, Since } from '../components/ui.jsx';
import PedidoCard from '../components/PedidoCard.jsx';
import { useApp } from '../store.jsx';

function Stepper({ m, k, label, onChange }) {
  const val = Number(m[k]) || 0, over = k === 'pessoas' && val > m.lugares;
  return (
    <div className={`stepper${over ? ' over' : ''}`}>
      <div><span>{label}</span>{over && <small>acima da capacidade</small>}</div>
      <div className="qty big">
        <button onClick={() => onChange(-1)} aria-label={`Diminuir ${label}`}><Icon name="minus" size={14} /></button>
        <b>{val}</b>
        <button onClick={() => onChange(1)} aria-label={`Aumentar ${label}`}><Icon name="plus" size={14} /></button>
      </div>
    </div>
  );
}

function useConfirm() {
  const [on, setOn] = useState(false);
  useEffect(() => { if (!on) return; const t = setTimeout(() => setOn(false), 4000); return () => clearTimeout(t); }, [on]);
  return [on, setOn];
}

const GORJETAS = [[0, 'Sem'], [10, '10%'], [12, '12%'], [15, '15%'], ['outro', 'Outro']];

export default function MesaDrawer({ mesaId, abaInicial = 'novo', onClose, draft, setDraft, clearDraft }) {
  const { mesas, pedidos, cardapio, can, refresh, salvarMesaInfo } = useApp();
  const [aba, setAba] = useState(abaInicial);
  const [gorjPct, setGorjPct] = useState(10);
  const [gorjOutro, setGorjOutro] = useState('');
  const [cat, setCat] = useState('Todos');
  const [notas, setNotas] = useState({});
  const [confirmFechar, setConfirmFechar] = useConfirm();
  const [confirmMesa, setConfirmMesa] = useConfirm();
  const ultima = useRef(null);

  const atual = mesas.find(x => x.id === mesaId);
  if (atual) ultima.current = atual;
  const m = atual || ultima.current;
  if (!m) return null;

  const ps = pedidosDaMesa(pedidos, m.id);
  const pend = ps.some(p => ATIVOS.includes(p.status));

  const trocarAba = v => { if (v === aba) return; setAba(v); setConfirmFechar(false); };

  const mudarStatus = async v => {
    if (m.status === v) return;
    if (v === 'livre' && ps.some(p => p.status !== 'cancelado')) { toast('Use "Fechar conta" na comanda para liberar esta mesa.', 'warn'); return; }
    await api.setStatusMesa(m, v); await refresh();
  };

  const ajustar = (k, delta) => {
    const [lo, hi] = k === 'lugares' ? [1, 30] : [0, 99];
    const antes = Number(m[k]) || 0, depois = Math.min(hi, Math.max(lo, antes + delta));
    if (depois === antes) return;
    const patch = { [k]: depois };
    if (k === 'pessoas' && depois > 0 && m.status === 'livre') { patch.status = 'ocupada'; patch.aberta_em = m.aberta_em || new Date().toISOString(); }
    salvarMesaInfo(m.id, patch);
  };

  const excluirMesa = async () => {
    if (ps.length) { toast('Feche a conta desta mesa antes de excluí-la.', 'warn'); return; }
    if (!confirmMesa) { setConfirmMesa(true); return; }
    setConfirmMesa(false);
    await api.excluirMesa(m.id);
    clearDraft();
    toast(`Mesa ${pad(m.numero)} excluída`, 'ok');
    onClose(); await refresh();
  };

  /* ---------- novo pedido ---------- */
  const disp = cardapio.filter(c => c.ativo);
  const cats = ['Todos', ...new Set(disp.map(c => c.categoria))];
  const catAtual = cats.includes(cat) ? cat : 'Todos';
  const items = disp.filter(c => catAtual === 'Todos' || c.categoria === catAtual);
  const total = draft.items.reduce((s, c) => s + c.qtd * c.preco, 0);
  const n = draft.items.reduce((s, c) => s + c.qtd, 0);

  const add = c => setDraft(d => {
    const ex = d.items.find(x => x.item_id === c.id);
    return { ...d, items: ex ? d.items.map(x => (x.item_id === c.id ? { ...x, qtd: x.qtd + 1 } : x)) : [...d.items, { item_id: c.id, nome: c.nome, preco: Number(c.preco), qtd: 1, obs: '' }] };
  });
  const mudarQtd = (id, delta) => setDraft(d => ({ ...d, items: d.items.map(x => (x.item_id === id ? { ...x, qtd: x.qtd + delta } : x)).filter(x => x.qtd > 0) }));
  const setObs = (id, obs) => setDraft(d => ({ ...d, items: d.items.map(x => (x.item_id === id ? { ...x, obs } : x)) }));

  const enviar = async () => {
    if (!draft.items.length) return;
    await api.criarPedido(m.id, draft.obs, draft.items.map(c => ({ item_id: c.item_id, qtd: c.qtd, obs: c.obs })));
    clearDraft(); setNotas({});
    toast(`Pedido enviado à cozinha · Mesa ${pad(m.numero)}`, 'ok');
    setAba('comanda');
    await refresh();
  };

  /* ---------- comanda ---------- */
  const consumo = totalMesa(pedidos, m.id);
  const gorjeta = gorjPct === 'outro'
    ? Math.max(0, Math.round(Number(String(gorjOutro).replace(',', '.')) * 100) / 100 || 0)
    : Math.round(consumo * gorjPct) / 100;
  const fechar = async () => {
    if (pend) { toast('Ainda há pedidos não entregues nesta mesa.', 'warn'); return; }
    if (!confirmFechar) { setConfirmFechar(true); return; }
    setConfirmFechar(false);
    await api.fecharMesa(m.id, gorjeta);
    toast(`Conta fechada · Mesa ${pad(m.numero)} · ${brl(consumo + gorjeta)}${gorjeta ? ` (gorjeta ${brl(gorjeta)})` : ''}`, 'ok');
    onClose(); await refresh();
  };

  return (<>
    <div className="d-head">
      <div><p className="eyebrow">{m.lugares} lugares{m.aberta_em && <> · aberta há <Since iso={m.aberta_em} /></>}</p><h2>Mesa {pad(m.numero)}</h2></div>
      <div className="d-head-acts">
        {can('admin') && <AsyncButton className={`icon-btn${confirmMesa ? ' danger' : ''}`} onClick={excluirMesa} aria-label="Excluir mesa" title="Excluir mesa">
          <Icon name="trash" size={16} />{confirmMesa && <span>Excluir?</span>}</AsyncButton>}
        <button className="icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
      </div>
    </div>
    <div className="seg seg-status">
      {Object.entries(MESA_ST).map(([k, v]) => (
        <AsyncButton key={k} className={m.status === k ? 'on' : ''} style={{ '--c': `var(--${COR_MESA[k]})` }} onClick={() => mudarStatus(k)}>{v}</AsyncButton>
      ))}
    </div>
    <div className="mesa-info">
      <Stepper m={m} k="lugares" label="Lugares" onChange={d => ajustar('lugares', d)} />
      <Stepper m={m} k="pessoas" label="Pessoas na mesa" onChange={d => ajustar('pessoas', d)} />
    </div>
    <div className="tabs">
      <button className={aba === 'novo' ? 'on' : ''} onClick={() => trocarAba('novo')}>Novo pedido</button>
      <button className={aba === 'comanda' ? 'on' : ''} onClick={() => trocarAba('comanda')}>Comanda <span className="count">{ps.length}</span></button>
      <span className="tab-ind" style={{ '--x': aba === 'novo' ? 0 : 1 }} />
    </div>

    {aba === 'novo' ? <>
      <div className="d-body enter" key={`novo-${catAtual}`}>
        <div className="chips cats">{cats.map(c => <button key={c} className={`chip ${catAtual === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}</div>
        <div className="menu">
          {items.map((c, i) => {
            const q = draft.items.find(x => x.item_id === c.id)?.qtd || 0;
            return (
              <div className={`menu-item${q ? ' in' : ''}`} key={c.id} style={{ '--i': i }}>
                <div className="mi-main">
                  <div className="thumb">{c.foto_url ? <img src={c.foto_url} alt="" loading="lazy" /> : <Icon name="dish" size={22} />}</div>
                  <div><strong>{c.nome}</strong>{c.descricao && <p>{c.descricao}</p>}
                    <span className="price">{brl(c.preco)} <em className="ptime">· {fmtPrev([c.tempo_min ?? 10, c.tempo_max ?? 20])}</em></span></div>
                </div>
                <button className="add" onClick={() => add(c)} aria-label={`Adicionar ${c.nome}`}>{q ? <b key={q}>{q}</b> : <Icon name="plus" size={18} />}</button>
              </div>
            );
          })}
        </div>
      </div>
      <div className="cart">
        {n ? <>
          <div className="cart-lines">
            {draft.items.map(c => (
              <div className="line" key={c.item_id}>
                <div className="qty">
                  <button onClick={() => mudarQtd(c.item_id, -1)} aria-label="Menos"><Icon name="minus" size={14} /></button>
                  <b>{c.qtd}</b>
                  <button onClick={() => mudarQtd(c.item_id, 1)} aria-label="Mais"><Icon name="plus" size={14} /></button>
                </div>
                <div className="line-name"><span>{c.nome}</span>
                  {(notas[c.item_id] || c.obs) && <input className="line-obs" value={c.obs} autoFocus={!c.obs} onChange={e => setObs(c.item_id, e.target.value)} placeholder="Ex.: sem cebola, ao ponto…" />}
                </div>
                <button className={`icon-btn sm${c.obs ? ' on' : ''}`} onClick={() => setNotas(o => ({ ...o, [c.item_id]: !o[c.item_id] }))} aria-label="Observação do item"><Icon name="note" size={15} /></button>
                <span className="line-price">{brl(c.qtd * c.preco)}</span>
              </div>
            ))}
          </div>
          <textarea rows={2} value={draft.obs} onChange={e => { const v = e.target.value; setDraft(d => ({ ...d, obs: v })); }} placeholder="Observação geral (alergias, ordem de saída, aniversário…)" />
        </> : <p className="cart-empty">Toque em <b>+</b> nos pratos para anotar o pedido.</p>}
        {n > 0 && <div className="prev-row"><Icon name="clock" size={13} /> Previsão de preparo: <b>{fmtPrev(previsao(cardapio, draft.items))}</b></div>}
        <AsyncButton className="btn btn-primary btn-block" disabled={!n} onClick={enviar}>
          <Icon name="send" size={16} /><span>Enviar para a cozinha</span><span className="sp" /><b>{n ? brl(total) : ''}</b>
        </AsyncButton>
      </div>
    </> : <>
      <div className="d-body enter" key="comanda">
        {ps.length ? [...ps].reverse().map((p, i) => <PedidoCard key={p.id} p={p} ctx="comanda" i={i} />)
          : <div className="empty"><Icon name="receipt" size={30} /><p>Nenhum pedido aberto nesta mesa.</p></div>}
      </div>
      <div className="cart">
        {(ps.length > 0) && (
          <div className="tip-box">
            <div className="tip-head"><span>Gorjeta do garçom</span><b>{brl(gorjeta)}</b></div>
            <div className="seg tip-seg">
              {GORJETAS.map(([k, l]) => <button key={k} className={gorjPct === k ? 'on' : ''} onClick={() => setGorjPct(k)}>{l}</button>)}
            </div>
            {gorjPct === 'outro' && <input className="tip-outro" type="number" min="0" step="0.01" inputMode="decimal" autoFocus value={gorjOutro} onChange={e => setGorjOutro(e.target.value)} placeholder="Valor da gorjeta (R$)" />}
          </div>
        )}
        <div className="sub-row"><span>Consumo</span><span>{brl(consumo)}</span></div>
        <div className="total-row"><span>Total{gorjeta ? ' com gorjeta' : ''}</span><strong>{brl(consumo + gorjeta)}</strong></div>
        <AsyncButton className={`btn ${confirmFechar ? 'btn-danger' : 'btn-primary'} btn-block`} disabled={!(ps.length || m.status !== 'livre')} onClick={fechar}>
          <Icon name="check" size={16} /><span>{confirmFechar ? 'Toque de novo para confirmar' : pend ? 'Há pedidos em andamento' : 'Fechar conta e liberar mesa'}</span>
        </AsyncButton>
      </div>
    </>}
  </>);
}
