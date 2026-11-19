/* Camada de dados: Supabase (produção) e modo demonstração (localStorage + sincronização entre abas).
   Mesma interface nas duas, para as telas não precisarem saber qual está em uso. */
import { createClient } from '@supabase/supabase-js';
import { CONFIG, DEMO } from '../config.js';
import { first, extOf, storagePath, blobToDataURL } from './utils.js';

export function supaApi(sb) {
  const ok = r => { if (r.error) throw r.error; return r.data; };
  const redirect = location.origin + location.pathname;
  const rmFoto = (bucket, url) => { const path = storagePath(url, bucket); if (path) sb.storage.from(bucket).remove([path]).catch(() => {}); };
  return {
    async session() { return (await sb.auth.getSession()).data.session; },
    onAuth(cb) { sb.auth.onAuthStateChange((_e, s) => setTimeout(() => cb(s), 0)); },
    async signIn(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); },
    async signUp(email, password, nome, papel) { return ok(await sb.auth.signUp({ email, password, options: { data: { full_name: nome, papel }, emailRedirectTo: redirect } })); },
    async oauth(provider) { ok(await sb.auth.signInWithOAuth({ provider, options: { redirectTo: redirect } })); },
    async signOut() { await sb.auth.signOut(); },
    async profile(uid) { return ok(await sb.from('profiles').select('*').eq('id', uid).maybeSingle()); },
    async loadAll() {
      const since = new Date(Date.now() - 24 * 3600e3).toISOString();
      const [mesas, cardapio, pedidos] = await Promise.all([
        sb.from('mesas').select('*').order('numero'),
        sb.from('cardapio').select('*').order('categoria').order('nome'),
        sb.from('pedidos').select('*, itens:itens_pedido(*), garcom:profiles(nome)').gte('criado_em', since).order('criado_em'),
      ]).then(rs => rs.map(ok));
      return { mesas, cardapio, pedidos };
    },
    async criarPedido(mesa, obs, itens) { return ok(await sb.rpc('criar_pedido', { p_mesa: mesa, p_obs: obs || '', p_itens: itens })); },
    async setStatusPedido(id, status) { ok(await sb.from('pedidos').update({ status }).eq('id', id)); },
    async setStatusMesa(m, status) {
      const patch = { status };
      if (status === 'livre' || status === 'reservada') { patch.aberta_em = null; patch.garcom_id = null; patch.pessoas = 0; }
      else if (!m.aberta_em) patch.aberta_em = new Date().toISOString();
      ok(await sb.from('mesas').update(patch).eq('id', m.id));
    },
    async fecharMesa(id, gorjeta = 0) { ok(await sb.rpc('fechar_mesa', { p_mesa: id, p_gorjeta: gorjeta || 0 })); },
    async editarItem(id, qtd, obs) { ok(await sb.rpc('editar_item', { p_item: id, p_qtd: qtd, p_obs: obs || '' })); },
    async cancelarItem(id) { ok(await sb.rpc('cancelar_item', { p_item: id })); },
    async adicionarItens(pedidoId, itens) { ok(await sb.rpc('adicionar_itens', { p_pedido: pedidoId, p_itens: itens })); },
    async listGorjetas(desde) {
      let q = sb.from('gorjetas').select('*, garcom:profiles(nome, avatar_url)').order('criado_em', { ascending: false });
      if (desde) q = q.gte('criado_em', desde);
      return ok(await q);
    },
    async repassarGorjetas(ids, repassado = true) { ok(await sb.from('gorjetas').update({ repassado, repassado_em: repassado ? new Date().toISOString() : null }).in('id', ids)); },
    async lancarGorjeta(g) { ok(await sb.from('gorjetas').insert({ garcom_id: g.garcom_id, valor: g.valor, observacao: g.observacao || null, base: 0 })); },
    async excluirGorjeta(id) { ok(await sb.from('gorjetas').delete().eq('id', id)); },
    async setMesaInfo(id, patch) { ok(await sb.from('mesas').update(patch).eq('id', id)); },
    async criarMesa(m) { ok(await sb.from('mesas').insert({ numero: m.numero, lugares: m.lugares })); },
    async excluirMesa(id) { ok(await sb.from('mesas').delete().eq('id', id)); },
    async listPerfis() { return ok(await sb.from('profiles').select('*').order('nome')); },
    async definirPapel(uid, papel) { ok(await sb.rpc('definir_papel', { p_usuario: uid, p_papel: papel })); },
    async escolherPapel(papel) { ok(await sb.rpc('escolher_papel', { p_papel: papel })); },
    async updateNome(uid, nome) { ok(await sb.from('profiles').update({ nome }).eq('id', uid)); await sb.auth.updateUser({ data: { full_name: nome } }); },
    async uploadAvatar(uid, blob, oldUrl) {
      const path = `${uid}/${Date.now()}.${extOf(blob)}`;
      ok(await sb.storage.from('avatars').upload(path, blob, { contentType: blob.type, cacheControl: '31536000' }));
      const url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      ok(await sb.from('profiles').update({ avatar_url: url }).eq('id', uid));
      rmFoto('avatars', oldUrl);
    },
    async removeAvatar(uid, oldUrl) { ok(await sb.from('profiles').update({ avatar_url: null }).eq('id', uid)); rmFoto('avatars', oldUrl); },
    async updateEmail(email) { ok(await sb.auth.updateUser({ email }, { emailRedirectTo: redirect })); },
    async updateSenha(password) { ok(await sb.auth.updateUser({ password })); },
    async signOutAll() { await sb.auth.signOut({ scope: 'global' }); },
    async salvarProduto(p, foto) {
      let foto_url = p.foto_url || null;
      if (foto?.blob) {
        const path = `${crypto.randomUUID()}.${extOf(foto.blob)}`;
        ok(await sb.storage.from('produtos').upload(path, foto.blob, { contentType: foto.blob.type, cacheControl: '31536000' }));
        foto_url = sb.storage.from('produtos').getPublicUrl(path).data.publicUrl;
      } else if (foto?.remove) foto_url = null;
      const row = { nome: p.nome, descricao: p.descricao || null, categoria: p.categoria, preco: p.preco, ativo: p.ativo, foto_url, tempo_min: p.tempo_min, tempo_max: p.tempo_max };
      if (p.id) ok(await sb.from('cardapio').update(row).eq('id', p.id));
      else ok(await sb.from('cardapio').insert(row));
      if (p.foto_url && p.foto_url !== foto_url) rmFoto('produtos', p.foto_url);
    },
    async ativarProduto(id, ativo) { ok(await sb.from('cardapio').update({ ativo }).eq('id', id)); },
    async excluirProduto(p) { ok(await sb.from('cardapio').delete().eq('id', p.id)); rmFoto('produtos', p.foto_url); },
    subscribe(cb) {
      const ch = sb.channel('ambar-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, cb)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'itens_pedido' }, cb)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'mesas' }, cb)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cardapio' }, cb)
        .subscribe();
      return () => sb.removeChannel(ch);
    },
  };
}

