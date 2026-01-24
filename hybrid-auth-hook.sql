--
-- CueStack Auth Hook
-- 基于 slack-clone 的 custom_access_token_hook
-- 添加 user_role 到 JWT claims 以支持 RBAC
--

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
  declare
    claims jsonb;
    user_role public.app_role;
  begin
    -- Check if the user is marked as admin/moderator
    select role into user_role from public.user_roles where user_id = (event->>'user_id')::uuid;

    claims := event->'claims';

    if user_role is not null then
      -- Set the claim
      claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
    else 
      claims := jsonb_set(claims, '{user_role}', 'null');
    end if;

    -- Update the 'claims' object in the original event
    event := jsonb_set(event, '{claims}', claims);

    -- Return the modified or original event
    return event;
  end;
$$;

grant usage on schema public to supabase_auth_admin;

grant execute
  on function public.custom_access_token_hook
  to supabase_auth_admin;

revoke execute
  on function public.custom_access_token_hook
  from authenticated, anon;

grant all
  on table public.user_roles
to supabase_auth_admin;

revoke all
  on table public.user_roles
  from authenticated, anon;

create policy "Allow auth admin to read user roles" ON public.user_roles
as permissive for select
to supabase_auth_admin
using (true);
