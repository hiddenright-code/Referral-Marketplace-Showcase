# Architecture Overview

MRN is a mobile-first web application built as a two-sided marketplace connecting Muslim job seekers with insiders at target companies.

## Stack

- **Frontend + Routing:** Next.js 16 (React, client-side rendering, file-based routing)
- **Database:** Supabase (PostgreSQL 15+ with Row Level Security)
- **Auth:** Supabase Auth (email/password with email confirmation)
- **Real-time:** Supabase Realtime (Postgres Changes for live chat)
- **Storage:** Supabase Storage (avatar uploads, public bucket)
- **Email:** Resend (transactional email via API, branded HTML templates)
- **Scheduling:** pg_cron (pipeline reminder cadence, match history cleanup)

## Data Flow

```
Seeker browses companies
    |
    v
Seeker sends pitch (rate limited, cooldown enforced)
    |
    v
Pitch lands in insider's queue (InsiderPitches component)
    |
    v
Insider accepts or declines
    |
    |-- Accept --> on_pitch_accepted trigger creates match
    |               |
    |               v
    |             Match enters pipeline (matched -> submitted -> interviewing -> hired)
    |               |
    |               v
    |             Private chat opens (real-time via Supabase Realtime)
    |               |
    |               v
    |             Pipeline reminders fire at 48hr / 7d / 14d / 18d via pg_cron
    |
    |-- Decline --> Seeker notified in-app + email with decline reasons
```

## Key Design Decisions

**RLS everywhere.** Every table has row-level security policies. Users can only access their own data, plus data from users they have an active pitch or match relationship with. No client-side trust.

**RPC over N+1.** The `get_matches_with_meta` function returns matches with unread counts, last message preview, and participant info in a single query. This replaced individual queries per match that would degrade at scale.

**Source-of-truth split.** Pipeline stages are updated by the side that has ground truth: insiders mark "submitted" (they filed the referral), seekers mark "interviewing" and "hired" (they received the callback). Neither side can update the other's stages.

**Insider as scarce resource.** Rate limiting, company cooldowns, and insider-controlled chat all protect the supply side of the marketplace. Every guardrail is designed to prevent insider burnout and churn.

**Fire-and-forget email with preference check.** The `/api/send-notification` route checks the recipient's notification_settings before sending. If the user has opted out of email for that event type, the route returns early. Email sends are non-blocking on the client so UI stays responsive.

## Security Model

- Row Level Security on all tables (enforced at database level, not application level)
- SECURITY DEFINER on RPC functions with explicit `SET search_path = public`
- Service role key used only in server-side API routes, never exposed to client
- Supabase anon key used on client (safe, scoped by RLS)
- Badge-based rate limiting (client-side for v1, server-side enforcement planned for v2)
- Name change logging with auto-flag after 2+ changes in 365 days
- Full account deletion purges all downstream data in correct foreign key order

## File Organization

```
app/
  page.js                          -- App shell, auth check, role/page routing
  login/page.js                    -- Login with error handling
  register/page.js                 -- Registration with password rules, ToS
  onboarding/page.js               -- Multi-step onboarding flow
  chat/page.js                     -- Real-time private chat
  auth/callback/page.js            -- Email confirmation handler
  forgot-password/page.js          -- Password reset request
  reset-password/page.js           -- Password reset form
  terms/page.js                    -- Terms of Service
  privacy/page.js                  -- Privacy Policy
  settings/
    notifications/page.js          -- Per-event notification preferences
    halal-preferences/page.js      -- Halal workplace filters
    account/page.js                -- Password change, account deletion
  components/
    BottomNav.jsx                   -- Navigation with unread badges
    RoleToggle.jsx                  -- Insider/seeker mode switch
    InsiderFeed.jsx                 -- Talent feed with filters
    InsiderMatches.jsx              -- Insider matches + pipeline
    InsiderProfile.jsx              -- Editable insider profile
    InsiderPitches.jsx              -- Incoming pitches (accept/decline)
    SeekerCompanies.jsx             -- Company directory
    SeekerMatches.jsx               -- Seeker matches + pipeline
    SeekerProfile.jsx               -- Editable seeker profile
    ChatsPage.jsx                   -- Chat list overlay
    PitchSheet.jsx                  -- Pitch form with rate limiting
  api/
    send-notification/route.js      -- Resend email API
lib/
  supabase.js                       -- Supabase client init
  constants.js                      -- Shared constants
  badges.js                         -- Dynamic badge generation
```