/* =====================================================================
   CAMADA DE DADOS — modo demonstração (localStorage + sync entre abas)
   ===================================================================== */
export function demoApi() {
  const KEY = 'ambar-demo-db-v1', SKEY = 'ambar-demo-session';
  const TEMPOS = { Entradas: [8, 15], Principais: [20, 35], Sobremesas: [5, 10], Bebidas: [2, 5] };
  const CARDAPIO = [
    ['Pão de fermentação natural', 'Manteiga de ervas e flor de sal', 'Entradas', 22],
    ['Bolinho de bacalhau', '6 unidades, aioli de limão', 'Entradas', 38],
    ['Carpaccio de beterraba', 'Beterraba assada na brasa, queijo de cabra', 'Entradas', 34],
    ['Peixe do dia na brasa', 'Purê de mandioquinha e farofa de castanhas', 'Principais', 89],
    ['Ancho na brasa', '350 g, chimichurri e batatas rústicas', 'Principais', 112],
    ['Risoto de cogumelos', 'Shiitake, shimeji e parmesão', 'Principais', 76],
    ['Polvo grelhado', 'Batatas ao murro e páprica defumada', 'Principais', 118],
    ['Nhoque de abóbora', 'Manteiga de sálvia e amêndoas', 'Principais', 64],
    ['Pudim de tapioca', 'Calda de coco queimado', 'Sobremesas', 28],
    ['Brownie quente', 'Sorvete de doce de leite', 'Sobremesas', 32],
    ['Frutas da estação', 'Com hortelã e mel', 'Sobremesas', 24],
    ['Água mineral', 'Com ou sem gás, 500 ml', 'Bebidas', 8],
    ['Suco natural', 'Laranja, abacaxi com hortelã ou maracujá', 'Bebidas', 14],
    ['Caipirinha de limão', 'Cachaça artesanal', 'Bebidas', 26],
    ['Taça de vinho da casa', 'Tinto ou branco', 'Bebidas', 32],
    ['Café espresso', null, 'Bebidas', 8],
  ].map(([nome, descricao, categoria, preco], i) => ({ id: i + 1, nome, descricao, categoria, preco, ativo: true, foto_url: null, tempo_min: TEMPOS[categoria][0], tempo_max: TEMPOS[categoria][1] }));
  const seed = () => ({
    seq: 100, seqItem: 100000, gorjetas: [],
    mesas: [2, 2, 4, 4, 4, 6, 2, 4, 4, 6, 8, 2].map((lugares, i) => ({ id: i + 1, numero: i + 1, lugares, pessoas: 0, status: 'livre', garcom_id: null, aberta_em: null })),
    cardapio: CARDAPIO,
    pedidos: [],
    perfis: [
      { id: 'demo-admin', nome: 'Helena Prado', papel: 'admin', avatar_url: null },
      { id: 'demo-garcom', nome: 'Rafael Costa', papel: 'garcom', avatar_url: null },
      { id: 'demo-cozinha', nome: 'Chef Marina', papel: 'cozinha', avatar_url: null },
    ],
  });
  const load = () => {
    let d; try { d = JSON.parse(localStorage.getItem(KEY)); } catch {}
    d ||= seed(); d.gorjetas ||= []; d.seqItem ||= 100000;
    return d;
  };
  let db = load();
  const subs = new Set();
  const commit = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} subs.forEach(f => f()); };
  addEventListener('storage', e => { if (e.key === KEY) { db = load(); subs.forEach(f => f()); } });
  const getSess = () => { try { return JSON.parse(sessionStorage.getItem(SKEY)); } catch { return null; } };
  const saveSess = s => { try { sessionStorage.setItem(SKEY, JSON.stringify(s)); } catch {} };
  const perfilDe = uid => db.perfis.find(p => p.id === uid);
  let authCb = () => {};
  const now = () => new Date().toISOString();
  return {
    async session() { return getSess(); },
    onAuth(cb) { authCb = cb; },
    async signIn(email, _pw, papel = 'garcom', nome, precisa = false) {
      const id = 'demo-' + papel;
      let perfil = db.perfis.find(p => p.id === id);
      if (!perfil) { perfil = { id, nome: nome || first(email.split('@')[0]), papel, avatar_url: null }; db.perfis.push(perfil); }
      if (nome) perfil.nome = nome;
      commit();
      const s = { user: { id, email, app_metadata: { provider: precisa ? 'google' : 'email' } }, profile: { id, papel, precisa_papel: precisa } };
      saveSess(s); authCb(s);
    },
    async signUp(email, pw, nome, papel) { await this.signIn(email, pw, papel, nome); return { session: true }; },
    async oauth(provider, papel) { await this.signIn('voce@gmail.com', '', papel, 'Convidado Google', papel !== 'admin'); },
    async signOut() { try { sessionStorage.removeItem(SKEY); } catch {} authCb(null); },
    async profile() {
      const s = getSess(); if (!s) return null;
      const p = db.perfis.find(x => x.id === s.user.id) || {};
      return { ...p, id: s.user.id, papel: s.profile.papel, precisa_papel: !!s.profile.precisa_papel };
    },
    async escolherPapel(papel) {
      const s = getSess(); const id = 'demo-' + papel;
      const atual = db.perfis.find(p => p.id === s.user.id);
      if (!db.perfis.find(p => p.id === id)) db.perfis.push({ id, nome: atual?.nome || 'Convidado', papel, avatar_url: null });
      s.user.id = id; s.profile = { id, papel, precisa_papel: false }; saveSess(s); commit();
    },
    async loadAll() { return structuredClone({ mesas: db.mesas, cardapio: db.cardapio, pedidos: db.pedidos }); },
    async criarPedido(mesaId, obs, itens) {
      const s = getSess(); const id = ++db.seq; const t = now();
      db.pedidos.push({
        id, mesa_id: mesaId, garcom_id: s.user.id, garcom: { nome: s.profile.nome }, status: 'novo',
        observacao: obs?.trim() || null, pago: false, criado_em: t, atualizado_em: t,
        itens: itens.map((it, k) => { const c = db.cardapio.find(c => c.id === it.item_id); return { id: id * 100 + k, pedido_id: id, item_id: c.id, nome: c.nome, preco: c.preco, quantidade: it.qtd, observacao: it.obs?.trim() || null, status: 'ativo', adicionado_em: null, alterado_em: null }; }),
      });
      const m = db.mesas.find(m => m.id === mesaId);
      if (['livre', 'reservada'].includes(m.status)) m.status = 'ocupada';
      m.garcom_id ||= s.user.id;
      m.aberta_em ||= t;
      commit(); return id;
    },
    async setStatusPedido(id, status) { const p = db.pedidos.find(p => p.id === id); p.status = status; p.atualizado_em = now(); commit(); },
    async setStatusMesa(m0, status) {
      const m = db.mesas.find(m => m.id === m0.id); m.status = status;
      if (status === 'livre' || status === 'reservada') { m.aberta_em = null; m.garcom_id = null; m.pessoas = 0; } else m.aberta_em ||= now();
      commit();
    },
    async fecharMesa(id, gorjeta = 0) {
      const m = db.mesas.find(m => m.id === id);
      const abertos = db.pedidos.filter(p => p.mesa_id === id && !p.pago && p.status !== 'cancelado');
      const sub = p => (p.itens || []).filter(i => i.status !== 'cancelado').reduce((s, i) => s + i.quantidade * i.preco, 0);
      const gorj = Math.round(Math.max(0, Number(gorjeta) || 0) * 100) / 100;
      if (gorj > 0) {
        const porGarcom = new Map();
        abertos.forEach(p => porGarcom.set(p.garcom_id, (porGarcom.get(p.garcom_id) || 0) + sub(p)));
        const base = [...porGarcom.values()].reduce((a, b) => a + b, 0);
        const agora = now();
        const nomeDe = uid => db.perfis.find(x => x.id === uid)?.nome || 'Garçom';
        if (base > 0) {
          const linhas = [...porGarcom.entries()].sort((a, b) => b[1] - a[1]).map(([uid, v]) => ({ uid, v, val: Math.round(gorj * v / base * 100) / 100 }));
          const resto = Math.round((gorj - linhas.reduce((s, l) => s + l.val, 0)) * 100) / 100;
          linhas[0].val = Math.round((linhas[0].val + resto) * 100) / 100;
          linhas.forEach(l => db.gorjetas.push({ id: ++db.seq, garcom_id: l.uid, garcom: { nome: nomeDe(l.uid) }, mesa_numero: m.numero, base: l.v, percentual: Math.round(gorj * 10000 / base) / 100, valor: l.val, observacao: null, repassado: false, repassado_em: null, criado_em: agora }));
        } else {
          const uid = m.garcom_id || getSess()?.user.id;
          db.gorjetas.push({ id: ++db.seq, garcom_id: uid, garcom: { nome: nomeDe(uid) }, mesa_numero: m.numero, base: 0, percentual: null, valor: gorj, observacao: null, repassado: false, repassado_em: null, criado_em: agora });
        }
      }
      db.pedidos.forEach(p => { if (p.mesa_id === id) p.pago = true; });
      Object.assign(m, { status: 'livre', aberta_em: null, garcom_id: null, pessoas: 0 });
      commit();
    },
    async editarItem(itemId, qtd, obs) {
      const p = db.pedidos.find(p => !p.pago && p.itens.some(i => i.id === itemId && i.status !== 'cancelado'));
      if (!p) throw new Error('Item não encontrado');
      if (!['novo', 'preparando'].includes(p.status)) throw new Error('Este pedido já saiu da cozinha e não pode mais ser alterado');
      if (!(qtd >= 1 && qtd <= 99)) throw new Error('Quantidade inválida');
      Object.assign(p.itens.find(i => i.id === itemId), { quantidade: qtd, observacao: obs?.trim() || null, alterado_em: now() });
      p.atualizado_em = now(); commit();
    },
    async cancelarItem(itemId) {
      const p = db.pedidos.find(p => !p.pago && p.itens.some(i => i.id === itemId && i.status !== 'cancelado'));
      if (!p) throw new Error('Item não encontrado');
      if (!['novo', 'preparando'].includes(p.status)) throw new Error('Este pedido já saiu da cozinha e não pode mais ser alterado');
      Object.assign(p.itens.find(i => i.id === itemId), { status: 'cancelado', alterado_em: now() });
      if (!p.itens.some(i => i.status !== 'cancelado')) p.status = 'cancelado';
      p.atualizado_em = now(); commit();
    },
    async adicionarItens(pedidoId, itens) {
      const p = db.pedidos.find(p => p.id === pedidoId && !p.pago);
      if (!p) throw new Error('Pedido não encontrado');
      if (!['novo', 'preparando', 'pronto'].includes(p.status)) throw new Error('Este pedido já foi entregue ou cancelado: faça um pedido novo');
      if (!itens?.length) throw new Error('Nenhum item para adicionar');
      const t = now();
      itens.forEach(it => {
        const c = db.cardapio.find(c => c.id === it.item_id && c.ativo); if (!c) return;
        p.itens.push({ id: ++db.seqItem, pedido_id: p.id, item_id: c.id, nome: c.nome, preco: c.preco, quantidade: Math.min(99, Math.max(1, it.qtd || 1)), observacao: it.obs?.trim() || null, status: 'ativo', adicionado_em: t, alterado_em: null });
      });
      if (p.status === 'pronto') p.status = 'preparando';
      p.atualizado_em = t; commit();
    },
    async listGorjetas(desde) {
      return structuredClone(db.gorjetas.filter(g => !desde || g.criado_em >= desde).sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1))
        .map(g => ({ ...g, garcom: { nome: db.perfis.find(x => x.id === g.garcom_id)?.nome || g.garcom?.nome || 'Garçom', avatar_url: db.perfis.find(x => x.id === g.garcom_id)?.avatar_url || null } })));
    },
    async repassarGorjetas(ids, repassado = true) { db.gorjetas.forEach(g => { if (ids.includes(g.id)) { g.repassado = repassado; g.repassado_em = repassado ? now() : null; } }); commit(); },
    async lancarGorjeta(g) { db.gorjetas.push({ id: ++db.seq, garcom_id: g.garcom_id, mesa_numero: null, base: 0, percentual: null, valor: g.valor, observacao: g.observacao || null, repassado: false, repassado_em: null, criado_em: now() }); commit(); },
    async excluirGorjeta(id) { db.gorjetas = db.gorjetas.filter(g => g.id !== id); commit(); },
    async listPerfis() { return structuredClone(db.perfis); },
    async definirPapel(uid, papel) { const p = db.perfis.find(p => p.id === uid); if (p) p.papel = papel; commit(); },
    async setMesaInfo(id, patch) { Object.assign(db.mesas.find(m => m.id === id), patch); commit(); },
    async criarMesa(m) {
      if (db.mesas.some(x => x.numero === m.numero)) throw new Error('duplicate key value violates unique constraint "mesas_numero_key"');
      db.mesas.push({ id: Math.max(0, ...db.mesas.map(x => x.id)) + 1, numero: m.numero, lugares: m.lugares, pessoas: 0, status: 'livre', garcom_id: null, aberta_em: null });
      db.mesas.sort((a, b) => a.numero - b.numero); commit();
    },
    async excluirMesa(id) { db.mesas = db.mesas.filter(m => m.id !== id); db.pedidos = db.pedidos.filter(p => p.mesa_id !== id); commit(); },
    async updateNome(uid, nome) { const p = perfilDe(uid); if (p) p.nome = nome; commit(); },
    async uploadAvatar(uid, blob) { const p = perfilDe(uid); if (p) p.avatar_url = await blobToDataURL(blob); commit(); },
    async removeAvatar(uid) { const p = perfilDe(uid); if (p) p.avatar_url = null; commit(); },
    async updateEmail() {}, async updateSenha() {},
    async signOutAll() { return this.signOut(); },
    async salvarProduto(p, foto) {
      let foto_url = p.foto_url || null;
      if (foto?.blob) foto_url = await blobToDataURL(foto.blob); else if (foto?.remove) foto_url = null;
      const row = { nome: p.nome, descricao: p.descricao || null, categoria: p.categoria, preco: p.preco, ativo: p.ativo, foto_url, tempo_min: p.tempo_min, tempo_max: p.tempo_max };
      if (p.id) Object.assign(db.cardapio.find(c => c.id === p.id), row);
      else db.cardapio.push({ id: Math.max(0, ...db.cardapio.map(c => c.id)) + 1, ...row });
      commit();
    },
    async ativarProduto(id, ativo) { db.cardapio.find(c => c.id === id).ativo = ativo; commit(); },
    async excluirProduto(p) { db.cardapio = db.cardapio.filter(c => c.id !== p.id); commit(); },
    subscribe(cb) { subs.add(cb); return () => subs.delete(cb); },
    async reset() { db = seed(); commit(); },
  };
}

export const api = DEMO ? demoApi() : supaApi(createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY));
