import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Allowlisted domains that can be proxied
const ALLOWED_DOMAINS = [
  'api.github.com',
  'dev.azure.com',
  'api.openai.com',
  'api.jira.com',
  'api.atlassian.com',
];

// Blocked IP ranges (private networks, cloud metadata)
const BLOCKED_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./, // Cloud metadata endpoint
  /^0\./,
  /^\[::1\]$/,
  /^fc00:/i,
  /^fe80:/i,
];

function isUrlAllowed(urlString: string): { allowed: boolean; reason?: string } {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();
    
    // Check if hostname matches blocked patterns
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(hostname)) {
        return { allowed: false, reason: `Blocked hostname pattern: ${hostname}` };
      }
    }
    
    // Check if hostname is in allowlist
    const isAllowed = ALLOWED_DOMAINS.some(domain => 
      hostname === domain || hostname.endsWith('.' + domain)
    );
    
    if (!isAllowed) {
      return { allowed: false, reason: `Domain not in allowlist: ${hostname}` };
    }
    
    // Only allow HTTPS
    if (url.protocol !== 'https:') {
      return { allowed: false, reason: `Only HTTPS allowed, got: ${url.protocol}` };
    }
    
    return { allowed: true };
  } catch (error) {
    return { allowed: false, reason: `Invalid URL: ${error.message}` };
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify JWT authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate the JWT token
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('Authentication failed:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`API Proxy - Authenticated user: ${user.id}`);

    const { url, method, headers: customHeaders, body } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate URL against allowlist
    const urlValidation = isUrlAllowed(url);
    if (!urlValidation.allowed) {
      console.error(`API Proxy - URL blocked: ${urlValidation.reason}`);
      return new Response(
        JSON.stringify({ error: `Request blocked: ${urlValidation.reason}` }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`API Proxy - Forwarding ${method} request to: ${url}`);

    // Build request options
    const fetchOptions: RequestInit = {
      method: method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...customHeaders
      },
    };

    // Add body for non-GET requests
    if (body && method !== 'GET') {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    // Make the actual request
    const response = await fetch(url, fetchOptions);

    // Get response headers
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    // Get response body
    let responseData;
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    console.log(`API Proxy - Response status: ${response.status} ${response.statusText}`);

    // Return the proxied response
    return new Response(
      JSON.stringify({
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        data: responseData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('API Proxy error:', error);
    return new Response(
      JSON.stringify({
        status: 0,
        statusText: 'Error',
        headers: {},
        data: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
