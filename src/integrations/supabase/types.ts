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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          company_id: string | null
          created_at: string
          details: Json | null
          id: string
          target_id: string | null
          target_type: string
          user_id: string | null
        }
        Insert: {
          action: string
          company_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type: string
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      buildings: {
        Row: {
          address: string
          company_id: string
          created_at: string
          evacuation_last_date: string | null
          ibp_valid_until: string | null
          id: string
          name: string
        }
        Insert: {
          address?: string
          company_id: string
          created_at?: string
          evacuation_last_date?: string | null
          ibp_valid_until?: string | null
          id?: string
          name: string
        }
        Update: {
          address?: string
          company_id?: string
          created_at?: string
          evacuation_last_date?: string | null
          ibp_valid_until?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "buildings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          approved_by: string | null
          building_id: string
          certificate_number: string
          created_at: string
          id: string
          issued_at: string
          status: string
          valid_until: string
        }
        Insert: {
          approved_by?: string | null
          building_id: string
          certificate_number: string
          created_at?: string
          id?: string
          issued_at?: string
          status?: string
          valid_until: string
        }
        Update: {
          approved_by?: string | null
          building_id?: string
          certificate_number?: string
          created_at?: string
          id?: string
          issued_at?: string
          status?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      device_services: {
        Row: {
          created_at: string
          device_id: string
          id: string
          next_service_date: string | null
          notes: string | null
          performed_at: string
          performed_by: string | null
          result: string
          task_id: string | null
        }
        Insert: {
          created_at?: string
          device_id: string
          id?: string
          next_service_date?: string | null
          notes?: string | null
          performed_at?: string
          performed_by?: string | null
          result?: string
          task_id?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string
          id?: string
          next_service_date?: string | null
          notes?: string | null
          performed_at?: string
          performed_by?: string | null
          result?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_services_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_services_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      device_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          service_interval_days: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          service_interval_days?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          service_interval_days?: number
        }
        Relationships: []
      }
      devices: {
        Row: {
          building_id: string
          created_at: string
          device_type_id: string
          id: string
          installed_at: string | null
          last_service_date: string | null
          location_in_building: string | null
          manufacturer: string | null
          model: string | null
          name: string
          next_service_date: string | null
          notes: string | null
          serial_number: string | null
          status: string
        }
        Insert: {
          building_id: string
          created_at?: string
          device_type_id: string
          id?: string
          installed_at?: string | null
          last_service_date?: string | null
          location_in_building?: string | null
          manufacturer?: string | null
          model?: string | null
          name: string
          next_service_date?: string | null
          notes?: string | null
          serial_number?: string | null
          status?: string
        }
        Update: {
          building_id?: string
          created_at?: string
          device_type_id?: string
          id?: string
          installed_at?: string | null
          last_service_date?: string | null
          location_in_building?: string | null
          manufacturer?: string | null
          model?: string | null
          name?: string
          next_service_date?: string | null
          notes?: string | null
          serial_number?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devices_device_type_id_fkey"
            columns: ["device_type_id"]
            isOneToOne: false
            referencedRelation: "device_types"
            referencedColumns: ["id"]
          },
        ]
      }
      evacuation_drills: {
        Row: {
          building_id: string
          created_at: string
          evacuation_time: number | null
          id: string
          participants_count: number
          performed_at: string
        }
        Insert: {
          building_id: string
          created_at?: string
          evacuation_time?: number | null
          id?: string
          participants_count?: number
          performed_at: string
        }
        Update: {
          building_id?: string
          created_at?: string
          evacuation_time?: number | null
          id?: string
          participants_count?: number
          performed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evacuation_drills_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          building_id: string
          created_at: string
          id: string
          next_due: string | null
          performed_at: string
          type: string
        }
        Insert: {
          building_id: string
          created_at?: string
          id?: string
          next_due?: string | null
          performed_at: string
          type?: string
        }
        Update: {
          building_id?: string
          created_at?: string
          id?: string
          next_due?: string | null
          performed_at?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspections_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_id: string | null
          created_at: string
          email: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      task_history: {
        Row: {
          action: string
          comment: string | null
          created_at: string
          id: string
          new_value: string | null
          old_value: string | null
          task_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          comment?: string | null
          created_at?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          task_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          comment?: string | null
          created_at?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          task_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_templates: {
        Row: {
          building_id: string | null
          created_at: string
          description: string | null
          device_type_id: string | null
          id: string
          is_global: boolean
          name: string
          priority: Database["public"]["Enums"]["task_priority"]
          recurrence_days: number | null
          sla_hours: number
          type: Database["public"]["Enums"]["task_type"]
        }
        Insert: {
          building_id?: string | null
          created_at?: string
          description?: string | null
          device_type_id?: string | null
          id?: string
          is_global?: boolean
          name: string
          priority?: Database["public"]["Enums"]["task_priority"]
          recurrence_days?: number | null
          sla_hours?: number
          type?: Database["public"]["Enums"]["task_type"]
        }
        Update: {
          building_id?: string | null
          created_at?: string
          description?: string | null
          device_type_id?: string | null
          id?: string
          is_global?: boolean
          name?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          recurrence_days?: number | null
          sla_hours?: number
          type?: Database["public"]["Enums"]["task_type"]
        }
        Relationships: [
          {
            foreignKeyName: "task_templates_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_templates_device_type_id_fkey"
            columns: ["device_type_id"]
            isOneToOne: false
            referencedRelation: "device_types"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          building_id: string
          closed_at: string | null
          closing_comment: string | null
          company_id: string
          created_at: string
          deadline: string | null
          description: string
          first_response_at: string | null
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          sla_hours: number
          status: Database["public"]["Enums"]["task_status"]
          title: string
          type: Database["public"]["Enums"]["task_type"]
        }
        Insert: {
          assignee_id?: string | null
          building_id: string
          closed_at?: string | null
          closing_comment?: string | null
          company_id: string
          created_at?: string
          deadline?: string | null
          description?: string
          first_response_at?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          sla_hours?: number
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          type?: Database["public"]["Enums"]["task_type"]
        }
        Update: {
          assignee_id?: string | null
          building_id?: string
          closed_at?: string | null
          closing_comment?: string | null
          company_id?: string
          created_at?: string
          deadline?: string | null
          description?: string
          first_response_at?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          sla_hours?: number
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          type?: Database["public"]["Enums"]["task_type"]
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          role: Database["public"]["Enums"]["app_role"]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_building_safety_status: {
        Args: { _building_id: string }
        Returns: Database["public"]["Enums"]["safety_status"]
      }
      calculate_task_sla: { Args: { _task_id: string }; Returns: Json }
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_company_admin: { Args: { _company_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "employee" | "client"
      safety_status: "bezpieczny" | "ostrzeżenie" | "krytyczny"
      task_priority: "niski" | "średni" | "wysoki" | "krytyczny"
      task_status:
        | "Nowe"
        | "Zaplanowane"
        | "W trakcie"
        | "Oczekuje"
        | "Do weryfikacji"
        | "Zamknięte"
      task_type:
        | "usterka"
        | "przegląd"
        | "szkolenie"
        | "ewakuacja"
        | "konsultacja"
        | "przebudowa"
        | "audyt"
        | "porada"
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
      app_role: ["super_admin", "admin", "employee", "client"],
      safety_status: ["bezpieczny", "ostrzeżenie", "krytyczny"],
      task_priority: ["niski", "średni", "wysoki", "krytyczny"],
      task_status: [
        "Nowe",
        "Zaplanowane",
        "W trakcie",
        "Oczekuje",
        "Do weryfikacji",
        "Zamknięte",
      ],
      task_type: [
        "usterka",
        "przegląd",
        "szkolenie",
        "ewakuacja",
        "konsultacja",
        "przebudowa",
        "audyt",
        "porada",
      ],
    },
  },
} as const
