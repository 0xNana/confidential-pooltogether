alter table public.pool_events
  drop constraint if exists pool_events_event_name_check;

alter table public.pool_events
  add constraint pool_events_event_name_check check (event_name in (
    'DepositRecorded',
    'DrawEntered',
    'WithdrawalRecorded',
    'PrizeFunded',
    'DrawOpened',
    'DrawFinalized',
    'SelectionProgress',
    'DrawClaimable',
    'DrawExpired',
    'PrizeSwept',
    'PrizeClaimAttempted'
  ));

comment on column public.pool_events.draw_id is
  'Primary draw referenced by the event. PrizeSwept stores sourceDrawId here and targetDrawId in metadata.';

create table public.pool_draws (
  chain_id bigint not null check (chain_id > 0),
  contract_address text not null check (contract_address ~ '^0x[0-9a-f]{40}$'),
  draw_id bigint not null check (draw_id > 0),
  scheduled_open bigint not null check (scheduled_open > 0),
  scheduled_close bigint not null check (scheduled_close > scheduled_open),
  claimable_at bigint,
  claim_expires_at bigint,
  participant_count integer not null check (participant_count between 0 and 256),
  scan_cursor integer not null check (scan_cursor between 0 and participant_count),
  status smallint not null check (status between 0 and 4),
  updated_at timestamptz not null default now(),
  primary key (chain_id, contract_address, draw_id)
);

alter table public.pool_draws
  add constraint pool_draws_claim_window_check check (
    (claimable_at is null and claim_expires_at is null)
    or (claimable_at > 0 and claim_expires_at >= claimable_at)
  );

create index pool_draws_actionable_idx
  on public.pool_draws (chain_id, contract_address, status, draw_id desc);

alter table public.pool_draws enable row level security;
revoke all on table public.pool_draws from anon, authenticated;
grant select on table public.pool_draws to anon, authenticated;
grant select, insert, update, delete on table public.pool_draws to service_role;

create policy "Public draw metadata is readable"
  on public.pool_draws
  for select
  to anon, authenticated
  using (true);

alter publication supabase_realtime add table public.pool_draws;
