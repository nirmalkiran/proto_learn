import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Encryption key from environment (should be 32 bytes for AES-256)
const ENCRYPTION_KEY = Deno.env.get('CREDENTIAL_ENCRYPTION_KEY') || '';

// Convert string to ArrayBuffer
function stringToArrayBuffer(str: string): ArrayBuffer {
  const encoder = new TextEncoder();
  return encoder.encode(str).buffer;
}

// Convert ArrayBuffer to string
function arrayBufferToString(buffer: ArrayBuffer): string {
  const decoder = new TextDecoder();
  return decoder.decode(buffer);
}

// Convert ArrayBuffer to base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Derive a crypto key from the encryption key
async function deriveKey(keyMaterial: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(keyMaterial.padEnd(32, '0').slice(0, 32));
  
  return await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt a string value
async function encryptValue(plaintext: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedText = new TextEncoder().encode(plaintext);
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encodedText
  );
  
  // Combine IV + ciphertext and encode as base64
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  
  return arrayBufferToBase64(combined.buffer);
}

// Decrypt a string value
async function decryptValue(encryptedData: string, key: CryptoKey): Promise<string> {
  const combined = new Uint8Array(base64ToArrayBuffer(encryptedData));
  
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  
  return new TextDecoder().decode(decrypted);
}

// Fields that should be encrypted in config objects
const SENSITIVE_FIELDS = ['apiKey', 'pat', 'token', 'accessToken', 'secretKey', 'password', 'secret'];

// Check if a field name indicates sensitive data
function isSensitiveField(fieldName: string): boolean {
  const lowerName = fieldName.toLowerCase();
  return SENSITIVE_FIELDS.some(sensitive => lowerName.includes(sensitive.toLowerCase()));
}

// Recursively encrypt sensitive fields in an object
async function encryptSensitiveFields(obj: any, key: CryptoKey): Promise<any> {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  
  const result: any = Array.isArray(obj) ? [] : {};
  
  for (const [fieldName, value] of Object.entries(obj)) {
    if (typeof value === 'string' && isSensitiveField(fieldName) && value.length > 0) {
      // Encrypt sensitive string fields
      result[fieldName] = {
        __encrypted: true,
        value: await encryptValue(value, key)
      };
    } else if (typeof value === 'object' && value !== null) {
      result[fieldName] = await encryptSensitiveFields(value, key);
    } else {
      result[fieldName] = value;
    }
  }
  
  return result;
}

// Recursively decrypt sensitive fields in an object
async function decryptSensitiveFields(obj: any, key: CryptoKey): Promise<any> {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  
  const result: any = Array.isArray(obj) ? [] : {};
  
  for (const [fieldName, value] of Object.entries(obj)) {
    if (typeof value === 'object' && value !== null && (value as any).__encrypted) {
      // Decrypt encrypted fields
      try {
        result[fieldName] = await decryptValue((value as any).value, key);
      } catch (error) {
        console.error(`Failed to decrypt field ${fieldName}:`, error);
        result[fieldName] = ''; // Return empty string on decryption failure
      }
    } else if (typeof value === 'object' && value !== null) {
      result[fieldName] = await decryptSensitiveFields(value, key);
    } else {
      result[fieldName] = value;
    }
  }
  
  return result;
}

serve(async (req) => {
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    // Validate user with anon key
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if encryption key is configured
    if (!ENCRYPTION_KEY) {
      console.error('CREDENTIAL_ENCRYPTION_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Encryption not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cryptoKey = await deriveKey(ENCRYPTION_KEY);
    const { action, projectId, integrationId, config } = await req.json();

    // Use service role for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user has access to the project
    const { data: membership } = await supabase
      .from('project_members')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .single();

    const { data: project } = await supabase
      .from('projects')
      .select('created_by')
      .eq('id', projectId)
      .single();

    const hasAccess = membership || project?.created_by === user.id || 
                      projectId === '3859858d-0555-409a-99ee-e63234e8683b'; // Public project

    if (!hasAccess) {
      return new Response(
        JSON.stringify({ error: 'Access denied to project' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'save') {
      // Encrypt sensitive fields before saving
      const encryptedConfig = await encryptSensitiveFields(config, cryptoKey);
      
      const { data, error } = await supabase
        .from('integration_configs')
        .upsert({
          project_id: projectId,
          integration_id: integrationId,
          config: encryptedConfig,
          enabled: true,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'project_id,integration_id'
        })
        .select()
        .single();

      if (error) {
        console.error('Failed to save config:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to save configuration' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Saved encrypted config for ${integrationId} in project ${projectId}`);
      
      return new Response(
        JSON.stringify({ success: true, id: data.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'load') {
      const { data, error } = await supabase
        .from('integration_configs')
        .select('*')
        .eq('project_id', projectId)
        .eq('integration_id', integrationId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Failed to load config:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to load configuration' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!data) {
        return new Response(
          JSON.stringify({ config: null }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Decrypt sensitive fields before returning
      const decryptedConfig = await decryptSensitiveFields(data.config, cryptoKey);
      
      return new Response(
        JSON.stringify({ 
          config: decryptedConfig,
          enabled: data.enabled,
          lastSync: data.last_sync
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Secure credentials error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
