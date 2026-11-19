/* Cálculos derivados dos dados carregados */
import { subtotal } from './utils.js';
export const mesaNum = (mesas, id) => mesas.find(m => m.id === id)?.numero ?? id;
export const pedidosDaMesa = (pedidos, id) => pedidos.filter(p => p.mesa_id === id && !p.pago);
export const totalMesa = (pedidos, id) => pedidosDaMesa(pedidos, id).filter(p => p.status !== 'cancelado').reduce((s, p) => s + subtotal(p), 0);

/* Posição de cada pedido na fila da cozinha (novos e em preparo, por ordem de chegada).
   Editar ou adicionar itens não muda a posição: ela depende só de quando o pedido foi feito. */
export const NA_FILA = ['novo', 'preparando'];
export const filaPosicoes = pedidos => {
  const m = new Map();
  pedidos.filter(p => NA_FILA.includes(p.status)).sort((a, b) => (a.criado_em < b.criado_em ? -1 : a.criado_em > b.criado_em ? 1 : a.id - b.id))
    .forEach((p, i) => m.set(p.id, i + 1));
  return m;
};
