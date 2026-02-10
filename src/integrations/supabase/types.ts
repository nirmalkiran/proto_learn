export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
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
          job_type: string
          max_retries: number
          priority: number
          project_id: string
          retries: number
          run_id: string
          started_at: string | null
          status: string
          steps: Json
          test_id: string | null
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
          job_type?: string
          max_retries?: number
          priority?: number
          project_id: string
          retries?: number
          run_id: string
          started_at?: string | null
          status?: string
          steps?: Json
          test_id?: string | null
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
          job_type?: string
          max_retries?: number
          priority?: number
          project_id?: string
          retries?: number
          run_id?: string
          started_at?: string | null
          status?: string
          steps?: Json
          test_id?: string | null
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
      agent_scheduled_triggers: {
        Row: {
          agent_id: string | null
          created_at: string
          created_by: string
          deployment_environment: string | null
          deployment_webhook_secret: string | null
          description: string | null
          id: string
          is_active: boolean | null
          last_triggered_at: string | null
          name: string
          next_scheduled_at: string | null
          project_id: string
          schedule_day_of_week: number | null
          schedule_time: string | null
          schedule_timezone: string | null
          schedule_type: string | null
          target_id: string
          target_type: string
          trigger_type: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          created_by: string
          deployment_environment?: string | null
          deployment_webhook_secret?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          name: string
          next_scheduled_at?: string | null
          project_id: string
          schedule_day_of_week?: number | null
          schedule_time?: string | null
          schedule_timezone?: string | null
          schedule_type?: string | null
          target_id: string
          target_type: string
          trigger_type: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          created_by?: string
          deployment_environment?: string | null
          deployment_webhook_secret?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          name?: string
          next_scheduled_at?: string | null
          project_id?: string
          schedule_day_of_week?: number | null
          schedule_time?: string | null
          schedule_timezone?: string | null
          schedule_type?: string | null
          target_id?: string
          target_type?: string
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_scheduled_triggers_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "self_hosted_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_scheduled_triggers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_trigger_executions: {
        Row: {
          created_at: string
          deployment_info: Json | null
          error_message: string | null
          id: string
          job_id: string | null
          project_id: string
          status: string
          trigger_id: string
          trigger_source: string
          triggered_at: string
        }
        Insert: {
          created_at?: string
          deployment_info?: Json | null
          error_message?: string | null
          id?: string
          job_id?: string | null
          project_id: string
          status?: string
          trigger_id: string
          trigger_source: string
          triggered_at?: string
        }
        Update: {
          created_at?: string
          deployment_info?: Json | null
          error_message?: string | null
          id?: string
          job_id?: string | null
          project_id?: string
          status?: string
          trigger_id?: string
          trigger_source?: string
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_trigger_executions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "agent_job_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_trigger_executions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_trigger_executions_trigger_id_fkey"
            columns: ["trigger_id"]
            isOneToOne: false
            referencedRelation: "agent_scheduled_triggers"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_logs: {
        Row: {
          created_at: string
          execution_time_ms: number | null
          feature_type: string
          id: string
          openai_cost_usd: number | null
          openai_model: string | null
          openai_tokens_completion: number | null
          openai_tokens_prompt: number | null
          project_id: string | null
          success: boolean | null
          tokens_used: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          execution_time_ms?: number | null
          feature_type: string
          id?: string
          openai_cost_usd?: number | null
          openai_model?: string | null
          openai_tokens_completion?: number | null
          openai_tokens_prompt?: number | null
          project_id?: string | null
          success?: boolean | null
          tokens_used?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          execution_time_ms?: number | null
          feature_type?: string
          id?: string
          openai_cost_usd?: number | null
          openai_model?: string | null
          openai_tokens_completion?: number | null
          openai_tokens_prompt?: number | null
          project_id?: string | null
          success?: boolean | null
          tokens_used?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          created_at: string
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          setting_key: string
          setting_value?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      automation_results: {
        Row: {
          created_at: string
          id: string
          json_result: Json
          project_id: string | null
          run_id: string
          timestamp: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          json_result?: Json
          project_id?: string | null
          run_id: string
          timestamp?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          json_result?: Json
          project_id?: string | null
          run_id?: string
          timestamp?: string
          user_id?: string
        }
        Relationships: []
      }
      burp_agents: {
        Row: {
          burp_api_key_encrypted: string | null
          burp_api_url: string
          capabilities: Json | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          last_heartbeat: string | null
          license_type: string | null
          name: string
          project_id: string
          status: string
          updated_at: string
          version: string | null
        }
        Insert: {
          burp_api_key_encrypted?: string | null
          burp_api_url: string
          capabilities?: Json | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          last_heartbeat?: string | null
          license_type?: string | null
          name: string
          project_id: string
          status?: string
          updated_at?: string
          version?: string | null
        }
        Update: {
          burp_api_key_encrypted?: string | null
          burp_api_url?: string
          capabilities?: Json | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          last_heartbeat?: string | null
          license_type?: string | null
          name?: string
          project_id?: string
          status?: string
          updated_at?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "burp_agents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      burp_attack_surface: {
        Row: {
          accepts_user_input: boolean | null
          api_operation_id: string | null
          auth_type: string | null
          body_params: Json | null
          content_type: string | null
          cookies: Json | null
          created_at: string
          discovery_source: string | null
          has_file_upload: boolean | null
          has_json_input: boolean | null
          has_xml_input: boolean | null
          headers: Json | null
          host: string
          id: string
          is_active: boolean | null
          last_tested_at: string | null
          method: string
          path: string
          path_params: Json | null
          port: number | null
          project_id: string
          protocol: string | null
          query_params: Json | null
          requires_auth: boolean | null
          response_length: number | null
          response_type: string | null
          scan_id: string
          updated_at: string
          url: string
        }
        Insert: {
          accepts_user_input?: boolean | null
          api_operation_id?: string | null
          auth_type?: string | null
          body_params?: Json | null
          content_type?: string | null
          cookies?: Json | null
          created_at?: string
          discovery_source?: string | null
          has_file_upload?: boolean | null
          has_json_input?: boolean | null
          has_xml_input?: boolean | null
          headers?: Json | null
          host: string
          id?: string
          is_active?: boolean | null
          last_tested_at?: string | null
          method?: string
          path: string
          path_params?: Json | null
          port?: number | null
          project_id: string
          protocol?: string | null
          query_params?: Json | null
          requires_auth?: boolean | null
          response_length?: number | null
          response_type?: string | null
          scan_id: string
          updated_at?: string
          url: string
        }
        Update: {
          accepts_user_input?: boolean | null
          api_operation_id?: string | null
          auth_type?: string | null
          body_params?: Json | null
          content_type?: string | null
          cookies?: Json | null
          created_at?: string
          discovery_source?: string | null
          has_file_upload?: boolean | null
          has_json_input?: boolean | null
          has_xml_input?: boolean | null
          headers?: Json | null
          host?: string
          id?: string
          is_active?: boolean | null
          last_tested_at?: string | null
          method?: string
          path?: string
          path_params?: Json | null
          port?: number | null
          project_id?: string
          protocol?: string | null
          query_params?: Json | null
          requires_auth?: boolean | null
          response_length?: number | null
          response_type?: string | null
          scan_id?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "burp_attack_surface_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "burp_attack_surface_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "burp_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      burp_cicd_jobs: {
        Row: {
          baseline_comparison: Json | null
          branch: string | null
          commit_sha: string | null
          completed_at: string | null
          created_at: string
          exit_code: number | null
          fail_on_severity: Database["public"]["Enums"]["burp_severity"] | null
          id: string
          job_id: string | null
          pipeline_id: string | null
          profile_id: string | null
          project_id: string
          scan_id: string | null
          scan_summary: Json | null
          started_at: string | null
          status: string | null
          timeout_minutes: number | null
        }
        Insert: {
          baseline_comparison?: Json | null
          branch?: string | null
          commit_sha?: string | null
          completed_at?: string | null
          created_at?: string
          exit_code?: number | null
          fail_on_severity?: Database["public"]["Enums"]["burp_severity"] | null
          id?: string
          job_id?: string | null
          pipeline_id?: string | null
          profile_id?: string | null
          project_id: string
          scan_id?: string | null
          scan_summary?: Json | null
          started_at?: string | null
          status?: string | null
          timeout_minutes?: number | null
        }
        Update: {
          baseline_comparison?: Json | null
          branch?: string | null
          commit_sha?: string | null
          completed_at?: string | null
          created_at?: string
          exit_code?: number | null
          fail_on_severity?: Database["public"]["Enums"]["burp_severity"] | null
          id?: string
          job_id?: string | null
          pipeline_id?: string | null
          profile_id?: string | null
          project_id?: string
          scan_id?: string | null
          scan_summary?: Json | null
          started_at?: string | null
          status?: string | null
          timeout_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "burp_cicd_jobs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "burp_scan_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "burp_cicd_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "burp_cicd_jobs_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "burp_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      burp_custom_extensions: {
        Row: {
          approved_by: string | null
          bapp_id: string | null
          bapp_version: string | null
          code_content: string | null
          created_at: string
          created_by: string
          description: string | null
          extension_type: string
          id: string
          is_approved: boolean | null
          is_enabled: boolean | null
          name: string
          project_id: string | null
          updated_at: string
          version: string | null
        }
        Insert: {
          approved_by?: string | null
          bapp_id?: string | null
          bapp_version?: string | null
          code_content?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          extension_type: string
          id?: string
          is_approved?: boolean | null
          is_enabled?: boolean | null
          name: string
          project_id?: string | null
          updated_at?: string
          version?: string | null
        }
        Update: {
          approved_by?: string | null
          bapp_id?: string | null
          bapp_version?: string | null
          code_content?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          extension_type?: string
          id?: string
          is_approved?: boolean | null
          is_enabled?: boolean | null
          name?: string
          project_id?: string | null
          updated_at?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "burp_custom_extensions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      burp_findings: {
        Row: {
          ai_analysis: Json | null
          ai_confidence_score: number | null
          assigned_to: string | null
          confidence: Database["public"]["Enums"]["burp_confidence"]
          created_at: string
          cwe_id: number | null
          fingerprint: string | null
          first_seen_scan_id: string | null
          host: string
          http_method: string | null
          id: string
          insertion_point: string | null
          is_dom_based: boolean | null
          is_false_positive: boolean | null
          is_suppressed: boolean | null
          issue_background: string | null
          issue_detail: string | null
          issue_name: string
          issue_type: string
          oast_data: Json | null
          oast_interaction_id: string | null
          occurrence_count: number | null
          owasp_category: string | null
          path: string
          path_to_issue: Json | null
          payload_used: string | null
          project_id: string
          reference_urls: Json | null
          remediation_background: string | null
          remediation_detail: string | null
          request_base64: string | null
          response_base64: string | null
          scan_id: string
          severity: Database["public"]["Enums"]["burp_severity"]
          source_sink_info: Json | null
          status: string | null
          suppression_reason: string | null
          surface_id: string | null
          updated_at: string
          url: string
        }
        Insert: {
          ai_analysis?: Json | null
          ai_confidence_score?: number | null
          assigned_to?: string | null
          confidence?: Database["public"]["Enums"]["burp_confidence"]
          created_at?: string
          cwe_id?: number | null
          fingerprint?: string | null
          first_seen_scan_id?: string | null
          host: string
          http_method?: string | null
          id?: string
          insertion_point?: string | null
          is_dom_based?: boolean | null
          is_false_positive?: boolean | null
          is_suppressed?: boolean | null
          issue_background?: string | null
          issue_detail?: string | null
          issue_name: string
          issue_type: string
          oast_data?: Json | null
          oast_interaction_id?: string | null
          occurrence_count?: number | null
          owasp_category?: string | null
          path: string
          path_to_issue?: Json | null
          payload_used?: string | null
          project_id: string
          reference_urls?: Json | null
          remediation_background?: string | null
          remediation_detail?: string | null
          request_base64?: string | null
          response_base64?: string | null
          scan_id: string
          severity?: Database["public"]["Enums"]["burp_severity"]
          source_sink_info?: Json | null
          status?: string | null
          suppression_reason?: string | null
          surface_id?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          ai_analysis?: Json | null
          ai_confidence_score?: number | null
          assigned_to?: string | null
          confidence?: Database["public"]["Enums"]["burp_confidence"]
          created_at?: string
          cwe_id?: number | null
          fingerprint?: string | null
          first_seen_scan_id?: string | null
          host?: string
          http_method?: string | null
          id?: string
          insertion_point?: string | null
          is_dom_based?: boolean | null
          is_false_positive?: boolean | null
          is_suppressed?: boolean | null
          issue_background?: string | null
          issue_detail?: string | null
          issue_name?: string
          issue_type?: string
          oast_data?: Json | null
          oast_interaction_id?: string | null
          occurrence_count?: number | null
          owasp_category?: string | null
          path?: string
          path_to_issue?: Json | null
          payload_used?: string | null
          project_id?: string
          reference_urls?: Json | null
          remediation_background?: string | null
          remediation_detail?: string | null
          request_base64?: string | null
          response_base64?: string | null
          scan_id?: string
          severity?: Database["public"]["Enums"]["burp_severity"]
          source_sink_info?: Json | null
          status?: string | null
          suppression_reason?: string | null
          surface_id?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "burp_findings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "burp_findings_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "burp_scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "burp_findings_surface_id_fkey"
            columns: ["surface_id"]
            isOneToOne: false
            referencedRelation: "burp_attack_surface"
            referencedColumns: ["id"]
          },
        ]
      }
      burp_intruder_attacks: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attack_type: string
          base_request_base64: string
          completed_at: string | null
          created_at: string
          created_by: string
          id: string
          interesting_responses: Json | null
          name: string
          payload_positions: Json
          payload_sets: Json
          project_id: string
          requests_made: number | null
          requests_per_second: number | null
          requires_approval: boolean | null
          scan_id: string | null
          started_at: string | null
          status: string | null
          target_url: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attack_type: string
          base_request_base64: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          interesting_responses?: Json | null
          name: string
          payload_positions: Json
          payload_sets: Json
          project_id: string
          requests_made?: number | null
          requests_per_second?: number | null
          requires_approval?: boolean | null
          scan_id?: string | null
          started_at?: string | null
          status?: string | null
          target_url: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attack_type?: string
          base_request_base64?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          interesting_responses?: Json | null
          name?: string
          payload_positions?: Json
          payload_sets?: Json
          project_id?: string
          requests_made?: number | null
          requests_per_second?: number | null
          requires_approval?: boolean | null
          scan_id?: string | null
          started_at?: string | null
          status?: string | null
          target_url?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "burp_intruder_attacks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "burp_intruder_attacks_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "burp_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      burp_oast_interactions: {
        Row: {
          client_ip: string | null
          correlated_at: string | null
          created_at: string
          dns_query: string | null
          dns_query_type: string | null
          finding_id: string | null
          http_request_base64: string | null
          http_response_base64: string | null
          id: string
          interaction_id: string
          interaction_type: string
          payload_id: string | null
          project_id: string
          scan_id: string | null
          smtp_conversation: string | null
          timestamp: string
        }
        Insert: {
          client_ip?: string | null
          correlated_at?: string | null
          created_at?: string
          dns_query?: string | null
          dns_query_type?: string | null
          finding_id?: string | null
          http_request_base64?: string | null
          http_response_base64?: string | null
          id?: string
          interaction_id: string
          interaction_type: string
          payload_id?: string | null
          project_id: string
          scan_id?: string | null
          smtp_conversation?: string | null
          timestamp: string
        }
        Update: {
          client_ip?: string | null
          correlated_at?: string | null
          created_at?: string
          dns_query?: string | null
          dns_query_type?: string | null
          finding_id?: string | null
          http_request_base64?: string | null
          http_response_base64?: string | null
          id?: string
          interaction_id?: string
          interaction_type?: string
          payload_id?: string | null
          project_id?: string
          scan_id?: string | null
          smtp_conversation?: string | null
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "burp_oast_interactions_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "burp_findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "burp_oast_interactions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "burp_oast_interactions_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "burp_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      burp_reports: {
        Row: {
          created_at: string
          created_by: string
          format: string
          generated_pocs: Json | null
          id: string
          include_remediation: boolean | null
          include_request_response: boolean | null
          name: string
          owasp_mapping: Json | null
          project_id: string
          report_content: string | null
          report_storage_path: string | null
          scan_id: string
          severity_filter: Database["public"]["Enums"]["burp_severity"][] | null
        }
        Insert: {
          created_at?: string
          created_by: string
          format?: string
          generated_pocs?: Json | null
          id?: string
          include_remediation?: boolean | null
          include_request_response?: boolean | null
          name: string
          owasp_mapping?: Json | null
          project_id: string
          report_content?: string | null
          report_storage_path?: string | null
          scan_id: string
          severity_filter?:
            | Database["public"]["Enums"]["burp_severity"][]
            | null
        }
        Update: {
          created_at?: string
          created_by?: string
          format?: string
          generated_pocs?: Json | null
          id?: string
          include_remediation?: boolean | null
          include_request_response?: boolean | null
          name?: string
          owasp_mapping?: Json | null
          project_id?: string
          report_content?: string | null
          report_storage_path?: string | null
          scan_id?: string
          severity_filter?:
            | Database["public"]["Enums"]["burp_severity"][]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "burp_reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "burp_reports_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "burp_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      burp_scan_logs: {
        Row: {
          category: string
          created_at: string
          details: Json | null
          id: string
          level: string
          message: string
          scan_id: string
          timestamp: string
        }
        Insert: {
          category: string
          created_at?: string
          details?: Json | null
          id?: string
          level?: string
          message: string
          scan_id: string
          timestamp?: string
        }
        Update: {
          category?: string
          created_at?: string
          details?: Json | null
          id?: string
          level?: string
          message?: string
          scan_id?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "burp_scan_logs_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "burp_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      burp_scan_profiles: {
        Row: {
          active_scan_enabled: boolean | null
          bchecks: Json | null
          brute_force_enabled: boolean | null
          concurrent_requests: number | null
          crawl_depth: number | null
          crawl_enabled: boolean | null
          crawl_max_urls: number | null
          created_at: string
          created_by: string
          delay_between_requests_ms: number | null
          description: string | null
          destructive_tests_enabled: boolean | null
          dom_analysis_enabled: boolean | null
          dom_invader_enabled: boolean | null
          follow_redirects: boolean | null
          fuzzing_enabled: boolean | null
          handle_javascript: boolean | null
          id: string
          match_replace_rules: Json | null
          name: string
          oast_enabled: boolean | null
          passive_scan_enabled: boolean | null
          profile_type: string
          project_id: string
          requests_per_second: number | null
          scan_categories: Json | null
          scan_insertion_points: Json | null
          scan_mode: Database["public"]["Enums"]["burp_scan_mode"]
          updated_at: string
        }
        Insert: {
          active_scan_enabled?: boolean | null
          bchecks?: Json | null
          brute_force_enabled?: boolean | null
          concurrent_requests?: number | null
          crawl_depth?: number | null
          crawl_enabled?: boolean | null
          crawl_max_urls?: number | null
          created_at?: string
          created_by: string
          delay_between_requests_ms?: number | null
          description?: string | null
          destructive_tests_enabled?: boolean | null
          dom_analysis_enabled?: boolean | null
          dom_invader_enabled?: boolean | null
          follow_redirects?: boolean | null
          fuzzing_enabled?: boolean | null
          handle_javascript?: boolean | null
          id?: string
          match_replace_rules?: Json | null
          name: string
          oast_enabled?: boolean | null
          passive_scan_enabled?: boolean | null
          profile_type?: string
          project_id: string
          requests_per_second?: number | null
          scan_categories?: Json | null
          scan_insertion_points?: Json | null
          scan_mode?: Database["public"]["Enums"]["burp_scan_mode"]
          updated_at?: string
        }
        Update: {
          active_scan_enabled?: boolean | null
          bchecks?: Json | null
          brute_force_enabled?: boolean | null
          concurrent_requests?: number | null
          crawl_depth?: number | null
          crawl_enabled?: boolean | null
          crawl_max_urls?: number | null
          created_at?: string
          created_by?: string
          delay_between_requests_ms?: number | null
          description?: string | null
          destructive_tests_enabled?: boolean | null
          dom_analysis_enabled?: boolean | null
          dom_invader_enabled?: boolean | null
          follow_redirects?: boolean | null
          fuzzing_enabled?: boolean | null
          handle_javascript?: boolean | null
          id?: string
          match_replace_rules?: Json | null
          name?: string
          oast_enabled?: boolean | null
          passive_scan_enabled?: boolean | null
          profile_type?: string
          project_id?: string
          requests_per_second?: number | null
          scan_categories?: Json | null
          scan_insertion_points?: Json | null
          scan_mode?: Database["public"]["Enums"]["burp_scan_mode"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "burp_scan_profiles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      burp_scans: {
        Row: {
          agent_id: string | null
          api_definition_content: string | null
          api_definition_type: string | null
          baseline_scan_id: string | null
          ci_cd_context: Json | null
          completed_at: string | null
          config_id: string | null
          created_at: string
          created_by: string
          critical_count: number | null
          current_phase: string | null
          duration_ms: number | null
          endpoints_discovered: number | null
          environment: string | null
          error_message: string | null
          high_count: number | null
          id: string
          info_count: number | null
          issues_found: number | null
          low_count: number | null
          medium_count: number | null
          name: string
          new_issues_count: number | null
          profile_id: string | null
          progress_percentage: number | null
          project_id: string
          requests_made: number | null
          resolved_issues_count: number | null
          run_id: string
          scan_mode: Database["public"]["Enums"]["burp_scan_mode"]
          scheduled_at: string | null
          scope_excludes: Json | null
          scope_includes: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["burp_scan_status"]
          target_urls: Json
          triggered_by: string | null
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          api_definition_content?: string | null
          api_definition_type?: string | null
          baseline_scan_id?: string | null
          ci_cd_context?: Json | null
          completed_at?: string | null
          config_id?: string | null
          created_at?: string
          created_by: string
          critical_count?: number | null
          current_phase?: string | null
          duration_ms?: number | null
          endpoints_discovered?: number | null
          environment?: string | null
          error_message?: string | null
          high_count?: number | null
          id?: string
          info_count?: number | null
          issues_found?: number | null
          low_count?: number | null
          medium_count?: number | null
          name: string
          new_issues_count?: number | null
          profile_id?: string | null
          progress_percentage?: number | null
          project_id: string
          requests_made?: number | null
          resolved_issues_count?: number | null
          run_id: string
          scan_mode?: Database["public"]["Enums"]["burp_scan_mode"]
          scheduled_at?: string | null
          scope_excludes?: Json | null
          scope_includes?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["burp_scan_status"]
          target_urls?: Json
          triggered_by?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          api_definition_content?: string | null
          api_definition_type?: string | null
          baseline_scan_id?: string | null
          ci_cd_context?: Json | null
          completed_at?: string | null
          config_id?: string | null
          created_at?: string
          created_by?: string
          critical_count?: number | null
          current_phase?: string | null
          duration_ms?: number | null
          endpoints_discovered?: number | null
          environment?: string | null
          error_message?: string | null
          high_count?: number | null
          id?: string
          info_count?: number | null
          issues_found?: number | null
          low_count?: number | null
          medium_count?: number | null
          name?: string
          new_issues_count?: number | null
          profile_id?: string | null
          progress_percentage?: number | null
          project_id?: string
          requests_made?: number | null
          resolved_issues_count?: number | null
          run_id?: string
          scan_mode?: Database["public"]["Enums"]["burp_scan_mode"]
          scheduled_at?: string | null
          scope_excludes?: Json | null
          scope_includes?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["burp_scan_status"]
          target_urls?: Json
          triggered_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "burp_scans_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "burp_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "burp_scans_baseline_scan_id_fkey"
            columns: ["baseline_scan_id"]
            isOneToOne: false
            referencedRelation: "burp_scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "burp_scans_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "security_scan_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "burp_scans_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "burp_scan_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "burp_scans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      burp_traffic_logs: {
        Row: {
          annotations: string | null
          created_at: string
          host: string
          http_version: string | null
          id: string
          is_websocket: boolean | null
          method: string
          modification_notes: string | null
          path: string
          port: number | null
          project_id: string
          protocol: string | null
          request_body_base64: string | null
          request_content_type: string | null
          request_headers: Json | null
          request_id: string
          response_body_base64: string | null
          response_content_type: string | null
          response_headers: Json | null
          response_length: number | null
          response_status: number | null
          scan_id: string | null
          tags: Json | null
          time_to_first_byte_ms: number | null
          timestamp: string
          total_time_ms: number | null
          url: string
          was_modified: boolean | null
          websocket_messages: Json | null
        }
        Insert: {
          annotations?: string | null
          created_at?: string
          host: string
          http_version?: string | null
          id?: string
          is_websocket?: boolean | null
          method: string
          modification_notes?: string | null
          path: string
          port?: number | null
          project_id: string
          protocol?: string | null
          request_body_base64?: string | null
          request_content_type?: string | null
          request_headers?: Json | null
          request_id: string
          response_body_base64?: string | null
          response_content_type?: string | null
          response_headers?: Json | null
          response_length?: number | null
          response_status?: number | null
          scan_id?: string | null
          tags?: Json | null
          time_to_first_byte_ms?: number | null
          timestamp?: string
          total_time_ms?: number | null
          url: string
          was_modified?: boolean | null
          websocket_messages?: Json | null
        }
        Update: {
          annotations?: string | null
          created_at?: string
          host?: string
          http_version?: string | null
          id?: string
          is_websocket?: boolean | null
          method?: string
          modification_notes?: string | null
          path?: string
          port?: number | null
          project_id?: string
          protocol?: string | null
          request_body_base64?: string | null
          request_content_type?: string | null
          request_headers?: Json | null
          request_id?: string
          response_body_base64?: string | null
          response_content_type?: string | null
          response_headers?: Json | null
          response_length?: number | null
          response_status?: number | null
          scan_id?: string | null
          tags?: Json | null
          time_to_first_byte_ms?: number | null
          timestamp?: string
          total_time_ms?: number | null
          url?: string
          was_modified?: boolean | null
          websocket_messages?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "burp_traffic_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "burp_traffic_logs_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "burp_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      git_commits: {
        Row: {
          author_email: string | null
          author_name: string | null
          commit_hash: string
          commit_message: string
          committed_at: string
          created_at: string
          id: string
          project_id: string
        }
        Insert: {
          author_email?: string | null
          author_name?: string | null
          commit_hash: string
          commit_message: string
          committed_at: string
          created_at?: string
          id?: string
          project_id: string
        }
        Update: {
          author_email?: string | null
          author_name?: string | null
          commit_hash?: string
          commit_message?: string
          committed_at?: string
          created_at?: string
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "git_commits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      git_files: {
        Row: {
          created_at: string
          file_content: string | null
          file_hash: string | null
          file_path: string
          file_type: string | null
          id: string
          last_modified: string | null
          project_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          file_content?: string | null
          file_hash?: string | null
          file_path: string
          file_type?: string | null
          id?: string
          last_modified?: string | null
          project_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          file_content?: string | null
          file_hash?: string | null
          file_path?: string
          file_type?: string | null
          id?: string
          last_modified?: string | null
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "git_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_configs: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          id: string
          integration_id: string
          last_sync: string | null
          project_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          integration_id: string
          last_sync?: string | null
          project_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          integration_id?: string
          last_sync?: string | null
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_configs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_config: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_visible: boolean
          label: string
          menu_id: string
          project_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_visible?: boolean
          label: string
          menu_id: string
          project_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_visible?: boolean
          label?: string
          menu_id?: string
          project_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_config_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      nocode_suite_executions: {
        Row: {
          completed_at: string | null
          created_at: string
          executed_by: string
          failed_tests: number | null
          id: string
          passed_tests: number | null
          project_id: string
          results: Json | null
          started_at: string
          status: string
          suite_id: string
          total_tests: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          executed_by: string
          failed_tests?: number | null
          id?: string
          passed_tests?: number | null
          project_id: string
          results?: Json | null
          started_at?: string
          status?: string
          suite_id: string
          total_tests?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          executed_by?: string
          failed_tests?: number | null
          id?: string
          passed_tests?: number | null
          project_id?: string
          results?: Json | null
          started_at?: string
          status?: string
          suite_id?: string
          total_tests?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nocode_suite_executions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nocode_suite_executions_suite_id_fkey"
            columns: ["suite_id"]
            isOneToOne: false
            referencedRelation: "nocode_test_suites"
            referencedColumns: ["id"]
          },
        ]
      }
      nocode_suite_tests: {
        Row: {
          created_at: string
          execution_order: number
          id: string
          suite_id: string
          test_id: string
        }
        Insert: {
          created_at?: string
          execution_order?: number
          id?: string
          suite_id: string
          test_id: string
        }
        Update: {
          created_at?: string
          execution_order?: number
          id?: string
          suite_id?: string
          test_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nocode_suite_tests_suite_id_fkey"
            columns: ["suite_id"]
            isOneToOne: false
            referencedRelation: "nocode_test_suites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nocode_suite_tests_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "nocode_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      nocode_test_executions: {
        Row: {
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          executed_by: string
          id: string
          project_id: string
          results: Json | null
          started_at: string
          status: string
          test_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          executed_by: string
          id?: string
          project_id: string
          results?: Json | null
          started_at?: string
          status: string
          test_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          executed_by?: string
          id?: string
          project_id?: string
          results?: Json | null
          started_at?: string
          status?: string
          test_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nocode_test_executions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nocode_test_executions_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "nocode_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      nocode_test_folders: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          project_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          project_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nocode_test_folders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      nocode_test_suites: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          prerequisite_base_url: string | null
          prerequisite_steps: Json | null
          project_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          prerequisite_base_url?: string | null
          prerequisite_steps?: Json | null
          project_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          prerequisite_base_url?: string | null
          prerequisite_steps?: Json | null
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nocode_test_suites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      nocode_tests: {
        Row: {
          base_url: string
          created_at: string
          created_by: string
          datasets: Json | null
          description: string | null
          folder_id: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          steps: Json
          test_case_id: string | null
          updated_at: string
        }
        Insert: {
          base_url: string
          created_at?: string
          created_by: string
          datasets?: Json | null
          description?: string | null
          folder_id?: string | null
          id?: string
          name: string
          project_id: string
          status?: string | null
          steps?: Json
          test_case_id?: string | null
          updated_at?: string
        }
        Update: {
          base_url?: string
          created_at?: string
          created_by?: string
          datasets?: Json | null
          description?: string | null
          folder_id?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          steps?: Json
          test_case_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nocode_tests_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "nocode_test_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nocode_tests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nocode_tests_test_case_id_fkey"
            columns: ["test_case_id"]
            isOneToOne: false
            referencedRelation: "test_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      nocode_visual_baselines: {
        Row: {
          baseline_image: string
          baseline_storage_path: string | null
          baseline_type: string | null
          created_at: string
          created_by: string
          id: string
          masks: Json | null
          step_id: string
          step_name: string
          test_id: string
          threshold: number | null
          updated_at: string
        }
        Insert: {
          baseline_image: string
          baseline_storage_path?: string | null
          baseline_type?: string | null
          created_at?: string
          created_by: string
          id?: string
          masks?: Json | null
          step_id: string
          step_name: string
          test_id: string
          threshold?: number | null
          updated_at?: string
        }
        Update: {
          baseline_image?: string
          baseline_storage_path?: string | null
          baseline_type?: string | null
          created_at?: string
          created_by?: string
          id?: string
          masks?: Json | null
          step_id?: string
          step_name?: string
          test_id?: string
          threshold?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nocode_visual_baselines_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "nocode_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_jmx_files: {
        Row: {
          created_at: string
          created_by: string
          id: string
          jmx: string
          jmx_base64: string | null
          project_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id: string
          jmx: string
          jmx_base64?: string | null
          project_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          jmx?: string
          jmx_base64?: string | null
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_jmx_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_jobs: {
        Row: {
          agent_id: string
          created_at: string | null
          duration: number
          finished_at: string | null
          id: string
          jmx_id: string
          project_id: string
          rampup: number
          started_at: string | null
          status: string
          threads: number
        }
        Insert: {
          agent_id: string
          created_at?: string | null
          duration: number
          finished_at?: string | null
          id?: string
          jmx_id: string
          project_id: string
          rampup: number
          started_at?: string | null
          status?: string
          threads: number
        }
        Update: {
          agent_id?: string
          created_at?: string | null
          duration?: number
          finished_at?: string | null
          id?: string
          jmx_id?: string
          project_id?: string
          rampup?: number
          started_at?: string | null
          status?: string
          threads?: number
        }
        Relationships: []
      }
      performance_reports: {
        Row: {
          ai_provider: string
          created_at: string
          created_by: string
          csv_files_metadata: Json | null
          id: string
          project_id: string
          report_content: string
          report_name: string
          status: string | null
          updated_at: string
        }
        Insert: {
          ai_provider: string
          created_at?: string
          created_by: string
          csv_files_metadata?: Json | null
          id?: string
          project_id: string
          report_content: string
          report_name: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          ai_provider?: string
          created_at?: string
          created_by?: string
          csv_files_metadata?: Json | null
          id?: string
          project_id?: string
          report_content?: string
          report_name?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      performance_results: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          job_id: string
          jtl_base64: string | null
          project_id: string
          report_base64: string | null
          status: string
          summary: Json | null
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          job_id: string
          jtl_base64?: string | null
          project_id: string
          report_base64?: string | null
          status?: string
          summary?: Json | null
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          job_id?: string
          jtl_base64?: string | null
          project_id?: string
          report_base64?: string | null
          status?: string
          summary?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_results_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "self_hosted_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_results_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "performance_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_results_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_test_templates: {
        Row: {
          config: Json
          correlation: Json
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          parameterization: Json
          project_id: string
          steps: Json
          updated_at: string
        }
        Insert: {
          config?: Json
          correlation?: Json
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          parameterization?: Json
          project_id: string
          steps?: Json
          updated_at?: string
        }
        Update: {
          config?: Json
          correlation?: Json
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          parameterization?: Json
          project_id?: string
          steps?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_test_templates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          role: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          role?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          role?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_members: {
        Row: {
          created_at: string
          id: string
          project_id: string
          role: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          role?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          role?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          git_access_token_encrypted: string | null
          git_branch: string | null
          git_last_sync: string | null
          git_repository_url: string | null
          git_sync_status: string | null
          id: string
          markdown_settings: string | null
          name: string
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          git_access_token_encrypted?: string | null
          git_branch?: string | null
          git_last_sync?: string | null
          git_repository_url?: string | null
          git_sync_status?: string | null
          id?: string
          markdown_settings?: string | null
          name: string
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          git_access_token_encrypted?: string | null
          git_branch?: string | null
          git_last_sync?: string | null
          git_repository_url?: string | null
          git_sync_status?: string | null
          id?: string
          markdown_settings?: string | null
          name?: string
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: []
      }
      qa_ai_feedback: {
        Row: {
          action: string
          artifact_id: string | null
          artifact_type: string
          created_at: string
          edited_content: string | null
          feedback_notes: string | null
          id: string
          original_content: string
          project_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          artifact_id?: string | null
          artifact_type: string
          created_at?: string
          edited_content?: string | null
          feedback_notes?: string | null
          id?: string
          original_content: string
          project_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          artifact_id?: string | null
          artifact_type?: string
          created_at?: string
          edited_content?: string | null
          feedback_notes?: string | null
          id?: string
          original_content?: string
          project_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_ai_feedback_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_embeddings: {
        Row: {
          approval_count: number | null
          artifact_id: string
          artifact_type: string
          content: string
          created_at: string
          created_by: string
          embedding: string | null
          id: string
          is_approved: boolean | null
          metadata: Json | null
          project_id: string | null
          updated_at: string
        }
        Insert: {
          approval_count?: number | null
          artifact_id: string
          artifact_type: string
          content: string
          created_at?: string
          created_by: string
          embedding?: string | null
          id?: string
          is_approved?: boolean | null
          metadata?: Json | null
          project_id?: string | null
          updated_at?: string
        }
        Update: {
          approval_count?: number | null
          artifact_id?: string
          artifact_type?: string
          content?: string
          created_at?: string
          created_by?: string
          embedding?: string | null
          id?: string
          is_approved?: boolean | null
          metadata?: Json | null
          project_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_embeddings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_instruction_agents: {
        Row: {
          agent_type: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          execution_order: number | null
          id: string
          instruction_id: string
          payload: Json | null
          result_summary: Json | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          agent_type: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          execution_order?: number | null
          id?: string
          instruction_id: string
          payload?: Json | null
          result_summary?: Json | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          agent_type?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          execution_order?: number | null
          id?: string
          instruction_id?: string
          payload?: Json | null
          result_summary?: Json | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qa_instruction_agents_instruction_id_fkey"
            columns: ["instruction_id"]
            isOneToOne: false
            referencedRelation: "qa_instructions"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_instruction_audit: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json | null
          id: string
          instruction_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          instruction_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          instruction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_instruction_audit_instruction_id_fkey"
            columns: ["instruction_id"]
            isOneToOne: false
            referencedRelation: "qa_instructions"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_instruction_jobs: {
        Row: {
          created_at: string
          id: string
          instruction_agent_id: string | null
          instruction_id: string
          job_reference_id: string | null
          job_reference_table: string | null
          job_type: string
          result: Json | null
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          instruction_agent_id?: string | null
          instruction_id: string
          job_reference_id?: string | null
          job_reference_table?: string | null
          job_type: string
          result?: Json | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          instruction_agent_id?: string | null
          instruction_id?: string
          job_reference_id?: string | null
          job_reference_table?: string | null
          job_type?: string
          result?: Json | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_instruction_jobs_instruction_agent_id_fkey"
            columns: ["instruction_agent_id"]
            isOneToOne: false
            referencedRelation: "qa_instruction_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_instruction_jobs_instruction_id_fkey"
            columns: ["instruction_id"]
            isOneToOne: false
            referencedRelation: "qa_instructions"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_instructions: {
        Row: {
          approval_required: boolean | null
          approved_at: string | null
          approved_by: string | null
          confidence: number | null
          constraints: Json | null
          created_at: string
          created_by: string
          error_message: string | null
          id: string
          instruction_text: string
          intent_type: string | null
          parsed_intent: Json | null
          project_id: string
          risk_level: string | null
          scope: Json | null
          status: string | null
          target_agents: string[] | null
          updated_at: string
        }
        Insert: {
          approval_required?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          confidence?: number | null
          constraints?: Json | null
          created_at?: string
          created_by: string
          error_message?: string | null
          id?: string
          instruction_text: string
          intent_type?: string | null
          parsed_intent?: Json | null
          project_id: string
          risk_level?: string | null
          scope?: Json | null
          status?: string | null
          target_agents?: string[] | null
          updated_at?: string
        }
        Update: {
          approval_required?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          confidence?: number | null
          constraints?: Json | null
          created_at?: string
          created_by?: string
          error_message?: string | null
          id?: string
          instruction_text?: string
          intent_type?: string | null
          parsed_intent?: Json | null
          project_id?: string
          risk_level?: string | null
          scope?: Json | null
          status?: string | null
          target_agents?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_instructions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_proven_patterns: {
        Row: {
          confidence_score: number | null
          created_at: string
          created_by: string
          description: string | null
          failure_count: number | null
          id: string
          is_global: boolean | null
          pattern_content: Json
          pattern_name: string
          pattern_type: string
          project_ids: string[] | null
          success_count: number | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          created_by: string
          description?: string | null
          failure_count?: number | null
          id?: string
          is_global?: boolean | null
          pattern_content: Json
          pattern_name: string
          pattern_type: string
          project_ids?: string[] | null
          success_count?: number | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          created_by?: string
          description?: string | null
          failure_count?: number | null
          id?: string
          is_global?: boolean | null
          pattern_content?: Json
          pattern_name?: string
          pattern_type?: string
          project_ids?: string[] | null
          success_count?: number | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      qa_standards: {
        Row: {
          created_at: string
          created_by: string
          examples: Json | null
          id: string
          is_active: boolean | null
          name: string
          project_id: string | null
          rules: Json
          standard_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          examples?: Json | null
          id?: string
          is_active?: boolean | null
          name: string
          project_id?: string | null
          rules: Json
          standard_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          examples?: Json | null
          id?: string
          is_active?: boolean | null
          name?: string
          project_id?: string | null
          rules?: Json
          standard_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_standards_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_api_test_cases: {
        Row: {
          additional_prompt: string | null
          auth_token: string | null
          base_url: string | null
          created_at: string
          id: string
          name: string
          postman_collection: Json | null
          project_id: string
          swagger_content: string | null
          test_cases: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          additional_prompt?: string | null
          auth_token?: string | null
          base_url?: string | null
          created_at?: string
          id?: string
          name: string
          postman_collection?: Json | null
          project_id: string
          swagger_content?: string | null
          test_cases?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          additional_prompt?: string | null
          auth_token?: string | null
          base_url?: string | null
          created_at?: string
          id?: string
          name?: string
          postman_collection?: Json | null
          project_id?: string
          swagger_content?: string | null
          test_cases?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_api_test_cases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_test_plans: {
        Row: {
          content: string
          created_at: string
          id: string
          name: string
          project_id: string
          project_name: string | null
          testing_scope: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          name: string
          project_id: string
          project_name?: string | null
          testing_scope?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          name?: string
          project_id?: string
          project_name?: string | null
          testing_scope?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_test_plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_test_reports: {
        Row: {
          azure_devops_data: Json | null
          created_at: string
          id: string
          jira_data: Json | null
          project_id: string
          project_name: string | null
          report_content: string
          report_name: string
          report_type: string
          statistics: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          azure_devops_data?: Json | null
          created_at?: string
          id?: string
          jira_data?: Json | null
          project_id: string
          project_name?: string | null
          report_content: string
          report_name: string
          report_type?: string
          statistics?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          azure_devops_data?: Json | null
          created_at?: string
          id?: string
          jira_data?: Json | null
          project_id?: string
          project_name?: string | null
          report_content?: string
          report_name?: string
          report_type?: string
          statistics?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      security_findings: {
        Row: {
          affected_endpoint: string
          confidence: number
          created_at: string
          evidence: Json | null
          http_method: string | null
          id: string
          is_false_positive: boolean | null
          is_suppressed: boolean | null
          owasp_category: string
          payload_used: string | null
          project_id: string
          remediation: string | null
          scan_id: string
          severity: string
          suppression_reason: string | null
          vulnerability_name: string
        }
        Insert: {
          affected_endpoint: string
          confidence?: number
          created_at?: string
          evidence?: Json | null
          http_method?: string | null
          id?: string
          is_false_positive?: boolean | null
          is_suppressed?: boolean | null
          owasp_category: string
          payload_used?: string | null
          project_id: string
          remediation?: string | null
          scan_id: string
          severity: string
          suppression_reason?: string | null
          vulnerability_name: string
        }
        Update: {
          affected_endpoint?: string
          confidence?: number
          created_at?: string
          evidence?: Json | null
          http_method?: string | null
          id?: string
          is_false_positive?: boolean | null
          is_suppressed?: boolean | null
          owasp_category?: string
          payload_used?: string | null
          project_id?: string
          remediation?: string | null
          scan_id?: string
          severity?: string
          suppression_reason?: string | null
          vulnerability_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_findings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_findings_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "security_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      security_scan_configs: {
        Row: {
          aggressive_mode: boolean | null
          auth_config: Json | null
          auth_type: string
          created_at: string
          created_by: string | null
          enabled_categories: string[] | null
          environment: string
          id: string
          name: string
          project_id: string
          rate_limit_rps: number | null
          roles: Json | null
          scan_depth: string
          target_type: string
          target_url: string
          target_urls: string[] | null
          updated_at: string
        }
        Insert: {
          aggressive_mode?: boolean | null
          auth_config?: Json | null
          auth_type?: string
          created_at?: string
          created_by?: string | null
          enabled_categories?: string[] | null
          environment?: string
          id?: string
          name: string
          project_id: string
          rate_limit_rps?: number | null
          roles?: Json | null
          scan_depth?: string
          target_type?: string
          target_url: string
          target_urls?: string[] | null
          updated_at?: string
        }
        Update: {
          aggressive_mode?: boolean | null
          auth_config?: Json | null
          auth_type?: string
          created_at?: string
          created_by?: string | null
          enabled_categories?: string[] | null
          environment?: string
          id?: string
          name?: string
          project_id?: string
          rate_limit_rps?: number | null
          roles?: Json | null
          scan_depth?: string
          target_type?: string
          target_url?: string
          target_urls?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_scan_configs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      security_scan_logs: {
        Row: {
          action: string
          details: Json | null
          id: string
          scan_id: string
          timestamp: string
        }
        Insert: {
          action: string
          details?: Json | null
          id?: string
          scan_id: string
          timestamp?: string
        }
        Update: {
          action?: string
          details?: Json | null
          id?: string
          scan_id?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_scan_logs_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "security_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      security_scans: {
        Row: {
          baseline_scan_id: string | null
          completed_at: string | null
          config_id: string
          created_at: string
          created_by: string | null
          discovered_endpoints: Json | null
          error_message: string | null
          id: string
          project_id: string
          scan_mode: string | null
          started_at: string | null
          status: string
          summary: Json | null
        }
        Insert: {
          baseline_scan_id?: string | null
          completed_at?: string | null
          config_id: string
          created_at?: string
          created_by?: string | null
          discovered_endpoints?: Json | null
          error_message?: string | null
          id?: string
          project_id: string
          scan_mode?: string | null
          started_at?: string | null
          status?: string
          summary?: Json | null
        }
        Update: {
          baseline_scan_id?: string | null
          completed_at?: string | null
          config_id?: string
          created_at?: string
          created_by?: string | null
          discovered_endpoints?: Json | null
          error_message?: string | null
          id?: string
          project_id?: string
          scan_mode?: string | null
          started_at?: string | null
          status?: string
          summary?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "security_scans_baseline_scan_id_fkey"
            columns: ["baseline_scan_id"]
            isOneToOne: false
            referencedRelation: "security_scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_scans_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "security_scan_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_scans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      self_hosted_agents: {
        Row: {
          agent_id: string
          agent_name: string
          agent_type: string | null
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
          agent_type?: string | null
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
          agent_type?: string | null
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
      test_case_folders: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_custom: boolean
          name: string
          project_id: string
          updated_at: string
          user_story_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_custom?: boolean
          name: string
          project_id: string
          updated_at?: string
          user_story_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_custom?: boolean
          name?: string
          project_id?: string
          updated_at?: string
          user_story_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "test_case_folders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_case_folders_user_story_id_fkey"
            columns: ["user_story_id"]
            isOneToOne: false
            referencedRelation: "user_stories"
            referencedColumns: ["id"]
          },
        ]
      }
      test_cases: {
        Row: {
          automated: boolean
          created_at: string
          description: string | null
          expected_result: string | null
          folder_id: string | null
          id: string
          priority: string | null
          project_id: string
          readable_id: string | null
          status: string | null
          steps: string | null
          structured_steps: Json | null
          test_data: string | null
          title: string
          updated_at: string
          user_story_id: string | null
        }
        Insert: {
          automated?: boolean
          created_at?: string
          description?: string | null
          expected_result?: string | null
          folder_id?: string | null
          id?: string
          priority?: string | null
          project_id: string
          readable_id?: string | null
          status?: string | null
          steps?: string | null
          structured_steps?: Json | null
          test_data?: string | null
          title: string
          updated_at?: string
          user_story_id?: string | null
        }
        Update: {
          automated?: boolean
          created_at?: string
          description?: string | null
          expected_result?: string | null
          folder_id?: string | null
          id?: string
          priority?: string | null
          project_id?: string
          readable_id?: string | null
          status?: string | null
          steps?: string | null
          structured_steps?: Json | null
          test_data?: string | null
          title?: string
          updated_at?: string
          user_story_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "test_cases_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "test_case_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_cases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_cases_user_story_id_fkey"
            columns: ["user_story_id"]
            isOneToOne: false
            referencedRelation: "user_stories"
            referencedColumns: ["id"]
          },
        ]
      }
      test_run_cases: {
        Row: {
          created_at: string
          executed_at: string | null
          executed_by: string | null
          id: string
          notes: string | null
          status: string
          step_results: Json | null
          test_case_id: string
          test_run_id: string
        }
        Insert: {
          created_at?: string
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          notes?: string | null
          status?: string
          step_results?: Json | null
          test_case_id: string
          test_run_id: string
        }
        Update: {
          created_at?: string
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          notes?: string | null
          status?: string
          step_results?: Json | null
          test_case_id?: string
          test_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_run_cases_test_case_id_fkey"
            columns: ["test_case_id"]
            isOneToOne: false
            referencedRelation: "test_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_run_cases_test_run_id_fkey"
            columns: ["test_run_id"]
            isOneToOne: false
            referencedRelation: "test_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      test_runs: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          project_id: string
          run_type: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          project_id: string
          run_type?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          run_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_stories: {
        Row: {
          acceptance_criteria: string | null
          board_id: string | null
          board_name: string | null
          created_at: string
          description: string | null
          id: string
          priority: string | null
          project_id: string
          readable_id: string | null
          sprint_id: string | null
          sprint_name: string | null
          status: string | null
          title: string
          updated_at: string
        }
        Insert: {
          acceptance_criteria?: string | null
          board_id?: string | null
          board_name?: string | null
          created_at?: string
          description?: string | null
          id?: string
          priority?: string | null
          project_id: string
          readable_id?: string | null
          sprint_id?: string | null
          sprint_name?: string | null
          status?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          acceptance_criteria?: string | null
          board_id?: string | null
          board_name?: string | null
          created_at?: string
          description?: string | null
          id?: string
          priority?: string | null
          project_id?: string
          readable_id?: string | null
          sprint_id?: string | null
          sprint_name?: string | null
          status?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_stories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      zap_agents: {
        Row: {
          capabilities: Json | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_daemon_mode: boolean | null
          last_heartbeat: string | null
          name: string
          project_id: string
          status: string
          updated_at: string
          version: string | null
          zap_api_key_encrypted: string | null
          zap_api_url: string
        }
        Insert: {
          capabilities?: Json | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_daemon_mode?: boolean | null
          last_heartbeat?: string | null
          name: string
          project_id: string
          status?: string
          updated_at?: string
          version?: string | null
          zap_api_key_encrypted?: string | null
          zap_api_url?: string
        }
        Update: {
          capabilities?: Json | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_daemon_mode?: boolean | null
          last_heartbeat?: string | null
          name?: string
          project_id?: string
          status?: string
          updated_at?: string
          version?: string | null
          zap_api_key_encrypted?: string | null
          zap_api_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "zap_agents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      zap_alerts: {
        Row: {
          alert_name: string
          alert_ref: string
          assigned_to: string | null
          attack: string | null
          confidence: Database["public"]["Enums"]["zap_confidence"]
          created_at: string
          cwe_id: number | null
          description: string | null
          evidence: string | null
          fingerprint: string | null
          first_seen_scan_id: string | null
          id: string
          is_false_positive: boolean | null
          is_suppressed: boolean | null
          message_id: string | null
          method: string | null
          occurrence_count: number | null
          other_info: string | null
          param: string | null
          plugin_id: string
          project_id: string
          reference: string | null
          risk: Database["public"]["Enums"]["zap_severity"]
          scan_id: string
          solution: string | null
          source: string | null
          status: string | null
          suppression_reason: string | null
          tags: Json | null
          updated_at: string
          url: string
          wasc_id: number | null
        }
        Insert: {
          alert_name: string
          alert_ref: string
          assigned_to?: string | null
          attack?: string | null
          confidence?: Database["public"]["Enums"]["zap_confidence"]
          created_at?: string
          cwe_id?: number | null
          description?: string | null
          evidence?: string | null
          fingerprint?: string | null
          first_seen_scan_id?: string | null
          id?: string
          is_false_positive?: boolean | null
          is_suppressed?: boolean | null
          message_id?: string | null
          method?: string | null
          occurrence_count?: number | null
          other_info?: string | null
          param?: string | null
          plugin_id: string
          project_id: string
          reference?: string | null
          risk?: Database["public"]["Enums"]["zap_severity"]
          scan_id: string
          solution?: string | null
          source?: string | null
          status?: string | null
          suppression_reason?: string | null
          tags?: Json | null
          updated_at?: string
          url: string
          wasc_id?: number | null
        }
        Update: {
          alert_name?: string
          alert_ref?: string
          assigned_to?: string | null
          attack?: string | null
          confidence?: Database["public"]["Enums"]["zap_confidence"]
          created_at?: string
          cwe_id?: number | null
          description?: string | null
          evidence?: string | null
          fingerprint?: string | null
          first_seen_scan_id?: string | null
          id?: string
          is_false_positive?: boolean | null
          is_suppressed?: boolean | null
          message_id?: string | null
          method?: string | null
          occurrence_count?: number | null
          other_info?: string | null
          param?: string | null
          plugin_id?: string
          project_id?: string
          reference?: string | null
          risk?: Database["public"]["Enums"]["zap_severity"]
          scan_id?: string
          solution?: string | null
          source?: string | null
          status?: string | null
          suppression_reason?: string | null
          tags?: Json | null
          updated_at?: string
          url?: string
          wasc_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "zap_alerts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zap_alerts_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "zap_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      zap_scan_profiles: {
        Row: {
          active_scan_enabled: boolean | null
          ajax_spider_enabled: boolean | null
          ajax_spider_max_crawl_depth: number | null
          ajax_spider_max_duration: number | null
          alert_threshold: string | null
          attack_strength: string | null
          context_name: string | null
          created_at: string
          created_by: string
          delay_in_ms: number | null
          description: string | null
          exclude_from_scope: Json | null
          follow_redirects: boolean | null
          handle_cookies: boolean | null
          id: string
          include_in_scope: Json | null
          max_rule_duration_minutes: number | null
          name: string
          passive_scan_enabled: boolean | null
          profile_type: string
          project_id: string
          scan_mode: Database["public"]["Enums"]["zap_scan_mode"]
          scan_policy: string | null
          spider_enabled: boolean | null
          spider_max_children: number | null
          spider_max_depth: number | null
          spider_max_duration: number | null
          technology_detection: boolean | null
          thread_per_host: number | null
          updated_at: string
        }
        Insert: {
          active_scan_enabled?: boolean | null
          ajax_spider_enabled?: boolean | null
          ajax_spider_max_crawl_depth?: number | null
          ajax_spider_max_duration?: number | null
          alert_threshold?: string | null
          attack_strength?: string | null
          context_name?: string | null
          created_at?: string
          created_by: string
          delay_in_ms?: number | null
          description?: string | null
          exclude_from_scope?: Json | null
          follow_redirects?: boolean | null
          handle_cookies?: boolean | null
          id?: string
          include_in_scope?: Json | null
          max_rule_duration_minutes?: number | null
          name: string
          passive_scan_enabled?: boolean | null
          profile_type?: string
          project_id: string
          scan_mode?: Database["public"]["Enums"]["zap_scan_mode"]
          scan_policy?: string | null
          spider_enabled?: boolean | null
          spider_max_children?: number | null
          spider_max_depth?: number | null
          spider_max_duration?: number | null
          technology_detection?: boolean | null
          thread_per_host?: number | null
          updated_at?: string
        }
        Update: {
          active_scan_enabled?: boolean | null
          ajax_spider_enabled?: boolean | null
          ajax_spider_max_crawl_depth?: number | null
          ajax_spider_max_duration?: number | null
          alert_threshold?: string | null
          attack_strength?: string | null
          context_name?: string | null
          created_at?: string
          created_by?: string
          delay_in_ms?: number | null
          description?: string | null
          exclude_from_scope?: Json | null
          follow_redirects?: boolean | null
          handle_cookies?: boolean | null
          id?: string
          include_in_scope?: Json | null
          max_rule_duration_minutes?: number | null
          name?: string
          passive_scan_enabled?: boolean | null
          profile_type?: string
          project_id?: string
          scan_mode?: Database["public"]["Enums"]["zap_scan_mode"]
          scan_policy?: string | null
          spider_enabled?: boolean | null
          spider_max_children?: number | null
          spider_max_depth?: number | null
          spider_max_duration?: number | null
          technology_detection?: boolean | null
          thread_per_host?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "zap_scan_profiles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      zap_scans: {
        Row: {
          active_scan_progress: number | null
          agent_id: string | null
          alerts_found: number | null
          api_definition_content: string | null
          api_definition_type: string | null
          baseline_scan_id: string | null
          completed_at: string | null
          config_id: string | null
          created_at: string
          created_by: string
          current_phase: string | null
          duration_ms: number | null
          environment: string | null
          error_message: string | null
          high_count: number | null
          id: string
          info_count: number | null
          low_count: number | null
          medium_count: number | null
          name: string
          new_alerts_count: number | null
          profile_id: string | null
          progress_percentage: number | null
          project_id: string
          requests_made: number | null
          resolved_alerts_count: number | null
          run_id: string
          scan_mode: Database["public"]["Enums"]["zap_scan_mode"]
          scheduled_at: string | null
          scope_excludes: Json | null
          scope_includes: Json | null
          spider_progress: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["zap_scan_status"]
          target_urls: Json
          triggered_by: string | null
          updated_at: string
          urls_discovered: number | null
        }
        Insert: {
          active_scan_progress?: number | null
          agent_id?: string | null
          alerts_found?: number | null
          api_definition_content?: string | null
          api_definition_type?: string | null
          baseline_scan_id?: string | null
          completed_at?: string | null
          config_id?: string | null
          created_at?: string
          created_by: string
          current_phase?: string | null
          duration_ms?: number | null
          environment?: string | null
          error_message?: string | null
          high_count?: number | null
          id?: string
          info_count?: number | null
          low_count?: number | null
          medium_count?: number | null
          name: string
          new_alerts_count?: number | null
          profile_id?: string | null
          progress_percentage?: number | null
          project_id: string
          requests_made?: number | null
          resolved_alerts_count?: number | null
          run_id: string
          scan_mode?: Database["public"]["Enums"]["zap_scan_mode"]
          scheduled_at?: string | null
          scope_excludes?: Json | null
          scope_includes?: Json | null
          spider_progress?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["zap_scan_status"]
          target_urls?: Json
          triggered_by?: string | null
          updated_at?: string
          urls_discovered?: number | null
        }
        Update: {
          active_scan_progress?: number | null
          agent_id?: string | null
          alerts_found?: number | null
          api_definition_content?: string | null
          api_definition_type?: string | null
          baseline_scan_id?: string | null
          completed_at?: string | null
          config_id?: string | null
          created_at?: string
          created_by?: string
          current_phase?: string | null
          duration_ms?: number | null
          environment?: string | null
          error_message?: string | null
          high_count?: number | null
          id?: string
          info_count?: number | null
          low_count?: number | null
          medium_count?: number | null
          name?: string
          new_alerts_count?: number | null
          profile_id?: string | null
          progress_percentage?: number | null
          project_id?: string
          requests_made?: number | null
          resolved_alerts_count?: number | null
          run_id?: string
          scan_mode?: Database["public"]["Enums"]["zap_scan_mode"]
          scheduled_at?: string | null
          scope_excludes?: Json | null
          scope_includes?: Json | null
          spider_progress?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["zap_scan_status"]
          target_urls?: Json
          triggered_by?: string | null
          updated_at?: string
          urls_discovered?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "zap_scans_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "zap_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zap_scans_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "zap_scan_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zap_scans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      ai_usage_summary: {
        Row: {
          avg_execution_time: number | null
          feature_type: string | null
          models_used: string | null
          success_rate: number | null
          successful_requests: number | null
          total_completion_tokens: number | null
          total_cost_usd: number | null
          total_prompt_tokens: number | null
          total_tokens: number | null
          usage_count: number | null
          usage_date: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      calculate_next_scheduled_at: {
        Args: {
          p_from?: string
          p_schedule_day_of_week: number
          p_schedule_time: string
          p_schedule_timezone: string
          p_schedule_type: string
        }
        Returns: string
      }
      cleanup_expired_pkce: { Args: never; Returns: undefined }
      cleanup_old_execution_data: { Args: never; Returns: number }
      generate_agent_run_id: { Args: never; Returns: string }
      generate_burp_scan_run_id: { Args: never; Returns: string }
      generate_unique_test_case_id: {
        Args: { p_project_id: string }
        Returns: string
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { user_id?: string }; Returns: boolean }
      is_project_member: {
        Args: { project_id: string; user_id?: string }
        Returns: boolean
      }
      match_qa_embeddings: {
        Args: {
          match_count?: number
          match_threshold?: number
          p_project_id?: string
          query_embedding: string
        }
        Returns: {
          artifact_id: string
          artifact_type: string
          content: string
          id: string
          is_approved: boolean
          metadata: Json
          project_id: string
          similarity: number
        }[]
      }
      run_due_scheduled_triggers: { Args: never; Returns: number }
    }
    Enums: {
      app_role: "admin" | "tester"
      burp_confidence: "certain" | "firm" | "tentative"
      burp_scan_mode: "passive" | "active" | "crawl" | "audit"
      burp_scan_status:
        | "pending"
        | "crawling"
        | "scanning"
        | "completed"
        | "failed"
        | "cancelled"
        | "paused"
      burp_severity: "info" | "low" | "medium" | "high" | "critical"
      project_status: "Active" | "Closed" | "On Hold"
      zap_confidence:
        | "confirmed"
        | "high"
        | "medium"
        | "low"
        | "user_confirmed"
        | "false_positive"
      zap_scan_mode: "spider" | "ajax_spider" | "active" | "passive" | "full"
      zap_scan_status:
        | "pending"
        | "spidering"
        | "scanning"
        | "completed"
        | "failed"
        | "cancelled"
        | "paused"
      zap_severity: "info" | "low" | "medium" | "high"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "tester"],
      burp_confidence: ["certain", "firm", "tentative"],
      burp_scan_mode: ["passive", "active", "crawl", "audit"],
      burp_scan_status: [
        "pending",
        "crawling",
        "scanning",
        "completed",
        "failed",
        "cancelled",
        "paused",
      ],
      burp_severity: ["info", "low", "medium", "high", "critical"],
      project_status: ["Active", "Closed", "On Hold"],
      zap_confidence: [
        "confirmed",
        "high",
        "medium",
        "low",
        "user_confirmed",
        "false_positive",
      ],
      zap_scan_mode: ["spider", "ajax_spider", "active", "passive", "full"],
      zap_scan_status: [
        "pending",
        "spidering",
        "scanning",
        "completed",
        "failed",
        "cancelled",
        "paused",
      ],
      zap_severity: ["info", "low", "medium", "high"],
    },
  },
} as const
