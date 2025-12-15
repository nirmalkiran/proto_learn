-- Insert automation result for WISPR project
INSERT INTO public.automation_results (
  run_id,
  json_result,
  timestamp,
  user_id,
  project_id
) VALUES (
  'WISPR_RUN_' || to_char(now(), 'YYYYMMDD_HH24MISS'),
  '{
    "project": "Dealer Services Automation",
    "executionDate": "2025-09-30T15:45:22",
    "environment": "QA",
    "browser": "Chrome 128.0",
    "platform": "Windows 11",
    "tests": [
      {
        "testName": "LoginTest",
        "description": "Verify user can log in with valid credentials",
        "status": "PASSED",
        "executionTimeMs": 2450,
        "screenshot": null,
        "logs": [
          "Navigated to login page",
          "Entered username and password",
          "Clicked on login button",
          "Verified dashboard is visible"
        ]
      },
      {
        "testName": "InvalidLoginTest",
        "description": "Verify error message appears with invalid credentials",
        "status": "FAILED",
        "executionTimeMs": 1875,
        "screenshot": "screenshots/InvalidLoginTest_20250930_154520.png",
        "logs": [
          "Navigated to login page",
          "Entered invalid username and password",
          "Clicked on login button",
          "Expected error message not displayed"
        ],
        "error": {
          "type": "AssertionError",
          "message": "Expected error message ''Invalid credentials'' but found ''Something went wrong''",
          "stackTrace": "org.testng.Assert.fail(Assert.java:99)\\ncom.qa.tests.InvalidLoginTest(InvalidLoginTest.java:45)"
        }
      },
      {
        "testName": "SearchDealerTest",
        "description": "Verify dealer search works with dealer ID",
        "status": "PASSED",
        "executionTimeMs": 3120,
        "screenshot": null,
        "logs": [
          "Navigated to dealer search page",
          "Entered dealer ID: 100245",
          "Clicked on search button",
          "Verified dealer details are displayed"
        ]
      }
    ],
    "summary": {
      "totalTests": 3,
      "passed": 2,
      "failed": 1,
      "skipped": 0,
      "totalExecutionTimeMs": 7445
    }
  }'::jsonb,
  '2025-09-30T15:45:22'::timestamp with time zone,
  '8470fdfe-3cea-43cf-b0d9-fb4ce1afd584'::uuid,
  '3859858d-0555-409a-99ee-e63234e8683b'::uuid
);