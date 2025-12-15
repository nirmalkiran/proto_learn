import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AzureDevOpsWorkItem {
  id: number;
  fields: {
    'System.Title': string;
    'System.Description'?: string;
    'System.WorkItemType': string;
    'Microsoft.VSTS.Common.Priority'?: number;
    'System.State': string;
    'Microsoft.VSTS.Common.AcceptanceCriteria'?: string;
  };
}

serve(async (req) => {
  console.log('Azure DevOps integration function called');

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
    console.log('Request body:', body);

    const { organizationUrl, projectName, personalAccessToken, action, boardId, sprintId } = body;

    console.log('Parsed action:', action, typeof action);

    // Input validation
    if (!organizationUrl || !projectName || !personalAccessToken) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: organizationUrl, projectName, and personalAccessToken are required' 
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

    // Validate input lengths (security measure)
    if (organizationUrl.length > 200 || projectName.length > 100 || personalAccessToken.length > 200) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Input values exceed maximum allowed length' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Prepare authentication
    const authToken = btoa(`:${personalAccessToken}`);
    const baseUrl = organizationUrl.endsWith('/') ? organizationUrl.slice(0, -1) : organizationUrl;

    // Handle get-boards action
    console.log('Checking action:', action, 'Type:', typeof action, 'Equals get-boards:', action === 'get-boards');
    if (action === 'get-boards') {
      console.log(`Fetching Azure DevOps teams/boards for project: ${projectName}`);
      
      try {
        const teamsUrl = `${baseUrl}/_apis/projects/${encodeURIComponent(projectName)}/teams?api-version=7.1`;
        const teamsResponse = await fetch(teamsUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${authToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
        });

        console.log('Azure DevOps Teams API response status:', teamsResponse.status);

        const responseText = await teamsResponse.text();
        console.log('Teams response text (first 200 chars):', responseText.substring(0, 200));

        if (!teamsResponse.ok) {
          if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
            throw new Error('Authentication failed or invalid URL. Please check your Personal Access Token and organization URL.');
          }
          if (teamsResponse.status === 401) {
            throw new Error('Authentication failed. Please check your Personal Access Token.');
          } else if (teamsResponse.status === 404) {
            throw new Error('Project not found. Please check your organization URL and project name.');
          } else {
            throw new Error(`Azure DevOps Teams API error: ${teamsResponse.status} ${teamsResponse.statusText}`);
          }
        }

        if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
          throw new Error('Received HTML response instead of JSON. Check authentication and URL.');
        }

        let teamsData;
        try {
          teamsData = JSON.parse(responseText);
        } catch (parseError) {
          console.error('Failed to parse teams response:', parseError);
          throw new Error('Invalid response from Azure DevOps API. Please check your credentials and URL.');
        }

        const boards = (teamsData.value || []).map((team: any) => ({
          id: team.id,
          name: team.name,
          source: 'azure'
        }));

        console.log(`Successfully fetched ${boards.length} teams/boards from Azure DevOps`);

        return new Response(
          JSON.stringify({
            success: true,
            boards: boards
          }),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      } catch (error) {
        console.error('Error fetching Azure DevOps boards:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Failed to fetch Azure DevOps boards: ' + errorMessage
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
    }
    
    // Handle get-sprints action
    if (action === 'get-sprints') {
      if (!boardId) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Team ID (boardId) is required to fetch sprints' 
          }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
      
      console.log(`Fetching Azure DevOps sprints for team: ${boardId}`);
      
      try {
        const sprintsUrl = `${baseUrl}/${encodeURIComponent(projectName)}/${boardId}/_apis/work/teamsettings/iterations?api-version=7.1`;
        const sprintsResponse = await fetch(sprintsUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${authToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
        });

        if (!sprintsResponse.ok) {
          const errorText = await sprintsResponse.text();
          console.error('Azure DevOps Sprints API error:', sprintsResponse.status, errorText);
          throw new Error(`Azure DevOps Sprints API error: ${sprintsResponse.status}`);
        }

        const sprintsData = await sprintsResponse.json();
        const sprints = (sprintsData.value || []).map((sprint: any) => ({
          id: sprint.path || sprint.id, // Use path for WIQL filtering
          name: sprint.name,
          state: sprint.attributes?.timeFrame || 'unknown'
        }));

        console.log(`Successfully fetched ${sprints.length} sprints from Azure DevOps`);

        return new Response(
          JSON.stringify({
            success: true,
            sprints: sprints
          }),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      } catch (error) {
        console.error('Error fetching Azure DevOps sprints:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Failed to fetch Azure DevOps sprints: ' + errorMessage
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
    }

    console.log('Action is not get-boards or get-sprints, proceeding to work items. Action:', action);

    // Construct Azure DevOps API URL for work items using WIQL
    const wiqlUrl = `${baseUrl}/_apis/wit/wiql?api-version=7.1`;

    console.log('Fetching from Azure DevOps WIQL API:', wiqlUrl);

    // WIQL query to get User Stories and Features for the specific project
    // Limit to 50 items to avoid URL length issues and performance problems
    let wiqlQueryString = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${projectName}' AND ([System.WorkItemType] = 'User Story' OR [System.WorkItemType] = 'Feature')`;
    
    // Add team filter if boardId (teamId) is provided
    if (boardId) {
      console.log(`Filtering by team/board ID: ${boardId}`);
      
      // Use team context to filter work items instead of area path
      // Area paths don't always match team names, so we'll get team configuration
      try {
        const teamSettingsUrl = `${baseUrl}/${encodeURIComponent(projectName)}/${boardId}/_apis/work/teamsettings?api-version=7.1`;
        const teamSettingsResponse = await fetch(teamSettingsUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${authToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
        });

        if (teamSettingsResponse.ok) {
          const teamSettings = await teamSettingsResponse.json();
          const defaultAreaPath = teamSettings.defaultValue?.areaPath;
          console.log(`Team default area path: ${defaultAreaPath}`);
          
          if (defaultAreaPath) {
            // Filter by the team's configured area path
            wiqlQueryString += ` AND [System.AreaPath] UNDER '${defaultAreaPath}'`;
          } else {
            console.log('No default area path found for team, skipping area filter');
          }
        } else {
          console.log('Could not fetch team settings, skipping area path filter');
        }
      } catch (teamError) {
        console.error('Error fetching team settings:', teamError);
        console.log('Skipping area path filter due to error');
      }
    }
    
    // Add sprint filter if sprintId is provided
    if (body.sprintId) {
      console.log(`Filtering by sprint/iteration path: ${body.sprintId}`);
      wiqlQueryString += ` AND [System.IterationPath] = '${body.sprintId}'`;
    }
    
    wiqlQueryString += ` ORDER BY [System.CreatedDate] DESC`;

    const wiqlQuery = {
      query: wiqlQueryString
    };

    // First, get work item IDs using WIQL
    const wiqlResponse = await fetch(wiqlUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(wiqlQuery),
    });

    console.log('Azure DevOps WIQL response status:', wiqlResponse.status);

    if (!wiqlResponse.ok) {
      const errorText = await wiqlResponse.text();
      console.error('Azure DevOps WIQL error:', errorText);
      
      // Check if response is HTML (authentication failure usually returns HTML)
      if (errorText.includes('<!DOCTYPE') || errorText.includes('<html')) {
        throw new Error('Authentication failed or invalid URL. Please check your Personal Access Token and organization URL.');
      }
      
      if (wiqlResponse.status === 401) {
        throw new Error('Authentication failed. Please check your Personal Access Token.');
      } else if (wiqlResponse.status === 404) {
        throw new Error('Project not found. Please check your organization URL and project name.');
      } else {
        throw new Error(`Azure DevOps WIQL API error: ${wiqlResponse.status} ${wiqlResponse.statusText}`);
      }
    }

    let wiqlData;
    try {
      const responseText = await wiqlResponse.text();
      console.log('WIQL response text (first 200 chars):', responseText.substring(0, 200));
      
      // Check if response is HTML
      if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
        throw new Error('Received HTML response instead of JSON. Check authentication and URL.');
      }
      
      wiqlData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse WIQL response:', parseError);
      throw new Error('Invalid response from Azure DevOps API. Please check your credentials and URL.');
    }

    console.log('WIQL response:', { workItemCount: wiqlData.workItems?.length || 0 });

    if (!wiqlData.workItems || wiqlData.workItems.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          stories: [],
          message: 'No User Stories or Features found in the specified project'
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Get all work item IDs
    const allWorkItemIds = wiqlData.workItems.map((item: any) => item.id);
    console.log(`Processing ${allWorkItemIds.length} work items from Azure DevOps`);
    
    if (allWorkItemIds.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          stories: [],
          message: 'No accessible User Stories or Features found in the specified project'
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    // Azure DevOps API can handle up to 200 work items per request
    // Process in batches to avoid URL length issues
    const batchSize = 200;
    const allWorkItems: AzureDevOpsWorkItem[] = [];
    
    for (let i = 0; i < allWorkItemIds.length; i += batchSize) {
      const batchIds = allWorkItemIds.slice(i, i + batchSize);
      const idsParam = batchIds.join(',');
      
      // Get the full work item details for this batch
      const workItemsUrl = `${baseUrl}/_apis/wit/workitems?ids=${idsParam}&$expand=Fields&api-version=7.1`;
      console.log(`Fetching batch ${Math.floor(i / batchSize) + 1}: ${batchIds.length} work items`);

      const response = await fetch(workItemsUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${authToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      console.log(`Batch ${Math.floor(i / batchSize) + 1} response status:`, response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Azure DevOps work items error:', errorText);
        
        if (errorText.includes('<!DOCTYPE') || errorText.includes('<html')) {
          throw new Error('Authentication failed or invalid URL. Please check your credentials.');
        }
        
        if (response.status === 404) {
          // Some work items might not be accessible, try to get more info
          throw new Error(`Work items not found or not accessible. This might be due to permissions or the work items have been moved/deleted. Please verify your access to the project "${projectName}".`);
        }
        
        throw new Error(`Azure DevOps API error: ${response.status} ${response.statusText}`);
      }

      let data;
      try {
        const responseText = await response.text();
        console.log(`Batch ${Math.floor(i / batchSize) + 1} response (first 200 chars):`, responseText.substring(0, 200));
        
        if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
          throw new Error('Received HTML response instead of JSON. Check authentication and URL.');
        }
        
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse work items response:', parseError);
        throw new Error('Invalid response from Azure DevOps API. Please check your credentials and URL.');
      }

      // Add work items from this batch to the collection
      if (data.value && Array.isArray(data.value)) {
        allWorkItems.push(...data.value);
        console.log(`Batch ${Math.floor(i / batchSize) + 1} added ${data.value.length} work items. Total so far: ${allWorkItems.length}`);
      }
    }

    console.log('All batches processed. Total work items:', allWorkItems.length);

    // Transform work items to user stories format
    const userStories = allWorkItems.map((workItem: AzureDevOpsWorkItem) => ({
      id: workItem.id.toString(),
      title: workItem.fields['System.Title'] || 'Untitled',
      description: workItem.fields['System.Description'] || 'No description available',
      acceptanceCriteria: workItem.fields['Microsoft.VSTS.Common.AcceptanceCriteria'] || '',
      priority: workItem.fields['Microsoft.VSTS.Common.Priority'] ? 
        workItem.fields['Microsoft.VSTS.Common.Priority'] === 1 ? 'high' :
        workItem.fields['Microsoft.VSTS.Common.Priority'] === 2 ? 'medium' :
        workItem.fields['Microsoft.VSTS.Common.Priority'] === 3 ? 'low' : 'medium'
        : 'medium',
      status: workItem.fields['System.State']?.toLowerCase() || 'new',
      issueType: workItem.fields['System.WorkItemType'] || 'User Story',
      azureDevOpsId: workItem.id,
      source: 'azure-devops'
    }));

    console.log('Transformed user stories:', { count: userStories.length });

    return new Response(
      JSON.stringify({
        success: true,
        stories: userStories,
        message: `Successfully fetched ${userStories.length} user stories from Azure DevOps`
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Azure DevOps integration error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred while connecting to Azure DevOps';
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