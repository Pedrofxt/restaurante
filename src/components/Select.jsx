/* Caixas de seleção próprias do Âmbar (sem o visual nativo do navegador).
   - Select: lista suspensa com teclado (setas, Enter, Esc, Home/End, busca por letra)
   - Combo: campo de texto livre com sugestões (ex.: categoria do produto)
   A lista abre num portal com posição fixa, então não é cortada por gavetas com rolagem,
   e abre para cima quando não há espaço embaixo. Cores vêm das variáveis do tema. */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icons.jsx';

function usePopover(anchorRef, open, count) {
  const [pos, setPos] = useState(null);
  const place = useCallback(() => {
    const el = anchorRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const h = Math.min(288, Math.max(1, count) * 42 + 12);
    const below = innerHeight - r.bottom, up = below < h + 16 && r.top > below;
    setPos({ left: Math.min(r.left, innerWidth - Math.max(r.width, 180) - 8), width: r.width, top: up ? undefined : r.bottom + 6, bottom: up ? innerHeight - r.top + 6 : undefined, up, maxH: Math.max(140, (up ? r.top : below) - 24) });
  }, [anchorRef, count]);
  useEffect(() => {
    if (!open) return;
    place();
    const re = () => place();
    addEventListener('resize', re); addEventListener('scroll', re, true);
    return () => { removeEventListener('resize', re); removeEventListener('scroll', re, true); };
  }, [open, place]);
  return pos;
}

function useFora(open, refs, fechar) {
  useEffect(() => {
    if (!open) return;
    const f = e => { if (!refs.some(r => r.current?.contains(e.target))) fechar(); };
    document.addEventListener('pointerdown', f);
    return () => document.removeEventListener('pointerdown', f);
  }, [open]); // eslint-disable-line
}

function Lista({ id, listRef, pos, itens, hi, setHi, escolher, ativo, vazio }) {
  useEffect(() => { listRef.current?.querySelector('.hi')?.scrollIntoView({ block: 'nearest' }); }, [hi, listRef]);
  return createPortal(
    <ul id={id} ref={listRef} role="listbox" className={`sel-pop${pos.up ? ' up' : ''}`}
      style={{ left: pos.left, minWidth: Math.max(pos.width, 180), top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}
      onPointerDown={e => e.preventDefault()}>
      {itens.length ? itens.map((o, i) => (
        <li key={o.value} id={`${id}-${i}`} role="option" aria-selected={ativo(o)} aria-disabled={o.disabled || undefined}
          className={`${i === hi ? 'hi' : ''}${ativo(o) ? ' on' : ''}${o.disabled ? ' dis' : ''}`}
          onPointerEnter={() => setHi(i)} onClick={() => escolher(o)}>
          <span className="sel-lbl">{o.label}{o.hint && <small>{o.hint}</small>}</span>
          {ativo(o) && <Icon name="check" size={15} />}
        </li>
      )) : <li className="sel-vazio">{vazio}</li>}
    </ul>, document.body);
}

export function Select({ value, onChange, options, placeholder = 'Selecione…', name, disabled, size = 'md', id, ...rest }) {
  const lid = useId().replace(/:/g, '');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const btn = useRef(null), list = useRef(null), busca = useRef({ txt: '', t: 0 });
  const pos = usePopover(btn, open, options.length);
  const sel = options.find(o => o.value === value);
  const fechar = () => setOpen(false);
  useFora(open, [btn, list], fechar);

  const abrir = () => { if (disabled) return; setHi(Math.max(0, options.findIndex(o => o.value === value))); setOpen(true); };
  const escolher = o => { if (!o || o.disabled) return; if (o.value !== value) onChange?.(o.value); setOpen(false); btn.current?.focus(); };
  const mover = d => setHi(h => { let i = h; for (let k = 0; k < options.length; k++) { i = (i + d + options.length) % options.length; if (!options[i].disabled) return i; } return h; });

  const tecla = e => {
    const k = e.key;
    if (['ArrowDown', 'ArrowUp'].includes(k)) { e.preventDefault(); if (!open) abrir(); else mover(k === 'ArrowDown' ? 1 : -1); return; }
    if (k === 'Enter' || k === ' ') { e.preventDefault(); if (!open) abrir(); else escolher(options[hi]); return; }
    if (k === 'Escape' && open) { e.preventDefault(); fechar(); return; }
    if (k === 'Tab' && open) { fechar(); return; }
    if (open && (k === 'Home' || k === 'End')) { e.preventDefault(); setHi(k === 'Home' ? 0 : options.length - 1); return; }
    if (k.length === 1 && /\S/.test(k)) {
      const b = busca.current, agora = Date.now();
      b.txt = (agora - b.t > 700 ? '' : b.txt) + k.toLowerCase(); b.t = agora;
      const i = options.findIndex(o => !o.disabled && String(o.label).toLowerCase().startsWith(b.txt));
      if (i >= 0) { if (open) setHi(i); else escolher(options[i]); }
    }
  };

  return (<>
    <button type="button" ref={btn} id={id} className={`sel sel-${size}${open ? ' open' : ''}${pos?.up ? ' up' : ''}`} disabled={disabled}
      role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? lid : undefined}
      aria-activedescendant={open && hi >= 0 ? `${lid}-${hi}` : undefined}
      onClick={() => (open ? fechar() : abrir())} onKeyDown={tecla} {...rest}>
      <span className={`sel-val${sel ? '' : ' sel-ph'}`}>{sel ? sel.label : placeholder}</span>
      <Icon name="chevron" size={16} />
    </button>
    {name && <input type="hidden" name={name} value={value ?? ''} />}
    {open && pos && <Lista id={lid} listRef={list} pos={pos} itens={options} hi={hi} setHi={setHi} escolher={escolher} ativo={o => o.value === value} />}
  </>);
}

