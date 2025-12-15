export const featureFlags = {
  bypassAuth: false, // Set to true to disable authentication
} as const;

// Public project IDs that can be accessed without authentication
export const publicProjectIds = [
  '3859858d-0555-409a-99ee-e63234e8683b'
] as const;
