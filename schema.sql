-- =====================================================================
--  Âmbar · Controle de Mesas — schema do Supabase
--  Rode este arquivo inteiro uma vez no SQL Editor do seu projeto.
--  Pode ser executado de novo sem quebrar nada (é idempotente).
-- =====================================================================

-- ---------- Tabelas ----------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text not null default 'Equipe',
  avatar_url  text,
  papel       text not null default 'garcom' check (papel in ('garcom','cozinha','admin')),
  criado_em   timestamptz not null default now()
);

create table if not exists public.mesas (
  id         serial primary key,
  numero     int  not null unique,
  lugares    int  not null default 4 check (lugares > 0),
  status     text not null default 'livre' check (status in ('livre','ocupada','conta','reservada')),
  garcom_id  uuid references public.profiles(id) on delete set null,
  aberta_em  timestamptz
);

create table if not exists public.cardapio (
  id         serial primary key,
  nome       text not null,
  descricao  text,
  categoria  text not null,
  preco      numeric(10,2) not null check (preco >= 0),
  ativo      boolean not null default true
);

create table if not exists public.pedidos (
  id             bigint generated always as identity primary key,
  mesa_id        int  not null references public.mesas(id) on delete cascade,
  garcom_id      uuid references public.profiles(id) on delete set null,
  status         text not null default 'novo'
                 check (status in ('novo','preparando','pronto','entregue','cancelado')),
  observacao     text,
  pago           boolean not null default false,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create table if not exists public.itens_pedido (
  id          bigint generated always as identity primary key,
  pedido_id   bigint not null references public.pedidos(id) on delete cascade,
  item_id     int references public.cardapio(id) on delete set null,
  nome        text not null,
  preco       numeric(10,2) not null,
  quantidade  int not null default 1 check (quantidade > 0),
  observacao  text
);

create index if not exists pedidos_mesa_aberta_idx on public.pedidos (mesa_id) where not pago;
create index if not exists pedidos_criado_idx      on public.pedidos (criado_em desc);
create index if not exists pedidos_garcom_idx      on public.pedidos (garcom_id);
create index if not exists itens_pedido_pedido_idx on public.itens_pedido (pedido_id);
create index if not exists itens_pedido_item_idx   on public.itens_pedido (item_id);
create index if not exists mesas_garcom_idx        on public.mesas (garcom_id);

-- ---------- Funções auxiliares -----------------------------------------
create or replace function public.meu_papel()
returns text language sql stable security definer set search_path = public as $$
  select papel from public.profiles where id = auth.uid()
$$;

-- Cria o perfil automaticamente no cadastro (e-mail, Google ou GitHub).
-- A primeira conta do sistema vira Gerência (admin); as demais entram como Garçom.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nome, avatar_url, papel)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',
             new.raw_user_meta_data->>'name',
             new.raw_user_meta_data->>'user_name',
             split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    case when exists (select 1 from public.profiles) then 'garcom' else 'admin' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Valida quem pode mudar o status de cada pedido.
--   Cozinha: novo → preparando → pronto
--   Garçom : pronto → entregue, novo → cancelado
--   Gerência: qualquer transição
create or replace function public.validar_pedido()
returns trigger language plpgsql set search_path = public as $$
declare r text := public.meu_papel();
begin
  new.atualizado_em := now();
  if new.status is distinct from old.status and r is not null and r <> 'admin' then
    if r = 'cozinha' and (old.status, new.status) not in (('novo','preparando'), ('preparando','pronto')) then
      raise exception 'A cozinha não pode mudar o pedido de % para %', old.status, new.status;
    elsif r = 'garcom' and (old.status, new.status) not in (('pronto','entregue'), ('novo','cancelado')) then
      raise exception 'O garçom não pode mudar o pedido de % para %', old.status, new.status;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists pedidos_validar on public.pedidos;
create trigger pedidos_validar
  before update on public.pedidos
  for each row execute function public.validar_pedido();

