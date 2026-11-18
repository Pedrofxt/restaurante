/* Tema claro / escuro com transição circular (View Transitions API) */
import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';

const subs = new Set();
const mq = matchMedia('(prefers-color-scheme: light)');
export const temaPref = () => { try { return localStorage.getItem('ambar-tema') || 'sistema'; } catch { return 'sistema'; } };
export const temaAtual = () => (document.documentElement.dataset.theme === 'light' ? 'claro' : 'escuro');
const snapshot = () => `${temaAtual()}|${temaPref()}`;

export function useTema() {
  const s = useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb); }, snapshot);
  const [atual, pref] = s.split('|');
  return { atual, pref };
}

export function aplicarTema(pref, origem) {
  try { localStorage.setItem('ambar-tema', pref); } catch {}
  const claro = pref === 'claro' || (pref === 'sistema' && mq.matches);
  const novo = claro ? 'light' : 'dark';
  const troca = () => {
    document.documentElement.dataset.theme = novo;
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', claro ? '#f6f1e9' : '#0c0b0a');
    flushSync(() => subs.forEach(f => f()));
  };
  if (document.documentElement.dataset.theme === novo) { troca(); return; }
  const reduz = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduz) { troca(); return; }
  const r = origem?.getBoundingClientRect?.();
  const x = r ? r.left + r.width / 2 : innerWidth - 40, y = r ? r.top + r.height / 2 : 40;
  const raio = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  document.documentElement.classList.add('theme-swap');
  const vt = document.startViewTransition(troca);
  vt.ready.then(() => document.documentElement.animate(
    { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${raio}px at ${x}px ${y}px)`] },
    { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)', pseudoElement: '::view-transition-new(root)' }
  )).catch(() => {});
  vt.finished.finally(() => document.documentElement.classList.remove('theme-swap'));
}
mq.addEventListener?.('change', () => { if (temaPref() === 'sistema') aplicarTema('sistema'); });
