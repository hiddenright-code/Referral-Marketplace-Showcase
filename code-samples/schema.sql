-- ============================================================
-- MRN: Muslim Referral Network
-- Database Schema (curated excerpt)
--
-- Full schema runs on Supabase (PostgreSQL 15+)
-- with Row Level Security, pg_cron, and real-time enabled.
-- ============================================================


-- ============================================================
-- CORE TABLES
-- ============================================================

-- Users (public profile, created automatically by auth trigger)
create table users (
  id uuid primary key references auth.users(id),
  role text check (role in ('insider', 'seeker', 'both')) not null default 'seeker',
  full_name text,
  tag_line text,
  linkedin_url text,
  avatar_url text,
  about text,
  onboarding_complete boolean default false,
  is_flagged boolean default false,
  flag_reason text,
  flagged_at timestamptz,
  is_banned boolean default false,
  created_at timestamptz default now()
);

-- Insider profiles (company, department, referral preferences)
create table insider_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null unique,
  company text,
  role_level text,
  department text,
  anonymity_on boolean default false,
  open_to_referring boolean default true,
  barakah_points integer default 0,
  created_at timestamptz default now()
);

-- Seeker profiles (job preferences, visa, location)
create table seeker_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null unique,
  summary text,
  current_location text,
  relocate_preference text,
  target_cities text,
  work_preference text,
  visa_status text,
  seeking_status text default 'Actively seeking referrals',
  featured_education text,
  created_at timestamptz default now()
);

-- Companies (directory with halal workplace indicators)
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  departments text[],
  is_halal_friendly boolean default false,
  has_muslim_erg boolean default false,
  has_prayer_rooms boolean default false,
  created_at timestamptz default now()
);

-- Pitches (seeker -> insider, one-to-one, rate limited)
create table pitches (
  id uuid primary key default gen_random_uuid(),
  seeker_id uuid references users(id) not null,
  insider_id uuid references users(id) not null,
  company_id uuid references companies(id) not null,
  pitch_text text not null,
  portfolio_link text,
  success_gift text,
  status text check (status in ('pending', 'accepted', 'declined')) default 'pending',
  decline_reasons text[],
  decline_comment text,
  is_archived boolean default false,
  created_at timestamptz default now()
);

-- Matches (created on pitch accept, tracks referral pipeline)
create table matches (
  id uuid primary key default gen_random_uuid(),
  pitch_id uuid references pitches(id) not null,
  seeker_id uuid references users(id) not null,
  insider_id uuid references users(id) not null,
  company_id uuid references companies(id) not null,
  stage text default 'matched',
  chat_enabled boolean default true,
  chat_ended boolean default false,
  is_stale boolean default false,
  is_archived boolean default false,
  archived_at timestamptz,
  archive_reason text,
  created_at timestamptz default now()
);

-- Messages (private chat within a match)
create table messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) not null,
  sender_id uuid references users(id) not null,
  content text not null,
  is_read boolean default false,
  created_at timestamptz default now()
);

-- Badges (earned through profile quality and referral activity)
create table badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  badge_type text not null,
  created_at timestamptz default now(),
  unique(user_id, badge_type)
);

-- Notifications (in-app, per-user)
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  type text not null,
  message text not null,
  read boolean default false,
  related_id uuid,
  created_at timestamptz default now()
);

-- Notification settings (per-event email/in-app preferences)
create table notification_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null unique,
  pitch_accepted text default 'both',
  pitch_declined text default 'both',
  pipeline_updates text default 'both',
  new_messages text default 'inapp',
  created_at timestamptz default now()
);

-- Name change log (abuse prevention, max 3 per 365 days)
create table name_change_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  old_name text,
  new_name text,
  changed_at timestamptz default now()
);

-- Match history (long-term retention after 12 months)
create table match_history (
  id uuid primary key default gen_random_uuid(),
  original_match_id uuid,
  insider_id uuid,
  seeker_id uuid,
  company_id uuid,
  final_stage text,
  archive_reason text,
  matched_at timestamptz,
  archived_at timestamptz
);

-- Barakah Points log (point history for reputation system)
create table barakah_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  event text not null,
  points integer not null,
  created_at timestamptz default now()
);


-- ============================================================
-- INDEXES
-- ============================================================

create index messages_match_id_idx on messages(match_id, created_at);
create index match_history_insider_idx on match_history(insider_id);
create index match_history_seeker_idx on match_history(seeker_id);


-- ============================================================
-- ROW LEVEL SECURITY (selected policies)
-- ============================================================

alter table users enable row level security;
alter table pitches enable row level security;
alter table matches enable row level security;
alter table messages enable row level security;

-- Users can read/update their own row
create policy "users_own_data" on users
  for all using (auth.uid() = id);

-- Pitches: seekers can insert and read their own pitches
create policy "seekers_manage_own_pitches" on pitches
  for all using (auth.uid() = seeker_id);

