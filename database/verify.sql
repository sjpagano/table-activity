-- LOCAL TEST DATABASE ONLY. All fixtures are rolled back, including auth users.
begin;
do $$begin
  assert current_setting('table_activity.local_test',true)='on', 'Use the local database test runner';
end $$;
insert into auth.users(id,email) values
 ('11111111-1111-4111-8111-111111111111','activity-test-a@example.invalid'),
 ('22222222-2222-4222-8222-222222222222','activity-test-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select * from public.save_activity_batch('[{"date":"2020-01-01","rows":["3"],"times":["11a","1130a"],"grid":[[true,false]],"expected_revision":0}]');
do $$begin
  assert (select count(*)=1 from public.activity_days), 'Owner must see own record';
  assert (select grid->0->1='false'::jsonb from public.activity_days), 'Blanks must be explicitly preserved';
  begin
    perform public.save_activity_batch('[{"date":"2020-01-01","rows":["3"],"times":["11a","1130a"],"grid":[[false,false]],"expected_revision":0}]');
    raise exception 'Stale revision was accepted';
  exception when raise_exception then
    if sqlerrm not like 'Another device changed%' then raise; end if;
  end;
  begin
    perform public.save_activity_batch('[{"date":"2020-01-02","rows":["3"],"times":["11a"],"grid":[[true]],"expected_revision":0},{"date":"2020-01-03","rows":["3"],"times":["11a"],"grid":[["X"]],"expected_revision":0}]');
    raise exception 'Malformed grid was accepted';
  exception when check_violation then null;
  end;
  assert (select count(*)=1 from public.activity_days), 'Failed batch must roll back every day';
end $$;
select * from public.archive_activity_day('2020-01-01',1,true);
select * from public.archive_activity_day('2020-01-01',2,false);
do $$begin
  assert (select revision=3 and not archived from public.activity_days), 'Archive and restore must increment revision';
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$begin
  assert (select count(*)=0 from public.activity_days), 'Another owner must see no records';
end $$;
select * from public.save_activity_batch('[{"date":"2020-01-01","rows":["3"],"times":["11a"],"grid":[[false]],"expected_revision":0}]');
do $$begin
  assert (select count(*)=1 from public.activity_days), 'Same date must be independent between owners';
  assert not has_table_privilege('authenticated','public.activity_days','UPDATE'), 'Direct updates must be denied';
  assert not has_table_privilege('anon','public.activity_days','SELECT'), 'Anonymous reads must be denied';
  assert not has_function_privilege('anon','public.save_activity_batch(jsonb)','EXECUTE'), 'Anonymous saves must be denied';
end $$;
reset role;
rollback;
select 'PASS: owner isolation, explicit blanks, same-date separation, stale writes, atomic batches, archive/restore and anonymous denial. All fixtures rolled back.' as verification;
