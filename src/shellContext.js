import { createContext, useContext } from 'react';
/* Permite que qualquer componente abra uma gaveta (ex.: "Editar pedido" dentro de um cartão) */
export const ShellCtx = createContext({ abrir: () => {} });
export const useShell = () => useContext(ShellCtx);
