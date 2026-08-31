// Generado por `pnpm db:types`. NO editar a mano.
// Regenerar despues de cada migracion y commitear (docs/ENGINEERING.md seccion 6).

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      games: {
        Row: {
          id: number
          chesscom_uuid: string
          url: string
          end_time: string
          time_class: string
          time_control: string
          base_seconds: number
          increment_secs: number
          rules: string
          my_color: Database["public"]["Enums"]["game_color"]
          my_rating: number
          opp_rating: number
          opp_username: string
          result: Database["public"]["Enums"]["game_result"]
          score: number
          termination: string
          my_accuracy: number | null
          opening_id: string | null
          opening_eco_cc: string | null
          opening_url_cc: string | null
          ply_count: number
          pgn: string
          session_id: number | null
          game_in_session: number | null
          prev_result: Database["public"]["Enums"]["game_result"] | null
          analysis_state: Database["public"]["Enums"]["analysis_state"]
          claimed_at: string | null
          analyzed_at: string | null
          engine_id: string | null
          divergence_ply: number | null
          acpl: number | null
          blunders: number | null
          mistakes: number | null
          inaccuracies: number | null
          created_at: string
        }
        Insert: {
          id?: number
          chesscom_uuid: string
          url: string
          end_time: string
          time_class: string
          time_control: string
          base_seconds: number
          increment_secs?: number
          rules?: string
          my_color: Database["public"]["Enums"]["game_color"]
          my_rating: number
          opp_rating: number
          opp_username: string
          result: Database["public"]["Enums"]["game_result"]
          score: number
          termination: string
          my_accuracy?: number | null
          opening_id?: string | null
          opening_eco_cc?: string | null
          opening_url_cc?: string | null
          ply_count: number
          pgn: string
          session_id?: number | null
          game_in_session?: number | null
          prev_result?: Database["public"]["Enums"]["game_result"] | null
          analysis_state?: Database["public"]["Enums"]["analysis_state"]
          claimed_at?: string | null
          analyzed_at?: string | null
          engine_id?: string | null
          divergence_ply?: number | null
          acpl?: number | null
          blunders?: number | null
          mistakes?: number | null
          inaccuracies?: number | null
          created_at?: string
        }
        Update: {
          id?: number
          chesscom_uuid?: string
          url?: string
          end_time?: string
          time_class?: string
          time_control?: string
          base_seconds?: number
          increment_secs?: number
          rules?: string
          my_color?: Database["public"]["Enums"]["game_color"]
          my_rating?: number
          opp_rating?: number
          opp_username?: string
          result?: Database["public"]["Enums"]["game_result"]
          score?: number
          termination?: string
          my_accuracy?: number | null
          opening_id?: string | null
          opening_eco_cc?: string | null
          opening_url_cc?: string | null
          ply_count?: number
          pgn?: string
          session_id?: number | null
          game_in_session?: number | null
          prev_result?: Database["public"]["Enums"]["game_result"] | null
          analysis_state?: Database["public"]["Enums"]["analysis_state"]
          claimed_at?: string | null
          analyzed_at?: string | null
          engine_id?: string | null
          divergence_ply?: number | null
          acpl?: number | null
          blunders?: number | null
          mistakes?: number | null
          inaccuracies?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "games_opening_id_fkey"
            columns: ["opening_id"]
            isOneToOne: false
            referencedRelation: "openings"
            referencedColumns: ["id"]
          }
        ]
      }
      job_runs: {
        Row: {
          id: number
          kind: Database["public"]["Enums"]["job_kind"]
          status: Database["public"]["Enums"]["job_status"]
          environment: string
          trigger: string
          started_at: string
          finished_at: string | null
          duration_ms: number | null
          processed: number
          failed: number
          skipped: number
          remaining: number | null
          engine_id: string | null
          error: string | null
          detail: Json | null
        }
        Insert: {
          id?: number
          kind: Database["public"]["Enums"]["job_kind"]
          status?: Database["public"]["Enums"]["job_status"]
          environment: string
          trigger: string
          started_at?: string
          finished_at?: string | null
          duration_ms?: number | null
          processed?: number
          failed?: number
          skipped?: number
          remaining?: number | null
          engine_id?: string | null
          error?: string | null
          detail?: Json | null
        }
        Update: {
          id?: number
          kind?: Database["public"]["Enums"]["job_kind"]
          status?: Database["public"]["Enums"]["job_status"]
          environment?: string
          trigger?: string
          started_at?: string
          finished_at?: string | null
          duration_ms?: number | null
          processed?: number
          failed?: number
          skipped?: number
          remaining?: number | null
          engine_id?: string | null
          error?: string | null
          detail?: Json | null
        }
        Relationships: []
      }
      moves: {
        Row: {
          game_id: number
          ply: number
          is_mine: boolean
          san: string
          uci: string
          phase: number
          clock_ms: number | null
          move_time_ms: number | null
          eval_cp: number | null
          mate_in: number | null
          best_uci: string | null
          cp_loss: number | null
          win_pct_loss: number | null
          classification: number | null
          is_book: boolean
          is_decided: boolean
        }
        Insert: {
          game_id: number
          ply: number
          is_mine: boolean
          san: string
          uci: string
          phase: number
          clock_ms?: number | null
          move_time_ms?: number | null
          eval_cp?: number | null
          mate_in?: number | null
          best_uci?: string | null
          cp_loss?: number | null
          win_pct_loss?: number | null
          classification?: number | null
          is_book?: boolean
          is_decided?: boolean
        }
        Update: {
          game_id?: number
          ply?: number
          is_mine?: boolean
          san?: string
          uci?: string
          phase?: number
          clock_ms?: number | null
          move_time_ms?: number | null
          eval_cp?: number | null
          mate_in?: number | null
          best_uci?: string | null
          cp_loss?: number | null
          win_pct_loss?: number | null
          classification?: number | null
          is_book?: boolean
          is_decided?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "moves_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "games"
            referencedColumns: ["id"]
          }
        ]
      }
      openings: {
        Row: {
          id: string
          eco: string
          name: string
          pgn: string
          epd: string
          ply_count: number
        }
        Insert: {
          id: string
          eco: string
          name: string
          pgn: string
          epd: string
          ply_count: number
        }
        Update: {
          id?: string
          eco?: string
          name?: string
          pgn?: string
          epd?: string
          ply_count?: number
        }
        Relationships: []
      }
      puzzle_attempts: {
        Row: {
          id: number
          puzzle_id: number
          correct: boolean
          ms_taken: number | null
          attempted_at: string
        }
        Insert: {
          id?: number
          puzzle_id: number
          correct: boolean
          ms_taken?: number | null
          attempted_at?: string
        }
        Update: {
          id?: number
          puzzle_id?: number
          correct?: boolean
          ms_taken?: number | null
          attempted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "puzzle_attempts_puzzle_id_fkey"
            columns: ["puzzle_id"]
            isOneToOne: false
            referencedRelation: "puzzles"
            referencedColumns: ["id"]
          }
        ]
      }
      puzzles: {
        Row: {
          id: number
          game_id: number
          ply: number
          fen: string
          played_uci: string
          best_uci: string
          cp_loss: number
          win_pct_loss: number
          is_unique: boolean
          theme: string | null
          due_at: string
          interval_days: number
          ease: number
          lapses: number
        }
        Insert: {
          id?: number
          game_id: number
          ply: number
          fen: string
          played_uci: string
          best_uci: string
          cp_loss: number
          win_pct_loss: number
          is_unique: boolean
          theme?: string | null
          due_at?: string
          interval_days?: number
          ease?: number
          lapses?: number
        }
        Update: {
          id?: number
          game_id?: number
          ply?: number
          fen?: string
          played_uci?: string
          best_uci?: string
          cp_loss?: number
          win_pct_loss?: number
          is_unique?: boolean
          theme?: string | null
          due_at?: string
          interval_days?: number
          ease?: number
          lapses?: number
        }
        Relationships: [
          {
            foreignKeyName: "puzzles_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "games"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      v_after_result: {
        Row: {
          time_class: string | null
          prev_result: Database["public"]["Enums"]["game_result"] | null
          n: number | null
          score_pct: number | null
          score_pct_lower: number | null
        }
        Relationships: []
      }
      v_analysis_coverage: {
        Row: {
          time_class: string | null
          n_games: number | null
          n_analyzed: number | null
          n_pending: number | null
          n_failed: number | null
        }
        Relationships: []
      }
      v_by_hour: {
        Row: {
          time_class: string | null
          hour_local: number | null
          n: number | null
          score_pct: number | null
          score_pct_lower: number | null
          acpl: number | null
        }
        Relationships: []
      }
      v_by_session_index: {
        Row: {
          time_class: string | null
          game_index_capped: number | null
          n: number | null
          score_pct: number | null
          score_pct_lower: number | null
        }
        Relationships: []
      }
      v_data_quality: {
        Row: {
          check_name: string | null
          offenders: number | null
          ok: boolean | null
          descripcion: string | null
        }
        Relationships: []
      }
      v_errors_by_move_time: {
        Row: {
          time_class: string | null
          time_bucket: string | null
          n_moves: number | null
          errors: number | null
          error_rate: number | null
          avg_cp_loss: number | null
        }
        Relationships: []
      }
      v_errors_by_phase: {
        Row: {
          time_class: string | null
          phase: number | null
          n_moves: number | null
          blunders: number | null
          mistakes: number | null
          inaccuracies: number | null
          avg_cp_loss: number | null
        }
        Relationships: []
      }
      v_games_by_month: {
        Row: {
          month_local: string | null
          n_local: number | null
          n_chess: number | null
          n_skipped: number | null
          first_game: string | null
          last_game: string | null
        }
        Relationships: []
      }
      v_health_jobs: {
        Row: {
          kind: Database["public"]["Enums"]["job_kind"] | null
          last_success_at: string | null
          hours_since_success: number | null
          failures_7d: number | null
          stuck_runs: number | null
        }
        Relationships: []
      }
      v_health_summary: {
        Row: {
          checks_failing: number | null
          checks_total: number | null
          ingest_hours_old: number | null
          n_games: number | null
          n_analyzed: number | null
          n_pending: number | null
        }
        Relationships: []
      }
      v_monthly_activity: {
        Row: {
          month_local: string | null
          time_class: string | null
          n_games: number | null
          score_pct: number | null
          rating_at_month_end: number | null
        }
        Relationships: []
      }
      v_opening_performance: {
        Row: {
          opening_id: string | null
          opening_name: string | null
          eco: string | null
          my_color: Database["public"]["Enums"]["game_color"] | null
          time_class: string | null
          n: number | null
          score_pct: number | null
          score_pct_lower: number | null
          n_diverged: number | null
          median_divergence_ply: number | null
          acpl: number | null
          n_analyzed: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      recompute_session_features: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      wilson_lower: {
        Args: { [key: string]: never }
        Returns: unknown
      }
      win_pct: {
        Args: { [key: string]: never }
        Returns: unknown
      }
    }
    Enums: {
      analysis_state: "pending" | "claimed" | "done" | "failed" | "skipped"
      game_color: "white" | "black"
      game_result: "win" | "loss" | "draw"
      job_kind: "ingest" | "extract_moves" | "analyze" | "puzzles" | "backup"
      job_status: "running" | "success" | "failed"
    }
    CompositeTypes: Record<PropertyKey, never>
  }
}

type PublicSchema = Database['public'];

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update'];
export type Views<T extends keyof PublicSchema['Views']> = PublicSchema['Views'][T]['Row'];
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T];
