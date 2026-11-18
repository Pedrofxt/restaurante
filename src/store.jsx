/* Estado global: sessão, perfil, dados do restaurante e tempo real */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './lib/api.js';
import { debounce, pad, sleep, traduz } from './lib/utils.js';
import { ROLES } from './lib/constants.js';
import { chime } from './lib/sound.js';
import { toast } from './components/Toasts.jsx';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);
const VAZIO = { mesas: [], cardapio: [], pedidos: [] };

export function AppProvider({ children }) {
  const [boot, setBoot] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [data, setData] = useState(VAZIO);
  const [version, setVersion] = useState(0);
  const [firstLoad, setFirstLoad] = useState(true);

  const sessionRef = useRef(null), profileRef = useRef(null), dataRef = useRef(VAZIO);
  const firstRef = useRef(true), seen = useRef(new Set()), pendMesa = useRef({});
  const refreshing = useRef(false), again = useRef(false), unsub = useRef(null), authSeq = useRef(0);
  const mesaTimers = useRef({});

  const can = useCallback((...r) => r.includes(profileRef.current?.papel), [profile]); // eslint-disable-line

  const notifyDiff = (prev, next, mesas) => {
    const old = new Map(prev.map(p => [p.id, p.status]));
    const papel = profileRef.current?.papel, eu = profileRef.current?.id;
    for (const p of next) {
      const o = old.get(p.id);
      const mesa = pad(mesas.find(m => m.id === p.mesa_id)?.numero ?? p.mesa_id);
      if (o === undefined && p.status === 'novo' && ['cozinha', 'admin'].includes(papel) && p.garcom_id !== eu) {
        toast(`Novo pedido · Mesa ${mesa}`, 'warn'); chime(1);
      } else if (o && o !== p.status && p.status === 'pronto' && ['garcom', 'admin'].includes(papel)) {
        toast(`Pedido pronto para servir · Mesa ${mesa}`, 'ok'); chime(2);
      }
    }
  };

  const refresh = useCallback(async () => {
    if (!profileRef.current) return;
    if (refreshing.current) { again.current = true; return; }
    refreshing.current = true;
    try {
      const d = await api.loadAll();
      d.mesas.forEach(m => { if (pendMesa.current[m.id]) Object.assign(m, pendMesa.current[m.id]); });
      if (!firstRef.current) notifyDiff(dataRef.current.pedidos, d.pedidos, d.mesas);
      firstRef.current = false;
      dataRef.current = d;
      setData(d);
      setVersion(v => v + 1);
    } catch (err) { console.error(err); toast(traduz(err), 'err'); }
    finally { refreshing.current = false; if (again.current) { again.current = false; refresh(); } }
  }, []);

  // pedidos que já apareceram na tela não animam de novo
  useEffect(() => {
    data.pedidos.forEach(p => seen.current.add(p.id));
    if (!firstRef.current && firstLoad && version > 0) setFirstLoad(false);
  }, [data]); // eslint-disable-line

  const iniciarDados = useCallback(async () => {
    seen.current.clear(); firstRef.current = true; setFirstLoad(true);
    await refresh();
    unsub.current ||= api.subscribe(debounce(refresh, 250));
  }, [refresh]);

  const startSession = useCallback(async s => {
    const uid = s?.user?.id || null;
    if (uid && uid === sessionRef.current?.user?.id && profileRef.current) { sessionRef.current = s; setSession(s); return; }
    const my = ++authSeq.current;
    sessionRef.current = s; setSession(s);
    profileRef.current = null; setProfile(null);
    unsub.current?.(); unsub.current = null;
    if (!uid) { dataRef.current = VAZIO; setData(VAZIO); setBoot(false); return; }
    let prof = null;
    for (let i = 0; i < 4 && !prof; i++) { prof = await api.profile(uid).catch(() => null); if (!prof) await sleep(600); }
    if (my !== authSeq.current) return;
    if (!prof) { toast('Perfil não encontrado. Confira se o schema.sql foi executado no Supabase.', 'err'); setBoot(false); await api.signOut(); return; }
    profileRef.current = prof; setProfile(prof); setBoot(false);
    if (prof.precisa_papel) return;
    await iniciarDados();
  }, [iniciarDados]);

  useEffect(() => {
    api.onAuth(s => startSession(s));
    api.session().then(s => startSession(s)).catch(() => setBoot(false));
  }, []); // eslint-disable-line

  const reloadProfile = useCallback(async () => {
    const p = await api.profile(sessionRef.current.user.id);
    profileRef.current = p; setProfile(p);
  }, []);

  const escolherPapel = useCallback(async papel => {
    await api.escolherPapel(papel);
    const s = (await api.session()) || sessionRef.current;
    sessionRef.current = s; setSession(s);
    const p = await api.profile(s.user.id);
    profileRef.current = p; setProfile(p);
    await iniciarDados();
    toast(`Tudo certo! Você entrou como ${ROLES[p.papel]}.`, 'ok');
  }, [iniciarDados]);

  // ajuste de lugares/pessoas: atualiza na hora e salva agrupado
  const salvarMesaInfo = useCallback((id, patch) => {
    pendMesa.current[id] = { ...(pendMesa.current[id] || {}), ...patch };
    setData(d => { const nd = { ...d, mesas: d.mesas.map(m => (m.id === id ? { ...m, ...patch } : m)) }; dataRef.current = nd; return nd; });
    clearTimeout(mesaTimers.current[id]);
    mesaTimers.current[id] = setTimeout(async () => {
      const envio = pendMesa.current[id];
      try { await api.setMesaInfo(id, envio); } catch (e) { toast(traduz(e), 'err'); }
      if (pendMesa.current[id] === envio) delete pendMesa.current[id];
      refresh();
    }, 450);
  }, [refresh]);

  const value = useMemo(() => ({
    boot, session, profile, ...data, version, firstLoad, seen,
    can, refresh, reloadProfile, escolherPapel, salvarMesaInfo,
  }), [boot, session, profile, data, version, firstLoad, can, refresh, reloadProfile, escolherPapel, salvarMesaInfo]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
