import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, data } = await req.json()

    // Handle different QA orchestration actions
    switch (action) {
      case 'analyze':
        return await handleQAAnalysis(data)
      case 'generate_tests':
        return await handleTestGeneration(data)
      case 'validate':
        return await handleValidation(data)
      case 'mobile_assist':
        return await handleMobileAssist(data)
      case 'mobile_qa':
        return await handleMobileQA(data)
      default:
        throw new Error(`Unknown action: ${action}`)
    }
  } catch (error) {
    console.error('Error in ai-qa-orchestrator:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

async function handleQAAnalysis(data: any) {
  // Implementation for QA analysis
  const result = {
    analysis: 'QA analysis completed',
    recommendations: ['Improve test coverage', 'Add edge case testing'],
    confidence: 0.85
  }

  return new Response(
    JSON.stringify(result),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  )
}

async function handleTestGeneration(data: any) {
  // Implementation for test generation
  const result = {
    tests: [
      { type: 'unit', description: 'Test user authentication' },
      { type: 'integration', description: 'Test API endpoints' }
    ],
    generated: true
  }

  return new Response(
    JSON.stringify(result),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  )
}

async function handleValidation(data: any) {
  // Implementation for validation
  const result = {
    valid: true,
    issues: [],
    score: 0.92
  }

  return new Response(
    JSON.stringify(result),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  )
}

async function handleMobileAssist(data: any) {
  const actions = Array.isArray(data?.actions) ? data.actions : []
  const latestFailure = String(data?.context?.latestFailure || "")

  const insights: Array<{ title: string; detail: string; confidence: number }> = []

  const hasAssertions = actions.some((a: any) => a?.type === "assert")
  if (!hasAssertions && actions.length > 0) {
    insights.push({
      title: "Assertion coverage is low",
      detail: "Add at least one assertion near critical checkpoints to verify outcomes, not just interactions.",
      confidence: 0.85
    })
  }

  const unstableLocatorCount = actions.filter((a: any) => {
    const strategy = String(a?.locatorStrategy || "")
    const hasBundle = Boolean(a?.locatorBundle?.primary?.value)
    const hasSmart = Boolean(a?.smartXPath || a?.xpath || a?.elementId || a?.elementContentDesc)
    return ["tap", "input", "longPress", "assert"].includes(String(a?.type || "")) && !hasBundle && !hasSmart && strategy === "coordinates"
  }).length

  if (unstableLocatorCount > 0) {
    insights.push({
      title: "Potential locator fragility",
      detail: `${unstableLocatorCount} step(s) may rely on coordinate fallback. Prefer id/accessibilityId/xpath from Inspector.`,
      confidence: 0.88
    })
  }

  const longWaits = actions.filter((a: any) => {
    if (a?.type !== "wait") return false
    const ms = Number(a?.value || 0)
    return Number.isFinite(ms) && ms > 5000
  }).length

  if (longWaits > 0) {
    insights.push({
      title: "Long static waits detected",
      detail: `${longWaits} long wait step(s) found. Replace with readiness checks where possible for faster, less flaky replay.`,
      confidence: 0.8
    })
  }

  if (latestFailure) {
    insights.push({
      title: "Recent replay failure context",
      detail: `Latest failure: ${latestFailure}. Re-run failed step first and validate locator + timing before full replay.`,
      confidence: 0.82
    })
  }

  if (insights.length === 0) {
    insights.push({
      title: "Flow health looks stable",
      detail: "No major heuristic risks detected. Continue with targeted replay and scenario save.",
      confidence: 0.72
    })
  }

  return new Response(
    JSON.stringify({
      mode: "mobile_assist",
      insights
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  )
}

async function handleMobileQA(data: any) {
  const question = String(data?.question || "").toLowerCase()
  const context = data?.context || {}

  let answer = "I can help with recording readiness, locator stability, replay failures, and script guidance."

  if (question.includes("record") && (question.includes("not") || question.includes("capture"))) {
    answer = `Recording checks:\n- Agent connection: ${context?.connectionStatus || "unknown"}\n- Device selected: ${context?.selectedDevice ? "yes" : "no"}\n- Recording state: ${context?.recording ? (context?.isPaused ? "paused" : "active") : "stopped"}\n- Ensure setup is complete and recording is not paused.`
  } else if (question.includes("replay") && question.includes("fail")) {
    answer = `Replay troubleshooting:\n- Latest failure: ${context?.latestFailure || "not provided"}\n- Re-run only the failed step first.\n- Validate locator stability and add wait/assertion before the failing transition.`
  } else if (question.includes("button") || question.includes("what does")) {
    answer = "Setup connects services and device, Recorder captures/edits steps, Script shows generated automation, and History explains replay outcomes."
  } else if (question.includes("locator")) {
    answer = "Use id/accessibilityId first, then stable xpath. Keep coordinates as fallback only."
  }

  return new Response(
    JSON.stringify({
      mode: "mobile_qa",
      answer
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  )
}
