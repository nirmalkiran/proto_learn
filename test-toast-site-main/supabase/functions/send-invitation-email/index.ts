import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InvitationEmailRequest {
  email: string;
  role: string;
  inviterName?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, role, inviterName }: InvitationEmailRequest = await req.json();

    console.log(`Sending invitation email to ${email} for role ${role}`);

    const emailResponse = await resend.emails.send({
      from: "QA Platform <onboarding@resend.dev>",
      to: [email],
      subject: `Invitation to join QA Platform as ${role}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; text-align: center;">You're Invited!</h1>
          
          <p style="font-size: 16px; line-height: 1.5; color: #555;">
            Hello,
          </p>
          
          <p style="font-size: 16px; line-height: 1.5; color: #555;">
            You've been invited to join our QA Platform with the role of <strong>${role}</strong>.
            ${inviterName ? `This invitation was sent by ${inviterName}.` : ''}
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${Deno.env.get('SUPABASE_URL')?.replace('/rest/v1', '')}/auth/signup" 
               style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
              Accept Invitation
            </a>
          </div>
          
          <p style="font-size: 14px; color: #777; margin-top: 30px;">
            If you have any questions, please contact your administrator.
          </p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="font-size: 12px; color: #999; text-align: center;">
            This is an automated message. Please do not reply to this email.
          </p>
        </div>
      `,
    });

    console.log("Invitation email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Invitation email sent successfully",
      emailId: emailResponse.data?.id 
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error("Error sending invitation email:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to send invitation email";
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        success: false 
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);