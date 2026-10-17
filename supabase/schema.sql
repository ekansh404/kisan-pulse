-- Kisan Pulse database. Run once in Supabase -> SQL Editor -> New query -> Run.
-- The app only talks to Supabase from server routes with the service role key,
-- so RLS is enabled with no public policies (browser can't read tables directly).

create extension if not exists "pgcrypto";

-- Farmers (filled by voice onboarding)
create table if not exists farmers (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,              -- +91XXXXXXXXXX
  name text not null,
  lang text not null default 'hi',          -- 'hi' | 'en'
  village text,
  district text,
  state text,
  lat double precision,
  lon double precision,
  land_value numeric,                       -- as spoken
  land_unit text,                           -- 'bigha' | 'acre' | 'hectare'
  land_acres numeric,                       -- normalised
  crops text[] default '{}',
  farmer_id_sim text,                       -- SIMULATED AgriStack Farmer ID
  consent jsonb default '{}'::jsonb,        -- {data:true, alerts:true, at:'...'}
  created_at timestamptz default now(),
  last_seen_at timestamptz default now()
);

-- Service partners (SEEDED demo data: machines, stores, labour, buyers)
create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('machine','store','labour','buyer')),
  name text not null,
  name_hi text,
  village text,
  district text,
  lat double precision,
  lon double precision,
  phone text,
  rate numeric,                             -- ₹ per hour / per day / per quintal offer
  rate_unit text,                           -- 'hour' | 'day' | 'quintal' | 'item'
  rating numeric default 4.5,
  details jsonb default '{}'::jsonb,        -- {machine:'Tractor + Rotavator', items:[...], crops:[...]}
  created_at timestamptz default now()
);

-- Every confirmed action (booking, order, labour request, sell offer)
create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid references farmers(id) on delete cascade,
  type text not null check (type in ('book_machine','order_input','hire_labour','sell_crop')),
  partner_id uuid references partners(id),
  payload jsonb default '{}'::jsonb,
  status text not null default 'confirmed', -- confirmed | accepted | done | cancelled
  created_at timestamptz default now()
);

-- Simple key/value cache for slow APIs (mandi, soil)
create table if not exists api_cache (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

-- Conversation log (useful for demo + debugging)
create table if not exists messages (
  id bigserial primary key,
  farmer_id uuid references farmers(id) on delete cascade,
  role text not null,                       -- 'user' | 'assistant'
  text text not null,
  created_at timestamptz default now()
);

alter table farmers enable row level security;
alter table partners enable row level security;
alter table requests enable row level security;
alter table api_cache enable row level security;
alter table messages enable row level security;

create index if not exists partners_type_district on partners(type, district);
create index if not exists requests_farmer on requests(farmer_id, created_at desc);

-- Server key access (needed on newer Supabase projects; see supabase/grants.sql)
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
