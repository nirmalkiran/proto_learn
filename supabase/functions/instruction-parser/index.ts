import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { instruction_text, project_id } = await req.json();

    if (!instruction_text) {
      return new Response(JSON.stringify({ error: 'instruction_text is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are an AI QA instruction parser for a test management platform called WISPR.
Your job is to analyze a natural language instruction from a QA lead and extract structured intent.

Available agent types: analyst, automation, healer, performance, security, reporting

Available intent types:
- TEST_GENERATION: Generate test cases (analyst)
- AUTOMATE_ONLY: Create automation scripts (automation)
- FIX_FAILURES: Heal or fix failed tests (healer)
- RUN_NFR: Run performance/load tests (performance)
- SECURITY_AUDIT: Run security scans (security)
- RELEASE_SUMMARY: Generate reports (reporting)
- DATA_VALIDATION: Validate data quality (analyst)
- CUSTOM: Anything else

Risk levels:
- low: read-only operations (reporting, viewing)
- medium: generation of artifacts (test cases, scripts)
- high: execution on production-like systems, security scans, performance stress tests

Return a JSON object with tool calling.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Parse this QA instruction:\n\n"${instruction_text}"` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "parse_instruction",
              description: "Parse a QA instruction into structured intent",
              parameters: {
                type: "object",
                properties: {
                  intent: {
                    type: "string",
                    enum: ["TEST_GENERATION", "AUTOMATE_ONLY", "FIX_FAILURES", "RUN_NFR", "SECURITY_AUDIT", "RELEASE_SUMMARY", "DATA_VALIDATION", "CUSTOM"],
                    description: "The classified intent type"
                  },
                  target_agents: {
                    type: "array",
                    items: { type: "string", enum: ["analyst", "automation", "healer", "performance", "security", "reporting"] },
                    description: "Which agents should handle this"
                  },
                  scope: {
                    type: "object",
                    properties: {
                      artifact_type: { type: "string", description: "Type of artifact (api, ui, user_story, test_case, etc.)" },
                      tags: { type: "array", items: { type: "string" }, description: "Relevant tags or keywords" },
                    },
                    additionalProperties: true,
                  },
                  constraints: {
                    type: "object",
                    properties: {
                      priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
                      test_types: { type: "array", items: { type: "string" }, description: "Types of tests (negative, boundary, regression, etc.)" },
                      exclude: { type: "array", items: { type: "string" }, description: "What to exclude" },
                    },
                    additionalProperties: true,
                  },
                  confidence: { type: "number", minimum: 0, maximum: 1, description: "How confident the parse is (0-1)" },
                  approval_required: { type: "boolean", description: "Whether this should require human approval" },
                  risk_level: { type: "string", enum: ["low", "medium", "high"], description: "Risk level of this instruction" },
                  summary: { type: "string", description: "A short summary of what was parsed" },
                },
                required: ["intent", "target_agents", "confidence", "risk_level", "summary"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "parse_instruction" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResult = await response.json();
    console.log("AI response:", JSON.stringify(aiResult));

    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("No tool call in AI response");
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    console.log("Parsed instruction:", JSON.stringify(parsed));

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("instruction-parser error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
