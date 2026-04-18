-- Run this in Supabase SQL Editor

-- Table to store one blob of data per user
create table if not exists finance_data (
  user_id uuid references auth.users on delete cascade primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

-- Enable Row Level Security
alter table finance_data enable row level security;

-- Policies: users can only see/edit their own row
create policy "Users can view own data"
  on finance_data for select
  using (auth.uid() = user_id);

create policy "Users can insert own data"
  on finance_data for insert
  with check (auth.uid() = user_id);

create policy "Users can update own data"
  on finance_data for update
  using (auth.uid() = user_id);
