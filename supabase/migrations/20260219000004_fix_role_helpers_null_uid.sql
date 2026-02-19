-- Fix: avoid RLS infinite recursion / unnecessary lookups when auth.uid() is NULL
-- Applies to role helper functions used across RLS / RPC checks.

create or replace function public.has_role(p_role text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  return exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role = p_role
  );
end;
$$;

create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  return public.has_role('admin');
end;
$$;

create or replace function public.is_moderator_or_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  return public.has_role('admin') or public.has_role('moderator');
end;
$$;