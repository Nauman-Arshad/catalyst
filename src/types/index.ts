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

export type PaymentMethod = "cash" | "bank";

export interface Payment {
  id: number;
  party_id: number;
  order_id: number | null;
  amount: number;
  payment_date: string;
  payment_method: PaymentMethod;
  created_at: string;
  // Joined
  party?: Party;
  order?: Order | null;
}

// Money paid straight to the supplier company, ahead of any bill. It settles
// no day, so it leaves every day's bill, paid and pending untouched and is
// carried as a credit to adjust against future purchases.
export type CompanyPayment = {
  id: number;
  payment_date: string;
  amount: number;
  payment_method: PaymentMethod;
  created_at: string;
};

export type CompanyLedgerDay = {
  date: string;
  // Per-order figures so the ledger can show which buyer of the day has
  // settled up and who still owes.
  orders: {
    id: number;
    order_number: string;
    party_name: string;
    party_id: number;
    total: number; // sale total (quantity x unit_price)
    paid: number; // money received, incl. the party's unlinked payments
    bill: number; // this order's company bill (quantity x company_rate)
    credit: number; // what settles the company bill; surplus included
    // Distinct methods of the payments linked to this order. Money allocated
    // from the party's unlinked pool has no single method, so it is not here —
    // `paid` can exceed what these account for.
    methods: PaymentMethod[];
  }[];
  bill: number; // the day's company bill
  paid: number; // sum of the day's credits — never a hand-typed figure;
  // may exceed `bill`, which is an advance with the company
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
  method?: PaymentMethod; // payments only
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
