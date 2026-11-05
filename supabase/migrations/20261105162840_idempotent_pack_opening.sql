-- Save the roll in the same transaction as its price and inventory changes.
-- The existing roller remains private and keeps the current reward rules.
create table if not exists public.pack_requests (
  player_id uuid not null references public.players(id) on delete cascade,
  request_id uuid not null,
  pack_id int not null references public.packs(id),
  drop jsonb not null,
  created_at timestamptz not null default now(),
  primary key (player_id, request_id)
);

alter table public.pack_requests enable row level security;
revoke all on public.pack_requests from public, anon, authenticated;
grant all on public.pack_requests to service_role;

create or replace function public.open_pack_idempotent(
  p_player_id uuid, p_pack_id int, p_request_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_previous public.pack_requests%rowtype;
  v_drop jsonb;
begin
  if p_request_id is null then raise exception 'INVALID_REQUEST_ID'; end if;
  if p_pack_id is null then raise exception 'ITEM_NOT_FOUND'; end if;
  -- Serialize all openings by this player, including concurrent retries.
  perform 1 from public.players where id = p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  select * into v_previous from public.pack_requests
    where player_id = p_player_id and request_id = p_request_id;
  if found then
    if v_previous.pack_id <> p_pack_id then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_previous.drop;
  end if;

  v_drop := public.open_pack_atomic(p_player_id, p_pack_id);
  insert into public.pack_requests(player_id, request_id, pack_id, drop)
    values (p_player_id, p_request_id, p_pack_id, v_drop);
  return v_drop;
end;
$$;

revoke all on function public.open_pack_idempotent(uuid, int, uuid) from public, anon, authenticated;
grant execute on function public.open_pack_idempotent(uuid, int, uuid) to service_role;
notify pgrst, 'reload schema';
