-- Vault3D · Estatísticas de uso (abertura e fechamento do app)
-- Rodar uma vez no SQL Editor do Supabase.
-- Guarda apenas: usuário, hora de abertura, hora de fechamento e versão do app.
-- Nenhum nome de arquivo, pasta ou conteúdo de modelo é enviado.

create table if not exists public.app_sessions (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  started_at  timestamptz not null,
  ended_at    timestamptz,
  app_version text,
  created_at  timestamptz not null default now()
);

create index if not exists app_sessions_started_idx on public.app_sessions (started_at);
create index if not exists app_sessions_user_idx on public.app_sessions (user_id, started_at);

-- Ninguém acessa a tabela diretamente: só pelas funções abaixo.
alter table public.app_sessions enable row level security;
revoke all on public.app_sessions from anon, authenticated;

-- O app chama ao abrir (p_ended_at nulo) e ao fechar (com p_ended_at).
-- Só grava sessões do próprio usuário logado.
create or replace function public.log_app_session(
  p_id uuid,
  p_started_at timestamptz,
  p_ended_at timestamptz default null,
  p_app_version text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_start timestamptz;
  v_end timestamptz;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- Relógio do PC pode estar errado: limita a valores plausíveis.
  v_start := least(p_started_at, now());
  v_end := case
    when p_ended_at is null then null
    else greatest(v_start, least(p_ended_at, now(), v_start + interval '24 hours'))
  end;

  insert into public.app_sessions (id, user_id, started_at, ended_at, app_version)
  values (p_id, v_uid, v_start, v_end, left(p_app_version, 20))
  on conflict (id) do update
    set ended_at = coalesce(excluded.ended_at, app_sessions.ended_at)
    where app_sessions.user_id = v_uid;
end;
$$;

revoke all on function public.log_app_session(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.log_app_session(uuid, timestamptz, timestamptz, text) to authenticated;

-- Painel /dash: só o e-mail de administração consegue ler.
create or replace function public.is_dash_admin() returns boolean
language sql stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'paulo@eustudio.com.br';
$$;

grant execute on function public.is_dash_admin() to authenticated;

create or replace function public.dash_stats(p_days int default 30) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tz constant text := 'America/Sao_Paulo';
  v_days int := greatest(7, least(coalesce(p_days, 30), 180));
  v_today date := (now() at time zone tz)::date;
  v_from date := v_today - (v_days - 1);
  result jsonb;
begin
  if not public.is_dash_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with s as (
    select user_id,
           started_at,
           ended_at,
           app_version,
           (started_at at time zone tz)::date as day,
           extract(epoch from (ended_at - started_at)) / 60.0 as minutes
    from public.app_sessions
  ),
  first_day as (
    select user_id, min(day) as d0 from s group by user_id
  ),
  days as (
    select generate_series(v_from, v_today, interval '1 day')::date as day
  ),
  daily as (
    select d.day,
           count(distinct s.user_id) as active_users,
           count(s.user_id) as sessions,
           round(avg(s.minutes) filter (where s.minutes is not null)::numeric, 1) as avg_minutes,
           (select count(*) from auth.users u where (u.created_at at time zone tz)::date = d.day) as new_users
    from days d
    left join s on s.day = d.day
    group by d.day
    order by d.day
  ),
  week_activity as (
    select user_id, count(distinct day) as active_days
    from s where day > v_today - 7
    group by user_id
  ),
  last_version as (
    select distinct on (user_id) user_id, coalesce(app_version, '?') as v
    from s where day >= v_from
    order by user_id, started_at desc
  ),
  retention as (
    select
      count(*) filter (where f.d0 <= v_today - 1) as base_d1,
      count(*) filter (where f.d0 <= v_today - 1 and exists (
        select 1 from s where s.user_id = f.user_id and s.day = f.d0 + 1)) as ret_d1,
      count(*) filter (where f.d0 <= v_today - 7) as base_d7,
      count(*) filter (where f.d0 <= v_today - 7 and exists (
        select 1 from s where s.user_id = f.user_id and s.day between f.d0 + 1 and f.d0 + 7)) as ret_d7
    from first_day f
  )
  select jsonb_build_object(
    'generated_at', now(),
    'timezone', tz,
    'days', v_days,
    'total_users', (select count(*) from auth.users),
    'tracked_users', (select count(*) from first_day),
    'tracking_since', (select min(day) from s),
    'active_today', (select count(distinct user_id) from s where day = v_today),
    'active_7d', (select count(distinct user_id) from s where day > v_today - 7),
    'active_30d', (select count(distinct user_id) from s where day > v_today - 30),
    'avg_minutes', (select round(avg(minutes)::numeric, 1) from s where day >= v_from and minutes is not null),
    'median_minutes', (select round((percentile_cont(0.5) within group (order by minutes))::numeric, 1)
                         from s where day >= v_from and minutes is not null),
    'daily', (select coalesce(jsonb_agg(to_jsonb(daily)), '[]'::jsonb) from daily),
    'week_frequency', (select jsonb_build_object(
        '1', count(*) filter (where active_days = 1),
        '2-3', count(*) filter (where active_days between 2 and 3),
        '4-6', count(*) filter (where active_days between 4 and 6),
        '7', count(*) filter (where active_days = 7)) from week_activity),
    'versions', (select coalesce(jsonb_agg(jsonb_build_object('version', v, 'users', n) order by n desc), '[]'::jsonb)
                 from (select v, count(*) as n from last_version group by v) x),
    'retention', (select to_jsonb(retention) from retention)
  ) into result;

  return result;
end;
$$;

revoke all on function public.dash_stats(int) from public, anon;
grant execute on function public.dash_stats(int) to authenticated;
