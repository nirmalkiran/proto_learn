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
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_visible?: boolean
          label: string
          menu_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_visible?: boolean
          label?: string
          menu_id?: string
          updated_at?: string
        }
        Relationships: []
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
          project_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          project_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
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
          created_at: string
          created_by: string
          id: string
          step_id: string
          step_name: string
          test_id: string
          threshold: number | null
          updated_at: string
        }
        Insert: {
          baseline_image: string
          created_at?: string
          created_by: string
          id?: string
          step_id: string
          step_name: string
          test_id: string
          threshold?: number | null
          updated_at?: string
        }
        Update: {
          baseline_image?: string
          created_at?: string
          created_by?: string
          id?: string
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
      cleanup_expired_pkce: { Args: never; Returns: undefined }
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
    }
    Enums: {
      app_role: "admin" | "tester"
      project_status: "Active" | "Closed" | "On Hold"
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
      project_status: ["Active", "Closed", "On Hold"],
    },
  },
} as const