-- Pitches: insiders can read pitches sent to them
create policy "insiders_read_pitches" on pitches
  for select using (auth.uid() = insider_id);

-- Matches: both participants can read their matches
create policy "match_participants_read" on matches
  for select using (
    auth.uid() = seeker_id or auth.uid() = insider_id
  );

-- Matches: participants can update archive fields on their own matches
create policy "match_participants_archive" on matches
  for update using (
    auth.uid() = seeker_id or auth.uid() = insider_id
  );

-- Messages: match participants can read and insert messages
create policy "messages_match_participants" on messages
  for all using (
    match_id in (
      select id from matches
      where seeker_id = auth.uid() or insider_id = auth.uid()
    )
  );

-- Companies: all authenticated users can read
create policy "companies_public_read" on companies
  for select using (auth.uid() is not null);


-- ============================================================
-- RPC FUNCTIONS
-- ============================================================

-- Returns all matches for a user with unread counts, last message,
-- and participant info in a single query (replaces N+1 pattern)
create or replace function get_matches_with_meta(
  p_user_id uuid,
  p_archived boolean default false
)
returns table (
  id uuid,
  pitch_id uuid,
  seeker_id uuid,
  insider_id uuid,
  company_id uuid,
  stage text,
  chat_enabled boolean,
  chat_ended boolean,
  is_stale boolean,
  is_archived boolean,
  archived_at timestamptz,
  archive_reason text,
  created_at timestamptz,
  unread_count bigint,
  last_message_id uuid,
  last_message_content text,
  last_message_sender_id uuid,
  last_message_created_at timestamptz,
  last_message_is_read boolean,
  company_name text,
  seeker_full_name text,
  seeker_avatar_url text,
  insider_role_level text,
  insider_company text,
  insider_anonymity_on boolean
)
language sql
security definer
set search_path = public
as $$
  select
    m.id, m.pitch_id, m.seeker_id, m.insider_id, m.company_id,
    m.stage, m.chat_enabled, m.chat_ended, m.is_stale,
    m.is_archived, m.archived_at, m.archive_reason, m.created_at,
    coalesce(u.unread_count, 0) as unread_count,
    lm.id as last_message_id,
    lm.content as last_message_content,
    lm.sender_id as last_message_sender_id,
    lm.created_at as last_message_created_at,
    lm.is_read as last_message_is_read,
    c.name as company_name,
    su.full_name as seeker_full_name,
    su.avatar_url as seeker_avatar_url,
    ip.role_level as insider_role_level,
    ip.company as insider_company,
    ip.anonymity_on as insider_anonymity_on
  from matches m
  left join companies c on c.id = m.company_id
  left join users su on su.id = m.seeker_id
  left join insider_profiles ip on ip.user_id = m.insider_id
  left join lateral (
    select count(*) as unread_count
    from messages msg
    where msg.match_id = m.id
      and msg.is_read = false
      and msg.sender_id != p_user_id
  ) u on true
  left join lateral (
    select msg.id, msg.content, msg.sender_id, msg.created_at, msg.is_read
    from messages msg
    where msg.match_id = m.id
    order by msg.created_at desc
    limit 1
  ) lm on true
  where (m.seeker_id = p_user_id or m.insider_id = p_user_id)
    and m.is_archived = p_archived
  order by coalesce(lm.created_at, m.created_at) desc;
$$;

-- Grant to authenticated users only
grant execute on function get_matches_with_meta(uuid, boolean) to authenticated;


-- Atomically marks all unread messages as read for the recipient
create or replace function mark_messages_read(
  p_match_id uuid,
  p_user_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  update messages
  set is_read = true
  where match_id = p_match_id
    and sender_id != p_user_id
    and is_read = false;
$$;

grant execute on function mark_messages_read(uuid, uuid) to authenticated;


-- ============================================================
-- TRIGGERS (signatures only, bodies omitted for brevity)
-- ============================================================

-- Auto-create public.users row when auth.users row is inserted
-- create trigger on_auth_user_created
--   after insert on auth.users
--   for each row execute function handle_new_user();

-- Award community_verified badge when LinkedIn URL is added
-- create trigger on_linkedin_added ...

-- Award portfolio_linked badge when portfolio link is added
-- create trigger on_portfolio_added ...

-- Award Barakah Points on match stage changes
-- create trigger on_match_stage_change ...

-- Create match + notifications when insider accepts pitch
-- create trigger on_pitch_accepted ...

-- Check top_referrer badge (10+ referrals) on new match
-- create trigger on_match_created ...


-- ============================================================
-- SCHEDULED JOBS (pg_cron)
-- ============================================================

-- Pipeline reminder cadence:
--   48hr: in-app notification only
--   7d:   in-app + email to insider
--   14d:  in-app + email to insider
--   18d:  match flagged stale, seeker notified in-app, insider emailed
--
-- select cron.schedule(
--   'pipeline-reminders-daily',
--   '0 9 * * *',
--   $$ select check_pipeline_reminders() $$
-- );