-- Cria um pedido com seus itens numa única transação.
create or replace function public.criar_pedido(p_mesa int, p_obs text, p_itens jsonb)
returns bigint language plpgsql security invoker set search_path = public as $$
declare v_id bigint;
begin
  if public.meu_papel() not in ('garcom','admin') then
    raise exception 'Somente o salão pode lançar pedidos';
  end if;
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'Pedido vazio';
  end if;

  insert into public.pedidos (mesa_id, garcom_id, observacao)
  values (p_mesa, auth.uid(), nullif(trim(p_obs), ''))
  returning id into v_id;

  insert into public.itens_pedido (pedido_id, item_id, nome, preco, quantidade, observacao)
  select v_id, c.id, c.nome, c.preco,
         greatest(coalesce((i->>'qtd')::int, 1), 1),
         nullif(trim(i->>'obs'), '')
  from jsonb_array_elements(p_itens) i
  join public.cardapio c on c.id = (i->>'item_id')::int;

  update public.mesas
     set status = 'ocupada',
         garcom_id = coalesce(garcom_id, auth.uid()),
         aberta_em = coalesce(aberta_em, now())
   where id = p_mesa and status in ('livre','reservada');

  return v_id;
end $$;

-- Fecha a conta: marca os pedidos como pagos e libera a mesa.
create or replace function public.fechar_mesa(p_mesa int)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if public.meu_papel() not in ('garcom','admin') then
    raise exception 'Somente o salão pode fechar contas';
  end if;
  update public.pedidos set pago = true where mesa_id = p_mesa and not pago;
  update public.mesas set status = 'livre', garcom_id = null, aberta_em = null where id = p_mesa;
end $$;

