-- Insert default setting for scheduled triggers cron job (enabled by default)
INSERT INTO public.app_settings (setting_key, setting_value)
VALUES ('scheduled_triggers_cron_enabled', '{"enabled": true}'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;

-- Update the run_due_scheduled_triggers function to check the setting first
CREATE OR REPLACE FUNCTION public.run_due_scheduled_triggers()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  got_lock boolean;
  cron_enabled boolean;
  t record;
  exec_id uuid;
  job_id uuid;
  jobs_created int;
  run_id text;
  next_at timestamptz;
BEGIN
  -- Check if cron is enabled in app_settings
  SELECT COALESCE((setting_value->>'enabled')::boolean, true)
  INTO cron_enabled
  FROM public.app_settings
  WHERE setting_key = 'scheduled_triggers_cron_enabled';

  -- If setting doesn't exist, default to enabled
  IF cron_enabled IS NULL THEN
    cron_enabled := true;
  END IF;

  -- Exit early if cron is disabled
  IF NOT cron_enabled THEN
    RETURN 0;
  END IF;

  got_lock := pg_try_advisory_lock(hashtext('run_due_scheduled_triggers'));
  IF NOT got_lock THEN
    RETURN 0;
  END IF;

  FOR t IN
    SELECT *
    FROM public.agent_scheduled_triggers
    WHERE trigger_type = 'schedule'
      AND COALESCE(is_active, false) = true
      AND next_scheduled_at IS NOT NULL
      AND next_scheduled_at <= now()
    ORDER BY next_scheduled_at ASC
  LOOP
    jobs_created := 0;
    job_id := NULL;

    INSERT INTO public.agent_trigger_executions (trigger_id, project_id, trigger_source, status, triggered_at)
    VALUES (t.id, t.project_id, 'schedule', 'pending', now())
    RETURNING id INTO exec_id;

    IF t.target_type = 'test' THEN
      run_id := 'SCHED-' || upper(replace(gen_random_uuid()::text, '-', ''));

      INSERT INTO public.agent_job_queue (project_id, test_id, run_id, base_url, steps, agent_id, created_by, status)
      SELECT t.project_id, nt.id, run_id, nt.base_url, nt.steps, t.agent_id, t.created_by, 'pending'
      FROM public.nocode_tests nt
      WHERE nt.id = t.target_id
      RETURNING id INTO job_id;

      IF job_id IS NOT NULL THEN
        jobs_created := 1;
      ELSE
        UPDATE public.agent_trigger_executions SET status='failed', error_message='Target test not found'
        WHERE id = exec_id;
        CONTINUE;
      END IF;

    ELSIF t.target_type = 'suite' THEN
      INSERT INTO public.agent_job_queue (project_id, test_id, run_id, base_url, steps, agent_id, created_by, status)
      SELECT
        t.project_id,
        nt.id,
        'SCHED-' || upper(replace(gen_random_uuid()::text, '-', '')) || '-' || nst.execution_order::text,
        nt.base_url,
        nt.steps,
        t.agent_id,
        t.created_by,
        'pending'
      FROM public.nocode_suite_tests nst
      JOIN public.nocode_tests nt ON nt.id = nst.test_id
      WHERE nst.suite_id = t.target_id;

      GET DIAGNOSTICS jobs_created = ROW_COUNT;

      IF jobs_created = 0 THEN
        UPDATE public.agent_trigger_executions SET status='failed', error_message='Suite has no tests'
        WHERE id = exec_id;
        CONTINUE;
      END IF;
    END IF;

    UPDATE public.agent_trigger_executions
    SET status='queued', job_id=job_id
    WHERE id = exec_id;

    -- Next time (reuse the same helper)
    next_at := public.calculate_next_scheduled_at(
      COALESCE(t.schedule_type, 'daily'),
      COALESCE(t.schedule_time::time, '09:00'::time),
      COALESCE(t.schedule_day_of_week, 1),
      COALESCE(NULLIF(t.schedule_timezone, ''), 'UTC'),
      now()
    );

    UPDATE public.agent_scheduled_triggers
    SET last_triggered_at = now(), next_scheduled_at = next_at
    WHERE id = t.id;

    INSERT INTO public.agent_activity_logs (project_id, agent_id, event_type, event_data)
    VALUES (
      t.project_id,
      t.agent_id,
      'scheduled_trigger_executed',
      jsonb_build_object(
        'trigger_id', t.id,
        'trigger_name', t.name,
        'schedule_type', t.schedule_type,
        'target_type', t.target_type,
        'target_id', t.target_id,
        'jobs_created', jobs_created
      )
    );
  END LOOP;

  PERFORM pg_advisory_unlock(hashtext('run_due_scheduled_triggers'));
  RETURN 1;
END;
$$;

-- Also fix search_path for the other functions created earlier
CREATE OR REPLACE FUNCTION public.calculate_next_scheduled_at(
  p_schedule_type text,
  p_schedule_time time,
  p_schedule_day_of_week int,
  p_schedule_timezone text,
  p_from timestamptz DEFAULT now()
)
RETURNS timestamptz
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  local_now timestamp;
  candidate_local timestamp;
  local_minute int;
  local_hour int;
  now_dow int;
  days_until int;
BEGIN
  IF p_schedule_timezone IS NULL OR p_schedule_timezone = '' THEN
    p_schedule_timezone := 'UTC';
  END IF;

  local_now := (p_from AT TIME ZONE p_schedule_timezone);

  IF p_schedule_type = 'hourly' THEN
    local_minute := EXTRACT(minute FROM p_schedule_time)::int;
    candidate_local := date_trunc('hour', local_now) + make_interval(mins => local_minute);
    IF candidate_local <= local_now THEN
      candidate_local := candidate_local + interval '1 hour';
    END IF;

  ELSIF p_schedule_type = 'daily' THEN
    candidate_local := date_trunc('day', local_now) + p_schedule_time;
    IF candidate_local <= local_now THEN
      candidate_local := candidate_local + interval '1 day';
    END IF;

  ELSIF p_schedule_type = 'weekly' THEN
    candidate_local := date_trunc('day', local_now) + p_schedule_time;
    now_dow := EXTRACT(dow FROM local_now)::int;
    days_until := (p_schedule_day_of_week - now_dow + 7) % 7;
    IF days_until = 0 AND candidate_local <= local_now THEN
      days_until := 7;
    END IF;
    candidate_local := date_trunc('day', local_now) + (days_until * interval '1 day') + p_schedule_time;

  ELSE
    candidate_local := date_trunc('day', local_now) + p_schedule_time;
    IF candidate_local <= local_now THEN
      candidate_local := candidate_local + interval '1 day';
    END IF;
  END IF;

  RETURN (candidate_local AT TIME ZONE p_schedule_timezone);
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_scheduled_triggers_set_next_scheduled_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  st text;
  tz text;
  dow int;
  tm time;
BEGIN
  IF NEW.trigger_type = 'schedule' AND COALESCE(NEW.is_active, false) = true THEN
    st := COALESCE(NEW.schedule_type, 'daily');
    tz := COALESCE(NULLIF(NEW.schedule_timezone, ''), 'UTC');
    dow := COALESCE(NEW.schedule_day_of_week, 1);
    tm := COALESCE(NEW.schedule_time::time, '09:00'::time);

    NEW.next_scheduled_at := public.calculate_next_scheduled_at(st, tm, dow, tz, now());
  ELSE
    NEW.next_scheduled_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;