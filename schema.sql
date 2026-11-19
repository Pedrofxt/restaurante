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

-- E-mails que sempre entram como Gerência (lista guardada só no banco, invisível para o app)
create table if not exists public.emails_gerencia (
  email text primary key check (email = lower(email))
);
alter table public.emails_gerencia enable row level security;
revoke all on public.emails_gerencia from anon, authenticated;

-- Colunas adicionadas depois da primeira versão (seguro rodar de novo)
alter table public.profiles add column if not exists precisa_papel boolean not null default false;
alter table public.cardapio add column if not exists foto_url text;
alter table public.cardapio add column if not exists tempo_min int not null default 10;
alter table public.cardapio add column if not exists tempo_max int not null default 20;
alter table public.mesas    add column if not exists pessoas   int not null default 0;
do $$
begin
  begin alter table public.cardapio add constraint cardapio_tempo_ok check (tempo_min >= 0 and tempo_max >= tempo_min); exception when duplicate_object then null; end;
  begin alter table public.mesas    add constraint mesas_pessoas_ok check (pessoas >= 0 and pessoas <= 99);            exception when duplicate_object then null; end;
end $$;

-- Itens editáveis depois de enviados (a posição do pedido na fila não muda)
alter table public.itens_pedido add column if not exists status        text not null default 'ativo';
alter table public.itens_pedido add column if not exists adicionado_em timestamptz;
alter table public.itens_pedido add column if not exists alterado_em   timestamptz;
do $$
begin
  begin alter table public.itens_pedido add constraint itens_status_ok check (status in ('ativo','cancelado')); exception when duplicate_object then null; end;
end $$;

-- Gorjetas dos garçons (visíveis só para a gerência)
create table if not exists public.gorjetas (
  id           bigint generated always as identity primary key,
  garcom_id    uuid references public.profiles(id) on delete set null,
  mesa_numero  int,
  base         numeric(10,2) not null default 0,
  percentual   numeric(6,2),
  valor        numeric(10,2) not null check (valor >= 0),
  observacao   text,
  repassado    boolean not null default false,
  repassado_em timestamptz,
  criado_em    timestamptz not null default now(),
  criado_por   uuid default auth.uid()
);
create index if not exists gorjetas_criado_idx on public.gorjetas (criado_em desc);
create index if not exists gorjetas_garcom_idx on public.gorjetas (garcom_id);

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

-- Cria o perfil automaticamente no cadastro (e-mail ou Google).
--   • A primeira conta do sistema vira Gerência (admin).
--   • E-mails cadastrados em emails_gerencia também viram Gerência.
--   • No cadastro por e-mail a pessoa escolhe Garçom ou Cozinha.
--   • No Google a escolha é feita no primeiro acesso (precisa_papel = true).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_primeiro boolean := not exists (select 1 from public.profiles);
  v_escolha  text    := new.raw_user_meta_data->>'papel';
  v_gerente  boolean := exists (select 1 from public.emails_gerencia where email = lower(new.email));
