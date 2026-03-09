drop view if exists public.projects_all_activities_view;
create view public.projects_all_activities_view as
with
  current_projects_base as (
    select
      p.id,
      p.state,
      p.status,
      p.submitted_at,
      p.date,
      p.estimated_timeframe,
      p.project_objectives,
      p.estimated_beneficiaries,
      p."Sector (Primary)",
      p."Sector (Secondary)",
      p.grant_serial,
      p.workplan_number,
      p.grant_serial_id,
      p.grant_segment,
      p.mou_id,
      p.donor_id,
      p.emergency_room_id,
      p.source,
      p.expenses,
      p.planned_activities,
      er.err_code,
      er.name as err_name,
      d.name as donor_name,
      m.mou_code,
      m.payment_confirmation_file,
      p.date_transfer,
      p.f4_status,
      p.f5_status
    from
      err_projects p
      left join emergency_rooms er on p.emergency_room_id = er.id
      left join donors d on p.donor_id = d.id
      left join mous m on p.mou_id = m.id
  ),
  current_projects_plan as (
    select
      cpb.id,
      COALESCE(
        (
          select
            sum(
              COALESCE(
                (e.value ->> 'total_cost'::text)::numeric,
                0::numeric
              )
            ) as sum
          from
            jsonb_array_elements(
              case
                when jsonb_typeof(cpb.expenses) = 'array'::text then cpb.expenses
                else '[]'::jsonb
              end
            ) e (value)
        ),
        0::numeric
      ) as usd,
      COALESCE(
        (
          select
            sum(
              COALESCE((pa.value ->> 'individuals'::text)::integer, 0)
            ) as sum
          from
            jsonb_array_elements(
              case
                when jsonb_typeof(cpb.planned_activities) = 'array'::text then cpb.planned_activities
                else '[]'::jsonb
              end
            ) pa (value)
        ),
        cpb.estimated_beneficiaries::bigint,
        0::bigint
      ) as target_ind,
      COALESCE(
        (
          select
            sum(
              COALESCE((pa.value ->> 'families'::text)::integer, 0)
            ) as sum
          from
            jsonb_array_elements(
              case
                when jsonb_typeof(cpb.planned_activities) = 'array'::text then cpb.planned_activities
                else '[]'::jsonb
              end
            ) pa (value)
        ),
        0::bigint
      ) as target_fam
    from
      current_projects_base cpb
  ),
  current_projects_mapped as (
    select
      COALESCE(
        NULLIF(
          TRIM(
            both
            from
              cpb.grant_serial
          ),
          ''::text
        ),
        case
          when cpb.workplan_number is not null then cpb.workplan_number::text
          else null::text
        end,
        NULLIF(
          TRIM(
            both
            from
              cpb.grant_serial_id
          ),
          ''::text
        ),
        cpb.id::text
      ) as serial_number,
      cpb.err_code,
      cpb.err_name,
      case
        when cpb.status = any (
          array['pending'::text, 'approved'::text, 'active'::text]
        ) then 'In Progress'::text
        when cpb.status = 'completed'::text then 'Completed'::text
        else cpb.status
      end as project_status,
      case
        when cpb.submitted_at is not null then cpb.submitted_at::date
        when cpb.date is not null then cpb.date
        else null::date
      end as f1_date_submitted,
      case
        when COALESCE(
          cpb.date_transfer,
          case
            when cpb.payment_confirmation_file is not null
            and cpb.payment_confirmation_file ~~ '{%'::text
            and NULLIF(
              TRIM(
                both
                from
                  (
                    cpb.payment_confirmation_file::jsonb -> cpb.id::text
                  ) ->> 'transfer_date'::text
              ),
              ''::text
            ) is not null then (
              (
                cpb.payment_confirmation_file::jsonb -> cpb.id::text
              ) ->> 'transfer_date'::text
            )::date
            else null::date
          end
        ) is not null
        and (
          COALESCE(
            cpb.date_transfer,
            case
              when cpb.payment_confirmation_file is not null
              and cpb.payment_confirmation_file ~~ '{%'::text
              and NULLIF(
                TRIM(
                  both
                  from
                    (
                      cpb.payment_confirmation_file::jsonb -> cpb.id::text
                    ) ->> 'transfer_date'::text
                ),
                ''::text
              ) is not null then (
                (
                  cpb.payment_confirmation_file::jsonb -> cpb.id::text
                ) ->> 'transfer_date'::text
              )::date
              else null::date
            end
          ) + 32
        ) < current_date
        and not (
          lower(trim(cpb.f4_status)) in ('completed', 'in review', 'under review', 'partial')
          and lower(trim(cpb.f5_status)) in ('completed', 'in review', 'under review', 'partial')
        )
        then (
          current_date
          - (
            COALESCE(
              cpb.date_transfer,
              case
                when cpb.payment_confirmation_file is not null
                and cpb.payment_confirmation_file ~~ '{%'::text
                and NULLIF(
                  TRIM(
                    both
                    from
                      (
                        cpb.payment_confirmation_file::jsonb -> cpb.id::text
                      ) ->> 'transfer_date'::text
                  ),
                  ''::text
                ) is not null then (
                  (
                    cpb.payment_confirmation_file::jsonb -> cpb.id::text
                  ) ->> 'transfer_date'::text
                )::date
                else null::date
              end
            ) + 32
          )
        )::numeric
        else null::numeric
      end as overdue,
      null::text as f1,
      null::numeric as num_base_err,
      COALESCE(
        NULLIF(
          TRIM(
            both
            from
              cpb.donor_name
          ),
          ''::text
        ),
        'Unknown'::text
      ) as project_donor,
      null::text as partner,
      cpb.state,
      null::text as responsible,
      cpb."Sector (Primary)" as sector_primary,
      cpb."Sector (Secondary)" as sector_secondary,
      cpb.project_objectives as description,
      cpp.target_ind::numeric as target_individuals,
      cpp.target_fam::numeric as target_families,
      case
        when cpb.mou_code is not null then cpb.mou_code
        when cpb.mou_id is not null then 'Yes'::text
        else 'No'::text
      end as mou_signed,
      COALESCE(
        cpb.date_transfer,
        case
          when cpb.payment_confirmation_file is not null
          and cpb.payment_confirmation_file ~~ '{%'::text
          and NULLIF(
            TRIM(
              both
              from
                (
                  cpb.payment_confirmation_file::jsonb -> cpb.id::text
                ) ->> 'transfer_date'::text
            ),
            ''::text
          ) is not null then (
            (
              cpb.payment_confirmation_file::jsonb -> cpb.id::text
            ) ->> 'transfer_date'::text
          )::date
          else null::date
        end
      ) as date_transfer,
      cpp.usd,
      null::numeric as sdg,
      null::numeric as rate,
      case
        when cpb.date is not null then cpb.date
        else null::date
      end as start_date_activity,
      null::date as end_date_activity,
      cpb.estimated_timeframe as activity_duration,
      initcap(lower(trim(cpb.f4_status))) as f4,
      initcap(lower(trim(cpb.f5_status))) as f5,
      null::date as date_report_completed,
      null::numeric as reporting_duration,
      (
        case initcap(lower(trim(cpb.f4_status)))
          when 'Completed' then 0.5
          when 'Partial' then 0.25
          when 'Under Review' then 0.25
          when 'Waiting' then 0
          else 0
        end
        +
        case initcap(lower(trim(cpb.f5_status)))
          when 'Completed' then 0.5
          when 'Partial' then 0.25
          when 'Under Review' then 0.25
          when 'Waiting' then 0
          else 0
        end
      )::numeric as tracker,
      null::numeric as volunteers,
      null::numeric as family,
      null::numeric as individuals,
      null::numeric as male_over_18,
      null::numeric as female_over_18,
      null::numeric as male_under_18,
      null::numeric as female_under_18,
      null::numeric as people_special_needs,
      null::text as lessons_learned,
      null::text as challenges,
      null::text as recommendations,
      null::text as comments,
      NULLIF(
        TRIM(
          both
          from
            cpb.grant_segment
        ),
        ''::text
      ) as grant_segment
    from
      current_projects_base cpb
      join current_projects_plan cpp on cpb.id = cpp.id
  )
