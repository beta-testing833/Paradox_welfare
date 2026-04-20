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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agents: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean | null
          languages: string[] | null
          phone: string | null
          specialization: string[] | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean | null
          languages?: string[] | null
          phone?: string | null
          specialization?: string[] | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          languages?: string[] | null
          phone?: string | null
          specialization?: string[] | null
        }
        Relationships: []
      }
      application_documents: {
        Row: {
          application_id: string
          file_name: string
          file_path: string
          file_size_bytes: number
          id: string
          uploaded_at: string
        }
        Insert: {
          application_id: string
          file_name: string
          file_path: string
          file_size_bytes: number
          id?: string
          uploaded_at?: string
        }
        Update: {
          application_id?: string
          file_name?: string
          file_path?: string
          file_size_bytes?: number
          id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "upcoming_consultations"
            referencedColumns: ["application_id"]
          },
        ]
      }
      applications: {
        Row: {
          aadhar: string | null
          agent_assigned_at: string | null
          applied_at: string
          assigned_agent_id: string | null
          consultation_date: string | null
          consultation_status: string | null
          consultation_time_slot: string | null
          id: string
          message: string | null
          ngo_id: string | null
          scheme_id: string | null
          status: string
          support_expires_at: string | null
          user_id: string
          visit_requested: boolean | null
        }
        Insert: {
          aadhar?: string | null
          agent_assigned_at?: string | null
          applied_at?: string
          assigned_agent_id?: string | null
          consultation_date?: string | null
          consultation_status?: string | null
          consultation_time_slot?: string | null
          id?: string
          message?: string | null
          ngo_id?: string | null
          scheme_id?: string | null
          status?: string
          support_expires_at?: string | null
          user_id: string
          visit_requested?: boolean | null
        }
        Update: {
          aadhar?: string | null
          agent_assigned_at?: string | null
          applied_at?: string
          assigned_agent_id?: string | null
          consultation_date?: string | null
          consultation_status?: string | null
          consultation_time_slot?: string | null
          id?: string
          message?: string | null
          ngo_id?: string | null
          scheme_id?: string | null
          status?: string
          support_expires_at?: string | null
          user_id?: string
          visit_requested?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_ngo_id_fkey"
            columns: ["ngo_id"]
            isOneToOne: false
            referencedRelation: "ngos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      eligibility_submissions: {
        Row: {
          age: number | null
          annual_income: number | null
          area_type: string | null
          category: string | null
          created_at: string
          disability: boolean | null
          family_annual_income: number | null
          full_name: string | null
          gender: string | null
          gov_employee_id: string | null
          guardian_annual_income: number | null
          guardian_not_applicable: boolean | null
          id: string
          is_bpl: boolean | null
          is_dbt_eligible: boolean | null
          is_distressed: boolean | null
          is_gov_employee: boolean | null
          is_minority: boolean | null
          marital_status: string | null
          occupation: string | null
          preferred_benefit_type: string | null
          priority_search: string | null
          state_of_residence: string | null
          user_id: string
        }
        Insert: {
          age?: number | null
          annual_income?: number | null
          area_type?: string | null
          category?: string | null
          created_at?: string
          disability?: boolean | null
          family_annual_income?: number | null
          full_name?: string | null
          gender?: string | null
          gov_employee_id?: string | null
          guardian_annual_income?: number | null
          guardian_not_applicable?: boolean | null
          id?: string
          is_bpl?: boolean | null
          is_dbt_eligible?: boolean | null
          is_distressed?: boolean | null
          is_gov_employee?: boolean | null
          is_minority?: boolean | null
          marital_status?: string | null
          occupation?: string | null
          preferred_benefit_type?: string | null
          priority_search?: string | null
          state_of_residence?: string | null
          user_id: string
        }
        Update: {
          age?: number | null
          annual_income?: number | null
          area_type?: string | null
          category?: string | null
          created_at?: string
          disability?: boolean | null
          family_annual_income?: number | null
          full_name?: string | null
          gender?: string | null
          gov_employee_id?: string | null
          guardian_annual_income?: number | null
          guardian_not_applicable?: boolean | null
          id?: string
          is_bpl?: boolean | null
          is_dbt_eligible?: boolean | null
          is_distressed?: boolean | null
          is_gov_employee?: boolean | null
          is_minority?: boolean | null
          marital_status?: string | null
          occupation?: string | null
          preferred_benefit_type?: string | null
          priority_search?: string | null
          state_of_residence?: string | null
          user_id?: string
        }
        Relationships: []
      }
      interactions: {
        Row: {
          agent_id: string | null
          application_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          id: string
          interaction_type: string
          notes: string | null
          scheduled_at: string | null
        }
        Insert: {
          agent_id?: string | null
          application_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          interaction_type: string
          notes?: string | null
          scheduled_at?: string | null
        }
        Update: {
          agent_id?: string | null
          application_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          interaction_type?: string
          notes?: string | null
          scheduled_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interactions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "upcoming_consultations"
            referencedColumns: ["application_id"]
          },
        ]
      }
      ngos: {
        Row: {
          created_at: string
          focus_area: string | null
          id: string
          km_from_user: number | null
          location: string | null
          name: string
          rating: number | null
          testimonial: string | null
          testimonial_author: string | null
        }
        Insert: {
          created_at?: string
          focus_area?: string | null
          id?: string
          km_from_user?: number | null
          location?: string | null
          name: string
          rating?: number | null
          testimonial?: string | null
          testimonial_author?: string | null
        }
        Update: {
          created_at?: string
          focus_area?: string | null
          id?: string
          km_from_user?: number | null
          location?: string | null
          name?: string
          rating?: number | null
          testimonial?: string | null
          testimonial_author?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          aadhar: string | null
          created_at: string
          dob: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          aadhar?: string | null
          created_at?: string
          dob?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          aadhar?: string | null
          created_at?: string
          dob?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      scheme_ngo_map: {
        Row: {
          ngo_id: string
          scheme_id: string
        }
        Insert: {
          ngo_id: string
          scheme_id: string
        }
        Update: {
          ngo_id?: string
          scheme_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheme_ngo_map_ngo_id_fkey"
            columns: ["ngo_id"]
            isOneToOne: false
            referencedRelation: "ngos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheme_ngo_map_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      scheme_packs: {
        Row: {
          amount_paid: number | null
          calls_total: number | null
          calls_used: number | null
          concession_applied: boolean | null
          expires_at: string
          id: string
          is_active: boolean | null
          payment_reference: string | null
          purchased_at: string
          scheme_id: string
          user_id: string
          visits_total: number | null
          visits_used: number | null
        }
        Insert: {
          amount_paid?: number | null
          calls_total?: number | null
          calls_used?: number | null
          concession_applied?: boolean | null
          expires_at: string
          id?: string
          is_active?: boolean | null
          payment_reference?: string | null
          purchased_at?: string
          scheme_id: string
          user_id: string
          visits_total?: number | null
          visits_used?: number | null
        }
        Update: {
          amount_paid?: number | null
          calls_total?: number | null
          calls_used?: number | null
          concession_applied?: boolean | null
          expires_at?: string
          id?: string
          is_active?: boolean | null
          payment_reference?: string | null
          purchased_at?: string
          scheme_id?: string
          user_id?: string
          visits_total?: number | null
          visits_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scheme_packs_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      schemes: {
        Row: {
          allowed_states: string[]
          benefit_amount: string | null
          category: string | null
          created_at: string
          description: string | null
          eligibility_criteria: Json
          id: string
          is_verified: boolean
          name: string
          official_portal_url: string | null
          required_documents: string[]
          requires_bpl: boolean
          subcategory: string | null
          target_area: string
        }
        Insert: {
          allowed_states?: string[]
          benefit_amount?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          eligibility_criteria?: Json
          id?: string
          is_verified?: boolean
          name: string
          official_portal_url?: string | null
          required_documents?: string[]
          requires_bpl?: boolean
          subcategory?: string | null
          target_area?: string
        }
        Update: {
          allowed_states?: string[]
          benefit_amount?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          eligibility_criteria?: Json
          id?: string
          is_verified?: boolean
          name?: string
          official_portal_url?: string | null
          required_documents?: string[]
          requires_bpl?: boolean
          subcategory?: string | null
          target_area?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          amount_paid: number | null
          calls_total: number | null
          calls_used: number | null
          concession_applied: boolean | null
          created_at: string
          expires_at: string
          id: string
          is_active: boolean
          payment_method: string | null
          payment_reference: string | null
          plan: string
          plan_type: string | null
          started_at: string
          updated_at: string
          user_id: string
          visits_total: number | null
          visits_used: number | null
        }
        Insert: {
          amount_paid?: number | null
          calls_total?: number | null
          calls_used?: number | null
          concession_applied?: boolean | null
          created_at?: string
          expires_at: string
          id?: string
          is_active?: boolean
          payment_method?: string | null
          payment_reference?: string | null
          plan?: string
          plan_type?: string | null
          started_at?: string
          updated_at?: string
          user_id: string
          visits_total?: number | null
          visits_used?: number | null
        }
        Update: {
          amount_paid?: number | null
          calls_total?: number | null
          calls_used?: number | null
          concession_applied?: boolean | null
          created_at?: string
          expires_at?: string
          id?: string
          is_active?: boolean
          payment_method?: string | null
          payment_reference?: string | null
          plan?: string
          plan_type?: string | null
          started_at?: string
          updated_at?: string
          user_id?: string
          visits_total?: number | null
          visits_used?: number | null
        }
        Relationships: []
      }
      topup_purchases: {
        Row: {
          amount_paid: number | null
          applies_to: string | null
          id: string
          payment_reference: string | null
          purchased_at: string
          scheme_pack_id: string | null
          subscription_id: string | null
          topup_type: string
          units_added: number | null
          user_id: string
        }
        Insert: {
          amount_paid?: number | null
          applies_to?: string | null
          id?: string
          payment_reference?: string | null
          purchased_at?: string
          scheme_pack_id?: string | null
          subscription_id?: string | null
          topup_type: string
          units_added?: number | null
          user_id: string
        }
        Update: {
          amount_paid?: number | null
          applies_to?: string | null
          id?: string
          payment_reference?: string | null
          purchased_at?: string
          scheme_pack_id?: string | null
          subscription_id?: string | null
          topup_type?: string
          units_added?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "topup_purchases_scheme_pack_id_fkey"
            columns: ["scheme_pack_id"]
            isOneToOne: false
            referencedRelation: "scheme_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topup_purchases_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      agent_bookings: {
        Row: {
          agent_id: string | null
          booking_date: string | null
          slot_start: string | null
        }
        Insert: {
          agent_id?: string | null
          booking_date?: never
          slot_start?: never
        }
        Update: {
          agent_id?: string | null
          booking_date?: never
          slot_start?: never
        }
        Relationships: [
          {
            foreignKeyName: "interactions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_summary: {
        Row: {
          day: string | null
          gross_revenue: number | null
          source: string | null
          units: number | null
        }
        Relationships: []
      }
      upcoming_consultations: {
        Row: {
          aadhar: string | null
          application_id: string | null
          applied_at: string | null
          consultation_date: string | null
          consultation_status: string | null
          consultation_time_slot: string | null
          full_name: string | null
          phone: string | null
          scheme_name: string | null
          user_id: string | null
        }
        Relationships: []
      }
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
    Enums: {},
  },
} as const
