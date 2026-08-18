// Hand-written to match supabase/migrations/0001_init.sql.
// Regenerate with `supabase gen types typescript` once the project is
// linked to a Supabase project, and this file can be replaced.

export type TicketStatus =
  | "new"
  | "analyzing"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "completed";

export type TransactionStatus = "succeeded" | "refunded";

export type Plan = "starter" | "pro" | "business";

export interface Database {
  public: {
    Tables: {
      mock_users: {
        Row: {
          id: string;
          name: string;
          email: string;
          plan: Plan;
          signup_date: string;
          last_active_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["mock_users"]["Row"]> & {
          name: string;
          email: string;
          plan: Plan;
          signup_date: string;
        };
        Update: Partial<Database["public"]["Tables"]["mock_users"]["Row"]>;
      };
      mock_transactions: {
        Row: {
          id: string;
          user_id: string;
          amount: number;
          currency: string;
          occurred_at: string;
          status: TransactionStatus;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["mock_transactions"]["Row"]> & {
          user_id: string;
          amount: number;
          occurred_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["mock_transactions"]["Row"]>;
      };
      tickets: {
        Row: {
          id: string;
          user_id: string | null;
          customer_message: string;
          status: TicketStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["tickets"]["Row"]> & {
          customer_message: string;
        };
        Update: Partial<Database["public"]["Tables"]["tickets"]["Row"]>;
      };
      ticket_actions: {
        Row: {
          id: string;
          ticket_id: string;
          action_type: string;
          payload: Record<string, unknown>;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ticket_actions"]["Row"]> & {
          ticket_id: string;
          action_type: string;
        };
        Update: Partial<Database["public"]["Tables"]["ticket_actions"]["Row"]>;
      };
    };
  };
}
