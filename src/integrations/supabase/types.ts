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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      automation_results: {
        Row: {
          created_at: string
          duration_ms: number | null
          id: string
          logs: string | null
          result: Json | null
          status: string
          test_case_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          id?: string
          logs?: string | null
          result?: Json | null
          status: string
          test_case_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          id?: string
          logs?: string | null
          result?: Json | null
          status?: string
          test_case_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_results_test_case_id_fkey"
            columns: ["test_case_id"]
            isOneToOne: false
            referencedRelation: "test_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      git_commits: {
        Row: {
          author: string | null
          commit_hash: string
          committed_at: string
          created_at: string
          id: string
          message: string | null
          project_id: string
          user_id: string
        }
        Insert: {
          author?: string | null
          commit_hash: string
          committed_at?: string
          created_at?: string
          id?: string
          message?: string | null
          project_id: string
          user_id: string
        }
        Update: {
          author?: string | null
          commit_hash?: string
          committed_at?: string
          created_at?: string
          id?: string
          message?: string | null
          project_id?: string
          user_id?: string
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
          file_path: string
          id: string
          last_modified: string
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_content?: string | null
          file_path: string
          id?: string
          last_modified?: string
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_content?: string | null
          file_path?: string
          id?: string
          last_modified?: string
          project_id?: string
          user_id?: string
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
          config: Json | null
          created_at: string
          enabled: boolean | null
          id: string
          integration_type: string
          project_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          enabled?: boolean | null
          id?: string
          integration_type: string
          project_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          enabled?: boolean | null
          id?: string
          integration_type?: string
          project_id?: string | null
          updated_at?: string
          user_id?: string
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
          user_id: string
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
          user_id: string
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
          user_id?: string
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
          failed_tests: number
          id: string
          passed_tests: number
          results: Json | null
          started_at: string
          status: string
          suite_id: string
          total_tests: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          failed_tests?: number
          id?: string
          passed_tests?: number
          results?: Json | null
          started_at?: string
          status?: string
          suite_id: string
          total_tests?: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          failed_tests?: number
          id?: string
          passed_tests?: number
          results?: Json | null
          started_at?: string
          status?: string
          suite_id?: string
          total_tests?: number
          user_id?: string
        }
        Relationships: [
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
          user_id: string
        }
        Insert: {
          created_at?: string
          execution_order?: number
          id?: string
          suite_id: string
          test_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          execution_order?: number
          id?: string
          suite_id?: string
          test_id?: string
          user_id?: string
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
          id: string
          results: Json | null
          started_at: string
          status: string
          test_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          results?: Json | null
          started_at?: string
          status?: string
          test_id: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          results?: Json | null
          started_at?: string
          status?: string
          test_id?: string
          user_id?: string
        }
        Relationships: [
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
          id: string
          name: string
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          project_id?: string
          user_id?: string
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
          description: string | null
          id: string
          name: string
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          user_id?: string
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
          description: string | null
          folder_id: string | null
          id: string
          name: string
          project_id: string
          status: string
          steps: Json | null
          test_case_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          base_url?: string
          created_at?: string
          description?: string | null
          folder_id?: string | null
          id?: string
          name: string
          project_id: string
          status?: string
          steps?: Json | null
          test_case_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          base_url?: string
          created_at?: string
          description?: string | null
          folder_id?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string
          steps?: Json | null
          test_case_id?: string | null
          updated_at?: string
          user_id?: string
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
          baseline_image: string | null
          created_at: string
          id: string
          step_name: string
          test_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          baseline_image?: string | null
          created_at?: string
          id?: string
          step_name: string
          test_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          baseline_image?: string | null
          created_at?: string
          id?: string
          step_name?: string
          test_id?: string
          updated_at?: string
          user_id?: string
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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_members: {
        Row: {
          created_at: string
          id: string
          invited_email: string | null
          project_id: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_email?: string | null
          project_id: string
          role?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_email?: string | null
          project_id?: string
          role?: string
          status?: string
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
          description: string | null
          git_branch: string | null
          git_last_sync: string | null
          git_repository_url: string | null
          git_sync_status: string | null
          id: string
          markdown_settings: Json | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          git_branch?: string | null
          git_last_sync?: string | null
          git_repository_url?: string | null
          git_sync_status?: string | null
          id?: string
          markdown_settings?: Json | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          git_branch?: string | null
          git_last_sync?: string | null
          git_repository_url?: string | null
          git_sync_status?: string | null
          id?: string
          markdown_settings?: Json | null
          name?: string
          updated_at?: string
          user_id?: string
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
          project_id: string | null
          swagger_content: string | null
          swagger_url: string | null
          test_cases: Json | null
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
          project_id?: string | null
          swagger_content?: string | null
          swagger_url?: string | null
          test_cases?: Json | null
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
          project_id?: string | null
          swagger_content?: string | null
          swagger_url?: string | null
          test_cases?: Json | null
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
          content: Json | null
          created_at: string
          id: string
          name: string
          project_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: Json | null
          created_at?: string
          id?: string
          name: string
          project_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: Json | null
          created_at?: string
          id?: string
          name?: string
          project_id?: string | null
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
          content: Json | null
          created_at: string
          id: string
          jira_data: Json | null
          name: string
          project_id: string | null
          project_name: string | null
          report_content: string | null
          report_name: string | null
          report_type: string | null
          statistics: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          azure_devops_data?: Json | null
          content?: Json | null
          created_at?: string
          id?: string
          jira_data?: Json | null
          name: string
          project_id?: string | null
          project_name?: string | null
          report_content?: string | null
          report_name?: string | null
          report_type?: string | null
          statistics?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          azure_devops_data?: Json | null
          content?: Json | null
          created_at?: string
          id?: string
          jira_data?: Json | null
          name?: string
          project_id?: string | null
          project_name?: string | null
          report_content?: string | null
          report_name?: string | null
          report_type?: string | null
          statistics?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_test_reports_project_id_fkey"
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
          id: string
          is_custom: boolean
          name: string
          project_id: string
          user_id: string
          user_story_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_custom?: boolean
          name: string
          project_id: string
          user_id: string
          user_story_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_custom?: boolean
          name?: string
          project_id?: string
          user_id?: string
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
          automated: boolean | null
          created_at: string
          description: string | null
          expected_result: string | null
          folder_id: string | null
          id: string
          priority: string | null
          project_id: string | null
          readable_id: string | null
          status: string | null
          steps: Json | null
          structured_steps: Json | null
          test_data: Json | null
          title: string
          updated_at: string
          user_id: string
          user_story_id: string | null
        }
        Insert: {
          automated?: boolean | null
          created_at?: string
          description?: string | null
          expected_result?: string | null
          folder_id?: string | null
          id?: string
          priority?: string | null
          project_id?: string | null
          readable_id?: string | null
          status?: string | null
          steps?: Json | null
          structured_steps?: Json | null
          test_data?: Json | null
          title: string
          updated_at?: string
          user_id: string
          user_story_id?: string | null
        }
        Update: {
          automated?: boolean | null
          created_at?: string
          description?: string | null
          expected_result?: string | null
          folder_id?: string | null
          id?: string
          priority?: string | null
          project_id?: string | null
          readable_id?: string | null
          status?: string | null
          steps?: Json | null
          structured_steps?: Json | null
          test_data?: Json | null
          title?: string
          updated_at?: string
          user_id?: string
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
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
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
          user_id: string
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
          user_id: string
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
          user_id?: string
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
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
