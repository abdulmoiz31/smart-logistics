create or replace view leads_summary as
with
  quote_stats as (
    select
      count(*) as total_quotes,
      count(*) filter (where status = 'confirmed') as confirmed_scans,
      count(*) filter (where status = 'pending_review') as pending_count,
      count(distinct session_id) as estimated_scans,
      coalesce(
        percentile_cont(0.5) within group (order by (breakdown->>'subtotalCents')::integer),
        0
      )::integer as median_estimate_cents
    from quotes
  ),
  item_stats as (
    select coalesce(sum(cubic_feet * count), 0)::numeric as total_cubic_feet
    from items
  ),
  confirmed_edit_rates as (
    select
      q.session_id,
      count(i.id) filter (where i.edited_by_user)::double precision
        / nullif(count(i.id), 0) as edit_rate
    from quotes q
    join rooms r on r.session_id = q.session_id
    join items i on i.room_id = r.id
    where q.status = 'confirmed'
    group by q.session_id
  )
select
  (select count(*) from sessions) as total_scans,
  qs.estimated_scans,
  qs.confirmed_scans,
  qs.pending_count,
  qs.median_estimate_cents,
  ist.total_cubic_feet,
  coalesce((select avg(edit_rate) from confirmed_edit_rates), 0)::double precision as mean_edit_rate
from quote_stats qs, item_stats ist;
