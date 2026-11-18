import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { ROLES } from '../lib/constants.js';
import { traduz } from '../lib/utils.js';
import { toast } from '../components/Toasts.jsx';
import { Avatar } from '../components/ui.jsx';
import { useApp } from '../store.jsx';

export default function Equipe() {
  const { profile, version } = useApp();
  const [perfis, setPerfis] = useState([]);
  const carregar = () => api.listPerfis().then(setPerfis).catch(e => toast(traduz(e), 'err'));
  useEffect(() => { carregar(); }, [version]); // eslint-disable-line

  const mudar = async (id, papel) => {
    try { await api.definirPapel(id, papel); toast('Função atualizada', 'ok'); await carregar(); }
    catch (e) { toast(traduz(e), 'err'); carregar(); }
  };

  return (<>
    <div className="view-head"><div><p className="eyebrow">Gerência</p><h1>Equipe</h1></div></div>
    <div className="team">
      {perfis.map((p, i) => (
        <div className="member" key={p.id} style={{ '--i': i }}>
          <Avatar p={p} />
          <div className="m-info"><strong>{p.nome}</strong><span className="mute">{p.id === profile.id ? 'Você' : ROLES[p.papel]}</span></div>
          <select value={p.papel} disabled={p.id === profile.id} aria-label="Função" onChange={e => mudar(p.id, e.target.value)}>
            {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      ))}
    </div>
    <p className="hint">No cadastro por e-mail, cada pessoa escolhe <b>Garçom</b> ou <b>Cozinha</b>; quem entra pelo Google escolhe no primeiro acesso. A primeira conta criada no sistema vira <b>Gerência</b> automaticamente. Aqui você pode mudar a função de qualquer pessoa.</p>
  </>);
}
