/* Componentes pequenos reutilizados pelas telas */
import { useEffect, useReducer, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';
import { toast } from './Toasts.jsx';
import { ago, initials, mins, traduz } from '../lib/utils.js';
import { aplicarTema, useTema } from '../lib/theme.js';
import { useApp } from '../store.jsx';

/* um único relógio de 15 s para todos os cronômetros */
const tickSubs = new Set();
let tickTimer = null;
export function useTick() {
  const [, force] = useReducer(x => x + 1, 0);
  useEffect(() => {
    tickSubs.add(force);
    tickTimer ||= setInterval(() => tickSubs.forEach(f => f()), 15000);
    return () => { tickSubs.delete(force); if (!tickSubs.size) { clearInterval(tickTimer); tickTimer = null; } };
  }, []);
}

export function Since({ iso, className }) {
  useTick();
  return <span className={className}>{ago(iso)}</span>;
}

export function Timer({ iso, min, max }) {
  useTick();
  const m = mins(iso);
  const cls = max != null ? (m >= max ? ' late' : m >= min ? ' warn' : '') : '';
  return <span className={`timer${cls}`}><Icon name="clock" size={13} /><em>{ago(iso)}</em></span>;
}

export const Pill = ({ c, children, style }) => <span className="pill" style={{ '--c': `var(--${c})`, ...style }}>{children}</span>;

export const Stat = ({ label, value, c, i }) => (
  <div className="stat" style={{ '--c': `var(--${c})`, '--i': i }}><span>{label}</span><b>{value}</b></div>
);

export const Avatar = ({ p, className = 'avatar' }) => (
  <div className={className}>{p?.avatar_url ? <img src={p.avatar_url} alt="" referrerPolicy="no-referrer" /> : initials(p?.nome)}</div>
);

export const AvatarMini = ({ p }) => (
  <span className="avatar mini">{p?.avatar_url ? <img src={p.avatar_url} alt="" referrerPolicy="no-referrer" /> : initials(p?.nome)}</span>
);

/* botão que mostra "carregando", trata erros e evita clique duplo */
export function AsyncButton({ onClick, children, disabled, className = '', ...rest }) {
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const { refresh } = useApp();
  useEffect(() => () => { alive.current = false; }, []);
  return (
    <button {...rest} className={`${className}${busy ? ' loading' : ''}`} disabled={disabled || busy}
      onClick={async e => {
        setBusy(true);
        try { await onClick?.(e); }
        catch (err) { console.error(err); toast(traduz(err), 'err'); refresh(); }
        finally { if (alive.current) setBusy(false); }
      }}>
      {children}
    </button>
  );
}

/* campo de senha com botão de mostrar/ocultar */
export function PasswordInput(props) {
  const [show, setShow] = useState(false);
  const ref = useRef(null);
  const toggle = () => {
    const el = ref.current, a = el?.selectionStart, b = el?.selectionEnd;
    setShow(s => !s);
    requestAnimationFrame(() => { el?.focus({ preventScroll: true }); try { el?.setSelectionRange(a, b); } catch {} });
  };
  return (
    <span className="pw">
      <input ref={ref} {...props} type={show ? 'text' : 'password'} />
      <button type="button" className="pw-eye" onClick={toggle} aria-pressed={show} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}>
        <Icon name={show ? 'eyeOff' : 'eye'} size={18} />
      </button>
    </span>
  );
}

export const Switch = ({ checked, onChange, label, title, ...rest }) => (
  <label className="switch-t" title={title}>
    <input type="checkbox" checked={checked} onChange={onChange} aria-label={label} {...rest} /><i />
  </label>
);

export function ThemeButton({ className = '' }) {
  const { atual } = useTema();
  const claro = atual === 'claro';
  const l = claro ? 'Ativar modo escuro' : 'Ativar modo claro';
  return (
    <button className={`theme-btn ${className}`} aria-label={l} title={l}
      onClick={e => aplicarTema(claro ? 'escuro' : 'claro', e.currentTarget)}>
      <Icon key={atual} name={claro ? 'moon' : 'sun'} size={18} />
    </button>
  );
}

/* adiciona a classe "enter" só na montagem, para as animações de entrada */
export function useEnter(ms = 1500) {
  const [enter, setEnter] = useState(true);
  useEffect(() => { const t = setTimeout(() => setEnter(false), ms); return () => clearTimeout(t); }, [ms]);
  return enter;
}
