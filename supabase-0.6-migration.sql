-- ERRANDLY 0.6 — controlled database migration
-- Run once in Supabase SQL Editor.
-- This migration is additive and preserves existing orders.
-- It removes the insecure 0.5 RLS policies and replaces them with account-based rules.

create extension if not exists pgcrypto;

alter table public.errands
  add column if not exists customer_id uuid references auth.users(id),
  add column if not exists runner_id uuid,
  add column if not exists updated_at timestamptz default now();

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role text not null default 'customer' check (role in ('customer','admin','owner')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.runners (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  status text not null default 'available' check (status in ('available','busy','offline')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists errands_customer_id_idx on public.errands(customer_id);
create index if not exists errands_runner_id_idx on public.errands(runner_id);

alter table public.errands enable row level security;
alter table public.profiles enable row level security;
alter table public.runners enable row level security;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists errands_set_updated_at on public.errands;
create trigger errands_set_updated_at before update on public.errands
for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists runners_set_updated_at on public.runners;
create trigger runners_set_updated_at before update on public.runners
for each row execute function public.set_updated_at();

-- New accounts are customers by default. This trigger also creates a profile
-- when a user registers through the Errandly app.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Admin authorization comes from Auth app_metadata, which customers cannot
-- modify from the public client.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','owner'), false);
$$;

-- Remove the insecure 0.5 policies. The old "Admins" policy actually allowed
-- every authenticated user because its USING expression was simply TRUE.
drop policy if exists "Admins can view errands" on public.errands;
drop policy if exists "Allow public errand submissions" on public.errands;
drop policy if exists "errands_customer_insert" on public.errands;
drop policy if exists "errands_customer_select" on public.errands;
drop policy if exists "errands_customer_update_unassigned" on public.errands;
drop policy if exists "errands_admin_all" on public.errands;

-- Customers must be authenticated and may only create an order for themselves.
create policy "errands_customer_insert"
on public.errands for insert to authenticated
with check (
  customer_id = auth.uid()
  and status = 'Pending'
  and runner_id is null
);

-- Customers see only their own orders. Admins see everything.
create policy "errands_customer_select"
on public.errands for select to authenticated
using (customer_id = auth.uid() or public.is_admin());

-- Customers can modify their own non-cancelled orders even after a runner is assigned.
-- Cancellation is permitted only while runner_id is NULL. The trigger below
-- protects customer_id, runner_id, and workflow status from customer tampering.
create policy "errands_customer_update"
on public.errands for update to authenticated
using (
  customer_id = auth.uid()
  and status <> 'Cancelled'
)
with check (
  customer_id = auth.uid()
  and (status <> 'Cancelled' or runner_id is null)
);

create policy "errands_admin_all"
on public.errands for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Enforce customer-side lifecycle rules at the database layer, not just in JS.
create or replace function public.protect_customer_errand_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if old.customer_id <> auth.uid() then
      raise exception 'You can only modify your own order';
    end if;

    if old.status = 'Cancelled' then
      raise exception 'Cancelled orders cannot be modified';
    end if;

    if new.customer_id is distinct from old.customer_id then
      raise exception 'Customer ownership cannot be changed';
    end if;

    if new.runner_id is distinct from old.runner_id then
      raise exception 'Customers cannot assign or remove runners';
    end if;

    if new.status is distinct from old.status then
      if old.runner_id is null and new.status = 'Cancelled' then
        null;
      else
        raise exception 'Customers cannot change the order workflow status';
      end if;
    end if;

    if old.runner_id is not null and new.status = 'Cancelled' then
      raise exception 'This order cannot be cancelled after a runner is assigned';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_customer_errand_update on public.errands;
create trigger protect_customer_errand_update
before update on public.errands
for each row execute function public.protect_customer_errand_update();

-- Profiles: customers see/update themselves; admins manage profiles.
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_select_own" on public.profiles
for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles_update_own" on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_admin_all" on public.profiles
for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Runners are operational data; only admins can manage them in 0.6.
drop policy if exists "runners_admin_all" on public.runners;
create policy "runners_admin_all" on public.runners
for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Make the existing 0.6 admin the initial owner/admin.
-- This does not expose a secret; it only marks the supplied Auth user as owner.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"owner"}'::jsonb
where id = '09d9a87a-be88-4bff-8fad-81bc61d4c950';

insert into public.profiles (id, full_name, role)
values ('09d9a87a-be88-4bff-8fad-81bc61d4c950', '', 'owner')
on conflict (id) do update set role = 'owner', updated_at = now();

-- IMPORTANT: after this migration, existing 0.5 orders without customer_id
-- remain in the database but are not visible to customers. Admins can still see them.
-- If you want to preserve those orders for a specific customer, backfill
-- customer_id deliberately rather than guessing ownership.
