-- FLUSSIO DATABASE SETUP SCRIPT
-- Copy and paste this script in your Supabase SQL Editor to set up all tables and security policies.

-- 1. Create Profiles Table (user settings & balance)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  salary_day integer default 27 check (salary_day >= 1 and salary_day <= 31),
  current_balance numeric(10,2) default 0.00,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Create Monthly Commitments Table (fixed expenses)
create table if not exists public.monthly_commitments (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  day integer not null check (day >= 1 and day <= 31),
  amount numeric(10,2) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Create Annual Commitments Table
create table if not exists public.annual_commitments (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  month integer not null check (month >= 1 and month <= 12), -- 1=January, 12=December
  amount numeric(10,2) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Create Annual Payments Status Table (tracks confirmation of annual payments per year)
create table if not exists public.annual_payments_status (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  annual_commitment_id uuid references public.annual_commitments on delete cascade not null,
  year integer not null,
  confirmed_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, annual_commitment_id, year)
);

-- 5. Create Planned Expenses Table (non-fixed variables)
create table if not exists public.planned_expenses (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  amount numeric(10,2) not null,
  month integer not null check (month >= 1 and month <= 12),
  year integer not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. Enable Row Level Security (RLS) on all tables
alter table public.profiles enable row level security;
alter table public.monthly_commitments enable row level security;
alter table public.annual_commitments enable row level security;
alter table public.annual_payments_status enable row level security;
alter table public.planned_expenses enable row level security;

-- 7. Define Security Policies (ensure users can only access their own data)

-- Policies for profiles
create policy "Users can view their own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id);
create policy "Users can insert their own profile" on public.profiles
  for insert with check (auth.uid() = id);

-- Policies for monthly commitments
create policy "Users can select their own monthly commitments" on public.monthly_commitments
  for select using (auth.uid() = user_id);
create policy "Users can insert their own monthly commitments" on public.monthly_commitments
  for insert with check (auth.uid() = user_id);
create policy "Users can update their own monthly commitments" on public.monthly_commitments
  for update using (auth.uid() = user_id);
create policy "Users can delete their own monthly commitments" on public.monthly_commitments
  for delete using (auth.uid() = user_id);

-- Policies for annual commitments
create policy "Users can select their own annual commitments" on public.annual_commitments
  for select using (auth.uid() = user_id);
create policy "Users can insert their own annual commitments" on public.annual_commitments
  for insert with check (auth.uid() = user_id);
create policy "Users can update their own annual commitments" on public.annual_commitments
  for update using (auth.uid() = user_id);
create policy "Users can delete their own annual commitments" on public.annual_commitments
  for delete using (auth.uid() = user_id);

-- Policies for annual payments status
create policy "Users can select their own annual payments status" on public.annual_payments_status
  for select using (auth.uid() = user_id);
create policy "Users can insert their own annual payments status" on public.annual_payments_status
  for insert with check (auth.uid() = user_id);
create policy "Users can delete their own annual payments status" on public.annual_payments_status
  for delete using (auth.uid() = user_id);

-- Policies for planned expenses
create policy "Users can select their own planned expenses" on public.planned_expenses
  for select using (auth.uid() = user_id);
create policy "Users can insert their own planned expenses" on public.planned_expenses
  for insert with check (auth.uid() = user_id);
create policy "Users can update their own planned expenses" on public.planned_expenses
  for update using (auth.uid() = user_id);
create policy "Users can delete their own planned expenses" on public.planned_expenses
  for delete using (auth.uid() = user_id);

-- 8. Automate Profile Creation on User Signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, salary_day, current_balance)
  values (new.id, 27, 0.00);
  return new;
end;
$$ language plpgsql security definer;

-- Drop trigger if exists, then create it
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
