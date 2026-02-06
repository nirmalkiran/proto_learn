-- Persist manually edited mobile scripts with each saved scenario.
ALTER TABLE IF EXISTS public.nocodemobile_scenarios
ADD COLUMN IF NOT EXISTS manual_script text;

COMMENT ON COLUMN public.nocodemobile_scenarios.manual_script
IS 'Optional manually edited Java/Appium script associated with the scenario for cross-device sync.';
