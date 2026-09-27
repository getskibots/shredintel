-- report.intel_pivot — the Explore CUBE engine. Cross-tab ANY two whitelisted
-- dimensions of report.conversation_time for one bot + window. Anon-safe (counts +
-- negative only, SECURITY DEFINER) and injection-proof: the dimension name is mapped
-- through report._pivot_col to a fixed column expression, so no user text ever reaches
-- the dynamic SQL. dim_b NULL → a 1-D breakdown. Powers src/components/ExploreCube.

create or replace function report._pivot_col(dim text) returns text language sql immutable as $$
  select case lower(dim)
    when 'sentiment' then 'sentiment'   when 'section' then 'section'
    when 'pinchpoint' then 'pinchpoint' when 'urgency' then 'urgency'
    when 'handover' then 'handover'     when 'category' then 'category'
    when 'resolution' then 'resolution' when 'revenue' then 'revenue'
    when 'language' then 'language'      when 'flavor' then 'flavor'
    when 'funnel_stage' then 'funnel_stage'
    when 'page' then 'page_path'         when 'city' then 'city'
    when 'country' then 'country_iso'    when 'region' then 'region'
    when 'hour' then 'hour_local::text'  when 'dow' then 'dow'
    when 'week' then 'iso_week::text'    when 'month' then 'month_local::text'
    else null end
$$;

create or replace function report.intel_pivot(
    p_bot int, p_from date, p_to date, p_dim_a text, p_dim_b text default null
  ) returns table(a text, b text, conversations bigint, negative bigint)
  language plpgsql security definer stable set search_path = report, pg_temp as $fn$
  declare col_a text; col_b text; q text;
  begin
    col_a := report._pivot_col(p_dim_a);
    if col_a is null then raise exception 'unknown dimension: %', p_dim_a; end if;
    if p_dim_b is not null and p_dim_b <> '' then
      col_b := report._pivot_col(p_dim_b);
      if col_b is null then raise exception 'unknown dimension: %', p_dim_b; end if;
    end if;
    q := format($q$
      select coalesce((%s)::text,'(none)') a, %s b,
             count(*)::bigint, count(*) filter (where sentiment='Negative')::bigint
        from report.conversation_time
       where bot_id = $1 and substantive and day_local between $2 and $3
       group by 1,2$q$,
      col_a,
      case when col_b is null then $$''::text$$ else format($$coalesce((%s)::text,'(none)')$$, col_b) end);
    return query execute q using p_bot, p_from, p_to;
  end $fn$;

grant execute on function report.intel_pivot(int,date,date,text,text) to anon, authenticated;
notify pgrst, 'reload schema';
