import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { pad, traduz } from '../lib/utils.js';
import { Icon } from '../components/Icons.jsx';
import { toast } from '../components/Toasts.jsx';
import { useApp } from '../store.jsx';

export default function NovaMesaForm({ onClose, onCriada }) {
  const { mesas, refresh } = useApp();
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const prox = Math.max(0, ...mesas.map(m => m.numero)) + 1;
  useEffect(() => { const t = setTimeout(() => { ref.current?.focus({ preventScroll: true }); ref.current?.select(); }, 450); return () => clearTimeout(t); }, []);

  const salvar = async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const numero = Math.round(Number(fd.get('numero'))), lugares = Math.round(Number(fd.get('lugares')));
    try {
      if (!(numero >= 1)) throw new Error('Informe um número de mesa válido.');
      if (!(lugares >= 1 && lugares <= 30)) throw new Error('A mesa precisa ter de 1 a 30 lugares.');
      if (mesas.some(m => m.numero === numero)) throw new Error(`Já existe a mesa ${pad(numero)}.`);
      setBusy(true);
      await api.criarMesa({ numero, lugares });
      toast(`Mesa ${pad(numero)} adicionada`, 'ok');
      onClose(); onCriada?.(); await refresh();
    } catch (err) { toast(traduz(err), 'err'); }
    finally { setBusy(false); }
  };

  return (<>
    <div className="d-head">
      <div><p className="eyebrow">Salão</p><h2>Nova mesa</h2></div>
      <button className="icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
    </div>
    <div className="d-body enter">
      <form id="formMesa" autoComplete="off" onSubmit={salvar}>
        <div className="two">
          <label className="field"><span>Número da mesa</span><input ref={ref} name="numero" type="number" inputMode="numeric" min="1" max="999" step="1" required defaultValue={prox} /></label>
          <label className="field"><span>Lugares</span><input name="lugares" type="number" inputMode="numeric" min="1" max="30" step="1" required defaultValue={4} /></label>
        </div>
        <p className="hint" style={{ marginTop: 4 }}>Já existem {mesas.length} mesas: {mesas.map(m => pad(m.numero)).join(', ') || 'nenhuma'}.</p>
      </form>
    </div>
    <div className="cart">
      <button className={`btn btn-primary btn-block${busy ? ' loading' : ''}`} disabled={busy} type="submit" form="formMesa"><Icon name="plus" size={16} /><span>Adicionar mesa</span></button>
    </div>
  </>);
}
