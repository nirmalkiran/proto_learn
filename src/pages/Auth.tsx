import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const navigate = useNavigate();

  const [ssoChecking, setSsoChecking] = useState(false);

  useEffect(() => {
    // Check if user is already logged in
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/");
        return;
      }

      // Check if we've already attempted SSO
      const ssoAttempted = sessionStorage.getItem('sso_attempted');
      const params = new URLSearchParams(window.location.search);
      const isSsoCheck = params.get('sso_check') === 'true';

      // Skip silent SSO check - just show login form
      // Silent SSO with prompt=none causes issues with multiple accounts
      if (isSsoCheck) {
        // Clear the sso_check parameter after checking
        window.history.replaceState({}, document.title, "/auth");
      }
    };
    checkAuth();
  }, [navigate]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const redirectUrl = `${window.location.origin}/`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
    });

    if (error) {
      console.error('Sign up error:', error);
      toast({
        variant: "destructive",
        title: "Sign up failed",
        description: error.message,
      });
    } else {
      toast({
        title: "Check your email",
        description: "We've sent you a confirmation link to complete your registration.",
      });
    }
    setLoading(false);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('Sign in error:', error);
      toast({
        variant: "destructive",
        title: "Sign in failed",
        description: error.message,
      });
    } else {
      navigate("/");
    }
    setLoading(false);
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
    });

    if (error) {
      console.error('Password reset error:', error);
      toast({
        variant: "destructive",
        title: "Password reset failed",
        description: error.message,
      });
    } else {
      toast({
        title: "Check your email",
        description: "We've sent you a password reset link.",
      });
      setForgotPassword(false);
    }
    setLoading(false);
  };

  // Generate random string for PKCE
  const generateRandomString = (length: number): string => {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const randomValues = new Uint8Array(length);
    crypto.getRandomValues(randomValues);
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset[randomValues[i] % charset.length];
    }
    return result;
  };

  // Generate code challenge from verifier
  const generateCodeChallenge = async (verifier: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const base64 = btoa(String.fromCharCode(...Array.from(new Uint8Array(hash))));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  const handleAzureLogin = async () => {
    try {
      setLoading(true);

      // Generate PKCE parameters
      const codeVerifier = generateRandomString(128);
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const state = generateRandomString(32);

      // Store PKCE parameters in sessionStorage
      sessionStorage.setItem('pkce_code_verifier', codeVerifier);
      sessionStorage.setItem('pkce_state', state);

      // Azure AD configuration
      const clientId = 'c8b748d8-43ce-47fe-9df6-3417021f5653';
      const tenantId = 'ea6c052c-f910-4b0a-a2a0-9e5179c0e9fb';
      const redirectUri = `${window.location.origin}/auth`;

      // Build authorization URL
      const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?` +
        `client_id=${clientId}` +
        `&response_type=code` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_mode=query` +
        `&scope=${encodeURIComponent('openid profile email')}` +
        `&state=${state}` +
        `&code_challenge=${codeChallenge}` +
        `&code_challenge_method=S256` +
        `&prompt=select_account`;

      window.location.href = authUrl;
    } catch (error) {
      console.error('Error initiating Azure AD login:', error);
      toast({
        title: "Error",
        description: "Failed to initiate Azure AD login",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  // Handle Azure AD callback
  useEffect(() => {
    const handleAzureCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');
      const error = params.get('error');
      const errorDescription = params.get('error_description');

      if (error) {
        toast({
          title: "Authentication Error",
          description: errorDescription || error,
          variant: "destructive",
        });
        window.history.replaceState({}, document.title, "/auth");
        setSsoChecking(false);
        return;
      }

      if (code && state) {
        try {
          setLoading(true);

          // Verify state matches
          const storedState = sessionStorage.getItem('pkce_state');
          const codeVerifier = sessionStorage.getItem('pkce_code_verifier');

          if (!storedState || storedState !== state || !codeVerifier) {
            throw new Error('Invalid state or missing PKCE verifier');
          }

          // Clean up storage
          sessionStorage.removeItem('pkce_state');
          sessionStorage.removeItem('pkce_code_verifier');

          // Exchange code for token
          const clientId = 'c8b748d8-43ce-47fe-9df6-3417021f5653';
          const tenantId = 'ea6c052c-f910-4b0a-a2a0-9e5179c0e9fb';
          const redirectUri = `${window.location.origin}/auth`;

          const tokenResponse = await fetch(
            `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({
                client_id: clientId,
                code: code,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code',
                code_verifier: codeVerifier,
              }),
            }
          );

          if (!tokenResponse.ok) {
            const errorData = await tokenResponse.json();
            throw new Error(errorData.error_description || 'Token exchange failed');
          }

          const tokens = await tokenResponse.json();

          // Get user info from Microsoft Graph
          const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: {
              'Authorization': `Bearer ${tokens.access_token}`,
            },
          });

          if (!userResponse.ok) {
            throw new Error('Failed to get user info');
          }

          const userInfo = await userResponse.json();
          const email = userInfo.mail || userInfo.userPrincipalName;

          // Sign in to Supabase using the edge function with the validated Azure token
          const { data, error: signInError } = await supabase.functions.invoke('azure-ad-auth', {
            body: {
              action: 'signin',
              azureAccessToken: tokens.access_token, // Pass the Azure token for server-side validation
            },
          });

          if (signInError) {
            console.error('Edge function error:', signInError);
            throw signInError;
          }

          if (!data || !data.success) {
            console.error('Invalid response received:', data);
            throw new Error(data?.error || 'Failed to authenticate with Azure AD');
          }

          console.log('Azure AD authentication successful, verifying with Supabase...');

          // Use the token_hash to verify OTP and establish session
          if (data.token_hash) {
            const { error: verifyError } = await supabase.auth.verifyOtp({
              token_hash: data.token_hash,
              type: 'magiclink',
            });

            if (verifyError) {
              console.error('OTP verification error:', verifyError);
              throw verifyError;
            }
          }

          console.log('Signed in successfully, redirecting...');

          toast({
            title: "Success",
            description: "Successfully signed in with Azure AD",
          });

          // Clean up URL
          window.history.replaceState({}, document.title, "/");

          // Wait a bit for auth state to propagate before navigating
          setTimeout(() => {
            navigate("/");
          }, 100);
        } catch (error: any) {
          console.error('Error completing Azure AD sign in:', error);
          toast({
            title: "Error",
            description: error.message || "Failed to complete Azure AD sign in",
            variant: "destructive",
          });
          window.history.replaceState({}, document.title, "/auth");
        } finally {
          setLoading(false);
        }
      }
    };

    handleAzureCallback();
  }, [navigate]);

  if (ssoChecking || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">Welcome</CardTitle>
          <CardDescription className="text-center">
            Sign in to your account or create a new one
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              {forgotPassword ? (
                <form onSubmit={handlePasswordReset} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">Email</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Sending reset link..." : "Send Reset Link"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => setForgotPassword(false)}
                  >
                    Back to Sign In
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Password</Label>
                    <Input
                      id="signin-password"
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setForgotPassword(true)}
                      className="text-sm text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Signing in..." : "Sign In"}
                  </Button>

                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">
                        Or continue with
                      </span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={loading}
                    onClick={handleAzureLogin}
                  >
                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z"
                      />
                    </svg>
                    Continue with Azure AD
                  </Button>
                </form>
              )}
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="Create a password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Creating account..." : "Create Account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;