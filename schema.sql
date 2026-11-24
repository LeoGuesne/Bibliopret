-- À coller dans Supabase > SQL Editor > Run
create table profiles(
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  code text unique not null default substr(md5(random()::text),1,8));
create table connections(
  a uuid references profiles on delete cascade,
  b uuid references profiles on delete cascade,
  primary key(a,b));
create table books(
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references profiles on delete cascade default auth.uid(),
  isbn text, title text not null, authors text, cover_url text,
  is_comic boolean default false,
  lent_to uuid references profiles,
  request_by uuid references profiles,
  created_at timestamptz default now(),
  unique(owner,isbn));

alter table profiles enable row level security;
alter table connections enable row level security;
alter table books enable row level security;

create policy "voir moi et mes amis" on profiles for select using (
  id=auth.uid() or exists(select 1 from connections where a=auth.uid() and b=profiles.id));
create policy "modifier mon profil" on profiles for update using (id=auth.uid());
create policy "voir mes connexions" on connections for select using (a=auth.uid());
create policy "voir mes livres et ceux de mes amis" on books for select using (
  owner=auth.uid() or exists(select 1 from connections where a=auth.uid() and b=books.owner));
create policy "ajouter un livre" on books for insert with check (owner=auth.uid());
create policy "modifier mes livres" on books for update using (owner=auth.uid());
create policy "supprimer mes livres" on books for delete using (owner=auth.uid());

-- Profil créé automatiquement à l'inscription
create function new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into profiles(id,name) values(new.id,split_part(new.email,'@',1)); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function new_user();

-- Ouvrir un lien d'invitation : crée le contact dans les deux sens
create function accept_invite(c text) returns text language plpgsql security definer set search_path=public as $$
declare p profiles;
begin
  select * into p from profiles where code=c;
  if p.id is null or p.id=auth.uid() then return null; end if;
  insert into connections values(auth.uid(),p.id),(p.id,auth.uid()) on conflict do nothing;
  return p.name;
end $$;

-- Un ami demande à emprunter un livre
create function request_book(bid uuid) returns void language sql security definer set search_path=public as $$
  update books set request_by=auth.uid()
  where id=bid and lent_to is null and request_by is null
    and exists(select 1 from connections where a=auth.uid() and b=books.owner);
$$;