-- Gerência define a função de cada membro da equipe.
create or replace function public.definir_papel(p_usuario uuid, p_papel text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.meu_papel() is distinct from 'admin' then
    raise exception 'Somente a gerência pode alterar funções';
  end if;
  if p_papel not in ('garcom','cozinha','admin') then
    raise exception 'Função inválida';
  end if;
  update public.profiles set papel = p_papel where id = p_usuario;
end $$;

revoke execute on function public.criar_pedido(int, text, jsonb) from anon;
revoke execute on function public.fechar_mesa(int)              from anon;
revoke execute on function public.definir_papel(uuid, text)     from anon;

-- ---------- Segurança (RLS) --------------------------------------------
alter table public.profiles     enable row level security;
alter table public.mesas        enable row level security;
alter table public.cardapio     enable row level security;
alter table public.pedidos      enable row level security;
alter table public.itens_pedido enable row level security;

-- Perfis
drop policy if exists "equipe lê perfis"        on public.profiles;
drop policy if exists "edita o próprio perfil"  on public.profiles;
create policy "equipe lê perfis"       on public.profiles for select to authenticated using (true);
create policy "edita o próprio perfil" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- O usuário só pode alterar o próprio nome/foto — nunca o próprio papel.
revoke update on public.profiles from authenticated, anon;
grant  update (nome, avatar_url) on public.profiles to authenticated;

-- Mesas
drop policy if exists "equipe lê mesas"        on public.mesas;
drop policy if exists "salão atualiza mesas"   on public.mesas;
drop policy if exists "gerência cria mesas"    on public.mesas;
drop policy if exists "gerência remove mesas"  on public.mesas;
create policy "equipe lê mesas"       on public.mesas for select to authenticated using (true);
create policy "salão atualiza mesas"  on public.mesas for update to authenticated
  using ((select public.meu_papel()) in ('garcom','admin'))
  with check ((select public.meu_papel()) in ('garcom','admin'));
create policy "gerência cria mesas"   on public.mesas for insert to authenticated
  with check ((select public.meu_papel()) = 'admin');
create policy "gerência remove mesas" on public.mesas for delete to authenticated
  using ((select public.meu_papel()) = 'admin');

-- Cardápio
drop policy if exists "equipe lê cardápio"          on public.cardapio;
drop policy if exists "gerência gerencia cardápio"  on public.cardapio;
drop policy if exists "gerência cria cardápio"      on public.cardapio;
drop policy if exists "gerência edita cardápio"     on public.cardapio;
drop policy if exists "gerência remove cardápio"    on public.cardapio;
create policy "equipe lê cardápio"       on public.cardapio for select to authenticated using (true);
create policy "gerência cria cardápio"   on public.cardapio for insert to authenticated
  with check ((select public.meu_papel()) = 'admin');
create policy "gerência edita cardápio"  on public.cardapio for update to authenticated
  using ((select public.meu_papel()) = 'admin') with check ((select public.meu_papel()) = 'admin');
create policy "gerência remove cardápio" on public.cardapio for delete to authenticated
  using ((select public.meu_papel()) = 'admin');

-- Pedidos
drop policy if exists "equipe lê pedidos"       on public.pedidos;
drop policy if exists "salão cria pedidos"      on public.pedidos;
drop policy if exists "equipe atualiza pedidos" on public.pedidos;
create policy "equipe lê pedidos"       on public.pedidos for select to authenticated
  using ((select public.meu_papel()) is not null);
create policy "salão cria pedidos"      on public.pedidos for insert to authenticated
  with check ((select public.meu_papel()) in ('garcom','admin') and garcom_id = (select auth.uid()));
create policy "equipe atualiza pedidos" on public.pedidos for update to authenticated
  using ((select public.meu_papel()) is not null)
  with check ((select public.meu_papel()) is not null);

-- Itens do pedido
drop policy if exists "equipe lê itens"  on public.itens_pedido;
drop policy if exists "salão cria itens" on public.itens_pedido;
create policy "equipe lê itens"  on public.itens_pedido for select to authenticated
  using ((select public.meu_papel()) is not null);
create policy "salão cria itens" on public.itens_pedido for insert to authenticated
  with check (
    (select public.meu_papel()) in ('garcom','admin')
    and exists (select 1 from public.pedidos p where p.id = pedido_id and p.garcom_id = (select auth.uid()))
  );

-- ---------- Tempo real -------------------------------------------------
do $$
begin
  begin alter publication supabase_realtime add table public.pedidos;      exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.itens_pedido; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.mesas;        exception when duplicate_object then null; end;
end $$;

-- ---------- Dados iniciais ---------------------------------------------
insert into public.mesas (numero, lugares) values
  (1,2),(2,2),(3,4),(4,4),(5,4),(6,6),(7,2),(8,4),(9,4),(10,6),(11,8),(12,2)
on conflict (numero) do nothing;

insert into public.cardapio (nome, descricao, categoria, preco)
select * from (values
  ('Pão de fermentação natural', 'Manteiga de ervas e flor de sal',            'Entradas',   22.00),
  ('Bolinho de bacalhau',        '6 unidades, aioli de limão',                 'Entradas',   38.00),
  ('Carpaccio de beterraba',     'Beterraba assada na brasa, queijo de cabra', 'Entradas',   34.00),
  ('Peixe do dia na brasa',      'Purê de mandioquinha e farofa de castanhas', 'Principais', 89.00),
  ('Ancho na brasa',             '350 g, chimichurri e batatas rústicas',      'Principais',112.00),
  ('Risoto de cogumelos',        'Shiitake, shimeji e parmesão',               'Principais', 76.00),
  ('Polvo grelhado',             'Batatas ao murro e páprica defumada',        'Principais',118.00),
  ('Nhoque de abóbora',          'Manteiga de sálvia e amêndoas',              'Principais', 64.00),
  ('Pudim de tapioca',           'Calda de coco queimado',                     'Sobremesas', 28.00),
  ('Brownie quente',             'Sorvete de doce de leite',                   'Sobremesas', 32.00),
  ('Frutas da estação',          'Com hortelã e mel',                          'Sobremesas', 24.00),
  ('Água mineral',               'Com ou sem gás, 500 ml',                     'Bebidas',     8.00),
  ('Suco natural',               'Laranja, abacaxi com hortelã ou maracujá',   'Bebidas',    14.00),
  ('Caipirinha de limão',        'Cachaça artesanal',                          'Bebidas',    26.00),
  ('Taça de vinho da casa',      'Tinto ou branco',                            'Bebidas',    32.00),
  ('Café espresso',              null,                                         'Bebidas',     8.00)
) as v(nome, descricao, categoria, preco)
where not exists (select 1 from public.cardapio);
