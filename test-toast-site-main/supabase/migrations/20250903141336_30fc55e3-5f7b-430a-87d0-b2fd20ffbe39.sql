-- Add status enum and column to projects table
CREATE TYPE project_status AS ENUM ('Active', 'Closed', 'On Hold');

-- Add status column to projects table with default value 'Active'
ALTER TABLE projects 
ADD COLUMN status project_status NOT NULL DEFAULT 'Active';