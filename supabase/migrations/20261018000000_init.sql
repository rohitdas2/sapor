-- Sapor initial schema. Catalog, personal tracking, rankings and public content
-- are separate tables. Row-level security is the access-control boundary.
-- NOTE: written for Supabase Postgres; not yet applied to a live project.

create extension if not exists pgcrypto;

-- ---------- enums ----------
create type availability_status as enum ('unknown', 'active', 'seasonal', 'discontinued');
create type track_status as enum ('want_to_try', 'tried');
create type visibility as enum ('private', 'public');
create type media_type as enum ('image', 'video'); -- 'video' reserved; not used yet

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_url text,
  bio text check (char_length(bio) <= 160),
  pinned_collection_id uuid, -- FK added after collections exists
  is_admin boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

-- Create a profile row for every new auth user.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'New taster'));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- ---------- catalog ----------
create table public.retailers (
  id text primary key,
  name text not null,
  slug text not null unique
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  retailer_id text not null references public.retailers (id),
  name text not null,
  slug text not null,
  category text not null check (category in ('frozen-meals','snacks','desserts','sauces','bakery','drinks')),
  description text not null default '',
  image_path text, -- Supabase Storage path in bucket 'product-images', or null for placeholder
  emoji text, -- illustration shown until a permitted photo exists
  availability availability_status not null default 'unknown',
  source_url text,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (retailer_id, slug)
);
create index products_category_idx on public.products (category);
create index products_name_search_idx on public.products using gin (to_tsvector('english', name || ' ' || description));

-- ---------- personal tracking (private) ----------
create table public.user_products (
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  status track_status not null,
  notes text check (char_length(notes) <= 2000),
  first_tried_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

-- ---------- collections / rankings ----------
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  description text check (char_length(description) <= 280),
  visibility visibility not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index collections_owner_idx on public.collections (owner_id);

alter table public.profiles
  add constraint profiles_pinned_collection_fk
  foreign key (pinned_collection_id) references public.collections (id) on delete set null;

create table public.collection_items (
  collection_id uuid not null references public.collections (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  position integer check (position >= 0), -- null = added but not yet placed
  tied_with_prev boolean not null default false, -- shares a rank with the item above
  added_at timestamptz not null default now(),
  primary key (collection_id, product_id), -- no duplicates within a collection
  unique (collection_id, position) deferrable initially deferred -- nulls (unplaced) are allowed
);

-- ---------- reviews ----------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 2000),
  visibility visibility not null default 'public',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (author_id, product_id) -- one editable review per user + product
);
-- Answers from guided placement ("which did you prefer?"). Private to the user.
create table public.comparisons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  collection_id uuid not null references public.collections (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  other_product_id uuid not null references public.products (id) on delete cascade,
  result text not null check (result in ('prefer_this','prefer_that','same','unsure')),
  created_at timestamptz not null default now()
);
alter table public.comparisons enable row level security;
create policy "own comparisons" on public.comparisons for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create index reviews_product_idx on public.reviews (product_id, created_at desc);

create table public.review_media (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews (id) on delete cascade,
  storage_path text not null, -- bucket 'review-media', path '<user_id>/<uuid>.<ext>'
  media_type media_type not null default 'image',
  display_order smallint not null default 0
);

-- ---------- updated_at ----------
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger t_products before update on public.products for each row execute function public.touch_updated_at();
create trigger t_user_products before update on public.user_products for each row execute function public.touch_updated_at();
create trigger t_collections before update on public.collections for each row execute function public.touch_updated_at();
create trigger t_reviews before update on public.reviews for each row execute function public.touch_updated_at();

-- ---------- row-level security ----------
alter table public.profiles enable row level security;
alter table public.retailers enable row level security;
alter table public.products enable row level security;
alter table public.user_products enable row level security;
alter table public.collections enable row level security;
alter table public.collection_items enable row level security;
alter table public.reviews enable row level security;
alter table public.review_media enable row level security;

-- Profiles: public fields readable by all; is_admin is not user-editable.
create policy "profiles readable" on public.profiles for select using (true);
create policy "own profile update" on public.profiles for update using (id = auth.uid())
  with check (id = auth.uid() and is_admin = public.is_admin()); -- security-definer fn avoids policy recursion

-- Catalog: read for everyone, write for admins only.
create policy "retailers readable" on public.retailers for select using (true);
create policy "products readable" on public.products for select using (true);
create policy "products admin write" on public.products for all using (public.is_admin()) with check (public.is_admin());

-- Tracking: strictly owner-only.
create policy "own tracking" on public.user_products for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Collections: public ones readable by all; owner has full access.
create policy "collections readable" on public.collections for select using (visibility = 'public' or owner_id = auth.uid());
create policy "own collections write" on public.collections for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "items readable" on public.collection_items for select using (
  exists (select 1 from public.collections c where c.id = collection_id and (c.visibility = 'public' or c.owner_id = auth.uid())));
create policy "own items write" on public.collection_items for all using (
  exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = auth.uid()));

-- Reviews: public ones readable by all; author has full access.
create policy "reviews readable" on public.reviews for select using (visibility = 'public' or author_id = auth.uid());
create policy "own reviews write" on public.reviews for all using (author_id = auth.uid()) with check (author_id = auth.uid());

create policy "media readable" on public.review_media for select using (
  exists (select 1 from public.reviews r where r.id = review_id and (r.visibility = 'public' or r.author_id = auth.uid())));
create policy "own media write" on public.review_media for all using (
  exists (select 1 from public.reviews r where r.id = review_id and r.author_id = auth.uid()))
  with check (exists (select 1 from public.reviews r where r.id = review_id and r.author_id = auth.uid()));

