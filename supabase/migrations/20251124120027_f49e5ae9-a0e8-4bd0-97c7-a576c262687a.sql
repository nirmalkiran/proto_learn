-- Add new column for structured test steps
ALTER TABLE test_cases 
ADD COLUMN IF NOT EXISTS structured_steps JSONB DEFAULT '[]'::jsonb;

-- Migrate existing steps data to structured format
-- This converts plain text steps into structured format with step number and action
UPDATE test_cases 
SET structured_steps = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'stepNumber', row_number,
      'action', step_text,
      'testData', '',
      'expectedResult', ''
    )
  )
  FROM (
    SELECT 
      ROW_NUMBER() OVER () as row_number,
      TRIM(step_line) as step_text
    FROM (
      SELECT 
        unnest(string_to_array(COALESCE(steps, ''), E'\n')) as step_line
    ) subquery
    WHERE TRIM(step_line) != ''
  ) numbered_steps
)
WHERE steps IS NOT NULL AND steps != '' AND structured_steps = '[]'::jsonb;

-- Create index for better query performance on structured steps
CREATE INDEX IF NOT EXISTS idx_test_cases_structured_steps ON test_cases USING GIN (structured_steps);

-- Add comment to document the structure
COMMENT ON COLUMN test_cases.structured_steps IS 'Structured test steps with format: [{"stepNumber": 1, "action": "step description", "testData": "test data", "expectedResult": "expected result"}]';
