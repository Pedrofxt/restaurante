import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { DEMO } from '../config.js';
import { resizeImage, traduz } from '../lib/utils.js';
import { Icon } from '../components/Icons.jsx';
import { toast } from '../components/Toasts.jsx';
import { AsyncButton } from '../components/ui.jsx';
import { useApp } from '../store.jsx';

export default function ProdutoForm({ inicial: p, onClose }) {
  const { cardapio, refresh } = useApp();
  const novo = !p.id;
  const [foto, setFoto] = useState(null);       // { blob, url } | { remove: true } | null
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const nomeRef = useRef(null);
  const cats = [...new Set(cardapio.map(c => c.categoria))];
  const fotoUrl = foto?.remove ? null : (foto?.url || p.foto_url);

  useEffect(() => () => { if (foto?.url) URL.revokeObjectURL(foto.url); }, [foto]);
  useEffect(() => { if (!confirmar) return; const t = setTimeout(() => setConfirmar(false), 4000); return () => clearTimeout(t); }, [confirmar]);
  useEffect(() => { if (!novo) return; const t = setTimeout(() => nomeRef.current?.focus({ preventScroll: true }), 450); return () => clearTimeout(t); }, [novo]);

  const escolher = async e => {
    const f = e.target.files[0]; setOver(false); if (!f) return;
    try { const blob = await resizeImage(f, DEMO ? 640 : 1200); setFoto({ blob, url: URL.createObjectURL(blob) }); }
    catch (err) { toast(traduz(err), 'err'); }
  };

  const salvar = async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
    const prod = {
      ...p,
      nome: String(fd.get('nome')).trim(), descricao: String(fd.get('descricao') || '').trim(),
      categoria: cap(String(fd.get('categoria')).trim()), preco: Number(fd.get('preco')),
      tempo_min: Math.round(Number(fd.get('tempo_min'))), tempo_max: Math.round(Number(fd.get('tempo_max'))), ativo: !!fd.get('ativo'),
    };
    try {
      if (!(prod.preco >= 0)) throw new Error('Preço inválido.');
      if (!(prod.tempo_min >= 0) || prod.tempo_max < prod.tempo_min) throw new Error('A espera máxima precisa ser maior ou igual à mínima.');
      setBusy(true);
      await api.salvarProduto(prod, foto);
      toast(novo ? `"${prod.nome}" cadastrado no cardápio` : 'Produto atualizado', 'ok');
      onClose(); await refresh();
    } catch (err) { console.error(err); toast(traduz(err), 'err'); }
    finally { setBusy(false); }
  };

  const excluir = async () => {
    if (!confirmar) { setConfirmar(true); return; }
    setConfirmar(false);
    await api.excluirProduto(p);
    toast(`"${p.nome}" foi excluído do cardápio`, 'ok');
    onClose(); await refresh();
  };

  return (<>
    <div className="d-head">
      <div><p className="eyebrow">Cardápio</p><h2>{novo ? 'Novo produto' : 'Editar produto'}</h2></div>
      <button className="icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
    </div>
    <div className="d-body enter">
      <form id="formProduto" autoComplete="off" onSubmit={salvar}>
        <label className={`drop${over ? ' over' : ''}`} onDragEnter={() => setOver(true)} onDragLeave={() => setOver(false)} onDrop={() => setOver(false)}>
          {fotoUrl ? <img key={fotoUrl} src={fotoUrl} alt="" />
            : <span className="ph"><Icon name="image" size={32} /><span>Toque ou arraste uma foto do prato<br /><small>JPG, PNG ou WebP · ajustamos o tamanho</small></span></span>}
          <input type="file" id="prodFoto" accept="image/png,image/jpeg,image/webp" aria-label="Foto do produto" onChange={escolher} />
        </label>
        {fotoUrl && <button type="button" className="btn btn-ghost sm" style={{ margin: '-4px 0 16px' }} onClick={() => setFoto({ remove: true })}><Icon name="trash" size={14} /> Remover foto</button>}
        <label className="field"><span>Nome</span><input ref={nomeRef} name="nome" required maxLength={80} defaultValue={p.nome || ''} placeholder="Ex.: Moqueca de banana-da-terra" /></label>
        <label className="field"><span>Descrição</span><textarea name="descricao" rows={2} maxLength={200} defaultValue={p.descricao || ''} placeholder="Ingredientes, acompanhamentos…" /></label>
        <div className="two">
          <label className="field"><span>Categoria</span><input name="categoria" required maxLength={40} list="catList" defaultValue={p.categoria || ''} placeholder="Principais" />
            <datalist id="catList">{cats.map(c => <option key={c} value={c} />)}</datalist></label>
          <label className="field"><span>Preço (R$)</span><input name="preco" type="number" inputMode="decimal" min="0" step="0.01" required defaultValue={p.preco ?? ''} placeholder="0,00" /></label>
        </div>
        <div className="two">
          <label className="field"><span>Espera mínima (min)</span><input name="tempo_min" type="number" inputMode="numeric" min="0" max="240" step="1" required defaultValue={p.tempo_min ?? 10} /></label>
          <label className="field"><span>Espera máxima (min)</span><input name="tempo_max" type="number" inputMode="numeric" min="0" max="240" step="1" required defaultValue={p.tempo_max ?? 20} /></label>
        </div>
        <div className="toggle-row"><div><strong>Disponível no cardápio</strong><span>Desative quando acabar: o garçom deixa de ver o item.</span></div>
          <label className="switch-t"><input type="checkbox" name="ativo" defaultChecked={p.ativo !== false} aria-label="Disponível" /><i /></label></div>
      </form>
    </div>
    <div className="cart">
      <div style={{ display: 'flex', gap: 10 }}>
        {!novo && <AsyncButton className={`btn ${confirmar ? 'btn-danger' : 'btn-ghost'}`} onClick={excluir}><Icon name="trash" size={16} /><span>{confirmar ? 'Confirmar exclusão' : 'Excluir'}</span></AsyncButton>}
        <button className={`btn btn-primary${busy ? ' loading' : ''}`} disabled={busy} style={{ flex: 1 }} type="submit" form="formProduto">
          <Icon name="check" size={16} /><span>{novo ? 'Cadastrar produto' : 'Salvar alterações'}</span></button>
      </div>
    </div>
  </>);
}
