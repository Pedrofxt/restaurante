import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { brl, first, pad, traduz } from '../lib/utils.js';
import { Icon } from '../components/Icons.jsx';
import { toast } from '../components/Toasts.jsx';
import { AsyncButton, Avatar, Pill, Stat } from '../components/ui.jsx';
import { useApp } from '../store.jsx';

const PERIODOS = [['hoje', 'Hoje'], ['7', '7 dias'], ['30', '30 dias'], ['tudo', 'Tudo']];
const desde = per => {
  if (per === 'tudo') return null;
  const d = new Date();
  if (per === 'hoje') d.setHours(0, 0, 0, 0); else { d.setDate(d.getDate() - Number(per)); d.setHours(0, 0, 0, 0); }
  return d.toISOString();
};
const quando = iso => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function Gorjetas() {
  const { version } = useApp();
  const [per, setPer] = useState('7');
  const [lista, setLista] = useState([]);
  const [perfis, setPerfis] = useState([]);
  const [filtro, setFiltro] = useState('todas');
  const [busy, setBusy] = useState(false);

  const carregar = () => api.listGorjetas(desde(per)).then(setLista).catch(e => toast(traduz(e), 'err'));
  useEffect(() => { carregar(); }, [per, version]); // eslint-disable-line
  useEffect(() => { api.listPerfis().then(setPerfis).catch(() => {}); }, []);

  const tot = useMemo(() => {
    const total = lista.reduce((s, g) => s + Number(g.valor), 0);
    const pend = lista.filter(g => !g.repassado).reduce((s, g) => s + Number(g.valor), 0);
    const comBase = lista.filter(g => Number(g.base) > 0);
    const base = comBase.reduce((s, g) => s + Number(g.base), 0);
    const media = base ? (comBase.reduce((s, g) => s + Number(g.valor), 0) / base) * 100 : 0;
    return { total, pend, rep: total - pend, media };
  }, [lista]);

  const porGarcom = useMemo(() => {
    const m = new Map();
    for (const g of lista) {
      const k = g.garcom_id || 'sem';
      const o = m.get(k) || { id: k, nome: g.garcom?.nome || 'Sem garçom', avatar_url: g.garcom?.avatar_url, total: 0, pend: 0, idsPend: [], mesas: 0 };
      o.total += Number(g.valor);
      if (!g.repassado) { o.pend += Number(g.valor); o.idsPend.push(g.id); }
      if (g.mesa_numero != null) o.mesas += 1;
      m.set(k, o);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [lista]);

  const linhas = lista.filter(g => filtro === 'todas' || (filtro === 'pend' ? !g.repassado : g.repassado));

  const repassar = async (ids, v = true) => {
    await api.repassarGorjetas(ids, v);
    toast(v ? 'Gorjetas marcadas como repassadas' : 'Gorjeta voltou para "a repassar"', 'ok');
    await carregar();
  };

  const lancar = async e => {
    e.preventDefault();
    const f = e.currentTarget, fd = new FormData(f);
    const valor = Math.round(Number(String(fd.get('valor')).replace(',', '.')) * 100) / 100;
    try {
      if (!fd.get('garcom')) throw new Error('Escolha o garçom.');
      if (!(valor > 0)) throw new Error('Informe um valor maior que zero.');
      setBusy(true);
      await api.lancarGorjeta({ garcom_id: fd.get('garcom'), valor, observacao: String(fd.get('obs') || '').trim() });
      f.reset(); toast('Gorjeta lançada', 'ok'); await carregar();
    } catch (err) { toast(traduz(err), 'err'); }
    finally { setBusy(false); }
  };

  const equipeSalao = perfis.filter(p => p.papel === 'garcom' || p.papel === 'admin');

  return (<>
    <div className="view-head"><div><p className="eyebrow">Gerência · só você vê esta tela</p><h1>Gorjetas</h1></div>
      <div className="chips">{PERIODOS.map(([k, l]) => <button key={k} className={`chip ${per === k ? 'on' : ''}`} onClick={() => setPer(k)}>{l}</button>)}</div></div>
    <div className="stats">
      <Stat label="Total no período" value={brl(tot.total)} c="amber" i={0} />
      <Stat label="A repassar" value={brl(tot.pend)} c="ember" i={1} />
      <Stat label="Já repassado" value={brl(tot.rep)} c="sage" i={2} />
      <Stat label="Média sobre as contas" value={tot.media ? `${tot.media.toFixed(1).replace('.', ',')}%` : '—'} c="sky" i={3} />
    </div>

    <div className="tip-cards">
      {porGarcom.map((g, i) => (
        <div className="card tip-card" key={g.id} style={{ '--i': i + 4 }}>
          <div className="tc-head"><Avatar p={g} /><div><strong>{g.nome}</strong><span className="mute sm-txt">{g.mesas} {g.mesas === 1 ? 'mesa' : 'mesas'} no período</span></div></div>
          <div className="tc-val">{brl(g.total)}</div>
          <div className="tc-sub"><span>A repassar</span><b>{brl(g.pend)}</b></div>
          {g.pend > 0
            ? <AsyncButton className="btn btn-primary sm btn-block" style={{ marginTop: 14 }} onClick={() => repassar(g.idsPend)}><Icon name="check" size={14} />Marcar {brl(g.pend)} como repassado</AsyncButton>
            : <p className="tc-ok"><Icon name="check" size={14} /> Tudo repassado</p>}
        </div>
      ))}
      {!porGarcom.length && <div className="empty" style={{ gridColumn: '1/-1' }}><Icon name="coin" size={30} /><p>Nenhuma gorjeta neste período. Elas aparecem aqui quando o garçom fecha uma conta com gorjeta.</p></div>}
    </div>

    <div className="card" style={{ '--i': 2, marginBottom: 22 }}>
      <h3>Lançar gorjeta avulsa</h3><p className="sub">Para gorjetas em dinheiro ou ajustes que não passaram pelo fechamento da conta.</p>
      <form className="tip-form" onSubmit={lancar}>
        <label className="field"><span>Garçom</span><select name="garcom" defaultValue=""><option value="" disabled>Escolha…</option>{equipeSalao.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
        <label className="field"><span>Valor (R$)</span><input name="valor" type="number" min="0.01" step="0.01" inputMode="decimal" required placeholder="0,00" /></label>
        <label className="field"><span>Observação</span><input name="obs" maxLength={120} placeholder="Ex.: gorjeta em dinheiro, mesa 07" /></label>
        <button className={`btn btn-primary${busy ? ' loading' : ''}`} disabled={busy} type="submit"><Icon name="plus" size={16} />Lançar</button>
      </form>
    </div>

    <div className="fila-sec"><h2>Lançamentos</h2>
      <div className="chips" style={{ marginLeft: 'auto' }}>
        {[['todas', 'Todos'], ['pend', 'A repassar'], ['rep', 'Repassados']].map(([k, l]) => <button key={k} className={`chip ${filtro === k ? 'on' : ''}`} onClick={() => setFiltro(k)}>{l}</button>)}
      </div></div>
    <div className="tip-table">
      <div className="tip-tr th"><span>Quando</span><span>Origem</span><span>Garçom</span><span className="num">Conta</span><span className="num">%</span><span className="num">Gorjeta</span><span>Situação</span></div>
      {linhas.map(g => (
        <div className="tip-tr" key={g.id}>
          <span>{quando(g.criado_em)}</span>
          <span>{g.mesa_numero != null ? `Mesa ${pad(g.mesa_numero)}` : <span title={g.observacao || ''}>Avulsa{g.observacao ? ` · ${g.observacao}` : ''}</span>}</span>
          <span>{first(g.garcom?.nome || '—')}</span>
          <span className="num">{Number(g.base) ? brl(g.base) : '—'}</span>
          <span className="num">{g.percentual != null ? `${String(g.percentual).replace('.', ',')}%` : '—'}</span>
          <span className="num"><b>{brl(g.valor)}</b></span>
          <span className="tip-st">
            <AsyncButton className="pill-btn" onClick={() => repassar([g.id], !g.repassado)} title={g.repassado ? 'Voltar para "a repassar"' : 'Marcar como repassado'}>
              <Pill c={g.repassado ? 'sage' : 'amber'}>{g.repassado ? 'Repassado' : 'A repassar'}</Pill>
            </AsyncButton>
            {g.mesa_numero == null && <AsyncButton className="icon-btn sm" aria-label="Excluir lançamento" title="Excluir lançamento avulso" onClick={async () => { await api.excluirGorjeta(g.id); toast('Lançamento excluído', 'ok'); await carregar(); }}><Icon name="trash" size={13} /></AsyncButton>}
          </span>
        </div>
      ))}
      {!linhas.length && <p className="col-empty">Nenhum lançamento.</p>}
    </div>
  </>);
}
