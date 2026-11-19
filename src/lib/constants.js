export const ROLES = { garcom: 'Garçom', cozinha: 'Cozinha', admin: 'Gerência' };
export const VIEWS = {
  salao:    { label: 'Salão',    icon: 'grid',    roles: ['garcom', 'admin'] },
  pedidos:  { label: 'Pedidos',  icon: 'receipt', roles: ['garcom', 'admin'] },
  fila:     { label: 'Fila',     icon: 'list',    roles: ['garcom', 'cozinha', 'admin'] },
  cozinha:  { label: 'Cozinha',  icon: 'flame',   roles: ['cozinha', 'admin'] },
  produtos: { label: 'Cardápio', icon: 'book',    roles: ['cozinha', 'admin'] },
  gorjetas: { label: 'Gorjetas', icon: 'coin',    roles: ['admin'] },
  equipe:   { label: 'Equipe',   icon: 'users',   roles: ['admin'] },
  perfil:   { label: 'Perfil',   icon: 'user',    roles: ['garcom', 'cozinha', 'admin'] },
};
export const MESA_ST = { livre: 'Livre', ocupada: 'Ocupada', conta: 'Conta', reservada: 'Reservada' };
export const COR_MESA = { livre: 'sage', ocupada: 'amber', conta: 'ember', reservada: 'sky' };
export const PED_ST = { novo: 'Novo', preparando: 'Preparando', pronto: 'Pronto', entregue: 'Entregue', cancelado: 'Cancelado' };
export const COR_PED = { novo: 'sky', preparando: 'amber', pronto: 'sage', entregue: 'dim', cancelado: 'ember' };
export const ATIVOS = ['novo', 'preparando', 'pronto'];
export const allowedViews = papel => Object.keys(VIEWS).filter(v => VIEWS[v].roles.includes(papel));
export const defaultView = papel => (papel === 'cozinha' ? 'cozinha' : 'salao');
