import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { errorContext, projectId, analyzeOnly = false, proposedFixes = null } = await req.json();

    if (!errorContext || !projectId) {
      throw new Error('Error context and project ID are required');
    }

    console.log('Analyzing test error:', errorContext.testName, 'for project:', projectId);
    console.log('Mode:', analyzeOnly ? 'Analysis only' : 'Apply fixes');

    // If we have proposed fixes to apply, skip AI analysis
    let fixData;
    if (!analyzeOnly && proposedFixes) {
      // Apply the proposed fixes directly
      console.log('Applying proposed fixes...');
      fixData = { fixes: proposedFixes, analysis: 'Applying confirmed fixes' };
    } else {
      // Perform AI analysis
      // Initialize Supabase client
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Fetch Azure OpenAI configuration
      const { data: azureConfig, error: configError } = await supabase
        .from('integration_configs')
        .select('config')
        .eq('project_id', projectId)
        .eq('integration_id', 'openai')
        .eq('enabled', true)
        .single();

      if (configError || !azureConfig) {
        throw new Error('Azure OpenAI integration not configured for this project');
      }

      const { endpoint, apiKey, deploymentId, apiVersion } = azureConfig.config as {
        endpoint: string;
        apiKey: string;
        deploymentId: string;
        apiVersion?: string;
      };

      if (!endpoint || !apiKey || !deploymentId) {
        throw new Error('Invalid Azure OpenAI configuration');
      }

      // Fetch relevant code files from git_files
      const { data: files, error: filesError } = await supabase
        .from('git_files')
        .select('*')
        .eq('project_id', projectId);

      if (filesError) {
        console.error('Error fetching files:', filesError);
        throw new Error('Failed to fetch repository files');
      }

      console.log(`Found ${files?.length || 0} files in repository`);

      // Filter relevant files (test files, source files)
      const relevantFiles = files?.filter(f => 
        f.file_type === 'java' || 
        f.file_path.includes('test') || 
        f.file_path.includes('Test') ||
        f.file_path.includes('.java')
      ) || [];

      console.log(`Analyzing ${relevantFiles.length} relevant files`);

      // Build context with file contents
      const codeContext = relevantFiles
        .slice(0, 10) // Limit to 10 files to avoid token limits
        .map(f => `File: ${f.file_path}\n\`\`\`java\n${f.file_content?.substring(0, 2000) || ''}\n\`\`\``)
        .join('\n\n');

      const systemPrompt = `You are an expert test automation engineer specializing in debugging and fixing Java Selenium test failures. 
You have access to the repository code and need to automatically fix the failing test.

Your task:
1. Analyze the test error in the context of the provided code
2. Identify the exact files and lines that need to be modified
3. Generate the fixed code for those files
4. Return the fixes in a structured JSON format

Return your response as a JSON object with this structure:
{
  "analysis": "Brief explanation of the root cause",
  "fixes": [
    {
      "file_path": "exact/path/to/file.java",
      "fixed_content": "complete fixed file content"
    }
  ]
}

Only include files that actually need changes. Ensure the fixed code is complete and syntactically correct.`;

      const userPrompt = `Test Execution Error:

Test Name: ${errorContext.testName}
Description: ${errorContext.description}

Error Details:
Type: ${errorContext.errorType}
Message: ${errorContext.errorMessage}

${errorContext.logs && errorContext.logs.length > 0 ? `Logs:\n${errorContext.logs.join('\n')}` : ''}

Repository Code Context:
${codeContext}

Analyze this error, identify the root cause in the code, and provide the complete fixed code for any files that need to be modified.`;

      const azureUrl = `${endpoint}/openai/deployments/${deploymentId}/chat/completions?api-version=${apiVersion || '2024-02-15-preview'}`;
      
      const response = await fetch(azureUrl, {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3,
          max_tokens: 4000
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('AI API error:', response.status, errorText);
        throw new Error(`AI API request failed: ${response.status}`);
      }

      const data = await response.json();
      let aiResponse = data.choices?.[0]?.message?.content;

      if (!aiResponse) {
        throw new Error('No response generated from AI');
      }

      console.log('AI response received:', aiResponse.substring(0, 200));

      // Extract JSON from markdown code blocks if present
      const jsonMatch = aiResponse.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        aiResponse = jsonMatch[1];
      }

      // Parse the AI response
      try {
        fixData = JSON.parse(aiResponse);
      } catch (parseError) {
        console.error('Failed to parse AI response as JSON:', parseError);
        // Return the response as a suggestion instead
        return new Response(
          JSON.stringify({ suggestion: aiResponse }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
          }
        );
      }
    }

    // If analyzeOnly mode, return the fixes for confirmation
    if (analyzeOnly) {
      console.log('Analysis complete, returning fixes for confirmation');
      return new Response(
        JSON.stringify({ 
          fixes: fixData.fixes || [],
          analysis: fixData.analysis || 'Analysis completed'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Apply fixes to the database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const filesModified: string[] = [];
    if (fixData.fixes && Array.isArray(fixData.fixes)) {
      for (const fix of fixData.fixes) {
        if (!fix.file_path || !fix.fixed_content) {
          console.warn('Skipping invalid fix:', fix);
          continue;
        }

        // Update the file in git_files table
        const { error: updateError } = await supabase
          .from('git_files')
          .update({ 
            file_content: fix.fixed_content,
            updated_at: new Date().toISOString()
          })
          .eq('project_id', projectId)
          .eq('file_path', fix.file_path);

        if (updateError) {
          console.error(`Error updating file ${fix.file_path}:`, updateError);
        } else {
          filesModified.push(fix.file_path);
          console.log(`Successfully updated: ${fix.file_path}`);
        }
      }
    }

    console.log(`Successfully modified ${filesModified.length} file(s)`);

    return new Response(
      JSON.stringify({ 
        filesModified,
        analysis: fixData.analysis || 'Code has been automatically fixed',
        summary: `${filesModified.length} file(s) updated with fixes`
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in fix-test-error function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
