create table public.pool_events (
  id bigint generated always as identity primary key,
  chain_id bigint not null check (chain_id > 0),
  contract_address text not null check (contract_address ~ '^0x[0-9a-f]{40}$'),
  transaction_hash text not null check (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  log_index integer not null check (log_index >= 0),
  block_number bigint not null check (block_number >= 0),
  event_name text not null check (event_name in (
    'DepositRecorded',
    'WithdrawalRecorded',
    'PrizeFunded',
    'DrawOpened',
    'DrawSelectionStarted',
    'DrawSelectionProgress',
    'DrawClaimable',
    'PrizeRolledOver',
    'PrizeClaimAttempted'
  )),
  draw_id bigint check (draw_id is null or draw_id > 0),
  label text not null check (char_length(label) between 1 and 120),
  metadata jsonb not null default '{}'::jsonb,
  indexed_at timestamptz not null default now(),
  unique (chain_id, contract_address, transaction_hash, log_index)
);

create index pool_events_feed_idx
  on public.pool_events (chain_id, contract_address, block_number desc, log_index desc);

alter table public.pool_events enable row level security;
revoke all on table public.pool_events from anon, authenticated;
grant select on table public.pool_events to anon, authenticated;
grant select, insert, update, delete on table public.pool_events to service_role;
grant usage, select on sequence public.pool_events_id_seq to service_role;

create policy "Public lifecycle events are readable"
  on public.pool_events
  for select
  to anon, authenticated
  using (true);

create table public.pool_event_indexer_state (
  chain_id bigint not null check (chain_id > 0),
  contract_address text not null check (contract_address ~ '^0x[0-9a-f]{40}$'),
  last_finalized_block bigint not null check (last_finalized_block >= 0),
  updated_at timestamptz not null default now(),
  primary key (chain_id, contract_address)
);

alter table public.pool_event_indexer_state enable row level security;
revoke all on table public.pool_event_indexer_state from anon, authenticated;
grant select, insert, update, delete on table public.pool_event_indexer_state to service_role;

alter publication supabase_realtime add table public.pool_events;