-- Pinned collection must be the user's own public collection.
create function public.check_pinned_collection() returns trigger language plpgsql as $$
begin
  if new.pinned_collection_id is not null and not exists (
    select 1 from public.collections c
    where c.id = new.pinned_collection_id and c.owner_id = new.id and c.visibility = 'public') then
    raise exception 'Only your own public collections can be pinned';
  end if;
  return new;
end $$;
create trigger t_profiles_pin before insert or update of pinned_collection_id on public.profiles
  for each row execute function public.check_pinned_collection();

-- Unpin when a collection goes private.
create function public.unpin_private_collection() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.visibility = 'private' then
    update public.profiles set pinned_collection_id = null where pinned_collection_id = new.id;
  end if;
  return new;
end $$;
create trigger t_collections_unpin after update of visibility on public.collections
  for each row execute function public.unpin_private_collection();

-- ---------- community picks ----------
-- Products in the top 3 (competition rank, ties share a rank) of public rankings.
create view public.community_top_picks with (security_invoker = true) as
  with placed as (
    select ci.product_id, c.owner_id, c.id as collection_id, ci.position, ci.tied_with_prev
    from public.collection_items ci join public.collections c on c.id = ci.collection_id
    where c.visibility = 'public' and ci.position is not null
  )
  select product_id, count(distinct owner_id)::int as top_three_count
  from (
    select p.product_id, p.owner_id,
      -- rank = 1 + items above the head of this item's tie group
      1 + (select count(*) from placed q where q.collection_id = p.collection_id
             and q.position < coalesce((select max(h.position) from placed h where h.collection_id = p.collection_id
                                        and h.position <= p.position and not h.tied_with_prev), p.position)) as rank
    from placed p
  ) r
  where rank <= 3
  group by product_id;
grant select on public.community_top_picks to anon, authenticated;

-- ---------- atomic collection operations ----------
-- Save the confirmed order of placed items in one transaction.
-- p_order: [{"product_id": uuid, "tied_with_prev": bool}, ...]. Items not listed become unplaced.
create function public.save_collection_order(p_collection_id uuid, p_order jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  perform 1 from collections where id = p_collection_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Not your collection'; end if;
  if (select count(*) from jsonb_array_elements(p_order) e
        where not exists (select 1 from collection_items ci
                          where ci.collection_id = p_collection_id and ci.product_id = (e ->> 'product_id')::uuid))
     > 0 or (select count(distinct e ->> 'product_id') from jsonb_array_elements(p_order) e) <> jsonb_array_length(p_order) then
    raise exception 'Order does not match collection contents';
  end if;
  update collection_items set position = null, tied_with_prev = false where collection_id = p_collection_id;
  update collection_items ci set position = o.idx - 1, tied_with_prev = (o.idx > 1 and coalesce((o.e ->> 'tied_with_prev')::boolean, false))
    from jsonb_array_elements(p_order) with ordinality as o(e, idx)
    where ci.collection_id = p_collection_id and ci.product_id = (o.e ->> 'product_id')::uuid;
  update collections set updated_at = now() where id = p_collection_id;
end $$;

-- Add unplaced; the first item in an empty ranking becomes its starting entry. Returns whether placed.
create function public.add_to_collection(p_collection_id uuid, p_product_id uuid) returns boolean
language plpgsql security invoker set search_path = public as $$
declare
  is_placed boolean;
begin
  perform 1 from collections where id = p_collection_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Not your collection'; end if;
  select position is not null into is_placed from collection_items where collection_id = p_collection_id and product_id = p_product_id;
  if found then return is_placed; end if;
  is_placed := not exists (select 1 from collection_items where collection_id = p_collection_id and position is not null);
  insert into collection_items (collection_id, product_id, position) values (p_collection_id, p_product_id, case when is_placed then 0 end);
  update collections set updated_at = now() where id = p_collection_id;
  return is_placed;
end $$;

-- Remove a product, close the gap, and keep ties intact.
create function public.remove_from_collection(p_collection_id uuid, p_product_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare
  removed record;
begin
  perform 1 from collections where id = p_collection_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Not your collection'; end if;
  delete from collection_items where collection_id = p_collection_id and product_id = p_product_id returning * into removed;
  if removed.position is not null and not removed.tied_with_prev then
    -- If the next item was tied to the removed group head, it becomes the head.
    update collection_items set tied_with_prev = false
      where collection_id = p_collection_id and position = removed.position + 1;
  end if;
  update collection_items ci set position = r.rn - 1
    from (select product_id, row_number() over (order by position) rn
          from collection_items where collection_id = p_collection_id and position is not null) r
    where ci.collection_id = p_collection_id and ci.product_id = r.product_id;
  update collection_items set tied_with_prev = false where collection_id = p_collection_id and position = 0;
  update collections set updated_at = now() where id = p_collection_id;
end $$;

-- ---------- storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('product-images', 'product-images', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('review-media', 'review-media', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "product images admin write" on storage.objects for all
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());

-- Users upload only into their own folder: review-media/<uid>/...
create policy "review media own upload" on storage.objects for insert
  with check (bucket_id = 'review-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "review media own delete" on storage.objects for delete
  using (bucket_id = 'review-media' and (storage.foldername(name))[1] = auth.uid()::text);
-- NOTE: review-media is a public bucket for simple CDN URLs. Paths are unguessable UUIDs,
-- but a photo on a review later switched to private stays reachable by direct URL.
-- Switch to a private bucket + signed URLs before launch if that matters.
