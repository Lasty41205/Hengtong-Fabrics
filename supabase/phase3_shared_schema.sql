create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'app_role' and n.nspname = 'public'
  ) then
    create type public.app_role as enum ('admin', 'staff');
  end if;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role public.app_role not null default 'staff',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null default '',
  address text not null default '',
  default_shipping_type text not null default '',
  default_shipping_name text not null default '',
  note text not null default '',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint customers_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null,
  constraint customers_updated_by_fkey foreign key (updated_by) references public.profiles (id) on delete set null
);

create unique index if not exists customers_name_unique_idx
on public.customers ((lower(name)));

create index if not exists customers_updated_at_idx
on public.customers (updated_at desc);

create table if not exists public.customer_prices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  price_key text not null,
  price numeric(12,2) not null default 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint customer_prices_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null,
  constraint customer_prices_updated_by_fkey foreign key (updated_by) references public.profiles (id) on delete set null
);

create unique index if not exists customer_prices_customer_key_unique_idx
on public.customer_prices (customer_id, lower(price_key));

create table if not exists public.default_prices (
  id uuid primary key default gen_random_uuid(),
  price_key text not null,
  price numeric(12,2) not null default 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint default_prices_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null,
  constraint default_prices_updated_by_fkey foreign key (updated_by) references public.profiles (id) on delete set null
);

create unique index if not exists default_prices_key_unique_idx
on public.default_prices ((lower(price_key)));

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete set null,
  invoice_no text not null,
  invoice_date date not null default current_date,
  shipping_type text not null default '',
  shipping_name text not null default '',
  total_amount numeric(12,2) not null default 0,
  note text not null default '',
  raw_input_text text not null default '',
  generated_image_url text not null default '',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint invoices_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null,
  constraint invoices_updated_by_fkey foreign key (updated_by) references public.profiles (id) on delete set null
);

create unique index if not exists invoices_invoice_no_unique_idx
on public.invoices (invoice_no);

create index if not exists invoices_customer_id_idx
on public.invoices (customer_id);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  spec_name text not null,
  quantity numeric(12,2) not null default 0,
  unit text not null default '',
  unit_price numeric(12,2) not null default 0,
  amount numeric(12,2) not null default 0,
  sort_order integer not null default 0
);

create index if not exists invoice_items_invoice_id_idx
on public.invoice_items (invoice_id, sort_order);

create table if not exists public.billing_entries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete set null,
  invoice_id uuid references public.invoices (id) on delete set null,
  entry_type text not null,
  amount numeric(12,2) not null default 0,
  payment_method text not null default '',
  note text not null default '',
  occurred_at timestamptz not null default timezone('utc', now()),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint billing_entries_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null,
  constraint billing_entries_updated_by_fkey foreign key (updated_by) references public.profiles (id) on delete set null
);

create index if not exists billing_entries_customer_id_idx
on public.billing_entries (customer_id, occurred_at desc);

create index if not exists billing_entries_invoice_id_idx
on public.billing_entries (invoice_id);

create index if not exists billing_entries_updated_at_idx
on public.billing_entries (updated_at desc);

create index if not exists invoices_updated_at_idx
on public.invoices (updated_at desc);

create or replace function public.current_profile_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
$$;

create or replace function public.current_profile_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select is_active
    from public.profiles
    where id = auth.uid()
  ), false)
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() = 'admin', false)
$$;

create or replace function public.list_active_login_accounts()
returns table (
  id uuid,
  display_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name
  from public.profiles p
  where p.is_active = true
    and coalesce(trim(p.display_name), '') <> ''
  order by p.display_name
$$;

revoke execute on function public.list_active_login_accounts() from anon;
grant execute on function public.list_active_login_accounts() to authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1), '')
  )
  on conflict (id) do update
  set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

create or replace function public.apply_audit_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.created_at is null then
      new.created_at = timezone('utc', now());
    end if;
    if new.updated_at is null then
      new.updated_at = timezone('utc', now());
    end if;
    if auth.uid() is not null then
      new.created_by = auth.uid();
      new.updated_by = auth.uid();
    end if;
  else
    new.updated_at = timezone('utc', now());
    if auth.uid() is not null then
      new.updated_by = auth.uid();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists customers_apply_audit_fields on public.customers;
create trigger customers_apply_audit_fields
before insert or update on public.customers
for each row execute procedure public.apply_audit_fields();

drop trigger if exists customer_prices_apply_audit_fields on public.customer_prices;
create trigger customer_prices_apply_audit_fields
before insert or update on public.customer_prices
for each row execute procedure public.apply_audit_fields();

drop trigger if exists default_prices_apply_audit_fields on public.default_prices;
create trigger default_prices_apply_audit_fields
before insert or update on public.default_prices
for each row execute procedure public.apply_audit_fields();

drop trigger if exists invoices_apply_audit_fields on public.invoices;
create trigger invoices_apply_audit_fields
before insert or update on public.invoices
for each row execute procedure public.apply_audit_fields();

drop trigger if exists billing_entries_apply_audit_fields on public.billing_entries;
create trigger billing_entries_apply_audit_fields
before insert or update on public.billing_entries
for each row execute procedure public.apply_audit_fields();

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.customer_prices enable row level security;
alter table public.default_prices enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.billing_entries enable row level security;

drop policy if exists "profiles_shared_select" on public.profiles;
create policy "profiles_shared_select"
on public.profiles
for select
to authenticated
using (public.current_profile_is_active());

drop policy if exists "profiles_update_admin_only" on public.profiles;
create policy "profiles_update_admin_only"
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "profiles_insert_admin_only" on public.profiles;
create policy "profiles_insert_admin_only"
on public.profiles
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "customers_shared_select" on public.customers;
create policy "customers_shared_select"
on public.customers
for select
to authenticated
using (public.current_profile_is_active());

drop policy if exists "customers_shared_insert" on public.customers;
create policy "customers_shared_insert"
on public.customers
for insert
to authenticated
with check (public.current_profile_is_active());

drop policy if exists "customers_shared_update" on public.customers;
create policy "customers_shared_update"
on public.customers
for update
to authenticated
using (public.current_profile_is_active())
with check (public.current_profile_is_active());

drop policy if exists "customers_shared_delete" on public.customers;
create policy "customers_shared_delete"
on public.customers
for delete
to authenticated
using (public.current_profile_is_active());

drop policy if exists "customer_prices_shared_all" on public.customer_prices;
create policy "customer_prices_shared_all"
on public.customer_prices
for all
to authenticated
using (public.current_profile_is_active())
with check (public.current_profile_is_active());

drop policy if exists "default_prices_shared_all" on public.default_prices;
create policy "default_prices_shared_all"
on public.default_prices
for all
to authenticated
using (public.current_profile_is_active())
with check (public.current_profile_is_active());

drop policy if exists "invoices_shared_all" on public.invoices;
create policy "invoices_shared_all"
on public.invoices
for all
to authenticated
using (public.current_profile_is_active())
with check (public.current_profile_is_active());

drop policy if exists "invoice_items_shared_all" on public.invoice_items;
create policy "invoice_items_shared_all"
on public.invoice_items
for all
to authenticated
using (true)
with check (true);

drop policy if exists "billing_entries_shared_all" on public.billing_entries;
create policy "billing_entries_shared_all"
on public.billing_entries
for all
to authenticated
using (public.current_profile_is_active())
with check (public.current_profile_is_active());


