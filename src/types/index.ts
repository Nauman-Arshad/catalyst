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
  deleted_at: string | null; 
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


export interface ProductReturn {
  id: number;
  order_id: number;
  return_date: string;
  total_amount: number; 
  company_amount: number; 
  refund_amount: number; 
  payment_id: number | null;
  note: string | null;
  created_by: string | null; // Clerk user id
  created_by_name: string | null;
  created_at: string;
  // Joined
  items?: ProductReturnItem[];
}

export interface ProductReturnItem {
  id: number;
  return_id: number;
  order_item_id: number | null; 
  product_id: number;
  quantity: number;
  unit_price: number;
  company_rate: number | null;
  created_at: string;
  // Joined
  product_name?: string;
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


export type CompanyPayment = {
  id: number;
  payment_date: string;
  amount: number;
  payment_method: PaymentMethod;
  created_at: string;
};

export type CompanyLedgerDay = {
  date: string;
 
  orders: {
    id: number;
    order_number: string;
    party_name: string;
    party_id: number;
    total: number;
    paid: number; 
    bill: number; 
    credit: number; 
    methods: PaymentMethod[];
  }[];
  bill: number; 
  paid: number; 
  missing_rates: number;
};


export type LedgerEntry = {
  date: string;
  type: "ORDER" | "PAYMENT";
  description: string;
  amount: number;
  balance_after: number;
  link_id: number;
  method?: PaymentMethod; // payments only
};


export type ActivityEntry = {
  type: "ORDER" | "PAYMENT" | "PARTY";
  record: string;
  details: string;
  date: string;
  href: string;
  party_id: number;
};
