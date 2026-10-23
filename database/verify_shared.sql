-- LOCAL TEST DATABASE ONLY. Never run fixture scripts on the hosted project.
begin;
do $$begin
  assert current_setting('table_activity.local_test',true)='on', 'Use the local database test runner';
end $$;
insert into auth.users(id,email) values
 ('11111111-1111-4111-8111-111111111111','activity-test-a@example.invalid'),
 ('22222222-2222-4222-8222-222222222222','activity-test-b@example.invalid'),
 ('33333333-3333-4333-8333-333333333333','activity-test-c@example.invalid');
insert into activity_private.account_access(member_id,owner_id) values
 ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select * from public.save_activity_batch('[{"date":"2020-01-01","rows":["3"],"times":["11a","1130a"],"grid":[[true,false]],"expected_revision":0}]');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$begin
  assert (select count(*)=1 from public.activity_days), 'Shared login must read the owner record';
  assert (select grid='[[true,false]]'::jsonb from public.activity_days), 'Shared login must read the same cells';
  assert public.activity_owner_id()='11111111-1111-4111-8111-111111111111', 'Shared writes must resolve the owner';
  begin
    insert into activity_private.account_access(member_id,owner_id) values(auth.uid(),'33333333-3333-4333-8333-333333333333');
    raise exception 'Client granted itself access';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.activity_days set grid='[[false,false]]';
    raise exception 'Direct client update succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;
select * from public.save_activity_batch('[{"date":"2020-01-01","rows":["3"],"times":["11a","1130a"],"grid":[[false,true]],"expected_revision":1}]');
select * from public.save_activity_batch('[{"date":"2020-01-02","rows":["3"],"times":["11a"],"grid":[[true]],"expected_revision":0}]');
select * from public.archive_activity_day('2020-01-01',2,true);
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$begin
  assert (select count(*)=2 from public.activity_days), 'Owner must see days created by shared login';
  assert (select grid='[[false,true]]'::jsonb and archived and revision=3 from public.activity_days where date='2020-01-01'), 'Owner must see shared edits and archives';
  begin
    perform public.save_activity_batch('[{"date":"2020-01-01","rows":["3"],"times":["11a"],"grid":[[true]],"expected_revision":1}]');
    raise exception 'Owner overwrote a shared edit with a stale revision';
  exception when raise_exception then
    if sqlerrm not like 'Another device changed%' then raise; end if;
  end;
end $$;
select * from public.archive_activity_day('2020-01-01',3,false);
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $$begin
  assert (select count(*)=0 from public.activity_days), 'Unlinked login must not read the shared data';
  begin
    perform public.archive_activity_day('2020-01-01',4,true);
    raise exception 'Unlinked login archived shared data';
  exception when raise_exception then
    if sqlerrm not like 'This day changed%' then raise; end if;
  end;
end $$;
select * from public.save_activity_batch('[{"date":"2020-01-01","rows":["3"],"times":["11a"],"grid":[[false]],"expected_revision":0}]');
reset role;
do $$begin
  assert (select count(*)=3 from public.activity_days), 'Shared login must not create duplicate owner datasets';
  assert not exists(select 1 from public.activity_days where user_id='22222222-2222-4222-8222-222222222222'), 'Shared writes must stay under the existing owner';
end $$;
delete from activity_private.account_access where member_id='22222222-2222-4222-8222-222222222222';
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$begin
  assert (select count(*)=0 from public.activity_days), 'Revoking membership must remove access';
end $$;
reset role;
do $$begin
  assert not has_schema_privilege('authenticated','activity_private','USAGE'), 'Membership schema must be private';
  assert not has_table_privilege('authenticated','activity_private.account_access','INSERT'), 'Clients must not grant membership';
  assert not has_table_privilege('anon','public.activity_days','SELECT'), 'Anonymous reads must be denied';
  assert not has_function_privilege('anon','public.activity_owner_id()','EXECUTE'), 'Anonymous owner lookup must be denied';
  assert not has_function_privilege('anon','public.save_activity_batch(jsonb)','EXECUTE'), 'Anonymous saves must be denied';
  assert not has_function_privilege('anon','public.archive_activity_day(date,integer,boolean)','EXECUTE'), 'Anonymous archives must be denied';
end $$;
reset role;
rollback;
select 'PASS: shared reads, writes, archives, restoration, stale revisions, isolation, membership protection and revocation. Local fixtures rolled back.' as verification;
