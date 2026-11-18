import { useApp } from './store.jsx';
import Login from './screens/Login.jsx';
import Onboarding from './screens/Onboarding.jsx';
import Shell from './screens/Shell.jsx';
import { Toasts } from './components/Toasts.jsx';

function Splash() {
  return (
    <div className="splash">
      <svg className="logo" width="56" height="56" viewBox="0 0 48 48"><path d="M24 10c4.6 6 9 9.6 9 16.2a9 9 0 0 1-18 0c0-3.7 1.8-6.4 3.7-8.2 0 3.7 1.8 5.5 3.7 5.5-.9-5.5 0-9.2 1.6-13.5z" fill="#e9a84c" /></svg>
    </div>
  );
}

export default function App() {
  const { boot, session, profile } = useApp();
  let tela;
  if (boot) tela = <Splash />;
  else if (!session || !profile) tela = <Login />;
  else if (profile.precisa_papel) tela = <Onboarding />;
  else tela = <Shell />;
  return <>{tela}<Toasts /></>;
}
