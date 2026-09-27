-- report.voice_pivot — the VOICE cube engine (parallel to report.intel_pivot for chat).
-- Cross-tab any two whitelisted dims of report.call_drill (call_base axes + the
-- transferred/voicemail flags + the folded-in resolution/revenue/category/flavor) into
-- anon-safe counts + a negative-sentiment count. Injection-proof: the dim name is mapped
-- to a fixed column expression by report._vpivot_col (a whitelist), never interpolated
-- raw, so no user text reaches the SQL. Powers ExploreCube source="voice".

create or replace function report._vpivot_col(dim text) returns text language sql immutable as $$
  select case lower(dim)
    when 'section'     then 'section'
    when 'sentiment'   then 'sentiment'
    when 'pinchpoint'  then 'pinchpoint'
    when 'urgency'     then 'urgency'
    when 'handover'    then 'handover'
    when 'resolution'  then 'resolution'
    when 'revenue'     then 'revenue'
    when 'category'    then 'category'
    when 'flavor'      then 'flavor'
    when 'hour'        then 'hour_local::text'
    when 'city'        then 'from_city'
    when 'region'      then 'from_region'
    when 'country'     then 'from_country'
    when 'transferred' then $x$case when transferred then 'Escalated' else 'AI resolved' end$x$
    when 'voicemail'   then $x$case when not transferred then 'No transfer' when is_voicemail then 'Voicemail' else 'Reached a person' end$x$
    else null
  end
$$;

create or replace function report.voice_pivot(
    p_bot int, p_from date, p_to date, p_dim_a text, p_dim_b text default null
  ) returns table(a text, b text, conversations bigint, negative bigint)
  language plpgsql security definer stable set search_path = report, pg_temp as $fn$
  declare col_a text; col_b text; q text;
  begin
    col_a := report._vpivot_col(p_dim_a);
    if col_a is null then raise exception 'unknown dimension: %', p_dim_a; end if;
    if p_dim_b is not null and p_dim_b <> '' then
      col_b := report._vpivot_col(p_dim_b);
      if col_b is null then raise exception 'unknown dimension: %', p_dim_b; end if;
    end if;
    q := format($q$
      select coalesce((%s)::text, '(none)') a, %s b,
             count(*)::bigint,
             count(*) filter (where sentiment = 'Negative')::bigint
        from report.call_drill
       where bot_id = $1 and substantive and day between $2 and $3
       group by 1, 2$q$,
      col_a,
      case when col_b is null then $$''::text$$
           else format($$coalesce((%s)::text, '(none)')$$, col_b) end);
    return query execute q using p_bot, p_from, p_to;
  end $fn$;

grant execute on function report.voice_pivot(int, date, date, text, text) to anon, authenticated;
notify pgrst, 'reload schema';
