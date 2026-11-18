/* Dados do projeto Supabase (chave publishable: pode ficar no front-end).
   Para rodar em MODO DEMONSTRAÇÃO, deixe os dois vazios ou use VITE_DEMO=1. */
const env = import.meta.env;
export const CONFIG = {
  SUPABASE_URL: env.VITE_SUPABASE_URL ?? 'https://dnztjyhprfqaimijvcuk.supabase.co',
  SUPABASE_KEY: env.VITE_SUPABASE_KEY ?? 'sb_publishable_5j91pebi6hdD0ygBQbc__w_P268nFKl',
};
export const DEMO = env.VITE_DEMO === '1' || !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY;
