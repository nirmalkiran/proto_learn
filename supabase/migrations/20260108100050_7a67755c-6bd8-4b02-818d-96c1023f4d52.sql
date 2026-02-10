-- Add masks column to nocode_visual_baselines table
-- Masks are stored as JSON array of rectangles: [{x, y, width, height}, ...]
ALTER TABLE public.nocode_visual_baselines
ADD COLUMN IF NOT EXISTS masks JSONB DEFAULT '[]'::jsonb;

-- Add a comment for documentation
COMMENT ON COLUMN public.nocode_visual_baselines.masks IS 'Array of mask regions to ignore during visual comparison. Each mask is {x, y, width, height} as percentages of image dimensions.';