begin
  insert into public.profiles (id, nome, avatar_url, papel, precisa_papel)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',
             new.raw_user_meta_data->>'name',
             new.raw_user_meta_data->>'user_name',
             split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    case when v_primeiro or v_gerente then 'admin'
         when v_escolha in ('garcom','cozinha') then v_escolha
         else 'garcom' end,
    not v_primeiro and not v_gerente and coalesce(v_escolha, '') not in ('garcom','cozinha')
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Primeiro acesso pelo Google: a pessoa escolhe Garçom ou Cozinha (uma única vez).
create or replace function public.escolher_papel(p_papel text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_papel not in ('garcom','cozinha') then
    raise exception 'Escolha Garçom ou Cozinha';
  end if;
  update public.profiles
     set papel = p_papel, precisa_papel = false
   where id = auth.uid() and precisa_papel;
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
  if coalesce(current_setting('ambar.interno', true), '') = '1' then
    return new;  -- mudança feita por uma função do sistema (ex.: item adicionado a um pedido pronto)
  end if;
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
     set status    = case when status in ('livre','reservada') then 'ocupada' else status end,
         garcom_id = coalesce(garcom_id, auth.uid()),
         aberta_em = coalesce(aberta_em, now())
   where id = p_mesa;

  return v_id;
end $$;

-- Fecha a conta: registra a gorjeta (dividida entre os garçons que lançaram pedidos
-- na mesa, proporcional ao valor de cada um), marca os pedidos como pagos e libera a mesa.
drop function if exists public.fechar_mesa(int);
create or replace function public.fechar_mesa(p_mesa int, p_gorjeta numeric default 0)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_num    int;
  v_garcom uuid;
  v_base   numeric := 0;
  v_gorj   numeric := round(greatest(coalesce(p_gorjeta, 0), 0), 2);
begin
  if public.meu_papel() not in ('garcom','admin') then
    raise exception 'Somente o salão pode fechar contas';
  end if;
  select numero, garcom_id into v_num, v_garcom from public.mesas where id = p_mesa;
  if v_num is null then raise exception 'Mesa não encontrada'; end if;

  select coalesce(sum(i.quantidade * i.preco), 0) into v_base
    from public.pedidos p join public.itens_pedido i on i.pedido_id = p.id
   where p.mesa_id = p_mesa and not p.pago and p.status <> 'cancelado' and i.status = 'ativo';

  if v_gorj > 0 then
    if v_base > 0 then
      with g as (
        select p.garcom_id, sum(i.quantidade * i.preco) as sub
          from public.pedidos p join public.itens_pedido i on i.pedido_id = p.id
         where p.mesa_id = p_mesa and not p.pago and p.status <> 'cancelado' and i.status = 'ativo'
         group by p.garcom_id
      ), r as (
        select garcom_id, sub, round(v_gorj * sub / v_base, 2) as val,
               row_number() over (order by sub desc) as rn
          from g
      )
      insert into public.gorjetas (garcom_id, mesa_numero, base, percentual, valor)
      select garcom_id, v_num, sub, round(v_gorj * 100 / v_base, 2),
             val + case when rn = 1 then v_gorj - (select sum(val) from r) else 0 end
        from r;
    else
      insert into public.gorjetas (garcom_id, mesa_numero, base, percentual, valor)
      values (coalesce(v_garcom, auth.uid()), v_num, 0, null, v_gorj);
    end if;
  end if;

  update public.pedidos set pago = true where mesa_id = p_mesa and not pago;
  update public.mesas set status = 'livre', garcom_id = null, aberta_em = null, pessoas = 0 where id = p_mesa;
end $$;

-- Alterar quantidade/observação de um item já enviado (pedido ainda na cozinha).
create or replace function public.editar_item(p_item bigint, p_qtd int, p_obs text)
returns void language plpgsql security definer set search_path = public as $$
declare v_pedido bigint; v_status text;
begin
  if public.meu_papel() not in ('garcom','admin') then raise exception 'Somente o salão pode alterar pedidos'; end if;
  select p.id, p.status into v_pedido, v_status
    from public.itens_pedido i join public.pedidos p on p.id = i.pedido_id
   where i.id = p_item and i.status = 'ativo' and not p.pago;
  if v_pedido is null then raise exception 'Item não encontrado'; end if;
  if v_status not in ('novo','preparando') then raise exception 'Este pedido já saiu da cozinha e não pode mais ser alterado'; end if;
  if p_qtd is null or p_qtd < 1 or p_qtd > 99 then raise exception 'Quantidade inválida'; end if;
  update public.itens_pedido
     set quantidade = p_qtd, observacao = nullif(trim(p_obs), ''), alterado_em = now()
   where id = p_item;
  perform set_config('ambar.interno', '1', true);
  update public.pedidos set atualizado_em = now() where id = v_pedido;
end $$;

-- Cancelar um item específico. Se não sobrar nenhum, o pedido inteiro é cancelado.
create or replace function public.cancelar_item(p_item bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_pedido bigint; v_status text;
begin
  if public.meu_papel() not in ('garcom','admin') then raise exception 'Somente o salão pode cancelar itens'; end if;
  select p.id, p.status into v_pedido, v_status
    from public.itens_pedido i join public.pedidos p on p.id = i.pedido_id
   where i.id = p_item and i.status = 'ativo' and not p.pago;
  if v_pedido is null then raise exception 'Item não encontrado'; end if;
  if v_status not in ('novo','preparando') then raise exception 'Este pedido já saiu da cozinha e não pode mais ser alterado'; end if;
  update public.itens_pedido set status = 'cancelado', alterado_em = now() where id = p_item;
  perform set_config('ambar.interno', '1', true);
  if not exists (select 1 from public.itens_pedido where pedido_id = v_pedido and status = 'ativo') then
    update public.pedidos set status = 'cancelado' where id = v_pedido;
  else
    update public.pedidos set atualizado_em = now() where id = v_pedido;
  end if;
end $$;

-- Adicionar itens a um pedido já enviado, mantendo a posição dele na fila.
-- Se o pedido já estava pronto, ele volta para "preparando" por causa dos itens novos.
create or replace function public.adicionar_itens(p_pedido bigint, p_itens jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if public.meu_papel() not in ('garcom','admin') then raise exception 'Somente o salão pode alterar pedidos'; end if;
  select status into v_status from public.pedidos where id = p_pedido and not pago;
  if v_status is null then raise exception 'Pedido não encontrado'; end if;
  if v_status not in ('novo','preparando','pronto') then raise exception 'Este pedido já foi entregue ou cancelado: faça um pedido novo'; end if;
  if p_itens is null or jsonb_array_length(p_itens) = 0 then raise exception 'Nenhum item para adicionar'; end if;
  insert into public.itens_pedido (pedido_id, item_id, nome, preco, quantidade, observacao, adicionado_em)
  select p_pedido, c.id, c.nome, c.preco,
         least(greatest(coalesce((i->>'qtd')::int, 1), 1), 99),
         nullif(trim(i->>'obs'), ''), now()
    from jsonb_array_elements(p_itens) i
    join public.cardapio c on c.id = (i->>'item_id')::int and c.ativo;
  perform set_config('ambar.interno', '1', true);
  update public.pedidos
     set status = case when status = 'pronto' then 'preparando' else status end,
         atualizado_em = now()
   where id = p_pedido;
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
revoke execute on function public.fechar_mesa(int, numeric)     from anon;
revoke execute on function public.editar_item(bigint, int, text) from anon;
revoke execute on function public.cancelar_item(bigint)         from anon;
revoke execute on function public.adicionar_itens(bigint, jsonb) from anon;
revoke execute on function public.definir_papel(uuid, text)     from anon;
revoke execute on function public.escolher_papel(text)          from anon;

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
-- Gerência e cozinha cadastram, editam e removem produtos
create policy "gerência cria cardápio"   on public.cardapio for insert to authenticated
  with check ((select public.meu_papel()) in ('admin','cozinha'));
create policy "gerência edita cardápio"  on public.cardapio for update to authenticated
  using ((select public.meu_papel()) in ('admin','cozinha')) with check ((select public.meu_papel()) in ('admin','cozinha'));
create policy "gerência remove cardápio" on public.cardapio for delete to authenticated
  using ((select public.meu_papel()) in ('admin','cozinha'));

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

-- Gorjetas: só a gerência vê e mexe (o fechamento de conta grava pela função fechar_mesa)
alter table public.gorjetas enable row level security;
drop policy if exists "gerência vê gorjetas"     on public.gorjetas;
drop policy if exists "gerência lança gorjetas"  on public.gorjetas;
drop policy if exists "gerência edita gorjetas"  on public.gorjetas;
drop policy if exists "gerência apaga gorjetas"  on public.gorjetas;
create policy "gerência vê gorjetas"    on public.gorjetas for select to authenticated using ((select public.meu_papel()) = 'admin');
-- Gorjeta avulsa só pode ser lançada para quem tem a função Garçom
create policy "gerência lança gorjetas" on public.gorjetas for insert to authenticated
  with check (
    (select public.meu_papel()) = 'admin'
    and exists (select 1 from public.profiles pr where pr.id = garcom_id and pr.papel = 'garcom')
  );
create policy "gerência edita gorjetas" on public.gorjetas for update to authenticated
  using ((select public.meu_papel()) = 'admin') with check ((select public.meu_papel()) = 'admin');
-- A gerência só marca como repassado ou ajusta a observação; não troca o garçom nem o valor
revoke update on public.gorjetas from authenticated, anon;
grant  update (repassado, repassado_em, observacao) on public.gorjetas to authenticated;
create policy "gerência apaga gorjetas" on public.gorjetas for delete to authenticated using ((select public.meu_papel()) = 'admin');

-- ---------- Tempo real -------------------------------------------------
do $$
begin
  begin alter publication supabase_realtime add table public.pedidos;      exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.itens_pedido; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.mesas;        exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.cardapio;     exception when duplicate_object then null; end;
end $$;

-- ---------- Fotos (Storage) ------------------------------------------
-- avatars/<id do usuário>/arquivo  → foto de perfil (cada um só mexe na sua pasta)
-- produtos/arquivo                 → fotos do cardápio (gerência e cozinha)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars',  'avatars',  true, 2097152, array['image/jpeg','image/png','image/webp']),
  ('produtos', 'produtos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "fotos: equipe vê"          on storage.objects;
drop policy if exists "avatar: dono envia"        on storage.objects;
drop policy if exists "avatar: dono atualiza"     on storage.objects;
drop policy if exists "avatar: dono apaga"        on storage.objects;
drop policy if exists "produtos: equipe envia"    on storage.objects;
drop policy if exists "produtos: equipe atualiza" on storage.objects;
drop policy if exists "produtos: equipe apaga"    on storage.objects;

create policy "fotos: equipe vê" on storage.objects for select to authenticated
  using (bucket_id in ('avatars','produtos'));
create policy "avatar: dono envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatar: dono atualiza" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatar: dono apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "produtos: equipe envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'produtos' and (select public.meu_papel()) in ('admin','cozinha'));
create policy "produtos: equipe atualiza" on storage.objects for update to authenticated
  using (bucket_id = 'produtos' and (select public.meu_papel()) in ('admin','cozinha'))
  with check (bucket_id = 'produtos' and (select public.meu_papel()) in ('admin','cozinha'));
create policy "produtos: equipe apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'produtos' and (select public.meu_papel()) in ('admin','cozinha'));

-- Aplica a lista de gerência a contas que já existem
update public.profiles p
   set papel = 'admin', precisa_papel = false
  from auth.users u
 where u.id = p.id
   and lower(u.email) in (select email from public.emails_gerencia)
   and (p.papel <> 'admin' or p.precisa_papel);

-- ---------- Dados iniciais ---------------------------------------------
insert into public.mesas (numero, lugares) values
  (1,2),(2,2),(3,4),(4,4),(5,4),(6,6),(7,2),(8,4),(9,4),(10,6),(11,8),(12,2)
on conflict (numero) do nothing;

insert into public.cardapio (nome, descricao, categoria, preco, tempo_min, tempo_max)
select * from (values
  ('Pão de fermentação natural', 'Manteiga de ervas e flor de sal',            'Entradas',   22.00, 8, 15),
  ('Bolinho de bacalhau',        '6 unidades, aioli de limão',                 'Entradas',   38.00, 8, 15),
  ('Carpaccio de beterraba',     'Beterraba assada na brasa, queijo de cabra', 'Entradas',   34.00, 8, 15),
  ('Peixe do dia na brasa',      'Purê de mandioquinha e farofa de castanhas', 'Principais', 89.00, 20, 35),
  ('Ancho na brasa',             '350 g, chimichurri e batatas rústicas',      'Principais',112.00, 20, 35),
  ('Risoto de cogumelos',        'Shiitake, shimeji e parmesão',               'Principais', 76.00, 20, 35),
  ('Polvo grelhado',             'Batatas ao murro e páprica defumada',        'Principais',118.00, 20, 35),
  ('Nhoque de abóbora',          'Manteiga de sálvia e amêndoas',              'Principais', 64.00, 20, 35),
  ('Pudim de tapioca',           'Calda de coco queimado',                     'Sobremesas', 28.00, 5, 10),
  ('Brownie quente',             'Sorvete de doce de leite',                   'Sobremesas', 32.00, 5, 10),
  ('Frutas da estação',          'Com hortelã e mel',                          'Sobremesas', 24.00, 5, 10),
  ('Água mineral',               'Com ou sem gás, 500 ml',                     'Bebidas',     8.00, 2, 5),
  ('Suco natural',               'Laranja, abacaxi com hortelã ou maracujá',   'Bebidas',    14.00, 2, 5),
  ('Caipirinha de limão',        'Cachaça artesanal',                          'Bebidas',    26.00, 2, 5),
  ('Taça de vinho da casa',      'Tinto ou branco',                            'Bebidas',    32.00, 2, 5),
  ('Café espresso',              null,                                         'Bebidas',     8.00, 2, 5)
) as v(nome, descricao, categoria, preco, tempo_min, tempo_max)
where not exists (select 1 from public.cardapio);
