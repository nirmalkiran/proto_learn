import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const url = new URL(req.url)
    const pathname = url.pathname
    const agentKey = req.headers.get('x-agent-key')

    let body: any = {}
    if (req.method === 'POST') {
      try { body = await req.json() } catch { /* ignore */ }
    }

    // Resolve action
    let action = body.action
    if (pathname.endsWith('/heartbeat')) action = 'heartbeat'
    if (pathname.endsWith('/jobs/poll')) action = 'poll'
    if (pathname.includes('/start')) action = 'start'
    if (pathname.includes('/result')) action = 'result'

    if (!action && pathname.includes('/register')) action = 'register'

    // Identify Agent
    let agent: any = null
    if (agentKey) {
      const { data } = await supabaseClient
        .from('self_hosted_agents')
        .select('*')
        .eq('api_key', agentKey)
        .maybeSingle()
      agent = data
    } else if (body.agentId?.startsWith('browser-') || body.agentId?.startsWith('mobile-')) {
      // For ephemeral local agents, we find or create a temporary record
      const { data } = await supabaseClient
        .from('self_hosted_agents')
        .select('*')
        .eq('agent_id', body.agentId)
        .maybeSingle()
      agent = data

      if (!agent && action === 'heartbeat') {
        const isMobile = body.agentId.startsWith('mobile-')
        // Auto-register ephemeral agent
        const { data: { user } } = await supabaseClient.auth.getUser(req.headers.get('Authorization')?.split(' ')[1] ?? '')
        const { data: newAgent } = await supabaseClient
          .from('self_hosted_agents')
          .insert({
            name: isMobile ? 'Mobile Automation Helper' : 'Local Browser Agent',
            agent_id: body.agentId,
            agent_type: isMobile ? 'mobile' : 'browser',
            status: 'online',
            project_id: body.projectId,
            user_id: user?.id,
            capabilities: {
              browsers: isMobile ? ['Android (ADB)'] : ['chrome'],
              capacity: body.capacity || 1
            },
            last_heartbeat: new Date().toISOString()
          })
          .select()
          .single()
        agent = newAgent
      }
    }

    if (!agent && action !== 'register' && !body.agentId?.startsWith('browser-') && !body.agentId?.startsWith('mobile-')) {
      throw new Error(`Authentication failed for ${pathname} (Action: ${action})`)
    }

    const agentId = agent?.id || body.agentId;

    switch (action) {
      case 'register':
        const authHeader = req.headers.get('Authorization')
        const { data: { user } } = await supabaseClient.auth.getUser(authHeader?.split(' ')[1] ?? '')
        if (!user) throw new Error('Unauthorized for registration')
        return await handleRegister(supabaseClient, user.id, body)
      case 'heartbeat':
        return await handleHeartbeat(supabaseClient, agentId, body)
      case 'poll':
        return await handlePoll(supabaseClient, agentId)
      case 'start':
        const jobIdToStart = body.jobId || pathname.split('/').reverse()[1] // Handles /jobs/:id/start
        return await handleStart(supabaseClient, agentId, jobIdToStart)
      case 'result':
        const jobIdToResult = body.jobId || pathname.split('/').reverse()[1] // Handles /jobs/:id/result
        return await handleResult(supabaseClient, agentId, jobIdToResult, body)
      default:
        throw new Error(`Unknown action: ${action} at ${pathname}`)
    }
  } catch (error) {
    console.error('Error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.message.includes('Unknown action') ? 404 : 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function handleRegister(supabase: any, userId: string, body: any) {
  const { projectId, agentName, agentId, browsers, capacity } = body
  const apiKey = crypto.randomUUID()

  console.log('Registering agent:', { projectId, agentName, agentId, browsers, capacity, userId })

  const { data, error } = await supabase
    .from('self_hosted_agents')
    .insert({
      project_id: projectId,
      user_id: userId,
      name: agentName || agentId || 'Unnamed Agent',
      agent_type: 'self-hosted',
      api_key: apiKey,
      capabilities: { browsers, capacity, agentId },
      status: 'online',
      last_heartbeat: new Date().toISOString()
    })
    .select()
    .single()

  if (error) {
    console.error('Registration error:', error)
    if (error.code === '23505') {
      throw new Error(`Agent name is already in use. Please choose a unique name.`)
    }
    throw error
  }

  console.log('Agent registered successfully:', data)
  return new Response(JSON.stringify({ agent: data, apiToken: apiKey }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

async function handleHeartbeat(supabase: any, agentId: string, body: any) {
  const { error } = await supabase
    .from('self_hosted_agents')
    .update({
      status: 'online',
      last_heartbeat: new Date().toISOString(),
      capabilities: body.data || body // handle both formats
    })
    .eq('id', agentId)

  if (error) throw error
  return new Response(JSON.stringify({ status: 'ok' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

async function handlePoll(supabase: any, agentId: string) {
  const { data: jobs, error } = await supabase
    .from('agent_job_queue')
    .select('*')
    .eq('status', 'pending')
    .maybeSingle() // Just get one job for now

  if (error) throw error
  return new Response(JSON.stringify({ jobs: jobs ? [jobs] : [] }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

async function handleStart(supabase: any, agentId: string, jobId: string) {
  const { error } = await supabase
    .from('agent_job_queue')
    .update({
      status: 'running',
      agent_id: agentId,
      started_at: new Date().toISOString()
    })
    .eq('id', jobId)

  if (error) throw error
  return new Response(JSON.stringify({ status: 'started' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

async function handleResult(supabase: any, agentId: string, jobId: string, body: any) {
  const { status, result_data, error_message } = body

  const { error } = await supabase
    .from('agent_job_queue')
    .update({
      status: status || 'completed',
      result: result_data || body.results || null,
      error_message: error_message || null,
      completed_at: new Date().toISOString()
    })
    .eq('id', jobId)

  if (error) throw error
  return new Response(JSON.stringify({ status: 'ok' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
