/* Avisos flutuantes. Use toast('mensagem', 'ok' | 'err' | 'warn' | 'info') de qualquer lugar. */
import { useEffect, useState } from 'react';

const subs = new Set();
let seq = 0;
export function toast(msg, type = 'info') {
  const t = { id: ++seq, msg, type };
  subs.forEach(f => f(t));
}

export function Toasts() {
  const [list, setList] = useState([]);
  useEffect(() => {
    const add = t => {
      setList(l => [...l, { ...t, out: false }]);
      setTimeout(() => setList(l => l.map(x => (x.id === t.id ? { ...x, out: true } : x))), 4200);
      setTimeout(() => setList(l => l.filter(x => x.id !== t.id)), 4600);
    };
    subs.add(add);
    return () => subs.delete(add);
  }, []);
  return (
    <div id="toasts" aria-live="polite">
      {list.map(t => (
        <div key={t.id} className={`toast t-${t.type}${t.out ? ' out' : ''}`}><span className="t-dot" /><p>{t.msg}</p></div>
      ))}
    </div>
  );
}
