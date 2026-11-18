import { api } from '../lib/api.js';
import { first } from '../lib/utils.js';
import { Icon, Logo } from '../components/Icons.jsx';
import { AsyncButton } from '../components/ui.jsx';
import { useApp } from '../store.jsx';

export default function Onboarding() {
  const { profile, escolherPapel } = useApp();
  const d = n => ({ '--d': n });
  return (
    <div className="onb"><div className="aurora"><i /><i /><i /></div>
      <div className="onb-box">
        <div className="brand rise" style={{ justifyContent: 'center' }}><Logo size={48} /></div>
        <p className="eyebrow rise" style={{ ...d(1), marginTop: 24 }}>Bem-vindo, {first(profile.nome)}</p>
        <h1 className="rise" style={d(2)}>Como você vai trabalhar?</h1>
        <p className="rise" style={d(3)}>Escolha sua função na equipe. A gerência pode alterar depois, se precisar.</p>
        <div className="roles">
          <AsyncButton className="role-card rise" style={d(4)} onClick={() => escolherPapel('garcom')}>
            <span className="ri"><Icon name="dish" size={26} /></span><strong>Garçom</strong><span>Atende o salão, anota pedidos, entrega e fecha contas.</span>
          </AsyncButton>
          <AsyncButton className="role-card rise" style={d(5)} onClick={() => escolherPapel('cozinha')}>
            <span className="ri"><Icon name="chef" size={26} /></span><strong>Cozinha</strong><span>Recebe os pedidos, prepara e avisa quando estão prontos.</span>
          </AsyncButton>
        </div>
        <p className="onb-out rise" style={d(6)}>Não é você? <button onClick={() => api.signOut()}>Sair</button></p>
      </div>
    </div>
  );
}
