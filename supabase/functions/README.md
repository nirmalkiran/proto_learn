Deno functions

This directory contains Supabase Edge Functions that run on Deno.

Setup & quick test

1. Install Deno: https://deno.land/manual@v1.37.1/getting_started/installation
2. Install the VS Code Deno extension (recommended): `denoland.vscode-deno` and restart VS Code.
3. Enable Deno for this workspace: the repository contains a `.vscode/settings.json` that enables Deno.

To run a function locally (quick test):

```bash
# cache remote imports
deno cache supabase/functions/mobile-execution/index.ts

# run (example)
den o run --allow-env --allow-net --allow-read supabase/functions/mobile-execution/index.ts
```

If you use the Supabase CLI for running functions, prefer `supabase functions serve`.
