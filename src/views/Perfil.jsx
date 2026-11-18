import { useState } from 'react';
import { api } from '../lib/api.js';
import { DEMO } from '../config.js';
import { ROLES } from '../lib/constants.js';
import { resizeImage, traduz } from '../lib/utils.js';
import { chime, setSom, somLigado, unlockAudio } from '../lib/sound.js';
import { aplicarTema, useTema } from '../lib/theme.js';
import { Icon } from '../components/Icons.jsx';
import { toast } from '../components/Toasts.jsx';
import { AsyncButton, Avatar, PasswordInput, Pill, Switch } from '../components/ui.jsx';
import { useApp } from '../store.jsx';

function Form({ onSubmit, className, children, id }) {
  const [busy, setBusy] = useState(false);
  return (
    <form id={id} className={className} onSubmit={async e => {
      e.preventDefault(); const f = e.currentTarget; setBusy(true);
      try { await onSubmit(new FormData(f), f); } catch (err) { console.error(err); toast(traduz(err), 'err'); } finally { setBusy(false); }
    }} data-busy={busy || undefined}>{typeof children === 'function' ? children(busy) : children}</form>
  );
}

export default function Perfil() {
  const { profile: p, session, reloadProfile } = useApp();
  const { pref } = useTema();
  const [som, setSomState] = useState(somLigado());
  const u = session?.user || {};
  const google = u.app_metadata?.provider === 'google';

  const trocarFoto = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      toast('Enviando foto…');
      const blob = await resizeImage(f, DEMO ? 320 : 512, true);
      await api.uploadAvatar(p.id, blob, p.avatar_url);
      await reloadProfile(); toast('Foto de perfil atualizada', 'ok');
    } catch (err) { toast(traduz(err), 'err'); }
  };

  return (<>
    <div className="view-head"><div><p className="eyebrow">Sua conta</p><h1>Perfil</h1></div></div>
    <div className="profile-grid">
      <div className="card profile-card" style={{ '--i': 0 }}>
        <div className="avatar-wrap">
          <Avatar p={p} className="avatar avatar-xl" />
          <label className="avatar-edit" htmlFor="avatarInput" title="Trocar foto"><Icon name="camera" size={18} /></label>
          <input type="file" id="avatarInput" accept="image/png,image/jpeg,image/webp" hidden onChange={trocarFoto} />
        </div>
        <h2>{p.nome}</h2>
        <p className="mail">{u.email || ''}</p>
        <div className="profile-meta"><Pill c="amber">{ROLES[p.papel]}</Pill><Pill c="sky">{google ? 'Conta Google' : DEMO ? 'Demonstração' : 'E-mail e senha'}</Pill></div>
        <div className="btn-row">
          <label className="btn btn-ghost sm" htmlFor="avatarInput"><Icon name="camera" size={14} /> Trocar foto</label>
          {p.avatar_url && <AsyncButton className="btn btn-ghost sm" onClick={async () => { await api.removeAvatar(p.id, p.avatar_url); await reloadProfile(); toast('Foto removida', 'ok'); }}><Icon name="trash" size={14} /> Remover</AsyncButton>}
        </div>
      </div>
      <div className="stack">
        <div className="card" style={{ '--i': 1 }}>
          <h3>Dados da conta</h3><p className="sub">Como seu nome aparece para a equipe e nos pedidos.</p>
          <Form className="form-row" onSubmit={async fd => {
            const nome = String(fd.get('nome')).trim(); if (!nome) throw new Error('Informe seu nome.');
            await api.updateNome(p.id, nome); await reloadProfile(); toast('Nome atualizado', 'ok');
          }}>{busy => <>
            <label className="field"><span>Nome</span><input name="nome" required maxLength={60} defaultValue={p.nome} autoComplete="name" /></label>
            <button className={`btn btn-primary${busy ? ' loading' : ''}`} disabled={busy} type="submit">Salvar</button></>}
          </Form>
          <div className="divider" />
          <h3>E-mail</h3><p className="sub">{google ? 'Você entra com o Google. ' : ''}Enviaremos um link de confirmação para o novo endereço.</p>
          <Form className="form-row" onSubmit={async (fd, f) => {
            await api.updateEmail(String(fd.get('email')).trim()); f.reset();
            toast(DEMO ? 'No modo demonstração o e-mail não é alterado.' : 'Enviamos um link de confirmação para o novo e-mail.', 'ok');
          }}>{busy => <>
            <label className="field"><span>Novo e-mail</span><input name="email" type="email" required placeholder={u.email || 'voce@ambar.com'} autoComplete="email" /></label>
            <button className={`btn btn-ghost${busy ? ' loading' : ''}`} disabled={busy} type="submit">Alterar</button></>}
          </Form>
          <div className="divider" />
          <h3>{google ? 'Criar senha' : 'Alterar senha'}</h3><p className="sub">{google ? 'Opcional: permite entrar também com e-mail e senha.' : 'Use pelo menos 6 caracteres.'}</p>
          <Form id="formSenha" onSubmit={async (fd, f) => {
            if (fd.get('senha') !== fd.get('conf')) throw new Error('As senhas não conferem.');
            await api.updateSenha(fd.get('senha')); f.reset();
            toast(DEMO ? 'No modo demonstração a senha não é alterada.' : 'Senha atualizada', 'ok');
          }}>{busy => <>
            <div className="two">
              <label className="field"><span>Nova senha</span><PasswordInput name="senha" minLength={6} required autoComplete="new-password" /></label>
              <label className="field"><span>Confirmar senha</span><PasswordInput name="conf" minLength={6} required autoComplete="new-password" /></label>
            </div>
            <button className={`btn btn-ghost${busy ? ' loading' : ''}`} disabled={busy} type="submit">Salvar senha</button></>}
          </Form>
        </div>
        <div className="card" style={{ '--i': 2 }}>
          <h3>Preferências</h3>
          <div className="toggle-row"><div><strong>Aparência</strong><span>Claro, escuro ou igual ao seu aparelho.</span></div>
            <div className="seg" style={{ minWidth: 280 }}>
              {[['claro', 'sun', 'Claro'], ['escuro', 'moon', 'Escuro'], ['sistema', 'monitor', 'Automático']].map(([k, ic, l]) => (
                <button key={k} type="button" className={pref === k ? 'on' : ''} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  onClick={e => aplicarTema(k, e.currentTarget)}><Icon name={ic} size={14} />{l}</button>
              ))}
            </div></div>
          <div className="toggle-row"><div><strong>Sons de alerta</strong><span>Aviso sonoro quando chega pedido novo ou um prato fica pronto.</span></div>
            <Switch checked={som} label="Sons de alerta" onChange={e => { const v = e.target.checked; setSom(v); setSomState(v); if (v) { unlockAudio(); chime(2); } }} /></div>
          <div className="divider" />
          <h3>Sessão</h3><p className="sub">Sua função ({ROLES[p.papel]}) só pode ser alterada pela gerência.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" onClick={() => api.signOut()}><Icon name="logout" size={16} /> Sair</button>
            <button className="btn btn-ghost" onClick={() => api.signOutAll()}>Sair de todos os aparelhos</button>
          </div>
        </div>
      </div>
    </div>
  </>);
}
