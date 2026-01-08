import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userStories, testCases, integrationGroupName, projectId } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Create the prompt for AI
    const prompt = `You are a QA expert tasked with generating comprehensive integration test cases.

Given the following user stories and their test cases, generate integration test cases that verify the end-to-end flow across multiple user stories.

User Stories and Test Cases:
${userStories.map((story: any, index: number) => `
${index + 1}. User Story: ${story.title}
   Test Cases:
${story.testCases.map((tc: any, tcIndex: number) => `   ${tcIndex + 1}. ${tc.title}
      Description: ${tc.description}
      Steps: ${tc.steps.join("; ")}
      Expected Result: ${tc.expectedResult}
`).join("")}
`).join("\n")}

Generate 3-5 integration test cases that:
1. Test the end-to-end flow across these user stories
2. Verify data consistency between different features
3. Test edge cases and boundary conditions
4. Include realistic test data
5. Have clear, detailed steps

For each integration test case, provide:
- title: A clear, descriptive title
- description: What the test verifies
- steps: Detailed step-by-step instructions (as an array)
- testData: Sample data needed for testing
- expectedResult: What should happen
- priority: "low", "medium", or "high"

Return ONLY a JSON array of test cases, no other text.`;

    console.log("Calling AI with prompt:", prompt);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "You are a QA expert who generates comprehensive integration test cases. Always return valid JSON arrays only."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required, please add funds to your Lovable AI workspace." }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("Failed to generate test cases with AI");
    }

    const data = await response.json();
    let generatedTestCasesText = data.choices[0].message.content;

    console.log("AI response:", generatedTestCasesText);

    // Extract JSON from markdown code blocks if present
    if (generatedTestCasesText.includes("```json")) {
      generatedTestCasesText = generatedTestCasesText.split("```json")[1].split("```")[0].trim();
    } else if (generatedTestCasesText.includes("```")) {
      generatedTestCasesText = generatedTestCasesText.split("```")[1].split("```")[0].trim();
    }

    let generatedTestCases;
    try {
      generatedTestCases = JSON.parse(generatedTestCasesText);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);
      throw new Error("AI returned invalid JSON format");
    }

    if (!Array.isArray(generatedTestCases)) {
      throw new Error("AI did not return an array of test cases");
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the authorization header
    const authHeader = req.headers.get("authorization");
    let userId = null;
    
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (!userError && user) {
        userId = user.id;
      }
    }

    // Insert generated test cases into the database
    const testCasesToInsert = generatedTestCases.map((tc: any) => ({
      project_id: projectId,
      title: tc.title,
      description: tc.description || "",
      steps: Array.isArray(tc.steps) ? tc.steps.join("\n") : tc.steps,
      test_data: tc.testData || "",
      expected_result: tc.expectedResult || "",
      priority: tc.priority || "medium",
      status: "not-run",
      automated: false,
      user_story_id: null, // Integration test cases don't belong to a single user story
    }));

    const { data: insertedTestCases, error: insertError } = await supabase
      .from("test_cases")
      .insert(testCasesToInsert)
      .select();

    if (insertError) {
      console.error("Error inserting test cases:", insertError);
      throw new Error("Failed to save generated test cases to database");
    }

    console.log(`Successfully generated and saved ${insertedTestCases.length} integration test cases`);

    return new Response(
      JSON.stringify({
        success: true,
        testCases: insertedTestCases,
        count: insertedTestCases.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in generate-integration-test-cases:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
