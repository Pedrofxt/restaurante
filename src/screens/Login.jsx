import { useState } from 'react';
import { api } from '../lib/api.js';
import { DEMO } from '../config.js';
import { ROLES } from '../lib/constants.js';
import { traduz } from '../lib/utils.js';
import { unlockAudio } from '../lib/sound.js';
import { GoogleMark, Icon, Logo } from '../components/Icons.jsx';
import { toast } from '../components/Toasts.jsx';
import { PasswordInput, ThemeButton } from '../components/ui.jsx';

function Seg({ options, value, onChange }) {
  return (
    <div className="seg">
      {options.map(([k, v]) => <button key={k} type="button" className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{v}</button>)}
    </div>
  );
}

export default function Login() {
  const [mode, setMode] = useState('login');
  const [demoRole, setDemoRole] = useState('garcom');
  const [signupRole, setSignupRole] = useState('garcom');
  const [busy, setBusy] = useState(false);
  const up = mode === 'signup';

  const submit = async e => {
    e.preventDefault(); unlockAudio();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      if (up) {
        const r = await api.signUp(fd.get('email'), fd.get('senha'), fd.get('nome'), signupRole);
        if (!DEMO && !r?.session) { toast('Conta criada! Confirme pelo link enviado ao seu e-mail.', 'ok'); setMode('login'); }
      } else await api.signIn(fd.get('email'), fd.get('senha'), demoRole);
    } catch (err) { toast(traduz(err), 'err'); }
    finally { setBusy(false); }
  };

  const google = async () => {
    unlockAudio();
    try { await api.oauth('google', demoRole); } catch (err) { toast(traduz(err), 'err'); }
  };

  const d = n => ({ '--d': n });
  return (
    <div className="login">
      <section className="login-art">
        <div className="aurora"><i /><i /><i /></div><div className="spot" />
        <div className="brand rise"><Logo size={46} /><div><strong>Âmbar</strong><span>cozinha de brasa</span></div></div>
        <div className="art-copy">
          <h2 className="rise" style={d(2)}>Cada mesa,<br /><em>no seu tempo.</em></h2>
          <p className="rise" style={d(3)}>Do salão à cozinha, ao vivo. Pedidos anotados, preparados e servidos sem papel e sem grito.</p>
        </div>
        <div className="art-foot rise" style={d(4)}><span className="dot-live" /> Sincronizado em tempo real</div>
      </section>
      <section className="login-form-wrap">
        <ThemeButton className="login-theme" />
        <form className="auth" key={mode} onSubmit={submit}>
          <div className="brand brand-sm rise"><Logo size={36} /><div><strong>Âmbar</strong><span>cozinha de brasa</span></div></div>
          <p className="eyebrow rise" style={d(1)}>{up ? 'Nova conta' : 'Acesso da equipe'}</p>
          <h1 className="rise" style={d(2)}>{up ? 'Criar conta' : 'Bem-vindo de volta'}</h1>
          <div className="social rise" style={d(3)}>
            <button type="button" className="btn-social" onClick={google}><GoogleMark /> Continuar com o Google</button>
          </div>
          <div className="sep rise" style={d(4)}><span>ou com e-mail</span></div>
          {up && <label className="field rise" style={d(5)}><span>Nome</span><input name="nome" required placeholder="Como a equipe te chama" autoComplete="name" /></label>}
          <label className="field rise" style={d(5)}><span>E-mail</span><input name="email" type="email" required placeholder="voce@ambar.com" autoComplete="email" /></label>
          <label className="field rise" style={d(6)}><span>Senha</span>
            <PasswordInput name="senha" required minLength={6} placeholder="••••••••" autoComplete={up ? 'new-password' : 'current-password'} />
          </label>
          {up && <div className="demo-roles rise" style={d(7)}><span>Vou trabalhar como</span>
            <Seg options={[['garcom', 'Garçom'], ['cozinha', 'Cozinha']]} value={signupRole} onChange={setSignupRole} /></div>}
          {DEMO && !up && <div className="demo-roles rise" style={d(7)}><span>Entrar como</span>
            <Seg options={Object.entries(ROLES)} value={demoRole} onChange={setDemoRole} /></div>}
          <button className={`btn btn-primary btn-block rise${busy ? ' loading' : ''}`} style={d(8)} type="submit">
            <span>{up ? 'Criar conta' : 'Entrar'}</span><Icon name="arrow" size={16} />
          </button>
          <p className="switch rise" style={d(9)}>{up ? 'Já tem conta?' : 'Novo na equipe?'}{' '}
            <button type="button" onClick={() => setMode(up ? 'login' : 'signup')}>{up ? 'Entrar' : 'Criar conta'}</button></p>
          {DEMO && <p className="demo-note rise" style={d(10)}><b>Modo demonstração.</b> Os dados ficam só neste navegador. Abra duas abas, uma como <b>Garçom</b> e outra como <b>Cozinha</b>, para ver a sincronização. Preencha <code>src/config.js</code> para usar o Supabase.</p>}
        </form>
      </section>
    </div>
  );
}
