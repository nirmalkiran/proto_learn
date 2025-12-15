import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validate Azure AD token by verifying it with Microsoft Graph API
async function validateAzureToken(accessToken: string): Promise<{ valid: boolean; userInfo?: { email: string; displayName: string; azureId: string } }> {
  try {
    // Call Microsoft Graph to validate the token and get user info
    const response = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error('Azure token validation failed:', response.status);
      return { valid: false };
    }

    const userData = await response.json();
    
    if (!userData.mail && !userData.userPrincipalName) {
      console.error('No email found in Azure AD response');
      return { valid: false };
    }

    return {
      valid: true,
      userInfo: {
        email: userData.mail || userData.userPrincipalName,
        displayName: userData.displayName || userData.mail || userData.userPrincipalName,
        azureId: userData.id,
      }
    };
  } catch (error) {
    console.error('Error validating Azure token:', error);
    return { valid: false };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { azureAccessToken, action } = await req.json();

    if (action !== 'signin') {
      return new Response(
        JSON.stringify({ error: 'Invalid action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SECURITY: Validate the Azure AD access token server-side
    if (!azureAccessToken) {
      return new Response(
        JSON.stringify({ error: 'Azure access token is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validation = await validateAzureToken(azureAccessToken);
    
    if (!validation.valid || !validation.userInfo) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired Azure AD token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { email, displayName, azureId } = validation.userInfo;

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Processing Azure AD sign in for validated user:', email);

    // Check if user exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    let user = existingUsers?.users?.find(u => u.email === email);

    if (!user) {
      console.log('Creating new user:', email);
      // Create user without password - they'll use Azure AD for auth
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: email,
        email_confirm: true,
        user_metadata: {
          display_name: displayName,
          azure_ad_id: azureId,
          provider: 'azure_ad',
        },
      });

      if (createError) {
        console.error('Failed to create user:', createError);
        throw createError;
      }

      user = newUser.user;
      console.log('User created successfully:', user.id);
    } else {
      console.log('User already exists:', user.id);
      
      // Update existing user metadata
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        user.id,
        {
          user_metadata: {
            display_name: displayName,
            azure_ad_id: azureId,
            provider: 'azure_ad',
          },
        }
      );

      if (updateError) {
        console.error('Failed to update user:', updateError);
        throw updateError;
      }
    }

    // Generate a session for the user directly (no password exposed)
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
      options: {
        redirectTo: `${req.headers.get('origin') || 'https://wispr-qa.lovable.app'}/`,
      }
    });

    if (sessionError) {
      console.error('Failed to generate magic link:', sessionError);
      throw sessionError;
    }

    // Assign user to WISPR project by default
    const wisprProjectId = '3859858d-0555-409a-99ee-e63234e8683b';
    
    // Check if user is already a member of the project
    const { data: existingMembership } = await supabase
      .from('project_members')
      .select('id')
      .eq('project_id', wisprProjectId)
      .eq('user_id', user.id)
      .single();

    if (!existingMembership) {
      const { error: memberError } = await supabase
        .from('project_members')
        .insert({
          project_id: wisprProjectId,
          user_id: user.id,
          role: 'member'
        });

      if (memberError) {
        console.error('Failed to assign user to WISPR project:', memberError);
      } else {
        console.log('User assigned to WISPR project successfully');
      }
    } else {
      console.log('User already member of WISPR project');
    }

    // Return the magic link properties for client-side handling
    // The client will use verifyOtp with the token_hash
    return new Response(
      JSON.stringify({
        success: true,
        user_id: user.id,
        email: email,
        // Include the hashed token for OTP verification
        token_hash: sessionData.properties?.hashed_token,
        verification_type: 'magiclink',
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('Error in azure-ad-auth:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
