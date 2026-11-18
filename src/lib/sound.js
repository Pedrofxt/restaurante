/* Avisos sonoros (WebAudio) — só tocam depois do primeiro toque do usuário na página */
let actx;
let ligado = (() => { try { return localStorage.getItem('ambar-som') !== '0'; } catch { return true; } })();
export const somLigado = () => ligado;
export function setSom(v) { ligado = v; try { localStorage.setItem('ambar-som', v ? '1' : '0'); } catch {} }
export function unlockAudio() { try { actx ||= new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch {} }
export function chime(kind = 1) {
  if (!actx || !ligado) return;
  const notes = kind === 2 ? [784, 1046] : [660, 880], t0 = actx.currentTime;
  notes.forEach((f, i) => {
    const o = actx.createOscillator(), g = actx.createGain(), t = t0 + i * 0.14;
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.55);
  });
}
