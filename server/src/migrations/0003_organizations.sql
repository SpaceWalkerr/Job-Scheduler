-- Organizations tenancy tier: projects live under an organization.

create table if not exists organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  owner_user_id uuid not null references users(id) on delete cascade,
  created_at    timestamptz not null default now()
);

create table if not exists organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  role            text not null default 'member' check (role in ('owner', 'member')),
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists idx_org_members_user on organization_members (user_id);

-- Backfill (idempotent, no-op on a fresh DB): give each user a personal org, then place
-- any org-less project into its creator's personal org. Column is added nullable, filled,
-- then made NOT NULL so the invariant holds for all future rows.
alter table projects add column if not exists organization_id uuid references organizations(id) on delete cascade;

insert into organizations (name, owner_user_id)
select 'Personal', u.id from users u
where not exists (select 1 from organizations o where o.owner_user_id = u.id);

insert into organization_members (organization_id, user_id, role)
select o.id, o.owner_user_id, 'owner' from organizations o
on conflict (organization_id, user_id) do nothing;

update projects p
set organization_id = (
  select o.id from organizations o
  where o.owner_user_id = p.user_id
  order by o.created_at
  limit 1
)
where p.organization_id is null;

alter table projects alter column organization_id set not null;

create index if not exists idx_projects_org on projects (organization_id);