select
  ari."Serial Number" as serial_number,
  ari."ERR CODE" as err_code,
  ari."ERR Name" as err_name,
  ari."Project Status" as project_status,
  case
    when ari."F1 Date of Submitted" is null
    or TRIM(
      both
      from
        ari."F1 Date of Submitted"
    ) = ''::text
    or lower(
      TRIM(
        both
        from
          ari."F1 Date of Submitted"
      )
    ) = 'null'::text then null::date
    when TRIM(
      both
      from
        ari."F1 Date of Submitted"
    ) ~ '^\d{1,2}-[A-Za-z]{3}-\d{2}$'::text then to_date(
      TRIM(
        both
        from
          ari."F1 Date of Submitted"
      ),
      'DD-Mon-YY'::text
    )
    when TRIM(
      both
      from
        ari."F1 Date of Submitted"
    ) ~ '^\d{1,2}-[A-Za-z]{3}-\d{4}$'::text then to_date(
      TRIM(
        both
        from
          ari."F1 Date of Submitted"
      ),
      'DD-Mon-YYYY'::text
    )
    when TRIM(
      both
      from
        ari."F1 Date of Submitted"
    ) ~ '^\d{1,2}/\d{1,2}/\d{4}$'::text then case
      when split_part(
        TRIM(
          both
          from
            ari."F1 Date of Submitted"
        ),
        '/'::text,
        1
      )::integer > 12 then to_date(
        TRIM(
          both
          from
            ari."F1 Date of Submitted"
        ),
        'DD/MM/YYYY'::text
      )
      when split_part(
        TRIM(
          both
          from
            ari."F1 Date of Submitted"
        ),
        '/'::text,
        2
      )::integer > 12 then to_date(
        TRIM(
          both
          from
            ari."F1 Date of Submitted"
        ),
        'MM/DD/YYYY'::text
      )
      else to_date(
        TRIM(
          both
          from
            ari."F1 Date of Submitted"
        ),
        'DD/MM/YYYY'::text
      )
    end
    else null::date
  end as f1_date_submitted,
  case
    when ari."Overdue" ~ '^[0-9]+\.?[0-9]*$'::text then ari."Overdue"::numeric
    else null::numeric
  end as overdue,
  ari."F1" as f1,
  case
    when ari."# of Base ERR" ~ '^[0-9]+\.?[0-9]*$'::text then ari."# of Base ERR"::numeric
    else null::numeric
  end as num_base_err,
  ari."Project Donor" as project_donor,
  ari."Partner" as partner,
  ari."State" as state,
  ari."Responsible" as responsible,
  ari."Sector (Primary)" as sector_primary,
  ari."Sector (Secondardy" as sector_secondary,
  ari."Description of ERRs activity" as description,
  ari."Target (Ind.)"::numeric as target_individuals,
  ari."Target (Fam.)"::numeric as target_families,
  ari."MOU Signed" as mou_signed,
  case
    when ari."Date Transfer" is null
    or TRIM(
      both
      from
        ari."Date Transfer"
    ) = ''::text
    or lower(
      TRIM(
        both
        from
          ari."Date Transfer"
      )
    ) = 'null'::text then null::date
    when TRIM(
      both
      from
        ari."Date Transfer"
    ) ~ '^\d{1,2}-[A-Za-z]{3}-\d{4}$'::text then to_date(
      TRIM(
        both
        from
          ari."Date Transfer"
      ),
      'DD-Mon-YYYY'::text
    )
    when TRIM(
      both
      from
        ari."Date Transfer"
    ) ~ '^\d{1,2}/\d{1,2}/\d{4}$'::text then to_date(
      TRIM(
        both
        from
          ari."Date Transfer"
      ),
      'MM/DD/YYYY'::text
    )
    else null::date
  end as date_transfer,
  ari."USD" as usd,
  ari."SDG" as sdg,
  ari."Rate"::numeric as rate,
  case
    when ari."Start Date (Activity)" is null
    or TRIM(
      both
      from
        ari."Start Date (Activity)"
    ) = ''::text
    or lower(
      TRIM(
        both
        from
          ari."Start Date (Activity)"
      )
    ) = 'null'::text then null::date
    when TRIM(
      both
      from
        ari."Start Date (Activity)"
    ) ~ '^\d{1,2}-[A-Za-z]{3}-\d{4}$'::text then to_date(
      TRIM(
        both
        from
          ari."Start Date (Activity)"
      ),
      'DD-Mon-YYYY'::text
    )
    when TRIM(
      both
      from
        ari."Start Date (Activity)"
    ) ~ '^\d{1,2}/\d{1,2}/\d{4}$'::text then to_date(
      TRIM(
        both
        from
          ari."Start Date (Activity)"
      ),
      'MM/DD/YYYY'::text
    )
    else null::date
  end as start_date_activity,
  case
    when ari."End Date (Activity)" is null
    or TRIM(
      both
      from
        ari."End Date (Activity)"
    ) = ''::text
    or lower(
      TRIM(
        both
        from
          ari."End Date (Activity)"
      )
    ) = 'null'::text then null::date
    when TRIM(
      both
      from
        ari."End Date (Activity)"
    ) ~ '^\d{1,2}-[A-Za-z]{3}-\d{4}$'::text then to_date(
      TRIM(
        both
        from
          ari."End Date (Activity)"
      ),
      'DD-Mon-YYYY'::text
    )
    when TRIM(
      both
      from
        ari."End Date (Activity)"
    ) ~ '^\d{1,2}/\d{1,2}/\d{4}$'::text then to_date(
      TRIM(
        both
        from
          ari."End Date (Activity)"
      ),
      'MM/DD/YYYY'::text
    )
    else null::date
  end as end_date_activity,
  ari."Activity Duration" as activity_duration,
  initcap(lower(trim(ari."F4"))) as f4,
  initcap(lower(trim(ari."F5"))) as f5,
  case
    when ari."Date Report Completed" is null
    or TRIM(
      both
      from
        ari."Date Report Completed"
    ) = ''::text
    or lower(
      TRIM(
        both
        from
          ari."Date Report Completed"
      )
    ) = 'null'::text then null::date
    when TRIM(
      both
      from
        ari."Date Report Completed"
    ) ~ '^\d{1,2}-[A-Za-z]{3}-\d{4}$'::text then to_date(
      TRIM(
        both
        from
          ari."Date Report Completed"
      ),
      'DD-Mon-YYYY'::text
    )
    when TRIM(
      both
      from
        ari."Date Report Completed"
    ) ~ '^\d{1,2}/\d{1,2}/\d{4}$'::text then to_date(
      TRIM(
        both
        from
          ari."Date Report Completed"
      ),
      'MM/DD/YYYY'::text
    )
    else null::date
  end as date_report_completed,
  case
    when ari."Reporting Duration (End Date to Report)" is null
    or TRIM(
      both
      from
        ari."Reporting Duration (End Date to Report)"
    ) = ''::text
    or lower(
      TRIM(
        both
        from
          ari."Reporting Duration (End Date to Report)"
      )
    ) = 'null'::text then null::numeric
    when ari."Reporting Duration (End Date to Report)" ~ '^[0-9]+\.?[0-9]*$'::text then ari."Reporting Duration (End Date to Report)"::numeric
    else null::numeric
  end as reporting_duration,
  (
    case initcap(lower(trim(ari."F4")))
      when 'Completed' then 0.5
      when 'Partial' then 0.25
      when 'Under Review' then 0.25
      when 'Waiting' then 0
      else 0
    end
    +
    case initcap(lower(trim(ari."F5")))
      when 'Completed' then 0.5
      when 'Partial' then 0.25
      when 'Under Review' then 0.25
      when 'Waiting' then 0
      else 0
    end
  )::numeric as tracker,
  ari."Volunteers"::numeric as volunteers,
  case
    when ari."Family" ~ '^[0-9]+\.?[0-9]*$'::text then ari."Family"::numeric
    else null::numeric
  end as family,
  case
    when ari."Individuals" ~ '^[0-9]+\.?[0-9]*$'::text then ari."Individuals"::numeric
    else null::numeric
  end as individuals,
  ari."Male >18"::numeric as male_over_18,
  ari."Female >18"::numeric as female_over_18,
  ari."Male <18"::numeric as male_under_18,
  ari."Female <18"::numeric as female_under_18,
  ari."People with special needs"::numeric as people_special_needs,
  ari."Lessons learned" as lessons_learned,
  ari."Challenges" as challenges,
  ari."Recommendations" as recommendations,
  ari."Comments" as comments,
  ari."Grant Segment" as grant_segment
