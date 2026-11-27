-- PBTRKR News: independent articles plus visitor tracking in shared visitors table.
-- Project: qyhzxfserrvsgutfhyel. Safe additive migration; existing clinics and main-app visitor data stay intact.
create table if not exists public.news_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 180),
  slug text not null unique,
  description text not null default '' check (char_length(description) <= 1000),
  image_url text,
  image_alt text,
  body_text text not null default '',
  body_html text not null default '',
  author_name text check (author_name is null or author_name in ('Max Hydell','Mark Mvanchan')),
  source_author text,
  category text not null default 'Pickleball',
  status text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz,
  source_name text not null default 'PBTRKR',
  source_url text,
  source_article_id text,
  original_html text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint news_articles_published_date check (status <> 'published' or published_at is not null)
);
create index if not exists news_articles_published_at_idx on public.news_articles(published_at desc) where status='published';
create index if not exists news_articles_created_at_idx on public.news_articles(created_at desc);
create unique index if not exists news_articles_source_url_unique_idx on public.news_articles(source_url) where source_url is not null;
create unique index if not exists news_articles_source_id_unique_idx on public.news_articles(source_article_id) where source_article_id is not null;
alter table public.news_articles enable row level security;
drop policy if exists "Anyone can read published news" on public.news_articles;
create policy "Anyone can read published news" on public.news_articles for select to anon,authenticated using(status='published');
drop policy if exists "News admins can read all articles" on public.news_articles;
create policy "News admins can read all articles" on public.news_articles for select to authenticated using((select auth.jwt()->'app_metadata'->>'role') in ('clinic_admin','pbtrkr_admin'));
drop policy if exists "News admins can insert articles" on public.news_articles;
create policy "News admins can insert articles" on public.news_articles for insert to authenticated with check((select auth.jwt()->'app_metadata'->>'role') in ('clinic_admin','pbtrkr_admin'));
drop policy if exists "News admins can update articles" on public.news_articles;
create policy "News admins can update articles" on public.news_articles for update to authenticated using((select auth.jwt()->'app_metadata'->>'role') in ('clinic_admin','pbtrkr_admin')) with check((select auth.jwt()->'app_metadata'->>'role') in ('clinic_admin','pbtrkr_admin'));
drop policy if exists "News admins can delete articles" on public.news_articles;
create policy "News admins can delete articles" on public.news_articles for delete to authenticated using((select auth.jwt()->'app_metadata'->>'role') in ('clinic_admin','pbtrkr_admin'));
grant select on public.news_articles to anon,authenticated;
grant insert,update,delete on public.news_articles to authenticated;

alter table public.visitors add column if not exists news_article_id uuid;
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.visitors'::regclass and conname='visitors_news_article_id_fkey') then
    alter table public.visitors add constraint visitors_news_article_id_fkey foreign key(news_article_id) references public.news_articles(id) on delete cascade;
  end if;
end $$;
create index if not exists visitors_news_article_id_time_idx on public.visitors(news_article_id,"time" desc) where news_article_id is not null;
-- Preserve the existing generic clinic insert rule while requiring news visits to target published stories.
drop policy if exists "News visitor inserts require published article" on public.visitors;
create policy "News visitor inserts require published article" on public.visitors as restrictive for insert to public
  with check (news_article_id is null or exists (select 1 from public.news_articles article where article.id = visitors.news_article_id and article.status = 'published'));

-- Clinics visitor rows have news_article_id NULL and continue to satisfy this restrictive rule.

-- Publicly readable image bucket; uploads and mutations require trusted PBTRKR admin role.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('news-media','news-media',true,8388608,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Public can view PBTRKR news media" on storage.objects;
create policy "Public can view PBTRKR news media" on storage.objects for select to anon,authenticated using (bucket_id='news-media');
drop policy if exists "PBTRKR news admins upload media" on storage.objects;
create policy "PBTRKR news admins upload media" on storage.objects for insert to authenticated with check (bucket_id='news-media' and (select auth.jwt()->'app_metadata'->>'role') in ('clinic_admin','pbtrkr_admin'));
drop policy if exists "PBTRKR news admins update media" on storage.objects;
create policy "PBTRKR news admins update media" on storage.objects for update to authenticated using (bucket_id='news-media' and (select auth.jwt()->'app_metadata'->>'role') in ('clinic_admin','pbtrkr_admin')) with check (bucket_id='news-media' and (select auth.jwt()->'app_metadata'->>'role') in ('clinic_admin','pbtrkr_admin'));
drop policy if exists "PBTRKR news admins delete media" on storage.objects;
create policy "PBTRKR news admins delete media" on storage.objects for delete to authenticated using (bucket_id='news-media' and (select auth.jwt()->'app_metadata'->>'role') in ('clinic_admin','pbtrkr_admin'));
