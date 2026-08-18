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

type Table<Row, InsertExtra extends keyof Row> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, InsertExtra>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      mock_users: Table<
        {
          id: string;
          name: string;
          email: string;
          plan: Plan;
          signup_date: string;
          last_active_at: string | null;
          created_at: string;
        },
        "name" | "email" | "plan" | "signup_date"
      >;
      mock_transactions: Table<
        {
          id: string;
          user_id: string;
          amount: number;
          currency: string;
          occurred_at: string;
          status: TransactionStatus;
          created_at: string;
        },
        "user_id" | "amount" | "occurred_at"
      >;
      tickets: Table<
        {
          id: string;
          user_id: string | null;
          customer_message: string;
          status: TicketStatus;
          created_at: string;
          updated_at: string;
        },
        "customer_message"
      >;
      ticket_actions: Table<
        {
          id: string;
          ticket_id: string;
          action_type: string;
          payload: Record<string, unknown>;
          created_at: string;
        },
        "ticket_id" | "action_type"
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