export function Combo({ name, defaultValue = '', options, placeholder, required, maxLength, inputRef, ...rest }) {
  const lid = useId().replace(/:/g, '');
  const [v, setV] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const wrap = useRef(null), list = useRef(null), inp = useRef(null);
  const termo = v.trim().toLowerCase();
  const itens = options.filter(o => !termo || o.toLowerCase().includes(termo)).map(o => ({ value: o, label: o }));
  const pos = usePopover(wrap, open, itens.length || 1);
  useFora(open, [wrap, list], () => setOpen(false));

  const escolher = o => { setV(o.value); setOpen(false); inp.current?.focus(); };
  const tecla = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!open) { setOpen(true); setHi(0); return; } setHi(h => (h + (e.key === 'ArrowDown' ? 1 : -1) + itens.length) % Math.max(1, itens.length)); }
    else if (e.key === 'Enter' && open && hi >= 0 && itens[hi]) { e.preventDefault(); escolher(itens[hi]); }
    else if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(false); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <span className={`combo${open ? ' open' : ''}`} ref={wrap}>
      <input ref={el => { inp.current = el; if (inputRef) inputRef.current = el; }} name={name} value={v} required={required} maxLength={maxLength} placeholder={placeholder}
        role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open ? lid : undefined} autoComplete="off"
        aria-activedescendant={open && hi >= 0 ? `${lid}-${hi}` : undefined}
        onFocus={() => { setOpen(true); setHi(-1); }} onChange={e => { setV(e.target.value); setOpen(true); setHi(0); }} onKeyDown={tecla} {...rest} />
      <button type="button" tabIndex={-1} className="combo-btn" aria-label="Mostrar opções" onClick={() => { setOpen(o => !o); inp.current?.focus(); }}><Icon name="chevron" size={16} /></button>
      {open && pos && <Lista id={lid} listRef={list} pos={pos} itens={itens} hi={hi} setHi={setHi} escolher={escolher} ativo={o => o.value === v}
        vazio={v.trim() ? <>Nova categoria: <b>{v.trim()}</b></> : 'Nenhuma categoria ainda'} />}
    </span>
  );
}
