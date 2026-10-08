-- Reader-added tropes and content warnings.
--
-- In the review form, whatever the reader types can be added as a tag. If it matches an
-- existing tag (same slug, or same name ignoring case), that tag is used; otherwise a new
-- one is created in the "Added by readers" category, visible to everyone.
--
-- tag_slug() must produce the same slug as slugifyTag() in src/lib/tags.ts (it reproduces
-- every slug in supabase/data/*.csv).

create extension if not exists unaccent with schema extensions;

alter table public.tags
  add column created_by uuid references auth.users (id) on delete set null; -- null for the built-in lists

create index tags_kind_lower_name_idx on public.tags (kind, lower(name));

-- "Brother's Best Friend" -> "brothers-best-friend", "Ménage" -> "menage"
create or replace function public.tag_slug(p_name text)
returns text
language sql
stable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(
    replace(replace(replace(lower(extensions.unaccent(coalesce(p_name, ''))), '&', ' and '), '''', ''), '’', ''),
    '[^a-z0-9]+', '-', 'g'
  ));
$$;

------------------------------------------------------------------------------
-- ensure_tag: the id of the tag matching a typed name, creating it if needed.
-- Security definer because readers can't insert into tags directly.
------------------------------------------------------------------------------

create or replace function public.ensure_tag(p_kind public.tag_kind, p_name text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_slug text := public.tag_slug(v_name);
  v_id integer;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if length(v_name) < 2 or length(v_name) > 40 or length(v_slug) < 2 then
    raise exception 'Tags must be 2 to 40 characters and include letters or numbers' using errcode = '22023';
  end if;

  select id into v_id from public.tags
  where kind = p_kind and (slug = v_slug or lower(name) = lower(v_name))
  order by (slug = v_slug) desc
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.tags (kind, slug, name, category, position, created_by)
  values (p_kind, v_slug, v_name, 'Added by readers', 1000000, v_uid)
  on conflict (kind, slug) do nothing
  returning id into v_id;

  if v_id is null then -- created by someone else at the same moment
    select id into v_id from public.tags where kind = p_kind and slug = v_slug;
  end if;
  return v_id;
end;
$$;

revoke execute on function public.ensure_tag(public.tag_kind, text) from public, anon;
grant execute on function public.ensure_tag(public.tag_kind, text) to authenticated;

------------------------------------------------------------------------------
-- save_review: now also takes typed names for tags that may not exist yet.
-- (Dropped and recreated: a second overload would make the API call ambiguous.)
------------------------------------------------------------------------------

drop function if exists public.save_review(uuid, smallint, text, text[], text[]);

create or replace function public.save_review(
  p_book_id uuid,
  p_rating smallint,
  p_body text,
  p_tropes text[] default '{}',       -- slugs of existing tags
  p_warnings text[] default '{}',
  p_new_tropes text[] default '{}',   -- typed names; matched to existing tags or created
  p_new_warnings text[] default '{}'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_body text := nullif(trim(coalesce(p_body, '')), '');
  v_tag_ids integer[] := '{}';
  v_name text;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_tropes), 0) + coalesce(cardinality(p_new_tropes), 0) > 50
     or coalesce(cardinality(p_warnings), 0) + coalesce(cardinality(p_new_warnings), 0) > 50 then
    raise exception 'Choose at most 50 tropes and 50 content warnings' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_new_tropes), 0) > 10 or coalesce(cardinality(p_new_warnings), 0) > 10 then
    raise exception 'Add at most 10 new tropes and 10 new content warnings per review' using errcode = '22023';
  end if;

  select id into v_id from public.reviews where user_id = v_uid and book_id = p_book_id;
  if v_id is null then
    insert into public.reviews (book_id, rating, body) values (p_book_id, p_rating, v_body)
    returning id into v_id;
  else
    update public.reviews set rating = p_rating, body = v_body where id = v_id;
  end if;

  foreach v_name in array coalesce(p_new_tropes, '{}') loop
    v_tag_ids := v_tag_ids || public.ensure_tag('trope', v_name);
  end loop;
  foreach v_name in array coalesce(p_new_warnings, '{}') loop
    v_tag_ids := v_tag_ids || public.ensure_tag('content_warning', v_name);
  end loop;

  delete from public.review_tags where review_id = v_id;
  insert into public.review_tags (review_id, tag_id)
  select distinct v_id, t.id
  from public.tags t
  where (t.kind = 'trope' and t.slug = any (coalesce(p_tropes, '{}')))
     or (t.kind = 'content_warning' and t.slug = any (coalesce(p_warnings, '{}')))
     or t.id = any (v_tag_ids);

  return v_id;
end;
$$;

revoke execute on function public.save_review(uuid, smallint, text, text[], text[], text[], text[]) from public, anon;
grant execute on function public.save_review(uuid, smallint, text, text[], text[], text[], text[]) to authenticated;
