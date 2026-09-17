export interface Party {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  status: "active" | "inactive";
  opening_balance: number;
  created_at: string;
}

export interface Product {
  id: number;
  name: string;
  unit_price: number;
  company_rate: number | null;
  deleted_at: string | null; // archived: hidden from lists, kept for old orders
  created_at: string;
}

export interface Order {
  id: number;
  order_number: string;
  party_id: number;
  order_date: string;
  status: "progress" | "completed";
  advance_payment: number;
  created_at: string;
  // Joined
  party?: Party;
  order_items?: OrderItem[];
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  created_at: string;
  // Joined
  product?: Product;
}

export interface Payment {
  id: number;
  party_id: number;
  order_id: number | null;
  amount: number;
  payment_date: string;
  created_at: string;
  // Joined
  party?: Party;
  order?: Order | null;
}

export type CompanyLedgerDay = {
  date: string;
  orders: { id: number; order_number: string; party_name: string }[];
  bill: number;
  paid: number;
  missing_rates: number; 
};

// For ledger history entries
export type LedgerEntry = {
  date: string;
  type: "ORDER" | "PAYMENT";
  description: string;
  amount: number; 
  balance_after: number;
  link_id: number;
};

// For dashboard activity feed
export type ActivityEntry = {
  type: "ORDER" | "PAYMENT" | "PARTY";
  record: string;
  details: string;
  date: string;
  href: string;
  party_id: number;
};
