export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            agent_activity_logs: {
                Row: {
                    agent_id: string | null
                    created_at: string
                    event_data: Json | null
                    event_type: string
                    id: string
                    project_id: string
                }
                Insert: {
                    agent_id?: string | null
                    created_at?: string
                    event_data?: Json | null
                    event_type: string
                    id?: string
                    project_id: string
                }
                Update: {
                    agent_id?: string | null
                    created_at?: string
                    event_data?: Json | null
                    event_type?: string
                    id?: string
                    project_id?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "agent_activity_logs_agent_id_fkey"
                        columns: ["agent_id"]
                        isOneToOne: false
                        referencedRelation: "self_hosted_agents"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "agent_activity_logs_project_id_fkey"
                        columns: ["project_id"]
                        isOneToOne: false
                        referencedRelation: "projects"
                        referencedColumns: ["id"]
                    },
                ]
            }
            agent_execution_results: {
                Row: {
                    agent_id: string | null
                    artifact_url: string | null
                    created_at: string
                    duration_ms: number | null
                    error_message: string | null
                    failed_steps: number
                    id: string
                    job_id: string
                    passed_steps: number
                    project_id: string
                    results: Json | null
                    screenshots: Json | null
                    status: string
                    total_steps: number
                    trace_url: string | null
                    video_url: string | null
                }
                Insert: {
                    agent_id?: string | null
                    artifact_url?: string | null
                    created_at?: string
                    duration_ms?: number | null
                    error_message?: string | null
                    failed_steps?: number
                    id?: string
                    job_id: string
                    passed_steps?: number
                    project_id: string
                    results?: Json | null
                    screenshots?: Json | null
                    status: string
                    total_steps?: number
                    trace_url?: string | null
                    video_url?: string | null
                }
                Update: {
                    agent_id?: string | null
                    artifact_url?: string | null
                    created_at?: string
                    duration_ms?: number | null
                    error_message?: string | null
                    failed_steps?: number
                    id?: string
                    job_id?: string
                    passed_steps?: number
                    project_id?: string
                    results?: Json | null
                    screenshots?: Json | null
                    status?: string
                    total_steps?: number
                    trace_url?: string | null
                    video_url?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "agent_execution_results_agent_id_fkey"
                        columns: ["agent_id"]
                        isOneToOne: false
                        referencedRelation: "self_hosted_agents"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "agent_execution_results_job_id_fkey"
                        columns: ["job_id"]
                        isOneToOne: false
                        referencedRelation: "agent_job_queue"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "agent_execution_results_project_id_fkey"
                        columns: ["project_id"]
                        isOneToOne: false
                        referencedRelation: "projects"
                        referencedColumns: ["id"]
                    },
                ]
            }
            agent_job_queue: {
                Row: {
                    agent_id: string | null
                    assigned_at: string | null
                    base_url: string
                    completed_at: string | null
                    created_at: string
                    created_by: string
                    id: string
                    max_retries: number
                    priority: number
                    project_id: string
                    retries: number
                    run_id: string
                    started_at: string | null
                    status: string
                    steps: Json
                    test_id: string
                    updated_at: string
                }
                Insert: {
                    agent_id?: string | null
                    assigned_at?: string | null
                    base_url: string
                    completed_at?: string | null
                    created_at?: string
                    created_by: string
                    id?: string
                    max_retries?: number
                    priority?: number
                    project_id: string
                    retries?: number
                    run_id: string
                    started_at?: string | null
                    status?: string
                    steps?: Json
                    test_id: string
                    updated_at?: string
                }
                Update: {
                    agent_id?: string | null
                    assigned_at?: string | null
                    base_url?: string
                    completed_at?: string | null
                    created_at?: string
                    created_by?: string
                    id?: string
                    max_retries?: number
                    priority?: number
                    project_id?: string
                    retries?: number
                    run_id?: string
                    started_at?: string | null
                    status?: string
                    steps?: Json
                    test_id?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "agent_job_queue_agent_id_fkey"
                        columns: ["agent_id"]
                        isOneToOne: false
                        referencedRelation: "self_hosted_agents"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "agent_job_queue_project_id_fkey"
                        columns: ["project_id"]
                        isOneToOne: false
                        referencedRelation: "projects"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "agent_job_queue_test_id_fkey"
                        columns: ["test_id"]
                        isOneToOne: false
                        referencedRelation: "nocode_tests"
                        referencedColumns: ["id"]
                    },
                ]
            }
            nocodemobile_scenarios: {
                Row: {
                    id: string
                    name: string
                    description: string | null
                    steps: Json
                    app_package: string | null
                    user_id: string
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    name: string
                    description?: string | null
                    steps?: Json
                    app_package?: string | null
                    user_id: string
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    name?: string
                    description?: string | null
                    steps?: Json
                    app_package?: string | null
                    user_id?: string
                    created_at?: string
                    updated_at?: string
                }
                Relationships: []
            }
            self_hosted_agents: {
                Row: {
                    agent_id: string
                    agent_name: string
                    api_token_hash: string
                    browsers: string[] | null
                    capacity: number
                    config: Json | null
                    created_at: string
                    created_by: string
                    id: string
                    last_heartbeat: string | null
                    project_id: string
                    running_jobs: number
                    status: string
                    updated_at: string
                }
                Insert: {
                    agent_id: string
                    agent_name: string
                    api_token_hash: string
                    browsers?: string[] | null
                    capacity?: number
                    config?: Json | null
                    created_at?: string
                    created_by: string
                    id?: string
                    last_heartbeat?: string | null
                    project_id: string
                    running_jobs?: number
                    status?: string
                    updated_at?: string
                }
                Update: {
                    agent_id?: string
                    agent_name?: string
                    api_token_hash?: string
                    browsers?: string[] | null
                    capacity?: number
                    config?: Json | null
                    created_at?: string
                    created_by?: string
                    id?: string
                    last_heartbeat?: string | null
                    project_id?: string
                    running_jobs?: number
                    status?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "self_hosted_agents_project_id_fkey"
                        columns: ["project_id"]
                        isOneToOne: false
                        referencedRelation: "projects"
                        referencedColumns: ["id"]
                    },
                ]
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            [_ in never]: never
        }
        Enums: {
            [_ in never]: never
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
}
