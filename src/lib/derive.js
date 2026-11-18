/* Cálculos derivados dos dados carregados */
import { subtotal } from './utils.js';
export const mesaNum = (mesas, id) => mesas.find(m => m.id === id)?.numero ?? id;
export const pedidosDaMesa = (pedidos, id) => pedidos.filter(p => p.mesa_id === id && !p.pago);
export const totalMesa = (pedidos, id) => pedidosDaMesa(pedidos, id).filter(p => p.status !== 'cancelado').reduce((s, p) => s + subtotal(p), 0);
