import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Intent types for QA operations
type QAIntent = 'test_case_generation' | 'automation_suggestion' | 'defect_analysis' | 'pattern_recommendation' | 'store_embedding' | 'semantic_search';

interface OrchestratorRequest {
  intent: QAIntent;
  projectId: string;
  content?: string;
  artifactType?: string;
  artifactId?: string;
  metadata?: Record<string, any>;
  searchQuery?: string;
  limit?: number;
  userStory?: {
    title: string;
    description: string;
    acceptanceCriteria?: string;
  };
  testCase?: {
    title: string;
    steps: string;
    expectedResult: string;
  };
  defect?: {
    title: string;
    description: string;
    stepsToReproduce?: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    const azureOpenaiKey = Deno.env.get('AZURE_OPENAI_API_KEY');
    const azureOpenaiEndpoint = Deno.env.get('AZURE_OPENAI_ENDPOINT');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const request: OrchestratorRequest = await req.json();
    const { intent, projectId } = request;

    console.log(`Processing intent: ${intent} for project: ${projectId}`);

    // Get AI configuration for the project
    const aiConfig = await getAIConfig(supabase, projectId, openaiApiKey, azureOpenaiKey, azureOpenaiEndpoint);

    let result;

    switch (intent) {
      case 'store_embedding':
        result = await storeEmbedding(supabase, aiConfig, request, user.id);
        break;
      
      case 'semantic_search':
        result = await semanticSearch(supabase, aiConfig, request);
        break;
      
      case 'test_case_generation':
        result = await generateTestCases(supabase, aiConfig, request, user.id);
        break;
      
      case 'automation_suggestion':
        result = await suggestAutomation(supabase, aiConfig, request, user.id);
        break;
      
      case 'defect_analysis':
        result = await analyzeDefect(supabase, aiConfig, request, user.id);
        break;
      
      case 'pattern_recommendation':
        result = await recommendPatterns(supabase, aiConfig, request);
        break;
      
      default:
        return new Response(JSON.stringify({ error: `Unknown intent: ${intent}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Orchestrator error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Get AI configuration (Azure OpenAI or OpenAI)
// Helper to validate Azure endpoint URL
function isValidAzureEndpoint(endpoint: string | undefined): boolean {
  if (!endpoint) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && url.hostname.includes('.');
  } catch {
    return false;
  }
}

// Support encrypted configs saved via the secure-credentials flow.
// When a value is saved as: { __encrypted: true, value: "base64" }, decrypt it using CREDENTIAL_ENCRYPTION_KEY.
const CREDENTIAL_ENCRYPTION_KEY = Deno.env.get('CREDENTIAL_ENCRYPTION_KEY') || '';

type EncryptedField = { __encrypted: true; value: string };

function isEncryptedField(v: unknown): v is EncryptedField {
  return !!v && typeof v === 'object' && (v as any).__encrypted === true && typeof (v as any).value === 'string';
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function deriveAesGcmKey(keyMaterial: string): Promise<CryptoKey> {
  const keyData = new TextEncoder().encode(keyMaterial.padEnd(32, '0').slice(0, 32));
  return await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['decrypt']);
}

async function decryptAesGcmBase64(combinedBase64: string, keyMaterial: string): Promise<string> {
  const combined = new Uint8Array(base64ToArrayBuffer(combinedBase64));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const key = await deriveAesGcmKey(keyMaterial);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

async function readConfigStringField(v: unknown): Promise<string | undefined> {
  if (typeof v === 'string') return v;
  if (isEncryptedField(v)) {
    if (!CREDENTIAL_ENCRYPTION_KEY) {
      console.warn('Encrypted integration config found but CREDENTIAL_ENCRYPTION_KEY is not configured');
      return undefined;
    }
    try {
      return await decryptAesGcmBase64(v.value, CREDENTIAL_ENCRYPTION_KEY);
    } catch (e) {
      console.warn('Failed to decrypt integration config field:', e);
      return undefined;
    }
  }
  return undefined;
}

async function getAIConfig(
  supabase: any,
  projectId: string,
  openaiKey?: string,
  azureKey?: string,
  azureEndpoint?: string
) {
  // NOTE: In this app, the Integrations module stores *Azure OpenAI* under integration_id = 'openai'.
  // We also support legacy/alternate key 'azure_openai'.
  const [{ data: openaiIntegration }, { data: azureIntegration }] = await Promise.all([
    supabase
      .from('integration_configs')
      .select('config')
      .eq('project_id', projectId)
      .eq('integration_id', 'openai')
      .eq('enabled', true)
      .maybeSingle(),
    supabase
      .from('integration_configs')
      .select('config')
      .eq('project_id', projectId)
      .eq('integration_id', 'azure_openai')
      .eq('enabled', true)
      .maybeSingle(),
  ]);

  // 1) Prefer Azure OpenAI config coming from Integrations module (integration_id: 'openai')
  const preferredConfig = openaiIntegration?.config || azureIntegration?.config;
  if (preferredConfig) {
    const configEndpoint = (await readConfigStringField((preferredConfig as any).endpoint)) || azureEndpoint;
    const configApiKey = (await readConfigStringField((preferredConfig as any).apiKey)) || azureKey;

    // Integrations uses `deploymentId`; keep backward-compat with `deploymentName`
    const deploymentName = (preferredConfig as any).deploymentId || (preferredConfig as any).deploymentName || 'gpt-4o';
    const embeddingDeployment = (preferredConfig as any).embeddingDeployment || 'text-embedding-3-small';
    const apiVersion = (preferredConfig as any).apiVersion || '2024-02-01';

    // If an Azure endpoint is configured, always treat this as Azure OpenAI.
    if (configApiKey && isValidAzureEndpoint(configEndpoint)) {
      console.log('Using Azure OpenAI config from Integrations module');
      return {
        provider: 'azure',
        apiKey: configApiKey,
        endpoint: configEndpoint,
        deploymentName,
        embeddingDeployment,
        apiVersion,
      };
    }
  }

  // 2) Fall back to environment variables
  if (azureKey && isValidAzureEndpoint(azureEndpoint)) {
    console.log('Using Azure OpenAI config from environment variables');
    return {
      provider: 'azure',
      apiKey: azureKey,
      endpoint: azureEndpoint,
      deploymentName: 'gpt-4o',
      embeddingDeployment: 'text-embedding-3-small',
      apiVersion: '2024-02-01',
    };
  }

  if (openaiKey) {
    console.log('Using OpenAI config from environment variables');
    return {
      provider: 'openai',
      apiKey: openaiKey,
    };
  }

  throw new Error('No AI provider configured. Please configure Azure OpenAI in the Integrations module, or set environment variables.');
}

// Generate embedding for text
async function generateEmbedding(aiConfig: any, text: string): Promise<number[]> {
  if (aiConfig.provider === 'azure') {
    const response = await fetch(
      `${aiConfig.endpoint}/openai/deployments/${aiConfig.embeddingDeployment}/embeddings?api-version=${aiConfig.apiVersion || '2024-02-01'}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': aiConfig.apiKey,
        },
        body: JSON.stringify({
          input: text,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Azure embedding error: ${error}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  } else {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI embedding error: ${error}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }
}

// Call LLM for chat completion
async function callLLM(aiConfig: any, systemPrompt: string, userPrompt: string): Promise<string> {
  if (aiConfig.provider === 'azure') {
    const response = await fetch(
      `${aiConfig.endpoint}/openai/deployments/${aiConfig.deploymentName}/chat/completions?api-version=${aiConfig.apiVersion || '2024-02-01'}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': aiConfig.apiKey,
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 4000,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Azure LLM error: ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } else {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI LLM error: ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }
}

// Store embedding for a QA artifact
async function storeEmbedding(supabase: any, aiConfig: any, request: OrchestratorRequest, userId: string) {
  const { projectId, content, artifactType, artifactId, metadata } = request;

  if (!content || !artifactType || !artifactId) {
    throw new Error('content, artifactType, and artifactId are required');
  }

  console.log(`Generating embedding for ${artifactType}: ${artifactId}`);
  
  // Try to generate embedding, but don't fail if it doesn't work
  let embedding: number[] | null = null;
  let embeddingError: string | null = null;
  
  try {
    embedding = await generateEmbedding(aiConfig, content);
  } catch (e) {
    console.warn(`Embedding generation failed (non-blocking): ${e.message}`);
    embeddingError = e.message;
  }

  // Check if embedding already exists
  const { data: existing } = await supabase
    .from('qa_embeddings')
    .select('id')
    .eq('artifact_type', artifactType)
    .eq('artifact_id', artifactId)
    .single();

  if (existing) {
    // Update existing record
    const updateData: any = {
      content,
      metadata,
      updated_at: new Date().toISOString(),
    };
    if (embedding) {
      updateData.embedding = `[${embedding.join(',')}]`;
    }
    
    const { error } = await supabase
      .from('qa_embeddings')
      .update(updateData)
      .eq('id', existing.id);

    if (error) throw error;
    return { 
      success: true, 
      action: 'updated', 
      embeddingId: existing.id,
      embeddingGenerated: !!embedding,
      embeddingError,
    };
  } else {
    // Insert new record (with or without embedding)
    const insertData: any = {
      project_id: projectId,
      artifact_type: artifactType,
      artifact_id: artifactId,
      content,
      metadata,
      created_by: userId,
    };
    if (embedding) {
      insertData.embedding = `[${embedding.join(',')}]`;
    }
    
    const { data, error } = await supabase
      .from('qa_embeddings')
      .insert(insertData)
      .select('id')
      .single();

    if (error) throw error;
    return { 
      success: true, 
      action: 'created', 
      embeddingId: data.id,
      embeddingGenerated: !!embedding,
      embeddingError,
    };
  }
}

// Perform semantic search
async function semanticSearch(supabase: any, aiConfig: any, request: OrchestratorRequest) {
  const { projectId, searchQuery, artifactType, limit = 5 } = request;

  if (!searchQuery) {
    throw new Error('searchQuery is required');
  }

  console.log(`Semantic search: "${searchQuery}" in project ${projectId}`);
  const queryEmbedding = await generateEmbedding(aiConfig, searchQuery);

  // Use pgvector for similarity search
  let query = supabase.rpc('match_qa_embeddings', {
    query_embedding: `[${queryEmbedding.join(',')}]`,
    match_threshold: 0.5,
    match_count: limit,
    p_project_id: projectId,
  });

  if (artifactType) {
    query = query.eq('artifact_type', artifactType);
  }

  const { data, error } = await query;

  if (error) {
    // If RPC doesn't exist, fall back to basic query
    console.log('RPC not available, using basic query');
    const { data: basicData, error: basicError } = await supabase
      .from('qa_embeddings')
      .select('*')
      .eq('project_id', projectId)
      .eq('is_approved', true)
      .limit(limit);

    if (basicError) throw basicError;
    return { results: basicData || [], method: 'basic' };
  }

  return { results: data || [], method: 'semantic' };
}

// Generate test cases with context from similar approved artifacts
async function generateTestCases(supabase: any, aiConfig: any, request: OrchestratorRequest, userId: string) {
  const { projectId, userStory } = request;

  if (!userStory) {
    throw new Error('userStory is required for test case generation');
  }

  // Build search query from user story
  const searchContent = `${userStory.title} ${userStory.description} ${userStory.acceptanceCriteria || ''}`;
  
  // Find similar approved test cases
  let similarTestCases: any[] = [];
  try {
    const searchResult = await semanticSearch(supabase, aiConfig, {
      ...request,
      searchQuery: searchContent,
      artifactType: 'test_case',
      limit: 3,
    });
    similarTestCases = searchResult.results || [];
  } catch (e) {
    console.log('Semantic search failed, continuing without similar examples:', e.message);
  }

  // Get QA standards for the project
  const { data: standards } = await supabase
    .from('qa_standards')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_active', true);

  // Get proven patterns
  const { data: patterns } = await supabase
    .from('qa_proven_patterns')
    .select('*')
    .eq('pattern_type', 'test_case_template')
    .gte('confidence_score', 0.7)
    .order('confidence_score', { ascending: false })
    .limit(3);

  // Build context-aware prompt
  const systemPrompt = buildTestCaseSystemPrompt(standards, patterns, similarTestCases);
  const userPrompt = buildTestCaseUserPrompt(userStory);

  console.log('Generating test cases with AI-learned context');
  const response = await callLLM(aiConfig, systemPrompt, userPrompt);

  // Parse and return test cases
  let testCases;
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      testCases = JSON.parse(jsonMatch[0]);
    } else {
      testCases = JSON.parse(response);
    }
  } catch (e) {
    console.log('Failed to parse JSON, returning raw response');
    testCases = [{ raw: response }];
  }

  return {
    testCases,
    context: {
      similarExamplesUsed: similarTestCases.length,
      standardsApplied: standards?.length || 0,
      appliedStandardNames: standards?.map((s: any) => s.name) || [],
      patternsUsed: patterns?.length || 0,
    },
  };
}

// Suggest automation steps based on test case
async function suggestAutomation(supabase: any, aiConfig: any, request: OrchestratorRequest, userId: string) {
  const { projectId, testCase } = request;

  if (!testCase) {
    throw new Error('testCase is required for automation suggestion');
  }

  // Find similar automation patterns
  const searchContent = `${testCase.title} ${testCase.steps}`;
  let similarAutomations: any[] = [];
  try {
    const searchResult = await semanticSearch(supabase, aiConfig, {
      ...request,
      searchQuery: searchContent,
      artifactType: 'automation_step',
      limit: 3,
    });
    similarAutomations = searchResult.results || [];
  } catch (e) {
    console.log('Semantic search failed:', e.message);
  }

  // Get proven automation patterns
  const { data: patterns } = await supabase
    .from('qa_proven_patterns')
    .select('*')
    .eq('pattern_type', 'automation_flow')
    .gte('confidence_score', 0.7)
    .order('confidence_score', { ascending: false })
    .limit(3);

  const systemPrompt = buildAutomationSystemPrompt(patterns, similarAutomations);
  const userPrompt = buildAutomationUserPrompt(testCase);

  console.log('Generating automation suggestions with learned patterns');
  const response = await callLLM(aiConfig, systemPrompt, userPrompt);

  let automationSteps;
  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      automationSteps = JSON.parse(jsonMatch[0]);
    } else {
      automationSteps = JSON.parse(response);
    }
  } catch (e) {
    automationSteps = [{ raw: response }];
  }

  return {
    automationSteps,
    context: {
      similarExamplesUsed: similarAutomations.length,
      patternsUsed: patterns?.length || 0,
    },
  };
}

// Analyze defect and suggest resolution
async function analyzeDefect(supabase: any, aiConfig: any, request: OrchestratorRequest, userId: string) {
  const { projectId, defect } = request;

  if (!defect) {
    throw new Error('defect is required for defect analysis');
  }

  // Find similar resolved defects
  const searchContent = `${defect.title} ${defect.description}`;
  let similarDefects: any[] = [];
  try {
    const searchResult = await semanticSearch(supabase, aiConfig, {
      ...request,
      searchQuery: searchContent,
      artifactType: 'defect',
      limit: 5,
    });
    similarDefects = searchResult.results || [];
  } catch (e) {
    console.log('Semantic search failed:', e.message);
  }

  // Get defect resolution patterns
  const { data: patterns } = await supabase
    .from('qa_proven_patterns')
    .select('*')
    .eq('pattern_type', 'defect_resolution')
    .gte('confidence_score', 0.6)
    .order('confidence_score', { ascending: false })
    .limit(3);

  const systemPrompt = buildDefectAnalysisSystemPrompt(patterns, similarDefects);
  const userPrompt = buildDefectAnalysisUserPrompt(defect);

  console.log('Analyzing defect with historical context');
  const response = await callLLM(aiConfig, systemPrompt, userPrompt);

  let analysis;
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      analysis = JSON.parse(jsonMatch[0]);
    } else {
      analysis = JSON.parse(response);
    }
  } catch (e) {
    analysis = { raw: response };
  }

  return {
    analysis,
    context: {
      similarDefectsFound: similarDefects.length,
      patternsUsed: patterns?.length || 0,
    },
  };
}

// Recommend patterns for a project
async function recommendPatterns(supabase: any, aiConfig: any, request: OrchestratorRequest) {
  const { projectId } = request;

  // Get high-confidence patterns
  const { data: globalPatterns } = await supabase
    .from('qa_proven_patterns')
    .select('*')
    .eq('is_global', true)
    .gte('confidence_score', 0.7)
    .order('confidence_score', { ascending: false })
    .limit(10);

  // Get project-specific patterns
  const { data: projectPatterns } = await supabase
    .from('qa_proven_patterns')
    .select('*')
    .contains('project_ids', [projectId])
    .gte('confidence_score', 0.6)
    .order('confidence_score', { ascending: false })
    .limit(10);

  return {
    globalPatterns: globalPatterns || [],
    projectPatterns: projectPatterns || [],
  };
}

// Build system prompts with learned context
function buildTestCaseSystemPrompt(standards: any[], patterns: any[], examples: any[]): string {
  let prompt = `You are an expert QA engineer that generates comprehensive test cases. You learn from organization-specific standards and proven patterns.

RESPONSE FORMAT:
Return a JSON array of test cases with this structure:
[
  {
    "title": "Test case title",
    "description": "Brief description",
    "type": "Functional|Integration|Regression|UI|API|Security|Performance",
    "priority": "High|Medium|Low",
    "steps": "Step 1: ...\\nStep 2: ...\\nStep 3: ...",
    "expectedResult": "Expected outcome",
    "testData": "Any required test data"
  }
]

Generate 3-5 test cases covering positive, negative, and edge cases.`;

  if (standards && standards.length > 0) {
    prompt += '\n\nORGANIZATION QA STANDARDS:\n';
    standards.forEach(s => {
      prompt += `- ${s.name}: ${JSON.stringify(s.rules)}\n`;
    });
  }

  if (patterns && patterns.length > 0) {
    prompt += '\n\nPROVEN PATTERNS (use these as templates):\n';
    patterns.forEach(p => {
      prompt += `- ${p.pattern_name} (confidence: ${p.confidence_score}): ${p.description || ''}\n`;
    });
  }

  if (examples && examples.length > 0) {
    prompt += '\n\nSIMILAR APPROVED TEST CASES (learn from these):\n';
    examples.forEach((e, i) => {
      prompt += `Example ${i + 1}:\n${e.content}\n\n`;
    });
  }

  return prompt;
}

function buildTestCaseUserPrompt(userStory: any): string {
  return `Generate test cases for this user story:

TITLE: ${userStory.title}

DESCRIPTION:
${userStory.description}

${userStory.acceptanceCriteria ? `ACCEPTANCE CRITERIA:\n${userStory.acceptanceCriteria}` : ''}

Return ONLY the JSON array, no additional text.`;
}

function buildAutomationSystemPrompt(patterns: any[], examples: any[]): string {
  let prompt = `You are an expert test automation engineer specializing in Playwright. Generate automation steps that can be executed by a no-code test runner.

RESPONSE FORMAT:
Return a JSON array of automation steps:
[
  {
    "action": "navigate|click|type|select|verify|wait|screenshot",
    "selector": "CSS selector or XPath",
    "value": "Value for input actions",
    "description": "Human-readable description"
  }
]

Use robust selectors (data-testid preferred, then aria-label, then semantic HTML).`;

  if (patterns && patterns.length > 0) {
    prompt += '\n\nPROVEN AUTOMATION PATTERNS:\n';
    patterns.forEach(p => {
      prompt += `- ${p.pattern_name}: ${JSON.stringify(p.pattern_content)}\n`;
    });
  }

  if (examples && examples.length > 0) {
    prompt += '\n\nSIMILAR SUCCESSFUL AUTOMATIONS:\n';
    examples.forEach((e, i) => {
      prompt += `Example ${i + 1}:\n${e.content}\n\n`;
    });
  }

  return prompt;
}

function buildAutomationUserPrompt(testCase: any): string {
  return `Generate Playwright automation steps for this test case:

TITLE: ${testCase.title}

TEST STEPS:
${testCase.steps}

EXPECTED RESULT:
${testCase.expectedResult}

Return ONLY the JSON array, no additional text.`;
}

function buildDefectAnalysisSystemPrompt(patterns: any[], examples: any[]): string {
  let prompt = `You are an expert QA analyst specializing in defect triage and root cause analysis.

RESPONSE FORMAT:
Return a JSON object:
{
  "severity": "Critical|High|Medium|Low",
  "category": "Functional|UI|Performance|Security|Integration|Data",
  "rootCause": "Analysis of the likely root cause",
  "suggestedFix": "Recommended approach to fix",
  "similarIssues": ["Related issues to check"],
  "testCoverage": "Suggested additional tests to prevent regression"
}`;

  if (patterns && patterns.length > 0) {
    prompt += '\n\nKNOWN DEFECT PATTERNS:\n';
    patterns.forEach(p => {
      prompt += `- ${p.pattern_name}: ${p.description || JSON.stringify(p.pattern_content)}\n`;
    });
  }

  if (examples && examples.length > 0) {
    prompt += '\n\nSIMILAR RESOLVED DEFECTS:\n';
    examples.forEach((e, i) => {
      prompt += `Example ${i + 1}:\n${e.content}\n\n`;
    });
  }

  return prompt;
}

function buildDefectAnalysisUserPrompt(defect: any): string {
  return `Analyze this defect:

TITLE: ${defect.title}

DESCRIPTION:
${defect.description}

${defect.stepsToReproduce ? `STEPS TO REPRODUCE:\n${defect.stepsToReproduce}` : ''}

Return ONLY the JSON object, no additional text.`;
}