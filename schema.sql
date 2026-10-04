-- Ferme de Bordeciel — schéma Supabase
-- À exécuter dans Supabase > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'employee' check (role in ('admin','employee')),
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id text primary key,
  name text not null,
  price numeric(12,2) not null check (price >= 0),
  active boolean not null default true
);

create table if not exists public.destinations (
  id text primary key,
  name text not null,
  factor numeric(8,4) not null default 1,
  free boolean not null default false
);

create table if not exists public.settings (
  id boolean primary key default true check (id = true),
  salary_rate numeric(8,4) not null default 0.50
);

create table if not exists public.harvests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id),
  product_id text not null references public.products(id),
  quantity numeric(12,2) not null check (quantity > 0),
  destination_id text not null references public.destinations(id),
  unit_price numeric(12,2) not null,
  billed_unit_price numeric(12,2) not null,
  total_sale numeric(14,2) not null,
  wage numeric(14,2) not null,
  paid boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id),
  total numeric(14,2) not null,
  entries_count integer not null,
  paid_at timestamptz not null default now()
);

insert into public.products(id,name,price) values
('patate','Patate',0.40),('poireau','Poireau',0.40),('chou','Chou',0.40),
('tomate','Tomate',0.40),('ble','Blé',0.50),('boeuf','Bœuf',2.00),
('poulet','Poulet',2.00),('oeuf','Œuf',1.00),('ail','Ail',0.10)
on conflict(id) do update set name=excluded.name;

insert into public.destinations(id,name,factor,free) values
('local','Vente locale',1.00,false),
('export','Exportation (+10 %)',1.10,false),
('solitude','Garde de Solitude — gratuit',1.00,true)
on conflict(id) do update set name=excluded.name,factor=excluded.factor,free=excluded.free;

insert into public.settings(id,salary_rate) values(true,0.50)
on conflict(id) do nothing;

-- Profil automatique après création d'un utilisateur Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles(id,name,role)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)), 'employee')
  on conflict(id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Calcul des prix et salaires côté base : le navigateur ne peut pas falsifier le salaire.
create or replace function public.calculate_harvest()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  p numeric(12,2);
  f numeric(8,4);
  free_dest boolean;
  rate numeric(8,4);
begin
  select price into p from public.products where id = new.product_id and active = true;
  select factor, free into f, free_dest from public.destinations where id = new.destination_id;
  select salary_rate into rate from public.settings where id = true;

  if p is null or f is null or rate is null then
    raise exception 'Produit, destination ou paramètres invalides';
  end if;

  new.unit_price := p;
  new.billed_unit_price := case when free_dest then 0 else p * f end;
  new.total_sale := new.quantity * new.billed_unit_price;

  -- Solitude : gratuit pour le client, mais salaire calculé au tarif normal.
  -- Export : prix et salaire +10 %.
  new.wage := new.quantity * p * rate * f;
  return new;
end;
$$;

drop trigger if exists calculate_harvest_before_insert on public.harvests;
create trigger calculate_harvest_before_insert
before insert on public.harvests
for each row execute procedure public.calculate_harvest();

-- Recalcul également lors d'une modification admin.
drop trigger if exists calculate_harvest_before_update on public.harvests;
create trigger calculate_harvest_before_update
before update of product_id,quantity,destination_id on public.harvests
for each row execute procedure public.calculate_harvest();

-- RLS
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.destinations enable row level security;
alter table public.settings enable row level security;
alter table public.harvests enable row level security;
alter table public.payments enable row level security;

revoke all on public.profiles,public.products,public.destinations,public.settings,public.harvests,public.payments from anon;
grant select on public.products,public.destinations,public.settings to authenticated;
grant select on public.profiles to authenticated;
grant select,insert on public.harvests to authenticated;
grant update,delete on public.harvests to authenticated;
grant select,insert on public.payments to authenticated;
grant update on public.products,public.settings,public.profiles to authenticated;

drop policy if exists "profiles own or admin" on public.profiles;
create policy "profiles own or admin" on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "products read" on public.products;
create policy "products read" on public.products for select to authenticated using (true);
drop policy if exists "products admin update" on public.products;
create policy "products admin update" on public.products for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "destinations read" on public.destinations;
create policy "destinations read" on public.destinations for select to authenticated using (true);

drop policy if exists "settings read" on public.settings;
create policy "settings read" on public.settings for select to authenticated using (true);
drop policy if exists "settings admin update" on public.settings;
create policy "settings admin update" on public.settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "harvests own insert" on public.harvests;
create policy "harvests own insert" on public.harvests for insert to authenticated
with check (employee_id = auth.uid());

drop policy if exists "harvests own or admin read" on public.harvests;
create policy "harvests own or admin read" on public.harvests for select to authenticated
using (employee_id = auth.uid() or public.is_admin());

drop policy if exists "harvests admin update" on public.harvests;
create policy "harvests admin update" on public.harvests for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "harvests admin delete" on public.harvests;
create policy "harvests admin delete" on public.harvests for delete to authenticated
using (public.is_admin());

drop policy if exists "payments admin" on public.payments;
create policy "payments admin" on public.payments for select to authenticated using (public.is_admin());
create policy "payments admin insert" on public.payments for insert to authenticated with check (public.is_admin());

-- Vue pratique pour l'admin.
create or replace view public.harvest_register as
select h.*, p.name as employee_name, pr.name as product_name, d.name as destination_name
from public.harvests h
join public.profiles p on p.id=h.employee_id
join public.products pr on pr.id=h.product_id
join public.destinations d on d.id=h.destination_id;
