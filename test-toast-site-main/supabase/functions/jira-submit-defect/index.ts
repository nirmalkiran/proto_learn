import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DefectSubmissionData {
  title: string;
  description: string;
  stepsToReproduce: string[];
  expectedResult: string;
  actualResult: string;
  priority: string;
  severity: string;
  jiraUrl: string;
  projectKey: string;
  email: string;
  apiToken: string;
}

serve(async (req) => {
  console.log('Jira submit defect function called');

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  try {
    const body = await req.json();
    console.log('Request body:', JSON.stringify(body, null, 2));

    const { 
      title,
      description, 
      stepsToReproduce,
      expectedResult,
      actualResult,
      priority,
      severity,
      jiraUrl, 
      projectKey, 
      email,
      apiToken 
    }: DefectSubmissionData = body;

    // Input validation
    if (!title || !jiraUrl || !projectKey || !email || !apiToken) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: title, jiraUrl, projectKey, email, and apiToken are required' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate URL format
    try {
      new URL(jiraUrl);
    } catch {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid Jira URL format' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Prepare authentication
    const authToken = btoa(`${email}:${apiToken}`);
    
    // Construct Jira API URL for creating issues
    const baseUrl = jiraUrl.endsWith('/') ? jiraUrl.slice(0, -1) : jiraUrl;
    const createIssueUrl = `${baseUrl}/rest/api/3/issue`;

    console.log('Creating defect in Jira:', createIssueUrl);

    // First, get available issue types for this project
    console.log('Fetching available issue types for project:', projectKey);
    const issueTypesUrl = `${baseUrl}/rest/api/3/issuetype/project?projectId=${projectKey}`;
    const metaUrl = `${baseUrl}/rest/api/3/issue/createmeta?projectKeys=${projectKey}&expand=projects.issuetypes`;
    
    let issueTypeName = 'Bug'; // Default
    
    try {
      // Try to get available issue types from createmeta endpoint
      const metaResponse = await fetch(metaUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${authToken}`,
          'Accept': 'application/json',
        },
      });
      
      if (metaResponse.ok) {
        const metaData = await metaResponse.json();
        console.log('Available issue types metadata:', JSON.stringify(metaData, null, 2));
        
        // Extract available issue types from the response
        const projects = metaData.projects || [];
        const project = projects.find((p: any) => p.key === projectKey);
        
        if (project && project.issuetypes && project.issuetypes.length > 0) {
          const issueTypes = project.issuetypes;
          const typeNames = issueTypes.map((t: any) => t.name.toLowerCase());
          
          console.log('Available issue type names:', typeNames);
          
          // Priority order: Bug, Defect, Error, Issue, Task
          const preferredTypes = ['bug', 'defect', 'error', 'issue', 'task'];
          
          for (const preferred of preferredTypes) {
            const found = issueTypes.find((t: any) => t.name.toLowerCase() === preferred);
            if (found) {
              issueTypeName = found.name;
              console.log('Using issue type:', issueTypeName);
              break;
            }
          }
          
          // If none of the preferred types found, use the first available subtask-free type
          if (issueTypeName === 'Bug' && !typeNames.includes('bug')) {
            const nonSubtask = issueTypes.find((t: any) => !t.subtask);
            if (nonSubtask) {
              issueTypeName = nonSubtask.name;
              console.log('Falling back to first available issue type:', issueTypeName);
            }
          }
        }
      } else {
        console.log('Could not fetch issue types metadata, using default:', issueTypeName);
      }
    } catch (metaError) {
      console.log('Error fetching issue types, using default:', metaError);
    }

    // Map priority values to Jira format
    const jiraPriority = priority === 'P1' || priority === 'high' ? 'Highest' :
                         priority === 'P2' || priority === 'medium' ? 'High' :
                         priority === 'P3' || priority === 'low' ? 'Medium' : 'Medium';

    // Format steps to reproduce and include expected/actual results
    let formattedSteps = Array.isArray(stepsToReproduce) 
      ? stepsToReproduce.map((step, index) => `${index + 1}. ${step}`).join('\n')
      : stepsToReproduce || '';

    // Build comprehensive description in Atlassian Document Format (ADF)
    const descriptionParts = [];
    
    if (description) {
      descriptionParts.push(description);
    }
    
    if (formattedSteps) {
      descriptionParts.push('\n\n*Steps to Reproduce:*\n' + formattedSteps);
    }
    
    if (expectedResult) {
      descriptionParts.push('\n\n*Expected Result:*\n' + expectedResult);
    }
    
    if (actualResult) {
      descriptionParts.push('\n\n*Actual Result:*\n' + actualResult);
    }
    
    if (severity) {
      descriptionParts.push('\n\n*Severity:*\n' + severity);
    }

    const fullDescription = descriptionParts.join('');

    // Prepare the issue data in Jira API v3 format with ADF
    const issueData = {
      fields: {
        project: {
          key: projectKey
        },
        summary: title,
        description: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: fullDescription
                }
              ]
            }
          ]
        },
        issuetype: {
          name: issueTypeName
        },
        priority: {
          name: jiraPriority
        }
      }
    };

    console.log('Issue data:', JSON.stringify(issueData, null, 2));

    // Create the issue
    const response = await fetch(createIssueUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(issueData),
    });

    console.log('Jira create issue response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Jira create issue error:', errorText);
      
      if (response.status === 401) {
        throw new Error('Authentication failed. Please check your email and API token.');
      } else if (response.status === 404) {
        throw new Error('Project not found. Please check your Jira URL and project key.');
      } else if (response.status === 400) {
        // Try to parse the error for more details
        try {
          const errorJson = JSON.parse(errorText);
          const errorMessages = errorJson.errors ? Object.values(errorJson.errors).join(', ') : errorText;
          throw new Error(`Jira validation error: ${errorMessages}`);
        } catch {
          throw new Error(`Jira API error: ${response.status} ${response.statusText}\n${errorText}`);
        }
      } else {
        throw new Error(`Jira API error: ${response.status} ${response.statusText}\n${errorText}`);
      }
    }

    let createdIssue;
    try {
      const responseText = await response.text();
      console.log('Create issue response text (first 200 chars):', responseText.substring(0, 200));
      
      if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
        throw new Error('Received HTML response instead of JSON. Check authentication and URL.');
      }
      
      createdIssue = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse create issue response:', parseError);
      throw new Error('Invalid response from Jira API. Please check your credentials and URL.');
    }

    console.log('Created issue:', { id: createdIssue.id, key: createdIssue.key });

    // Construct the issue URL
    const issueUrl = `${baseUrl}/browse/${createdIssue.key}`;

    return new Response(
      JSON.stringify({
        success: true,
        issueId: createdIssue.id,
        issueKey: createdIssue.key,
        issueUrl: issueUrl,
        title: title,
        message: `Successfully created defect ${createdIssue.key} in Jira`
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Jira submit defect error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred while creating defect in Jira';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
