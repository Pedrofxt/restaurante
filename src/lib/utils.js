/* Utilitários gerais */
export const brl = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const pad = n => String(n ?? '').padStart(2, '0');
export const mins = iso => Math.max(0, Math.floor((Date.now() - new Date(iso)) / 60000));
export const ago = iso => { const m = mins(iso); return m < 1 ? 'agora' : m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${pad(m % 60)}`; };
export const first = n => String(n || '').trim().split(/\s+/)[0];
export const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const saud = () => { const hr = new Date().getHours(); return hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite'; };
export const hora = () => new Date().toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '');
export const extOf = b => ({ 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' }[b?.type] || 'jpg');
export const storagePath = (url, bucket) => { const k = `/object/public/${bucket}/`; const i = String(url || '').indexOf(k); return i < 0 ? null : decodeURIComponent(url.slice(i + k.length).split('?')[0]); };
export const blobToDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });

/* Pedidos e mesas */
export const itensAtivos = p => (p.itens || []).filter(i => i.status !== 'cancelado');
export const subtotal = p => itensAtivos(p).reduce((s, i) => s + i.quantidade * Number(i.preco), 0);
export const tempoItem = (cardapio, id) => { const c = cardapio.find(x => x.id === id); return [Number(c?.tempo_min ?? 10), Number(c?.tempo_max ?? 20)]; };
export const previsao = (cardapio, todos) => { const itens = (todos || []).filter(i => i.status !== 'cancelado'); return itens.length ? itens.reduce(([a, b], it) => { const [x, y] = tempoItem(cardapio, it.item_id); return [Math.max(a, x), Math.max(b, y)]; }, [0, 0]) : null; };
export const fmtPrev = pr => !pr ? '' : pr[0] === pr[1] ? `${pr[0]} min` : `${pr[0]}–${pr[1]} min`;
export const hhmm = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
/* Hora prevista para o pedido ficar pronto. Cada item conta a partir de quando entrou no pedido
   (itens adicionados depois começam a contar na hora em que foram adicionados). Os tempos vêm do
   cardápio atual, então mudar o tempo de um produto atualiza as previsões na hora. */
export const etaPedido = (cardapio, p) => {
  const its = itensAtivos(p); if (!its.length) return null;
  let a = 0, b = 0;
  for (const it of its) {
    const ini = new Date(it.adicionado_em || p.criado_em).getTime();
    const [x, y] = tempoItem(cardapio, it.item_id);
    a = Math.max(a, ini + x * 60000); b = Math.max(b, ini + y * 60000);
  }
  return { min: a, max: b };
};
export const minutosAte = t => Math.round((t - Date.now()) / 60000);

export async function resizeImage(file, max = 1000, square = false) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Escolha um arquivo de imagem (JPG, PNG ou WebP).');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Não foi possível ler esta imagem.')); i.src = url; });
    let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
    if (square) { const m = Math.min(sw, sh); sx = (sw - m) / 2; sy = (sh - m) / 2; sw = sh = m; }
    const k = Math.min(1, max / Math.max(sw, sh));
    const c = document.createElement('canvas'); c.width = Math.round(sw * k); c.height = Math.round(sh * k);
    c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    let blob = await new Promise(r => c.toBlob(r, 'image/webp', 0.82));
    if (!blob || blob.type !== 'image/webp') blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
    return blob;
  } finally { URL.revokeObjectURL(url); }
}

export function traduz(e) {
  const m = e?.message || String(e);
  const map = {
    'Invalid login credentials': 'E-mail ou senha incorretos.',
    'Email not confirmed': 'Confirme seu e-mail antes de entrar.',
    'User already registered': 'Este e-mail já está cadastrado.',
    'Password should be at least': 'A senha precisa ter ao menos 6 caracteres.',
    'Failed to fetch': 'Sem conexão com o servidor. Verifique sua internet.',
    'New password should be different': 'A nova senha precisa ser diferente da atual.',
    'Bucket not found': 'Armazenamento de fotos não configurado: rode o schema.sql atualizado no Supabase.',
    'exceeded the maximum allowed size': 'Imagem muito grande.',
    'mime type': 'Formato de imagem não suportado. Use JPG, PNG ou WebP.',
    'row-level security': 'Você não tem permissão para esta ação.',
    'rate limit': 'Muitas tentativas seguidas. Aguarde alguns minutos.',
    'same email': 'Este já é o seu e-mail atual.',
    'mesas_numero_key': 'Já existe uma mesa com esse número.',
  };
  for (const k in map) if (m.includes(k)) return map[k];
  if (/provider is not enabled|Unsupported provider/i.test(m)) return 'O login com Google ainda não foi ativado no Supabase.';
  if (/column .* does not exist|Could not find the .* column|function .* does not exist/i.test(m)) return 'O banco está desatualizado: rode o schema.sql novo no SQL Editor do Supabase.';
  return m;
}
