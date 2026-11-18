import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { AppProvider } from './store.jsx';
import { unlockAudio } from './lib/sound.js';
import './styles.css';

// brilho que segue o cursor (cards das mesas e tela de login)
document.addEventListener('pointermove', e => {
  const card = e.target.closest?.('.mesa');
  if (card) { const r = card.getBoundingClientRect(); card.style.setProperty('--x', `${e.clientX - r.left}px`); card.style.setProperty('--y', `${e.clientY - r.top}px`); }
  const art = document.querySelector('.login-art');
  if (art) { const r = art.getBoundingClientRect(); art.style.setProperty('--mx', `${e.clientX - r.left}px`); art.style.setProperty('--my', `${e.clientY - r.top}px`); }
}, { passive: true });
document.addEventListener('pointerdown', unlockAudio, { once: true });

createRoot(document.getElementById('root')).render(<AppProvider><App /></AppProvider>);
