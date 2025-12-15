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
  organizationUrl: string;
  projectName: string;
  personalAccessToken: string;
}

serve(async (req) => {
  console.log('Azure DevOps submit defect function called');

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
      organizationUrl, 
      projectName, 
      personalAccessToken 
    }: DefectSubmissionData = body;

    // Input validation
    if (!title || !organizationUrl || !projectName || !personalAccessToken) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: title, organizationUrl, projectName, and personalAccessToken are required' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate URL format
    try {
      new URL(organizationUrl);
    } catch {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid organization URL format' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Prepare authentication
    const authToken = btoa(`:${personalAccessToken}`);
    
    // Construct Azure DevOps API URL for creating work items
    const baseUrl = organizationUrl.endsWith('/') ? organizationUrl.slice(0, -1) : organizationUrl;
    const createWorkItemUrl = `${baseUrl}/${projectName}/_apis/wit/workitems/$Bug?api-version=7.1`;

    console.log('Creating defect in Azure DevOps:', createWorkItemUrl);

    // Map priority values to Azure DevOps format
    const azurePriority = priority === 'P1' || priority === 'high' ? 1 :
                         priority === 'P2' || priority === 'medium' ? 2 :
                         priority === 'P3' || priority === 'low' ? 3 : 2;

    // Format steps to reproduce and include expected/actual results
    let formattedSteps = Array.isArray(stepsToReproduce) 
      ? stepsToReproduce.map((step, index) => `${index + 1}. ${step}`).join('\n')
      : stepsToReproduce || '';

    // Add expected and actual results to reproduction steps if provided
    if (expectedResult || actualResult) {
      formattedSteps += '\n\n';
      if (expectedResult) {
        formattedSteps += `Expected Result: ${expectedResult}\n`;
      }
      if (actualResult) {
        formattedSteps += `Actual Result: ${actualResult}`;
      }
    }

    // Build comprehensive description
    let fullDescription = description || '';
    if (expectedResult || actualResult) {
      fullDescription += '\n\n';
      if (expectedResult) {
        fullDescription += `Expected Result: ${expectedResult}\n`;
      }
      if (actualResult) {
        fullDescription += `Actual Result: ${actualResult}`;
      }
    }

    // Prepare the work item data with only supported fields
    const workItemData = [
      {
        op: "add",
        path: "/fields/System.Title",
        value: title
      },
      {
        op: "add", 
        path: "/fields/System.Description",
        value: fullDescription
      },
      {
        op: "add",
        path: "/fields/Microsoft.VSTS.TCM.ReproSteps",
        value: `<div><b>Steps to Reproduce:</b><br/>${formattedSteps.replace(/\n/g, '<br/>')}</div>`
      },
      {
        op: "add",
        path: "/fields/Microsoft.VSTS.Common.Priority",
        value: azurePriority
      },
      {
        op: "add",
        path: "/fields/Microsoft.VSTS.Common.Severity",
        value: severity || 'Medium'
      },
      {
        op: "add",
        path: "/fields/System.AreaPath",
        value: projectName
      }
    ];

    console.log('Work item data:', JSON.stringify(workItemData, null, 2));

    // Create the work item
    const response = await fetch(createWorkItemUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authToken}`,
        'Content-Type': 'application/json-patch+json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(workItemData),
    });

    console.log('Azure DevOps create defect response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Azure DevOps create defect error:', errorText);
      
      if (response.status === 401) {
        throw new Error('Authentication failed. Please check your Personal Access Token.');
      } else if (response.status === 404) {
        throw new Error('Project not found. Please check your organization URL and project name.');
      } else {
        throw new Error(`Azure DevOps API error: ${response.status} ${response.statusText}\n${errorText}`);
      }
    }

    let createdWorkItem;
    try {
      const responseText = await response.text();
      console.log('Create defect response text (first 200 chars):', responseText.substring(0, 200));
      
      if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
        throw new Error('Received HTML response instead of JSON. Check authentication and URL.');
      }
      
      createdWorkItem = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse create defect response:', parseError);
      throw new Error('Invalid response from Azure DevOps API. Please check your credentials and URL.');
    }

    console.log('Created work item:', { id: createdWorkItem.id, title: createdWorkItem.fields?.['System.Title'] });

    return new Response(
      JSON.stringify({
        success: true,
        workItemId: createdWorkItem.id,
        workItemUrl: createdWorkItem._links?.html?.href,
        title: createdWorkItem.fields?.['System.Title'],
        message: `Successfully created defect #${createdWorkItem.id} in Azure DevOps`
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Azure DevOps submit defect error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred while creating defect in Azure DevOps';
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