from
  activities_raw_import ari
union all
select
  current_projects_mapped.serial_number,
  current_projects_mapped.err_code,
  current_projects_mapped.err_name,
  current_projects_mapped.project_status,
  current_projects_mapped.f1_date_submitted,
  current_projects_mapped.overdue,
  current_projects_mapped.f1,
  current_projects_mapped.num_base_err,
  current_projects_mapped.project_donor,
  current_projects_mapped.partner,
  current_projects_mapped.state,
  current_projects_mapped.responsible,
  current_projects_mapped.sector_primary,
  current_projects_mapped.sector_secondary,
  current_projects_mapped.description,
  current_projects_mapped.target_individuals,
  current_projects_mapped.target_families,
  current_projects_mapped.mou_signed,
  current_projects_mapped.date_transfer,
  current_projects_mapped.usd,
  current_projects_mapped.sdg,
  current_projects_mapped.rate,
  current_projects_mapped.start_date_activity,
  current_projects_mapped.end_date_activity,
  current_projects_mapped.activity_duration,
  current_projects_mapped.f4,
  current_projects_mapped.f5,
  current_projects_mapped.date_report_completed,
  current_projects_mapped.reporting_duration,
  current_projects_mapped.tracker,
  current_projects_mapped.volunteers,
  current_projects_mapped.family,
  current_projects_mapped.individuals,
  current_projects_mapped.male_over_18,
  current_projects_mapped.female_over_18,
  current_projects_mapped.male_under_18,
  current_projects_mapped.female_under_18,
  current_projects_mapped.people_special_needs,
  current_projects_mapped.lessons_learned,
  current_projects_mapped.challenges,
  current_projects_mapped.recommendations,
  current_projects_mapped.comments,
  current_projects_mapped.grant_segment
from
  current_projects_mapped;
