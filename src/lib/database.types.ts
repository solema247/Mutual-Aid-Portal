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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activities_merged: {
        Row: {
          activities_raw_import_id: string | null
          activity_duration: number | null
          additional_support: string | null
          approval_file_key: string | null
          approval_uploaded_at: string | null
          approval_uploaded_by: string | null
          banking_details: string | null
          challenges: string | null
          comments: string | null
          created_at: string | null
          created_by: string | null
          current_feedback_id: string | null
          cycle_state_allocation_id: string | null
          date: string | null
          date_report_completed: string | null
          date_transfer: string | null
          description: string | null
          donor_id: string | null
          emergency_room_id: string | null
          end_date_activity: string | null
          err_code: string | null
          err_id: string | null
          err_name: string | null
          estimated_beneficiaries: number | null
          estimated_timeframe: string | null
          expenses: Json | null
          f1: string | null
          f1_date_submitted: string | null
          f4: string | null
          f5: string | null
          family: number | null
          female_over_18: number | null
          female_under_18: number | null
          file_key: string | null
          finance_officer_name: string | null
          finance_officer_phone: string | null
          funding_cycle_id: string | null
          funding_status: string | null
          grant_call_id: string | null
          grant_call_state_allocation_id: string | null
          grant_grid_id: string | null
          grant_id: string | null
          grant_segment: string | null
          grant_segment_project: string | null
          grant_serial: string | null
          grant_serial_id: string | null
          id: string
          individuals: number | null
          intended_beneficiaries: string | null
          is_draft: boolean | null
          language: string | null
          last_modified: string | null
          lessons_learned: string | null
          locality: string | null
          male_over_18: number | null
          male_under_18: number | null
          mou_id: string | null
          mou_signed: string | null
          num_base_err: number | null
          original_text: Json | null
          overdue: number | null
          partner: string | null
          people_special_needs: number | null
          planned_activities: Json | null
          program_officer_name: string | null
          program_officer_phone: string | null
          project_donor: string | null
          project_id: string | null
          project_name: string | null
          project_objectives: string | null
          project_status: string | null
          rate: number | null
          recommendations: string | null
          reporting_duration: number | null
          reporting_officer_name: string | null
          reporting_officer_phone: string | null
          responsible: string | null
          sdg: number | null
          sector_primary: string | null
          sector_primary_project: string | null
          sector_secondary: string | null
          sector_secondary_project: string | null
          serial_number: string | null
          source: string | null
          start_date_activity: string | null
          state: string | null
          state_project: string | null
          status: string | null
          submitted_at: string | null
          target_fam: number | null
          target_ind: number | null
          temp_file_key: string | null
          tracker: number | null
          updated_at: string | null
          usd: number | null
          version: number | null
          volunteers: number | null
          workplan_number: number | null
        }
        Insert: {
          activities_raw_import_id?: string | null
          activity_duration?: number | null
          additional_support?: string | null
          approval_file_key?: string | null
          approval_uploaded_at?: string | null
          approval_uploaded_by?: string | null
          banking_details?: string | null
          challenges?: string | null
          comments?: string | null
          created_at?: string | null
          created_by?: string | null
          current_feedback_id?: string | null
          cycle_state_allocation_id?: string | null
          date?: string | null
          date_report_completed?: string | null
          date_transfer?: string | null
          description?: string | null
          donor_id?: string | null
          emergency_room_id?: string | null
          end_date_activity?: string | null
          err_code?: string | null
          err_id?: string | null
          err_name?: string | null
          estimated_beneficiaries?: number | null
          estimated_timeframe?: string | null
          expenses?: Json | null
          f1?: string | null
          f1_date_submitted?: string | null
          f4?: string | null
          f5?: string | null
          family?: number | null
          female_over_18?: number | null
          female_under_18?: number | null
          file_key?: string | null
          finance_officer_name?: string | null
          finance_officer_phone?: string | null
          funding_cycle_id?: string | null
          funding_status?: string | null
          grant_call_id?: string | null
          grant_call_state_allocation_id?: string | null
          grant_grid_id?: string | null
          grant_id?: string | null
          grant_segment?: string | null
          grant_segment_project?: string | null
          grant_serial?: string | null
          grant_serial_id?: string | null
          id?: string
          individuals?: number | null
          intended_beneficiaries?: string | null
          is_draft?: boolean | null
          language?: string | null
          last_modified?: string | null
          lessons_learned?: string | null
          locality?: string | null
          male_over_18?: number | null
          male_under_18?: number | null
          mou_id?: string | null
          mou_signed?: string | null
          num_base_err?: number | null
          original_text?: Json | null
          overdue?: number | null
          partner?: string | null
          people_special_needs?: number | null
          planned_activities?: Json | null
          program_officer_name?: string | null
          program_officer_phone?: string | null
          project_donor?: string | null
          project_id?: string | null
          project_name?: string | null
          project_objectives?: string | null
          project_status?: string | null
          rate?: number | null
          recommendations?: string | null
          reporting_duration?: number | null
          reporting_officer_name?: string | null
          reporting_officer_phone?: string | null
          responsible?: string | null
          sdg?: number | null
          sector_primary?: string | null
          sector_primary_project?: string | null
          sector_secondary?: string | null
          sector_secondary_project?: string | null
          serial_number?: string | null
          source?: string | null
          start_date_activity?: string | null
          state?: string | null
          state_project?: string | null
          status?: string | null
          submitted_at?: string | null
          target_fam?: number | null
          target_ind?: number | null
          temp_file_key?: string | null
          tracker?: number | null
          updated_at?: string | null
          usd?: number | null
          version?: number | null
          volunteers?: number | null
          workplan_number?: number | null
        }
        Update: {
          activities_raw_import_id?: string | null
          activity_duration?: number | null
          additional_support?: string | null
          approval_file_key?: string | null
          approval_uploaded_at?: string | null
          approval_uploaded_by?: string | null
          banking_details?: string | null
          challenges?: string | null
          comments?: string | null
          created_at?: string | null
          created_by?: string | null
          current_feedback_id?: string | null
          cycle_state_allocation_id?: string | null
          date?: string | null
          date_report_completed?: string | null
          date_transfer?: string | null
          description?: string | null
          donor_id?: string | null
          emergency_room_id?: string | null
          end_date_activity?: string | null
          err_code?: string | null
          err_id?: string | null
          err_name?: string | null
          estimated_beneficiaries?: number | null
          estimated_timeframe?: string | null
          expenses?: Json | null
          f1?: string | null
          f1_date_submitted?: string | null
          f4?: string | null
          f5?: string | null
          family?: number | null
          female_over_18?: number | null
          female_under_18?: number | null
          file_key?: string | null
          finance_officer_name?: string | null
          finance_officer_phone?: string | null
          funding_cycle_id?: string | null
          funding_status?: string | null
          grant_call_id?: string | null
          grant_call_state_allocation_id?: string | null
          grant_grid_id?: string | null
          grant_id?: string | null
          grant_segment?: string | null
          grant_segment_project?: string | null
          grant_serial?: string | null
          grant_serial_id?: string | null
          id?: string
          individuals?: number | null
          intended_beneficiaries?: string | null
          is_draft?: boolean | null
          language?: string | null
          last_modified?: string | null
          lessons_learned?: string | null
          locality?: string | null
          male_over_18?: number | null
          male_under_18?: number | null
          mou_id?: string | null
          mou_signed?: string | null
          num_base_err?: number | null
          original_text?: Json | null
          overdue?: number | null
          partner?: string | null
          people_special_needs?: number | null
          planned_activities?: Json | null
          program_officer_name?: string | null
          program_officer_phone?: string | null
          project_donor?: string | null
          project_id?: string | null
          project_name?: string | null
          project_objectives?: string | null
          project_status?: string | null
          rate?: number | null
          recommendations?: string | null
          reporting_duration?: number | null
          reporting_officer_name?: string | null
          reporting_officer_phone?: string | null
          responsible?: string | null
          sdg?: number | null
          sector_primary?: string | null
          sector_primary_project?: string | null
          sector_secondary?: string | null
          sector_secondary_project?: string | null
          serial_number?: string | null
          source?: string | null
          start_date_activity?: string | null
          state?: string | null
          state_project?: string | null
          status?: string | null
          submitted_at?: string | null
          target_fam?: number | null
          target_ind?: number | null
          temp_file_key?: string | null
          tracker?: number | null
          updated_at?: string | null
          usd?: number | null
          version?: number | null
          volunteers?: number | null
          workplan_number?: number | null
        }
        Relationships: []
      }
      activities_raw_import: {
        Row: {
          "# of Base ERR": string | null
          "Activity Duration": string | null
          Challenges: string | null
          Comments: string | null
          "Date Report Completed": string | null
          "Date Transfer": string | null
          "Description of ERRs activity": string | null
          "End Date (Activity)": string | null
          "ERR CODE": string | null
          "ERR Name": string | null
          F1: string | null
          "F1 Date of Submitted": string | null
          F4: string | null
          F5: string | null
          Family: string | null
          "Female <18": number | null
          "Female >18": number | null
          "Grant Segment": string | null
          id: string
          Individuals: string | null
          "Lessons learned": string | null
          "Male <18": number | null
          "Male >18": number | null
          "MOU Signed": string | null
          Overdue: string | null
          "Paid To": string | null
          Partner: string | null
          "People with special needs": number | null
          "Project Donor": string | null
          "Project Status": string | null
          Rate: number | null
          Recommendations: string | null
          "Reporting Duration (End Date to Report)": string | null
          Responsible: string | null
          SDG: number | null
          "Sector (Primary)": string | null
          "Sector (Secondardy": string | null
          "Serial Number": string
          "Start Date (Activity)": string | null
          State: string | null
          "Target (Fam.)": number | null
          "Target (Ind.)": number | null
          Tracker: number | null
          USD: number | null
          Volunteers: number | null
        }
        Insert: {
          "# of Base ERR"?: string | null
          "Activity Duration"?: string | null
          Challenges?: string | null
          Comments?: string | null
          "Date Report Completed"?: string | null
          "Date Transfer"?: string | null
          "Description of ERRs activity"?: string | null
          "End Date (Activity)"?: string | null
          "ERR CODE"?: string | null
          "ERR Name"?: string | null
          F1?: string | null
          "F1 Date of Submitted"?: string | null
          F4?: string | null
          F5?: string | null
          Family?: string | null
          "Female <18"?: number | null
          "Female >18"?: number | null
          "Grant Segment"?: string | null
          id?: string
          Individuals?: string | null
          "Lessons learned"?: string | null
          "Male <18"?: number | null
          "Male >18"?: number | null
          "MOU Signed"?: string | null
          Overdue?: string | null
          "Paid To"?: string | null
          Partner?: string | null
          "People with special needs"?: number | null
          "Project Donor"?: string | null
          "Project Status"?: string | null
          Rate?: number | null
          Recommendations?: string | null
          "Reporting Duration (End Date to Report)"?: string | null
          Responsible?: string | null
          SDG?: number | null
          "Sector (Primary)"?: string | null
          "Sector (Secondardy"?: string | null
          "Serial Number": string
          "Start Date (Activity)"?: string | null
          State?: string | null
          "Target (Fam.)"?: number | null
          "Target (Ind.)"?: number | null
          Tracker?: number | null
          USD?: number | null
          Volunteers?: number | null
        }
        Update: {
          "# of Base ERR"?: string | null
          "Activity Duration"?: string | null
          Challenges?: string | null
          Comments?: string | null
          "Date Report Completed"?: string | null
          "Date Transfer"?: string | null
          "Description of ERRs activity"?: string | null
          "End Date (Activity)"?: string | null
          "ERR CODE"?: string | null
          "ERR Name"?: string | null
          F1?: string | null
          "F1 Date of Submitted"?: string | null
          F4?: string | null
          F5?: string | null
          Family?: string | null
          "Female <18"?: number | null
          "Female >18"?: number | null
          "Grant Segment"?: string | null
          id?: string
          Individuals?: string | null
          "Lessons learned"?: string | null
          "Male <18"?: number | null
          "Male >18"?: number | null
          "MOU Signed"?: string | null
          Overdue?: string | null
          "Paid To"?: string | null
          Partner?: string | null
          "People with special needs"?: number | null
          "Project Donor"?: string | null
          "Project Status"?: string | null
          Rate?: number | null
          Recommendations?: string | null
          "Reporting Duration (End Date to Report)"?: string | null
          Responsible?: string | null
          SDG?: number | null
          "Sector (Primary)"?: string | null
          "Sector (Secondardy"?: string | null
          "Serial Number"?: string
          "Start Date (Activity)"?: string | null
          State?: string | null
          "Target (Fam.)"?: number | null
          "Target (Ind.)"?: number | null
          Tracker?: number | null
          USD?: number | null
          Volunteers?: number | null
        }
        Relationships: []
      }
      aid_clusters: {
        Row: {
          id: string
          name: string
          name_ar: string | null
        }
        Insert: {
          id?: string
          name: string
          name_ar?: string | null
        }
        Update: {
          id?: string
          name?: string
          name_ar?: string | null
        }
        Relationships: []
      }
      allocations: {
        Row: {
          allocation_amount: number | null
          allocation_id: Json | null
          decision_amount: Json | null
          decision_date: Json | null
          decision_id: Json | null
          decision_maker: string | null
          flow_oversight: string | null
          grant_id: Json | null
          notes: string | null
          partner: Json | null
          percent_decision_amount: number | null
          restriction: string | null
          sequence: string | null
          serial: number | null
          state: string | null
          status: string | null
        }
        Insert: {
          allocation_amount?: number | null
          allocation_id?: Json | null
          decision_amount?: Json | null
          decision_date?: Json | null
          decision_id?: Json | null
          decision_maker?: string | null
          flow_oversight?: string | null
          grant_id?: Json | null
          notes?: string | null
          partner?: Json | null
          percent_decision_amount?: number | null
          restriction?: string | null
          sequence?: string | null
          serial?: number | null
          state?: string | null
          status?: string | null
        }
        Update: {
          allocation_amount?: number | null
          allocation_id?: Json | null
          decision_amount?: Json | null
          decision_date?: Json | null
          decision_id?: Json | null
          decision_maker?: string | null
          flow_oversight?: string | null
          grant_id?: Json | null
          notes?: string | null
          partner?: Json | null
          percent_decision_amount?: number | null
          restriction?: string | null
          sequence?: string | null
          serial?: number | null
          state?: string | null
          status?: string | null
        }
        Relationships: []
      }
      allocations_by_date: {
        Row: {
          "%_Decision_Amount": number | null
          airtable_record_id: string | null
          "Allocation Amount": number | null
          Allocation_ID: string
          "Decision Maker": string | null
          Decision_Amount: number | null
          Decision_Date: string | null
          Decision_ID: string | null
          "Flow Oversight": string | null
          google_sheet_code: string | null
          Grant_ID: string | null
          last_pushed_at: string | null
          Notes: string | null
          Partner: string | null
          Restriction: string | null
          Serial: number | null
          State: string | null
          Status: string | null
          sync_status: string
        }
        Insert: {
          "%_Decision_Amount"?: number | null
          airtable_record_id?: string | null
          "Allocation Amount"?: number | null
          Allocation_ID: string
          "Decision Maker"?: string | null
          Decision_Amount?: number | null
          Decision_Date?: string | null
          Decision_ID?: string | null
          "Flow Oversight"?: string | null
          google_sheet_code?: string | null
          Grant_ID?: string | null
          last_pushed_at?: string | null
          Notes?: string | null
          Partner?: string | null
          Restriction?: string | null
          Serial?: number | null
          State?: string | null
          Status?: string | null
          sync_status?: string
        }
        Update: {
          "%_Decision_Amount"?: number | null
          airtable_record_id?: string | null
          "Allocation Amount"?: number | null
          Allocation_ID?: string
          "Decision Maker"?: string | null
          Decision_Amount?: number | null
          Decision_Date?: string | null
          Decision_ID?: string | null
          "Flow Oversight"?: string | null
          google_sheet_code?: string | null
          Grant_ID?: string | null
          last_pushed_at?: string | null
          Notes?: string | null
          Partner?: string | null
          Restriction?: string | null
          Serial?: number | null
          State?: string | null
          Status?: string | null
          sync_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_alloc_decision"
            columns: ["Decision_ID"]
            isOneToOne: false
            referencedRelation: "distribution_decision_master_sheet_1"
            referencedColumns: ["decision_id_proposed"]
          },
        ]
      }
      allocations_by_decision: {
        Row: {
          allocation_amount: number | null
          allocation_id: string | null
          created_at: string | null
          decision_amount: number | null
          decision_date: string | null
          decision_id: string | null
          decision_maker: string | null
          flow_oversight: string | null
          grant_id: string | null
          id: string
          notes: string | null
          partner: string | null
          pct_decision_amount: number | null
          restriction: string | null
          serial: number | null
          state: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          allocation_amount?: number | null
          allocation_id?: string | null
          created_at?: string | null
          decision_amount?: number | null
          decision_date?: string | null
          decision_id?: string | null
          decision_maker?: string | null
          flow_oversight?: string | null
          grant_id?: string | null
          id?: string
          notes?: string | null
          partner?: string | null
          pct_decision_amount?: number | null
          restriction?: string | null
          serial?: number | null
          state?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          allocation_amount?: number | null
          allocation_id?: string | null
          created_at?: string | null
          decision_amount?: number | null
          decision_date?: string | null
          decision_id?: string | null
          decision_maker?: string | null
          flow_oversight?: string | null
          grant_id?: string | null
          id?: string
          notes?: string | null
          partner?: string | null
          pct_decision_amount?: number | null
          restriction?: string | null
          serial?: number | null
          state?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      app_feedback: {
        Row: {
          created_at: string
          id: number
          main_challenges: string | null
          recommendation: boolean | null
          room_id: string | null
          task_usability_rating: number | null
        }
        Insert: {
          created_at?: string
          id?: number
          main_challenges?: string | null
          recommendation?: boolean | null
          room_id?: string | null
          task_usability_rating?: number | null
        }
        Update: {
          created_at?: string
          id?: number
          main_challenges?: string | null
          recommendation?: boolean | null
          room_id?: string | null
          task_usability_rating?: number | null
        }
        Relationships: []
      }
      cycle_grant_inclusions: {
        Row: {
          amount_included: number
          created_at: string | null
          created_by: string | null
          cycle_id: string
          grant_call_id: string
          id: string
        }
        Insert: {
          amount_included?: number
          created_at?: string | null
          created_by?: string | null
          cycle_id: string
          grant_call_id: string
          id?: string
        }
        Update: {
          amount_included?: number
          created_at?: string | null
          created_by?: string | null
          cycle_id?: string
          grant_call_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cycle_grant_inclusions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycle_grant_inclusions_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "funding_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycle_grant_inclusions_grant_call_id_fkey"
            columns: ["grant_call_id"]
            isOneToOne: false
            referencedRelation: "grant_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      cycle_state_allocations: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string | null
          cycle_id: string
          decision_no: number
          id: string
          state_name: string
        }
        Insert: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          cycle_id: string
          decision_no?: number
          id?: string
          state_name: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          cycle_id?: string
          decision_no?: number
          id?: string
          state_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "cycle_state_allocations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycle_state_allocations_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "funding_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      cycle_tranches: {
        Row: {
          closed_at: string | null
          created_at: string | null
          cycle_id: string
          id: string
          opened_at: string | null
          planned_cap: number
          status: string
          tranche_no: number
        }
        Insert: {
          closed_at?: string | null
          created_at?: string | null
          cycle_id: string
          id?: string
          opened_at?: string | null
          planned_cap?: number
          status?: string
          tranche_no: number
        }
        Update: {
          closed_at?: string | null
          created_at?: string | null
          cycle_id?: string
          id?: string
          opened_at?: string | null
          planned_cap?: number
          status?: string
          tranche_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "cycle_tranches_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "funding_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      distribution_decision: {
        Row: {
          allocation_id: Json | null
          decision_amount: number | null
          decision_date: string | null
          decision_id: string | null
          decision_id_proposed: Json | null
          file_link: string | null
          file_name: string | null
          fund_request: Json | null
          grant_name: Json | null
          id: string | null
          notes: string | null
          partner: Json | null
          restriction: string | null
          sum_allocation_amount: number | null
          transfer_segment: Json | null
          variance: number | null
        }
        Insert: {
          allocation_id?: Json | null
          decision_amount?: number | null
          decision_date?: string | null
          decision_id?: string | null
          decision_id_proposed?: Json | null
          file_link?: string | null
          file_name?: string | null
          fund_request?: Json | null
          grant_name?: Json | null
          id?: string | null
          notes?: string | null
          partner?: Json | null
          restriction?: string | null
          sum_allocation_amount?: number | null
          transfer_segment?: Json | null
          variance?: number | null
        }
        Update: {
          allocation_id?: Json | null
          decision_amount?: number | null
          decision_date?: string | null
          decision_id?: string | null
          decision_id_proposed?: Json | null
          file_link?: string | null
          file_name?: string | null
          fund_request?: Json | null
          grant_name?: Json | null
          id?: string | null
          notes?: string | null
          partner?: Json | null
          restriction?: string | null
          sum_allocation_amount?: number | null
          transfer_segment?: Json | null
          variance?: number | null
        }
        Relationships: []
      }
      distribution_decision_master_sheet_1: {
        Row: {
          airtable_record_id: string | null
          allocation_id: string | null
          created_at: string | null
          decision_amount: number | null
          decision_date: string | null
          decision_id: string | null
          decision_id_proposed: string | null
          decision_documents: Json
          decision_maker: string | null
          file_link: string | null
          file_name: string | null
          flow_oversight: string | null
          fund_request: string | null
          grant_name: string | null
          id: string
          last_pushed_at: string | null
          notes: string | null
          partner: string | null
          restriction: string | null
          sum_allocation_amount: number | null
          sync_status: string
          transfer_segment: string | null
          updated_at: string | null
        }
        Insert: {
          airtable_record_id?: string | null
          allocation_id?: string | null
          created_at?: string | null
          decision_amount?: number | null
          decision_date?: string | null
          decision_id?: string | null
          decision_id_proposed?: string | null
          decision_documents?: Json
          decision_maker?: string | null
          file_link?: string | null
          file_name?: string | null
          flow_oversight?: string | null
          fund_request?: string | null
          grant_name?: string | null
          id?: string
          last_pushed_at?: string | null
          notes?: string | null
          partner?: string | null
          restriction?: string | null
          sum_allocation_amount?: number | null
          sync_status?: string
          transfer_segment?: string | null
          updated_at?: string | null
        }
        Update: {
          airtable_record_id?: string | null
          allocation_id?: string | null
          created_at?: string | null
          decision_amount?: number | null
          decision_date?: string | null
          decision_id?: string | null
          decision_id_proposed?: string | null
          decision_documents?: Json
          decision_maker?: string | null
          file_link?: string | null
          file_name?: string | null
          flow_oversight?: string | null
          fund_request?: string | null
          grant_name?: string | null
          id?: string
          last_pushed_at?: string | null
          notes?: string | null
          partner?: string | null
          restriction?: string | null
          sum_allocation_amount?: number | null
          sync_status?: string
          transfer_segment?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      donor_forecasts: {
        Row: {
          amount: number | null
          cluster_id: string | null
          created_at: string
          created_by: string | null
          donor_id: string | null
          id: number
          intermediary: string | null
          localities: string | null
          month: string | null
          org_name: string | null
          org_type: string | null
          organization: string | null
          readable_code: string | null
          receiving_mag: string | null
          source: string | null
          state_id: string | null
          state_name: string | null
          status: string | null
          transfer_method: string | null
        }
        Insert: {
          amount?: number | null
          cluster_id?: string | null
          created_at?: string
          created_by?: string | null
          donor_id?: string | null
          id?: number
          intermediary?: string | null
          localities?: string | null
          month?: string | null
          org_name?: string | null
          org_type?: string | null
          organization?: string | null
          readable_code?: string | null
          receiving_mag?: string | null
          source?: string | null
          state_id?: string | null
          state_name?: string | null
          status?: string | null
          transfer_method?: string | null
        }
        Update: {
          amount?: number | null
          cluster_id?: string | null
          created_at?: string
          created_by?: string | null
          donor_id?: string | null
          id?: number
          intermediary?: string | null
          localities?: string | null
          month?: string | null
          org_name?: string | null
          org_type?: string | null
          organization?: string | null
          readable_code?: string | null
          receiving_mag?: string | null
          source?: string | null
          state_id?: string | null
          state_name?: string | null
          status?: string | null
          transfer_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_cluster"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "aid_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_state"
            columns: ["state_id"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["id"]
          },
        ]
      }
      donor_users: {
        Row: {
          created_at: string | null
          donor_id: string | null
          id: string
          login: string
          password_hash: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          donor_id?: string | null
          id?: string
          login: string
          password_hash: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          donor_id?: string | null
          id?: string
          login?: string
          password_hash?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "donor_users_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["id"]
          },
        ]
      }
      donors: {
        Row: {
          address: string | null
          code: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          org_type: string | null
          phone_number: string | null
          short_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          code?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          org_type?: string | null
          phone_number?: string | null
          short_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          org_type?: string | null
          phone_number?: string | null
          short_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      donors_grid_view: {
        Row: {
          created_at: string | null
          grants: string | null
          id: string
          name: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          grants?: string | null
          id?: string
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          grants?: string | null
          id?: string
          name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      emergency_rooms: {
        Row: {
          created_at: string | null
          err_code: string | null
          id: string
          is_wrr: string | null
          legacy_err_id: string | null
          location: string | null
          name: string
          name_ar: string | null
          state_reference: string | null
          status: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          err_code?: string | null
          id?: string
          is_wrr?: string | null
          legacy_err_id?: string | null
          location?: string | null
          name: string
          name_ar?: string | null
          state_reference?: string | null
          status?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          err_code?: string | null
          id?: string
          is_wrr?: string | null
          legacy_err_id?: string | null
          location?: string | null
          name?: string
          name_ar?: string | null
          state_reference?: string | null
          status?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emergency_rooms_state_reference_fkey"
            columns: ["state_reference"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["id"]
          },
        ]
      }
      err_expense: {
        Row: {
          activities_raw_import_id: string | null
          created_at: string
          expense_activity: string | null
          expense_amount: number | null
          expense_amount_sdg: number | null
          expense_description: string | null
          expense_id: number
          is_draft: boolean | null
          language: string | null
          original_text: Json | null
          payment_date: string | null
          payment_method: string | null
          project_id: string | null
          receipt_no: string | null
          seller: string | null
          summary_id: number | null
          uploaded_by: string | null
        }
        Insert: {
          activities_raw_import_id?: string | null
          created_at?: string
          expense_activity?: string | null
          expense_amount?: number | null
          expense_amount_sdg?: number | null
          expense_description?: string | null
          expense_id?: never
          is_draft?: boolean | null
          language?: string | null
          original_text?: Json | null
          payment_date?: string | null
          payment_method?: string | null
          project_id?: string | null
          receipt_no?: string | null
          seller?: string | null
          summary_id?: number | null
          uploaded_by?: string | null
        }
        Update: {
          activities_raw_import_id?: string | null
          created_at?: string
          expense_activity?: string | null
          expense_amount?: number | null
          expense_amount_sdg?: number | null
          expense_description?: string | null
          expense_id?: never
          is_draft?: boolean | null
          language?: string | null
          original_text?: Json | null
          payment_date?: string | null
          payment_method?: string | null
          project_id?: string | null
          receipt_no?: string | null
          seller?: string | null
          summary_id?: number | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_err_expense_activities_raw_import_id"
            columns: ["activities_raw_import_id"]
            isOneToOne: false
            referencedRelation: "activities_raw_import"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_err_expense_project_id"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "err_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_err_expense_summary_id"
            columns: ["summary_id"]
            isOneToOne: false
            referencedRelation: "err_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      err_expense_receipts: {
        Row: {
          expense_id: number
          file_key: string
          id: string
          receipt_no: string | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          expense_id: number
          file_key: string
          id?: string
          receipt_no?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          expense_id?: number
          file_key?: string
          id?: string
          receipt_no?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "err_expense_receipts_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "err_expense"
            referencedColumns: ["expense_id"]
          },
        ]
      }
      err_import_staging: {
        Row: {
          err_code: string | null
          id: number
          name: string | null
          name_ar: string | null
          state: string | null
          state_ar: string | null
          type: string | null
        }
        Insert: {
          err_code?: string | null
          id?: number
          name?: string | null
          name_ar?: string | null
          state?: string | null
          state_ar?: string | null
          type?: string | null
        }
        Update: {
          err_code?: string | null
          id?: number
          name?: string | null
          name_ar?: string | null
          state?: string | null
          state_ar?: string | null
          type?: string | null
        }
        Relationships: []
      }
      err_program_files: {
        Row: {
          file_name: string | null
          file_size: number | null
          file_type: string | null
          file_url: string | null
          id: string
          report_id: string | null
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          report_id?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          report_id?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "err_program_files_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "err_program_report"
            referencedColumns: ["id"]
          },
        ]
      }
      err_program_reach: {
        Row: {
          activity_goal: string | null
          activity_goal_en: string | null
          activity_name: string | null
          activity_name_en: string | null
          adjusted_counts: Json | null
          adjusted_note: string | null
          end_date: string | null
          female_count: number | null
          household_count: number | null
          id: string
          individual_count: number | null
          is_draft: boolean | null
          language: string | null
          location: string | null
          location_en: string | null
          male_count: number | null
          original_text: Json | null
          people_with_disabilities: number | null
          report_id: string | null
          start_date: string | null
          under18_female: number | null
          under18_male: number | null
        }
        Insert: {
          activity_goal?: string | null
          activity_goal_en?: string | null
          activity_name?: string | null
          activity_name_en?: string | null
          adjusted_counts?: Json | null
          adjusted_note?: string | null
          end_date?: string | null
          female_count?: number | null
          household_count?: number | null
          id?: string
          individual_count?: number | null
          is_draft?: boolean | null
          language?: string | null
          location?: string | null
          location_en?: string | null
          male_count?: number | null
          original_text?: Json | null
          people_with_disabilities?: number | null
          report_id?: string | null
          start_date?: string | null
          under18_female?: number | null
          under18_male?: number | null
        }
        Update: {
          activity_goal?: string | null
          activity_goal_en?: string | null
          activity_name?: string | null
          activity_name_en?: string | null
          adjusted_counts?: Json | null
          adjusted_note?: string | null
          end_date?: string | null
          female_count?: number | null
          household_count?: number | null
          id?: string
          individual_count?: number | null
          is_draft?: boolean | null
          language?: string | null
          location?: string | null
          location_en?: string | null
          male_count?: number | null
          original_text?: Json | null
          people_with_disabilities?: number | null
          report_id?: string | null
          start_date?: string | null
          under18_female?: number | null
          under18_male?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "err_program_reach_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "err_program_report"
            referencedColumns: ["id"]
          },
        ]
      }
      err_program_report: {
        Row: {
          created_at: string | null
          id: string
          is_draft: boolean | null
          language: string | null
          lessons_learned: string | null
          lessons_learned_en: string | null
          negative_results: string | null
          negative_results_en: string | null
          original_text: Json | null
          positive_changes: string | null
          positive_changes_en: string | null
          project_id: string | null
          report_date: string | null
          reporting_person: string | null
          suggestions: string | null
          suggestions_en: string | null
          unexpected_results: string | null
          unexpected_results_en: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_draft?: boolean | null
          language?: string | null
          lessons_learned?: string | null
          lessons_learned_en?: string | null
          negative_results?: string | null
          negative_results_en?: string | null
          original_text?: Json | null
          positive_changes?: string | null
          positive_changes_en?: string | null
          project_id?: string | null
          report_date?: string | null
          reporting_person?: string | null
          suggestions?: string | null
          suggestions_en?: string | null
          unexpected_results?: string | null
          unexpected_results_en?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_draft?: boolean | null
          language?: string | null
          lessons_learned?: string | null
          lessons_learned_en?: string | null
          negative_results?: string | null
          negative_results_en?: string | null
          original_text?: Json | null
          positive_changes?: string | null
          positive_changes_en?: string | null
          project_id?: string | null
          report_date?: string | null
          reporting_person?: string | null
          suggestions?: string | null
          suggestions_en?: string | null
          unexpected_results?: string | null
          unexpected_results_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "err_program_report_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "err_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      err_projects: {
        Row: {
          additional_support: string | null
          approval_file_key: string | null
          approval_uploaded_at: string | null
          approval_uploaded_by: string | null
          banking_details: string | null
          created_by: string | null
          current_feedback_id: string | null
          cycle_state_allocation_id: string | null
          date: string | null
          date_report_completed: string | null
          date_transfer: string | null
          donor_id: string | null
          emergency_room_id: string | null
          end_date: string | null
          err_id: string | null
          estimated_beneficiaries: number | null
          estimated_timeframe: string | null
          expenses: Json | null
          f4_status: string
          f5_status: string
          file_key: string | null
          finance_officer_name: string | null
          finance_officer_phone: string | null
          funding_cycle_id: string | null
          funding_status: string | null
          grant_call_id: string | null
          grant_call_state_allocation_id: string | null
          grant_grid_id: string | null
          grant_id: string | null
          grant_segment: string | null
          grant_serial: string | null
          grant_serial_id: string | null
          id: string
          intended_beneficiaries: string | null
          is_draft: boolean
          language: string | null
          last_modified: string | null
          locality: string | null
          mou_id: string | null
          ocr_edited_fields_count: number | null
          original_text: Json | null
          planned_activities: Json | null
          program_officer_name: string | null
          program_officer_phone: string | null
          project_name: string | null
          project_objectives: string | null
          reporting_officer_name: string | null
          reporting_officer_phone: string | null
          "Sector (Primary)": string | null
          "Sector (Secondary)": string | null
          source: string | null
          state: string | null
          status: string
          submitted_at: string | null
          temp_file_key: string | null
          version: number
          workplan_number: number | null
        }
        Insert: {
          additional_support?: string | null
          approval_file_key?: string | null
          approval_uploaded_at?: string | null
          approval_uploaded_by?: string | null
          banking_details?: string | null
          created_by?: string | null
          current_feedback_id?: string | null
          cycle_state_allocation_id?: string | null
          date?: string | null
          date_report_completed?: string | null
          date_transfer?: string | null
          donor_id?: string | null
          emergency_room_id?: string | null
          end_date?: string | null
          err_id?: string | null
          estimated_beneficiaries?: number | null
          estimated_timeframe?: string | null
          expenses?: Json | null
          f4_status?: string
          f5_status?: string
          file_key?: string | null
          finance_officer_name?: string | null
          finance_officer_phone?: string | null
          funding_cycle_id?: string | null
          funding_status?: string | null
          grant_call_id?: string | null
          grant_call_state_allocation_id?: string | null
          grant_grid_id?: string | null
          grant_id?: string | null
          grant_segment?: string | null
          grant_serial?: string | null
          grant_serial_id?: string | null
          id?: string
          intended_beneficiaries?: string | null
          is_draft?: boolean
          language?: string | null
          last_modified?: string | null
          locality?: string | null
          mou_id?: string | null
          ocr_edited_fields_count?: number | null
          original_text?: Json | null
          planned_activities?: Json | null
          program_officer_name?: string | null
          program_officer_phone?: string | null
          project_name?: string | null
          project_objectives?: string | null
          reporting_officer_name?: string | null
          reporting_officer_phone?: string | null
          "Sector (Primary)"?: string | null
          "Sector (Secondary)"?: string | null
          source?: string | null
          state?: string | null
          status?: string
          submitted_at?: string | null
          temp_file_key?: string | null
          version?: number
          workplan_number?: number | null
        }
        Update: {
          additional_support?: string | null
          approval_file_key?: string | null
          approval_uploaded_at?: string | null
          approval_uploaded_by?: string | null
          banking_details?: string | null
          created_by?: string | null
          current_feedback_id?: string | null
          cycle_state_allocation_id?: string | null
          date?: string | null
          date_report_completed?: string | null
          date_transfer?: string | null
          donor_id?: string | null
          emergency_room_id?: string | null
          end_date?: string | null
          err_id?: string | null
          estimated_beneficiaries?: number | null
          estimated_timeframe?: string | null
          expenses?: Json | null
          f4_status?: string
          f5_status?: string
          file_key?: string | null
          finance_officer_name?: string | null
          finance_officer_phone?: string | null
          funding_cycle_id?: string | null
          funding_status?: string | null
          grant_call_id?: string | null
          grant_call_state_allocation_id?: string | null
          grant_grid_id?: string | null
          grant_id?: string | null
          grant_segment?: string | null
          grant_serial?: string | null
          grant_serial_id?: string | null
          id?: string
          intended_beneficiaries?: string | null
          is_draft?: boolean
          language?: string | null
          last_modified?: string | null
          locality?: string | null
          mou_id?: string | null
          ocr_edited_fields_count?: number | null
          original_text?: Json | null
          planned_activities?: Json | null
          program_officer_name?: string | null
          program_officer_phone?: string | null
          project_name?: string | null
          project_objectives?: string | null
          reporting_officer_name?: string | null
          reporting_officer_phone?: string | null
          "Sector (Primary)"?: string | null
          "Sector (Secondary)"?: string | null
          source?: string | null
          state?: string | null
          status?: string
          submitted_at?: string | null
          temp_file_key?: string | null
          version?: number
          workplan_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "err_projects_allocation_id_fkey"
            columns: ["grant_call_state_allocation_id"]
            isOneToOne: false
            referencedRelation: "grant_call_state_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "err_projects_cycle_state_allocation_id_fkey"
            columns: ["cycle_state_allocation_id"]
            isOneToOne: false
            referencedRelation: "cycle_state_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "err_projects_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "err_projects_funding_cycle_id_fkey"
            columns: ["funding_cycle_id"]
            isOneToOne: false
            referencedRelation: "funding_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "err_projects_grant_call_id_fkey"
            columns: ["grant_call_id"]
            isOneToOne: false
            referencedRelation: "grant_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "err_projects_grant_segment_fkey"
            columns: ["grant_segment"]
            isOneToOne: false
            referencedRelation: "grant_segments"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "err_projects_mou_id_fkey"
            columns: ["mou_id"]
            isOneToOne: false
            referencedRelation: "mous"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_err_projects_current_feedback"
            columns: ["current_feedback_id"]
            isOneToOne: false
            referencedRelation: "project_feedback"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_err_projects_emergency_room"
            columns: ["emergency_room_id"]
            isOneToOne: false
            referencedRelation: "emergency_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_err_projects_grant_grid"
            columns: ["grant_grid_id"]
            isOneToOne: false
            referencedRelation: "grants_grid_view"
            referencedColumns: ["id"]
          },
        ]
      }
      err_summary: {
        Row: {
          activities_raw_import_id: string | null
          beneficiaries: string | null
          created_at: string
          err_id: string | null
          excess_expenses: string | null
          id: number
          is_draft: boolean | null
          language: string | null
          lessons: string | null
          original_text: Json | null
          project_id: string | null
          project_name: string | null
          project_objectives: string | null
          receipt_check: Json | null
          remainder: number | null
          report_date: string | null
          review_comment: string | null
          review_status: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          surplus_use: string | null
          total_expenses: number | null
          total_expenses_sdg: number | null
          total_grant: number | null
          total_other_sources: number | null
          training: string | null
        }
        Insert: {
          activities_raw_import_id?: string | null
          beneficiaries?: string | null
          created_at?: string
          err_id?: string | null
          excess_expenses?: string | null
          id?: number
          is_draft?: boolean | null
          language?: string | null
          lessons?: string | null
          original_text?: Json | null
          project_id?: string | null
          project_name?: string | null
          project_objectives?: string | null
          receipt_check?: Json | null
          remainder?: number | null
          report_date?: string | null
          review_comment?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          surplus_use?: string | null
          total_expenses?: number | null
          total_expenses_sdg?: number | null
          total_grant?: number | null
          total_other_sources?: number | null
          training?: string | null
        }
        Update: {
          activities_raw_import_id?: string | null
          beneficiaries?: string | null
          created_at?: string
          err_id?: string | null
          excess_expenses?: string | null
          id?: number
          is_draft?: boolean | null
          language?: string | null
          lessons?: string | null
          original_text?: Json | null
          project_id?: string | null
          project_name?: string | null
          project_objectives?: string | null
          receipt_check?: Json | null
          remainder?: number | null
          report_date?: string | null
          review_comment?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          surplus_use?: string | null
          total_expenses?: number | null
          total_expenses_sdg?: number | null
          total_grant?: number | null
          total_other_sources?: number | null
          training?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_err_summary_activities_raw_import_id"
            columns: ["activities_raw_import_id"]
            isOneToOne: false
            referencedRelation: "activities_raw_import"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_err_summary_project_id"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "err_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      err_summary_attachments: {
        Row: {
          file_key: string
          file_type: string | null
          id: string
          summary_id: number
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          file_key: string
          file_type?: string | null
          id?: string
          summary_id: number
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          file_key?: string
          file_type?: string | null
          id?: string
          summary_id?: number
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "err_summary_attachments_summary_id_fkey"
            columns: ["summary_id"]
            isOneToOne: false
            referencedRelation: "err_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          expense_name: string | null
          id: string
          language: string | null
        }
        Insert: {
          expense_name?: string | null
          id?: string
          language?: string | null
        }
        Update: {
          expense_name?: string | null
          id?: string
          language?: string | null
        }
        Relationships: []
      }
      fund_request: {
        Row: {
          date_submitted: string | null
          decision_id: Json | null
          file_link: string | null
          file_name: string | null
          partner_name: Json | null
          request_id: string | null
          requested_amount: number | null
          transfer_amount_rollup: number | null
          transfer_id: Json | null
        }
        Insert: {
          date_submitted?: string | null
          decision_id?: Json | null
          file_link?: string | null
          file_name?: string | null
          partner_name?: Json | null
          request_id?: string | null
          requested_amount?: number | null
          transfer_amount_rollup?: number | null
          transfer_id?: Json | null
        }
        Update: {
          date_submitted?: string | null
          decision_id?: Json | null
          file_link?: string | null
          file_name?: string | null
          partner_name?: Json | null
          request_id?: string | null
          requested_amount?: number | null
          transfer_amount_rollup?: number | null
          transfer_id?: Json | null
        }
        Relationships: []
      }
      fund_request_grid_view_2: {
        Row: {
          created_at: string | null
          date_submitted: string | null
          decision_id: string | null
          file_link: string | null
          file_name: string | null
          grant_name: string | null
          id: string
          partner_name: string | null
          requested_amount: number | null
          transfer_amount_rollup: number | null
          transfer_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          date_submitted?: string | null
          decision_id?: string | null
          file_link?: string | null
          file_name?: string | null
          grant_name?: string | null
          id?: string
          partner_name?: string | null
          requested_amount?: number | null
          transfer_amount_rollup?: number | null
          transfer_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          date_submitted?: string | null
          decision_id?: string | null
          file_link?: string | null
          file_name?: string | null
          grant_name?: string | null
          id?: string
          partner_name?: string | null
          requested_amount?: number | null
          transfer_amount_rollup?: number | null
          transfer_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      funding_cycles: {
        Row: {
          created_at: string | null
          created_by: string | null
          cycle_number: number
          end_date: string | null
          id: string
          name: string
          pool_amount: number
          start_date: string | null
          status: string
          tranche_count: number | null
          tranche_splits: Json | null
          type: string
          year: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          cycle_number: number
          end_date?: string | null
          id?: string
          name: string
          pool_amount?: number
          start_date?: string | null
          status?: string
          tranche_count?: number | null
          tranche_splits?: Json | null
          type?: string
          year: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          cycle_number?: number
          end_date?: string | null
          id?: string
          name?: string
          pool_amount?: number
          start_date?: string | null
          status?: string
          tranche_count?: number | null
          tranche_splits?: Json | null
          type?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "funding_cycles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      grant_call_state_allocations: {
        Row: {
          amount: number
          created_at: string
          decision_no: number
          grant_call_id: string
          id: string
          state_name: string
        }
        Insert: {
          amount: number
          created_at?: string
          decision_no?: number
          grant_call_id: string
          id?: string
          state_name: string
        }
        Update: {
          amount?: number
          created_at?: string
          decision_no?: number
          grant_call_id?: string
          id?: string
          state_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "grant_call_state_allocations_grant_call_id_fkey"
            columns: ["grant_call_id"]
            isOneToOne: false
            referencedRelation: "grant_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      grant_calls: {
        Row: {
          amount: number | null
          amount_disbursed: number | null
          amount_transferred: number | null
          created_at: string | null
          donor_id: string
          end_date: string | null
          id: string
          name: string
          series_id: string | null
          shortname: string | null
          start_date: string | null
          status: string | null
          transfer_fees: number | null
        }
        Insert: {
          amount?: number | null
          amount_disbursed?: number | null
          amount_transferred?: number | null
          created_at?: string | null
          donor_id: string
          end_date?: string | null
          id?: string
          name: string
          series_id?: string | null
          shortname?: string | null
          start_date?: string | null
          status?: string | null
          transfer_fees?: number | null
        }
        Update: {
          amount?: number | null
          amount_disbursed?: number | null
          amount_transferred?: number | null
          created_at?: string | null
          donor_id?: string
          end_date?: string | null
          id?: string
          name?: string
          series_id?: string | null
          shortname?: string | null
          start_date?: string | null
          status?: string | null
          transfer_fees?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "grant_calls_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_calls_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "grant_ids"
            referencedColumns: ["id"]
          },
        ]
      }
      grant_ids: {
        Row: {
          base_pattern: string
          created_at: string | null
          id: string
          last_sequence_number: number
          last_used: string | null
        }
        Insert: {
          base_pattern: string
          created_at?: string | null
          id?: string
          last_sequence_number?: number
          last_used?: string | null
        }
        Update: {
          base_pattern?: string
          created_at?: string | null
          id?: string
          last_sequence_number?: number
          last_used?: string | null
        }
        Relationships: []
      }
      grant_project_commitment_ledger: {
        Row: {
          created_at: string
          created_by: string | null
          cycle_state_allocation_id: string | null
          delta_amount: number
          funding_cycle_id: string | null
          grant_call_id: string
          grant_call_state_allocation_id: string
          grant_serial_id: string
          id: string
          reason: string
          workplan_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          cycle_state_allocation_id?: string | null
          delta_amount: number
          funding_cycle_id?: string | null
          grant_call_id: string
          grant_call_state_allocation_id: string
          grant_serial_id: string
          id?: string
          reason: string
          workplan_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          cycle_state_allocation_id?: string | null
          delta_amount?: number
          funding_cycle_id?: string | null
          grant_call_id?: string
          grant_call_state_allocation_id?: string
          grant_serial_id?: string
          id?: string
          reason?: string
          workplan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grant_project_commitment_ledger_allocation_fkey"
            columns: ["grant_call_state_allocation_id"]
            isOneToOne: false
            referencedRelation: "grant_call_state_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_project_commitment_ledger_cycle_state_allocation_id_fkey"
            columns: ["cycle_state_allocation_id"]
            isOneToOne: false
            referencedRelation: "cycle_state_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_project_commitment_ledger_funding_cycle_id_fkey"
            columns: ["funding_cycle_id"]
            isOneToOne: false
            referencedRelation: "funding_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_project_commitment_ledger_grant_call_fkey"
            columns: ["grant_call_id"]
            isOneToOne: false
            referencedRelation: "grant_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_project_commitment_ledger_serial_fkey"
            columns: ["grant_serial_id"]
            isOneToOne: false
            referencedRelation: "grant_serials"
            referencedColumns: ["grant_serial"]
          },
          {
            foreignKeyName: "grant_project_commitment_ledger_workplan_fkey"
            columns: ["workplan_id"]
            isOneToOne: false
            referencedRelation: "err_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      grant_segments: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          label_ar: string | null
          label_en: string
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          label_ar?: string | null
          label_en: string
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label_ar?: string | null
          label_en?: string
          sort_order?: number
        }
        Relationships: []
      }
      grant_serials: {
        Row: {
          created_at: string | null
          created_by: string | null
          cycle_state_allocation_id: string | null
          funding_cycle_id: string | null
          grant_call_id: string
          grant_serial: string
          state_name: string
          yymm: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          cycle_state_allocation_id?: string | null
          funding_cycle_id?: string | null
          grant_call_id: string
          grant_serial: string
          state_name: string
          yymm: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          cycle_state_allocation_id?: string | null
          funding_cycle_id?: string | null
          grant_call_id?: string
          grant_serial?: string
          state_name?: string
          yymm?: string
        }
        Relationships: [
          {
            foreignKeyName: "grant_serials_cycle_state_allocation_id_fkey"
            columns: ["cycle_state_allocation_id"]
            isOneToOne: false
            referencedRelation: "cycle_state_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_serials_funding_cycle_id_fkey"
            columns: ["funding_cycle_id"]
            isOneToOne: false
            referencedRelation: "funding_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_serials_grant_call_id_fkey"
            columns: ["grant_call_id"]
            isOneToOne: false
            referencedRelation: "grant_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      grant_workplan_seq: {
        Row: {
          funding_cycle_id: string | null
          grant_serial: string
          last_used: string | null
          last_workplan_number: number
        }
        Insert: {
          funding_cycle_id?: string | null
          grant_serial: string
          last_used?: string | null
          last_workplan_number?: number
        }
        Update: {
          funding_cycle_id?: string | null
          grant_serial?: string
          last_used?: string | null
          last_workplan_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "grant_workplan_seq_funding_cycle_id_fkey"
            columns: ["funding_cycle_id"]
            isOneToOne: false
            referencedRelation: "funding_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_workplan_seq_grant_serial_fkey"
            columns: ["grant_serial"]
            isOneToOne: true
            referencedRelation: "grant_serials"
            referencedColumns: ["grant_serial"]
          },
        ]
      }
      grants: {
        Row: {
          activities: Json | null
          allocations: Json | null
          donor_name: Json | null
          grant_end_date: string | null
          grant_id: string | null
          grant_start_date: string | null
          partner_name: Json | null
          project_id: string | null
          project_name: string | null
          status: string | null
          sum_activity_amount: number | null
          sum_transfer_fee_amount: number | null
          total_transferred_amount_usd: number | null
          transfer_segment: Json | null
        }
        Insert: {
          activities?: Json | null
          allocations?: Json | null
          donor_name?: Json | null
          grant_end_date?: string | null
          grant_id?: string | null
          grant_start_date?: string | null
          partner_name?: Json | null
          project_id?: string | null
          project_name?: string | null
          status?: string | null
          sum_activity_amount?: number | null
          sum_transfer_fee_amount?: number | null
          total_transferred_amount_usd?: number | null
          transfer_segment?: Json | null
        }
        Update: {
          activities?: Json | null
          allocations?: Json | null
          donor_name?: Json | null
          grant_end_date?: string | null
          grant_id?: string | null
          grant_start_date?: string | null
          partner_name?: Json | null
          project_id?: string | null
          project_name?: string | null
          status?: string | null
          sum_activity_amount?: number | null
          sum_transfer_fee_amount?: number | null
          total_transferred_amount_usd?: number | null
          transfer_segment?: Json | null
        }
        Relationships: []
      }
      grants_grid_view: {
        Row: {
          activities: string | null
          airtable_record_id: string | null
          allocations: string | null
          created_at: string | null
          donor_id: string | null
          donor_name: string | null
          grant_end_date: string | null
          grant_id: string | null
          grant_start_date: string | null
          id: string
          last_pushed_at: string | null
          max_workplan_sequence: number | null
          partner_name: string | null
          project_id: string | null
          project_name: string | null
          status: string | null
          sum_activity_amount: number | null
          sum_transfer_fee_amount: number | null
          sync_status: string
          total_transferred_amount_usd: number | null
          transfer_segment: string | null
          updated_at: string | null
        }
        Insert: {
          activities?: string | null
          airtable_record_id?: string | null
          allocations?: string | null
          created_at?: string | null
          donor_id?: string | null
          donor_name?: string | null
          grant_end_date?: string | null
          grant_id?: string | null
          grant_start_date?: string | null
          id?: string
          last_pushed_at?: string | null
          max_workplan_sequence?: number | null
          partner_name?: string | null
          project_id?: string | null
          project_name?: string | null
          status?: string | null
          sum_activity_amount?: number | null
          sum_transfer_fee_amount?: number | null
          sync_status?: string
          total_transferred_amount_usd?: number | null
          transfer_segment?: string | null
          updated_at?: string | null
        }
        Update: {
          activities?: string | null
          airtable_record_id?: string | null
          allocations?: string | null
          created_at?: string | null
          donor_id?: string | null
          donor_name?: string | null
          grant_end_date?: string | null
          grant_id?: string | null
          grant_start_date?: string | null
          id?: string
          last_pushed_at?: string | null
          max_workplan_sequence?: number | null
          partner_name?: string | null
          project_id?: string | null
          project_name?: string | null
          status?: string | null
          sum_activity_amount?: number | null
          sum_transfer_fee_amount?: number | null
          sync_status?: string
          total_transferred_amount_usd?: number | null
          transfer_segment?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grants_grid_view_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["id"]
          },
        ]
      }
      historical_financial_reports: {
        Row: {
          agriculture_support: string | null
          balance_usd: string | null
          budget_items: string | null
          capacity_building: string | null
          education: string | null
          food_security: number | null
          health: string | null
          id: number
          livelihoods: string | null
          local_contribution: string | null
          media: string | null
          mental_physical_health: string | null
          protection: string | null
          shelter_nfis: string | null
          state: string | null
          submit_pct: number | null
          support_logistics: number | null
          total_budget_received_usd: number | null
          total_errs_expenditure_usd: number | null
          volunteer_support: string | null
          wash: string | null
          women_children_needs: string | null
        }
        Insert: {
          agriculture_support?: string | null
          balance_usd?: string | null
          budget_items?: string | null
          capacity_building?: string | null
          education?: string | null
          food_security?: number | null
          health?: string | null
          id: number
          livelihoods?: string | null
          local_contribution?: string | null
          media?: string | null
          mental_physical_health?: string | null
          protection?: string | null
          shelter_nfis?: string | null
          state?: string | null
          submit_pct?: number | null
          support_logistics?: number | null
          total_budget_received_usd?: number | null
          total_errs_expenditure_usd?: number | null
          volunteer_support?: string | null
          wash?: string | null
          women_children_needs?: string | null
        }
        Update: {
          agriculture_support?: string | null
          balance_usd?: string | null
          budget_items?: string | null
          capacity_building?: string | null
          education?: string | null
          food_security?: number | null
          health?: string | null
          id?: number
          livelihoods?: string | null
          local_contribution?: string | null
          media?: string | null
          mental_physical_health?: string | null
          protection?: string | null
          shelter_nfis?: string | null
          state?: string | null
          submit_pct?: number | null
          support_logistics?: number | null
          total_budget_received_usd?: number | null
          total_errs_expenditure_usd?: number | null
          volunteer_support?: string | null
          wash?: string | null
          women_children_needs?: string | null
        }
        Relationships: []
      }
      lohub_historical_2024_25: {
        Row: {
          "# of Base ERR": number | null
          "Activity Duration": number | null
          Challenges: string | null
          Comments: string | null
          "Date report completed": string | null
          "Date Transfer": string | null
          "Description of ERRs activity": string | null
          "End Date (Activity)": string | null
          "ERR CODE": string | null
          "ERR Name": string | null
          F1: string | null
          "F1 Date of Submitted": string | null
          F4: string | null
          F5: string | null
          Family: string | null
          "Female <18": string | null
          "Female >18": string | null
          "Grant Segment": string | null
          id: string
          Individuals: string | null
          "Lessons learned": string | null
          "Male <18": string | null
          "Male >18": string | null
          "MOU Signed": string | null
          Overdue: string | null
          Partner: string | null
          "People with special needs": string | null
          "Project Donor": string | null
          "Project Status": string | null
          Rate: string | null
          Recommendations: string | null
          "Reporting Duration (End Date to Report)": number | null
          Responsible: string | null
          SDG: string | null
          "Sector (Primary)": string | null
          "Sector (Secondardy": string | null
          "Serial Number": string
          "Start Date (Activity)": string | null
          State: string | null
          "Target (Fam.)": string | null
          "Target (Ind.)": string | null
          Tracker: string | null
          USD: string | null
        }
        Insert: {
          "# of Base ERR"?: number | null
          "Activity Duration"?: number | null
          Challenges?: string | null
          Comments?: string | null
          "Date report completed"?: string | null
          "Date Transfer"?: string | null
          "Description of ERRs activity"?: string | null
          "End Date (Activity)"?: string | null
          "ERR CODE"?: string | null
          "ERR Name"?: string | null
          F1?: string | null
          "F1 Date of Submitted"?: string | null
          F4?: string | null
          F5?: string | null
          Family?: string | null
          "Female <18"?: string | null
          "Female >18"?: string | null
          "Grant Segment"?: string | null
          id?: string
          Individuals?: string | null
          "Lessons learned"?: string | null
          "Male <18"?: string | null
          "Male >18"?: string | null
          "MOU Signed"?: string | null
          Overdue?: string | null
          Partner?: string | null
          "People with special needs"?: string | null
          "Project Donor"?: string | null
          "Project Status"?: string | null
          Rate?: string | null
          Recommendations?: string | null
          "Reporting Duration (End Date to Report)"?: number | null
          Responsible?: string | null
          SDG?: string | null
          "Sector (Primary)"?: string | null
          "Sector (Secondardy"?: string | null
          "Serial Number": string
          "Start Date (Activity)"?: string | null
          State?: string | null
          "Target (Fam.)"?: string | null
          "Target (Ind.)"?: string | null
          Tracker?: string | null
          USD?: string | null
        }
        Update: {
          "# of Base ERR"?: number | null
          "Activity Duration"?: number | null
          Challenges?: string | null
          Comments?: string | null
          "Date report completed"?: string | null
          "Date Transfer"?: string | null
          "Description of ERRs activity"?: string | null
          "End Date (Activity)"?: string | null
          "ERR CODE"?: string | null
          "ERR Name"?: string | null
          F1?: string | null
          "F1 Date of Submitted"?: string | null
          F4?: string | null
          F5?: string | null
          Family?: string | null
          "Female <18"?: string | null
          "Female >18"?: string | null
          "Grant Segment"?: string | null
          id?: string
          Individuals?: string | null
          "Lessons learned"?: string | null
          "Male <18"?: string | null
          "Male >18"?: string | null
          "MOU Signed"?: string | null
          Overdue?: string | null
          Partner?: string | null
          "People with special needs"?: string | null
          "Project Donor"?: string | null
          "Project Status"?: string | null
          Rate?: string | null
          Recommendations?: string | null
          "Reporting Duration (End Date to Report)"?: number | null
          Responsible?: string | null
          SDG?: string | null
          "Sector (Primary)"?: string | null
          "Sector (Secondardy"?: string | null
          "Serial Number"?: string
          "Start Date (Activity)"?: string | null
          State?: string | null
          "Target (Fam.)"?: string | null
          "Target (Ind.)"?: string | null
          Tracker?: string | null
          USD?: string | null
        }
        Relationships: []
      }
      mous: {
        Row: {
          banking_details_override: string | null
          created_at: string
          created_by: string | null
          end_date: string | null
          err_contact_override: string | null
          err_name: string
          exchange_rate: number | null
          file_key: string | null
          id: string
          mou_code: string
          partner_contact_override: string | null
          partner_name: string
          payment_confirmation_file: string | null
          signatures: Json | null
          signed_mou_file_key: string | null
          start_date: string | null
          state: string | null
          total_amount: number
          transfer_date: string | null
        }
        Insert: {
          banking_details_override?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          err_contact_override?: string | null
          err_name: string
          exchange_rate?: number | null
          file_key?: string | null
          id?: string
          mou_code: string
          partner_contact_override?: string | null
          partner_name: string
          payment_confirmation_file?: string | null
          signatures?: Json | null
          signed_mou_file_key?: string | null
          start_date?: string | null
          state?: string | null
          total_amount?: number
          transfer_date?: string | null
        }
        Update: {
          banking_details_override?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          err_contact_override?: string | null
          err_name?: string
          exchange_rate?: number | null
          file_key?: string | null
          id?: string
          mou_code?: string
          partner_contact_override?: string | null
          partner_name?: string
          payment_confirmation_file?: string | null
          signatures?: Json | null
          signed_mou_file_key?: string | null
          start_date?: string | null
          state?: string | null
          total_amount?: number
          transfer_date?: string | null
        }
        Relationships: []
      }
      n8n_user_context: {
        Row: {
          current_project_id: string | null
          id: string
        }
        Insert: {
          current_project_id?: string | null
          id: string
        }
        Update: {
          current_project_id?: string | null
          id?: string
        }
        Relationships: []
      }
      distribution_decision_maker: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      flow_oversight_options: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      distribution_restriction_options: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      ops_partners: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      partners: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          partnership_type: string | null
          phone_number: string | null
          position: string | null
          short_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          partnership_type?: string | null
          phone_number?: string | null
          position?: string | null
          short_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          partnership_type?: string | null
          phone_number?: string | null
          position?: string | null
          short_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      partners_grid_view: {
        Row: {
          activities: string | null
          allocation_ids: string | null
          created_at: string | null
          decision_ids: string | null
          fund_request_ids: string | null
          grants_names: string | null
          id: string
          name: string | null
          transfer_ids: string | null
          updated_at: string | null
        }
        Insert: {
          activities?: string | null
          allocation_ids?: string | null
          created_at?: string | null
          decision_ids?: string | null
          fund_request_ids?: string | null
          grants_names?: string | null
          id?: string
          name?: string | null
          transfer_ids?: string | null
          updated_at?: string | null
        }
        Update: {
          activities?: string | null
          allocation_ids?: string | null
          created_at?: string | null
          decision_ids?: string | null
          fund_request_ids?: string | null
          grants_names?: string | null
          id?: string
          name?: string | null
          transfer_ids?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      planned_activities: {
        Row: {
          activity_name: string | null
          activity_name_ar: string | null
          id: string
          language: string | null
        }
        Insert: {
          activity_name?: string | null
          activity_name_ar?: string | null
          id?: string
          language?: string | null
        }
        Update: {
          activity_name?: string | null
          activity_name_ar?: string | null
          id?: string
          language?: string | null
        }
        Relationships: []
      }
      project_activities: {
        Row: {
          activity_id: string
          id: string
          project_id: string
          quantity: number
        }
        Insert: {
          activity_id: string
          id?: string
          project_id: string
          quantity: number
        }
        Update: {
          activity_id?: string
          id?: string
          project_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_planned_activity"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "planned_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_project"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "err_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_activity_expenses: {
        Row: {
          amount: number
          description: string | null
          expense_category_id: string
          id: string
          project_activity_id: string
          project_id: string
        }
        Insert: {
          amount: number
          description?: string | null
          expense_category_id: string
          id?: string
          project_activity_id: string
          project_id: string
        }
        Update: {
          amount?: number
          description?: string | null
          expense_category_id?: string
          id?: string
          project_activity_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_activity_project_match"
            columns: ["project_id", "project_activity_id"]
            isOneToOne: false
            referencedRelation: "project_activities"
            referencedColumns: ["project_id", "id"]
          },
          {
            foreignKeyName: "fk_expense_category"
            columns: ["expense_category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      project_donors: {
        Row: {
          contribution_amount: number | null
          contribution_date: string | null
          created_at: string
          donor_id: string
          id: string
          project_id: string
        }
        Insert: {
          contribution_amount?: number | null
          contribution_date?: string | null
          created_at?: string
          donor_id: string
          id?: string
          project_id: string
        }
        Update: {
          contribution_amount?: number | null
          contribution_date?: string | null
          created_at?: string
          donor_id?: string
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_project_donors_donor"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_project_donors_project"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "err_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_feedback: {
        Row: {
          addressed_at: string | null
          addressed_by: string | null
          created_at: string
          created_by: string
          feedback_status: string
          feedback_text: string
          id: string
          iteration_number: number
          project_id: string
        }
        Insert: {
          addressed_at?: string | null
          addressed_by?: string | null
          created_at?: string
          created_by: string
          feedback_status?: string
          feedback_text: string
          id?: string
          iteration_number: number
          project_id: string
        }
        Update: {
          addressed_at?: string | null
          addressed_by?: string | null
          created_at?: string
          created_by?: string
          feedback_status?: string
          feedback_text?: string
          id?: string
          iteration_number?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_project_feedback_addressed_by"
            columns: ["addressed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_project_feedback_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_project_feedback_project_id"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "err_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_feedback_fields: {
        Row: {
          created_at: string
          feedback_id: string
          feedback_text: string
          field_name: string
          id: string
        }
        Insert: {
          created_at?: string
          feedback_id: string
          feedback_text: string
          field_name: string
          id?: string
        }
        Update: {
          created_at?: string
          feedback_id?: string
          feedback_text?: string
          field_name?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_project_feedback_fields_feedback_id"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "project_feedback"
            referencedColumns: ["id"]
          },
        ]
      }
      project_grant_history: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          id: number
          new_grant_call_id: string | null
          old_grant_call_id: string | null
          project_id: string
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          id?: number
          new_grant_call_id?: string | null
          old_grant_call_id?: string | null
          project_id: string
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          id?: number
          new_grant_call_id?: string | null
          old_grant_call_id?: string | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_grant_history_new_grant_call_id_fkey"
            columns: ["new_grant_call_id"]
            isOneToOne: false
            referencedRelation: "grant_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_grant_history_old_grant_call_id_fkey"
            columns: ["old_grant_call_id"]
            isOneToOne: false
            referencedRelation: "grant_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_grant_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "err_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_partners: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          partner_id: string
          partnership_details: string | null
          project_id: string
          start_date: string | null
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          partner_id: string
          partnership_details?: string | null
          project_id: string
          start_date?: string | null
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          partner_id?: string
          partnership_details?: string | null
          project_id?: string
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_project_partners_partner"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_project_partners_project"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "err_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          created_at: string
          expense_id: number
          id: number
          image_url: string | null
        }
        Insert: {
          created_at?: string
          expense_id: number
          id?: number
          image_url?: string | null
        }
        Update: {
          created_at?: string
          expense_id?: number
          id?: number
          image_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_receipts_expense_id"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "err_expense"
            referencedColumns: ["expense_id"]
          },
        ]
      }
      sectors: {
        Row: {
          id: string
          sector_name_ar: string | null
          sector_name_en: string
        }
        Insert: {
          id?: string
          sector_name_ar?: string | null
          sector_name_en: string
        }
        Update: {
          id?: string
          sector_name_ar?: string | null
          sector_name_en?: string
        }
        Relationships: []
      }
      states: {
        Row: {
          id: string
          locality: string | null
          locality_ar: string | null
          state_name: string | null
          state_name_ar: string | null
          state_short: string | null
        }
        Insert: {
          id?: string
          locality?: string | null
          locality_ar?: string | null
          state_name?: string | null
          state_name_ar?: string | null
          state_short?: string | null
        }
        Update: {
          id?: string
          locality?: string | null
          locality_ar?: string | null
          state_name?: string | null
          state_name_ar?: string | null
          state_short?: string | null
        }
        Relationships: []
      }
      transfer_segment: {
        Row: {
          activity_amount: number | null
          auto: number | null
          comment: string | null
          decision_id: Json | null
          grant_id: Json | null
          partner: Json | null
          request_date_submitted: Json | null
          request_id: Json | null
          status: string | null
          transfer_amount: number | null
          transfer_fee_amount: number | null
          transfer_id: string | null
          transfer_received_date: string | null
        }
        Insert: {
          activity_amount?: number | null
          auto?: number | null
          comment?: string | null
          decision_id?: Json | null
          grant_id?: Json | null
          partner?: Json | null
          request_date_submitted?: Json | null
          request_id?: Json | null
          status?: string | null
          transfer_amount?: number | null
          transfer_fee_amount?: number | null
          transfer_id?: string | null
          transfer_received_date?: string | null
        }
        Update: {
          activity_amount?: number | null
          auto?: number | null
          comment?: string | null
          decision_id?: Json | null
          grant_id?: Json | null
          partner?: Json | null
          request_date_submitted?: Json | null
          request_id?: Json | null
          status?: string | null
          transfer_amount?: number | null
          transfer_fee_amount?: number | null
          transfer_id?: string | null
          transfer_received_date?: string | null
        }
        Relationships: []
      }
      transfer_segment_partner_grouping_1: {
        Row: {
          activity_amount: number | null
          created_at: string | null
          decision_id: string | null
          grant_id: string | null
          id: string
          request_date_submitted: string | null
          request_id: string | null
          status: string | null
          transfer_amount: number | null
          transfer_fee_amount: number | null
          transfer_id: string | null
          transfer_received_date: string | null
          updated_at: string | null
        }
        Insert: {
          activity_amount?: number | null
          created_at?: string | null
          decision_id?: string | null
          grant_id?: string | null
          id?: string
          request_date_submitted?: string | null
          request_id?: string | null
          status?: string | null
          transfer_amount?: number | null
          transfer_fee_amount?: number | null
          transfer_id?: string | null
          transfer_received_date?: string | null
          updated_at?: string | null
        }
        Update: {
          activity_amount?: number | null
          created_at?: string | null
          decision_id?: string | null
          grant_id?: string | null
          id?: string
          request_date_submitted?: string | null
          request_id?: string | null
          status?: string | null
          transfer_amount?: number | null
          transfer_fee_amount?: number | null
          transfer_id?: string | null
          transfer_received_date?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_permission_overrides: {
        Row: {
          add_functions: string[]
          remove_functions: string[]
          user_id: string
        }
        Insert: {
          add_functions?: string[]
          remove_functions?: string[]
          user_id: string
        }
        Update: {
          add_functions?: string[]
          remove_functions?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_user_id: string | null
          can_see_all_states: boolean | null
          created_at: string | null
          display_name: string | null
          err_id: string | null
          id: string
          pin_hash: string | null
          role: string | null
          status: string | null
          telegram_id: string | null
          updated_at: string | null
          visible_states: string[] | null
        }
        Insert: {
          auth_user_id?: string | null
          can_see_all_states?: boolean | null
          created_at?: string | null
          display_name?: string | null
          err_id?: string | null
          id?: string
          pin_hash?: string | null
          role?: string | null
          status?: string | null
          telegram_id?: string | null
          updated_at?: string | null
          visible_states?: string[] | null
        }
        Update: {
          auth_user_id?: string | null
          can_see_all_states?: boolean | null
          created_at?: string | null
          display_name?: string | null
          err_id?: string | null
          id?: string
          pin_hash?: string | null
          role?: string | null
          status?: string | null
          telegram_id?: string | null
          updated_at?: string | null
          visible_states?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "users_err_id_fkey"
            columns: ["err_id"]
            isOneToOne: false
            referencedRelation: "emergency_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      wrappers_fdw_stats: {
        Row: {
          bytes_in: number | null
          bytes_out: number | null
          create_times: number | null
          created_at: string
          fdw_name: string
          metadata: Json | null
          rows_in: number | null
          rows_out: number | null
          updated_at: string
        }
        Insert: {
          bytes_in?: number | null
          bytes_out?: number | null
          create_times?: number | null
          created_at?: string
          fdw_name: string
          metadata?: Json | null
          rows_in?: number | null
          rows_out?: number | null
          updated_at?: string
        }
        Update: {
          bytes_in?: number | null
          bytes_out?: number | null
          create_times?: number | null
          created_at?: string
          fdw_name?: string
          metadata?: Json | null
          rows_in?: number | null
          rows_out?: number | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      activities_merged_view2: {
        Row: {
          "# of Base ERR": string | null
          activities_raw_import_id: string | null
          "Activity Duration": string | null
          additional_support: string | null
          approval_file_key: string | null
          approval_uploaded_at: string | null
          approval_uploaded_by: string | null
          banking_details: string | null
          Challenges: string | null
          Comments: string | null
          created_at: string | null
          created_by: string | null
          current_feedback_id: string | null
          cycle_state_allocation_id: string | null
          date: string | null
          "Date Report Completed": string | null
          "Date Transfer": string | null
          "Description of ERRs activity": string | null
          donor_id: string | null
          emergency_room_id: string | null
          "End Date (Activity)": string | null
          "ERR CODE": string | null
          "ERR Name": string | null
          err_id: string | null
          estimated_beneficiaries: number | null
          estimated_timeframe: string | null
          expenses: Json | null
          F1: string | null
          "F1 Date of Submitted": string | null
          F4: string | null
          F5: string | null
          Family: number | null
          "Female <18": number | null
          "Female >18": number | null
          file_key: string | null
          finance_officer_name: string | null
          finance_officer_phone: string | null
          funding_cycle_id: string | null
          funding_status: string | null
          "Grant Segment": string | null
          grant_call_id: string | null
          grant_call_state_allocation_id: string | null
          grant_grid_id: string | null
          grant_id: string | null
          grant_segment_project: string | null
          grant_serial: string | null
          grant_serial_id: string | null
          id: string | null
          Individuals: number | null
          intended_beneficiaries: string | null
          is_draft: boolean | null
          language: string | null
          last_modified: string | null
          "Lessons learned": string | null
          locality: string | null
          "Male <18": number | null
          "Male >18": number | null
          "MOU Signed": string | null
          mou_id: string | null
          original_text: Json | null
          Overdue: string | null
          Partner: string | null
          "People with special needs": number | null
          planned_activities: Json | null
          program_officer_name: string | null
          program_officer_phone: string | null
          "Project Donor": string | null
          "Project Status": string | null
          project_id: string | null
          project_name: string | null
          project_objectives: string | null
          Rate: number | null
          Recommendations: string | null
          "Reporting Duration (End Date to Report)": string | null
          reporting_officer_name: string | null
          reporting_officer_phone: string | null
          Responsible: string | null
          SDG: number | null
          "Sector (Primary)": string | null
          "Sector (Secondardy": string | null
          sector_primary_project: string | null
          sector_secondary_project: string | null
          "Serial Number": string | null
          source: string | null
          "Start Date (Activity)": string | null
          State: string | null
          state_project: string | null
          status: string | null
          submitted_at: string | null
          "Target (Fam.)": number | null
          "Target (Ind.)": number | null
          temp_file_key: string | null
          Tracker: number | null
          updated_at: string | null
          USD: number | null
          version: number | null
          Volunteers: number | null
          workplan_number: number | null
        }
        Relationships: []
      }
      projects_all_activities_view: {
        Row: {
          activity_duration: string | null
          challenges: string | null
          comments: string | null
          date_report_completed: string | null
          date_transfer: string | null
          description: string | null
          end_date_activity: string | null
          err_code: string | null
          err_name: string | null
          f1: string | null
          f1_date_submitted: string | null
          f4: string | null
          f5: string | null
          family: number | null
          female_over_18: number | null
          female_under_18: number | null
          grant_segment: string | null
          individuals: number | null
          lessons_learned: string | null
          male_over_18: number | null
          male_under_18: number | null
          mou_signed: string | null
          num_base_err: number | null
          overdue: number | null
          partner: string | null
          people_special_needs: number | null
          project_donor: string | null
          project_status: string | null
          rate: number | null
          recommendations: string | null
          reporting_duration: number | null
          responsible: string | null
          sdg: number | null
          sector_primary: string | null
          sector_secondary: string | null
          serial_number: string | null
          start_date_activity: string | null
          state: string | null
          target_families: number | null
          target_individuals: number | null
          tracker: number | null
          usd: number | null
          volunteers: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      airtable_fdw_handler: { Args: never; Returns: unknown }
      airtable_fdw_meta: {
        Args: never
        Returns: {
          author: string
          name: string
          version: string
          website: string
        }[]
      }
      airtable_fdw_validator: {
        Args: { catalog: unknown; options: string[] }
        Returns: undefined
      }
      auth0_fdw_handler: { Args: never; Returns: unknown }
      auth0_fdw_meta: {
        Args: never
        Returns: {
          author: string
          name: string
          version: string
          website: string
        }[]
      }
      auth0_fdw_validator: {
        Args: { catalog: unknown; options: string[] }
        Returns: undefined
      }
      big_query_fdw_handler: { Args: never; Returns: unknown }
      big_query_fdw_meta: {
        Args: never
        Returns: {
          author: string
          name: string
          version: string
          website: string
        }[]
      }
      big_query_fdw_validator: {
        Args: { catalog: unknown; options: string[] }
        Returns: undefined
      }
      click_house_fdw_handler: { Args: never; Returns: unknown }
      click_house_fdw_meta: {
        Args: never
        Returns: {
          author: string
          name: string
          version: string
          website: string
        }[]
      }
      click_house_fdw_validator: {
        Args: { catalog: unknown; options: string[] }
        Returns: undefined
      }
      cognito_fdw_handler: { Args: never; Returns: unknown }
      cognito_fdw_meta: {
        Args: never
        Returns: {
          author: string
          name: string
          version: string
          website: string
        }[]
      }
      cognito_fdw_validator: {
        Args: { catalog: unknown; options: string[] }
        Returns: undefined
      }
      delete_donor_forecast: {
        Args: { p_donor_code: string; p_id: number }
        Returns: Json
      }
      execute_sql: { Args: { sql: string }; Returns: undefined }
      firebase_fdw_handler: { Args: never; Returns: unknown }
      firebase_fdw_meta: {
        Args: never
        Returns: {
          author: string
          name: string
          version: string
          website: string
        }[]
      }
      firebase_fdw_validator: {
        Args: { catalog: unknown; options: string[] }
        Returns: undefined
      }
      get_donor_forecasts: { Args: { p_donor_code: string }; Returns: Json }
      get_forecast_summary: { Args: { p_chart_type?: string }; Returns: Json }
      get_last_upload_timestamp: {
        Args: { p_donor_code: string }
        Returns: {
          created_at: string
        }[]
      }
      hello_world_fdw_handler: { Args: never; Returns: unknown }
      hello_world_fdw_meta: {
        Args: never
        Returns: {
          author: string
          name: string
          version: string
          website: string
        }[]
      }
      hello_world_fdw_validator: {
        Args: { catalog: unknown; options: string[] }
        Returns: undefined
      }
      insert_donor_forecast: {
        Args: { p_donor_code: string; p_forecasts: Json }
        Returns: Json
      }
      logflare_fdw_handler: { Args: never; Returns: unknown }
      logflare_fdw_meta: {
        Args: never
        Returns: {
          author: string
          name: string
          version: string
          website: string
        }[]
      }
      logflare_fdw_validator: {
        Args: { catalog: unknown; options: string[] }
        Returns: undefined
      }
      mssql_fdw_handler: { Args: never; Returns: unknown }
      mssql_fdw_meta: {
        Args: never
        Returns: {
          author: string
          name: string
          version: string
          website: string
        }[]
      }
      mssql_fdw_validator: {
        Args: { catalog: unknown; options: string[] }
        Returns: undefined
      }
      redis_fdw_handler: { Args: never; Returns: unknown }
      redis_fdw_meta: {
        Args: never
        Returns: {
          author: string
          name: string
          version: string
          website: string
        }[]
      }
      redis_fdw_validator: {
        Args: { catalog: unknown; options: string[] }
        Returns: undefined
      }
      refresh_activities_merged: { Args: never; Returns: undefined }
      s3_fdw_handler: { Args: never; Returns: unknown }
      s3_fdw_meta: {
        Args: never
        Returns: {
          author: string
          name: string
          version: string
          website: string
        }[]
      }
      s3_fdw_validator: {
        Args: { catalog: unknown; options: string[] }
        Returns: undefined
      }
      stripe_fdw_handler: { Args: never; Returns: unknown }
      stripe_fdw_meta: {
        Args: never
        Returns: {
          author: string
          name: string
          version: string
          website: string
        }[]
      }
      stripe_fdw_validator: {
        Args: { catalog: unknown; options: string[] }
        Returns: undefined
      }
      update_donor_forecast: {
        Args: {
          p_amount: number
          p_donor_code: string
          p_id: number
          p_localities: string
          p_status: string
        }
        Returns: Json
      }
      wasm_fdw_handler: { Args: never; Returns: unknown }
      wasm_fdw_meta: {
        Args: never
        Returns: {
          author: string
          name: string
          version: string
          website: string
        }[]
      }
      wasm_fdw_validator: {
        Args: { catalog: unknown; options: string[] }
        Returns: undefined
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
