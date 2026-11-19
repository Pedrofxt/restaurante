import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { api } from '../lib/api.js';
import { DEMO } from '../config.js';
import { ROLES, VIEWS, allowedViews, defaultView } from '../lib/constants.js';
import { first, hora, saud } from '../lib/utils.js';
import { Icon, Logo } from '../components/Icons.jsx';
import { toast } from '../components/Toasts.jsx';
import { AsyncButton, Avatar, AvatarMini, ThemeButton, useEnter, useTick } from '../components/ui.jsx';
import { useApp } from '../store.jsx';
import Salao from '../views/Salao.jsx';
import Pedidos from '../views/Pedidos.jsx';
import Cozinha from '../views/Cozinha.jsx';
import Produtos from '../views/Produtos.jsx';
import Equipe from '../views/Equipe.jsx';
import Perfil from '../views/Perfil.jsx';
import Fila from '../views/Fila.jsx';
import Gorjetas from '../views/Gorjetas.jsx';
import PedidoEditor from '../drawers/PedidoEditor.jsx';
import { ShellCtx } from '../shellContext.js';
import MesaDrawer from '../drawers/MesaDrawer.jsx';
import ProdutoForm from '../drawers/ProdutoForm.jsx';
import NovaMesaForm from '../drawers/NovaMesaForm.jsx';

const transition = fn => (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches)
  ? document.startViewTransition(() => flushSync(fn)) : fn();

function Clock() { useTick(); return <h2 className="clock">{hora()}</h2>; }

function ViewSection({ children }) {
  const enter = useEnter();
  return <section className={`view${enter ? ' enter' : ''}`}>{children}</section>;
}

export default function Shell() {
  const { profile, pedidos, refresh } = useApp();
  const [view, setView] = useState(() => defaultView(profile.papel));
  const [animKey, setAnimKey] = useState(0);
  const [filtro, setFiltro] = useState('todas');
  const [drawer, setDrawer] = useState({ type: null, seq: 0 });
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState({});

  const views = allowedViews(profile.papel);
  const atual = views.includes(view) ? view : defaultView(profile.papel);

  const abrir = useCallback((type, payload) => { setDrawer(d => ({ type, payload, seq: d.seq + 1 })); setOpen(true); }, []);
  const fechar = useCallback(() => setOpen(false), []);
  const reanimar = () => setAnimKey(k => k + 1);

  useEffect(() => {
    if (open) { const r = requestAnimationFrame(() => document.body.classList.add('drawer-open')); return () => cancelAnimationFrame(r); }
    document.body.classList.remove('drawer-open');
  }, [open, drawer.seq]);
  useEffect(() => () => document.body.classList.remove('drawer-open'), []);
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, []);

  const go = v => {
    if (v === atual) return;
    transition(() => { setView(v); reanimar(); setOpen(false); });
  };

  const resetDemo = async () => {
    await api.reset?.(); setDrafts({}); setOpen(false);
    toast('Demonstração reiniciada', 'ok'); reanimar(); await refresh();
  };

  const prontos = pedidos.filter(p => p.status === 'pronto').length;
  const novos = pedidos.filter(p => p.status === 'novo').length;
  const badge = { pedidos: prontos, cozinha: novos };

  const draftOf = id => drafts[id] || { items: [], obs: '' };
  const setDraft = (id, fn) => setDrafts(d => ({ ...d, [id]: fn(d[id] || { items: [], obs: '' }) }));
  const clearDraft = id => setDrafts(d => { const n = { ...d }; delete n[id]; return n; });

  const viewEl = {
    salao: <Salao filtro={filtro} setFiltro={f => { setFiltro(f); reanimar(); }} onOpenMesa={id => abrir('mesa', { id })} onNovaMesa={() => abrir('novaMesa')} />,
    fila: <Fila />,
    gorjetas: <Gorjetas />,
    pedidos: <Pedidos />,
    cozinha: <Cozinha />,
    produtos: <Produtos onNovo={p => abrir('produto', p)} onEditar={p => abrir('produto', p)} />,
    equipe: <Equipe />,
    perfil: <Perfil />,
  }[atual];

  let drawerEl = null;
  if (drawer.type === 'mesa') { const id = drawer.payload.id; drawerEl = <MesaDrawer key={drawer.seq} mesaId={id} abaInicial={drawer.payload.aba} onClose={fechar}
    draft={draftOf(id)} setDraft={fn => setDraft(id, fn)} clearDraft={() => clearDraft(id)} />; }
  if (drawer.type === 'pedido') drawerEl = <PedidoEditor key={drawer.seq} pedidoId={drawer.payload.id} voltarMesa={drawer.payload.voltarMesa} onClose={fechar} />;
  if (drawer.type === 'produto') drawerEl = <ProdutoForm key={drawer.seq} inicial={drawer.payload} onClose={fechar} />;
  if (drawer.type === 'novaMesa') drawerEl = <NovaMesaForm key={drawer.seq} onClose={fechar} onCriada={() => { setFiltro('todas'); reanimar(); }} />;

  return (
    <ShellCtx.Provider value={{ abrir }}>
      <div className="shell" id="shell">
        <nav className="rail">
          <div className="rail-logo"><Logo size={38} /></div>
          <div className="nav">
            {views.map(v => (
              <button key={v} className={`nav-btn ${atual === v ? 'on' : ''}`} onClick={() => go(v)} aria-label={VIEWS[v].label}>
                {v === 'perfil' ? <AvatarMini p={profile} /> : <Icon name={VIEWS[v].icon} />}
                <span className="tip">{VIEWS[v].label}</span>
                {badge[v] > 0 && atual !== v && <span className="badge">{badge[v]}</span>}
              </button>
            ))}
          </div>
          <button className="nav-btn" data-act="logout" onClick={() => api.signOut()} aria-label="Sair"><Icon name="logout" /><span className="tip">Sair</span></button>
        </nav>
        <main>
          <header className="topbar">
            <div><p className="eyebrow">{saud()}, {first(profile.nome)}</p><Clock /></div>
            <div className="top-right">
              {DEMO && <AsyncButton className="btn btn-ghost sm" onClick={resetDemo}><Icon name="refresh" size={14} /> Reiniciar demo</AsyncButton>}
              <span className="live"><span className="dot-live" />Ao vivo</span>
              <ThemeButton />
              <button className="me" onClick={() => go('perfil')} aria-label="Abrir perfil">
                <Avatar p={profile} /><div><strong>{profile.nome}</strong><span>{ROLES[profile.papel]}</span></div>
              </button>
            </div>
          </header>
          <div id="view"><ViewSection key={`${atual}-${animKey}`}>{viewEl}</ViewSection></div>
        </main>
      </div>
      <div className="overlay" onClick={fechar} />
      <aside className="drawer" id="drawer" aria-label="Detalhes">{drawerEl}</aside>
    </ShellCtx.Provider>
  );
}
