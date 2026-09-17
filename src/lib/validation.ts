import { z } from "zod";

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

export const partySchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: optionalString,
  address: optionalString,
  opening_balance: z.coerce.number().default(0),
  status: z.enum(["active", "inactive"]).default("active"),
});
export type PartyInput = z.infer<typeof partySchema>;
export type PartyFormValues = z.input<typeof partySchema>;

export const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  unit_price: z.coerce.number().min(0, "Must be ≥ 0"),
  // Optional: an empty input means "not set" (null), not 0.
  company_rate: z
    .union([z.literal(""), z.null(), z.coerce.number().min(0, "Must be ≥ 0")])
    .optional()
    .transform((v) => (v === "" || v == null ? null : Number(v))),
});
export type ProductInput = z.infer<typeof productSchema>;
export type ProductFormValues = z.input<typeof productSchema>;

export const orderItemSchema = z.object({
  product_id: z.coerce.number().int().positive("Select a product"),
  quantity: z.coerce.number().positive("Qty must be > 0"),
  unit_price: z.coerce.number().min(0, "Must be ≥ 0"),
});

export const orderSchema = z.object({
  party_id: z.coerce.number().int().positive("Select a customer"),
  order_date: z.string().min(1, "Date is required"),
  status: z.enum(["progress", "completed"]).default("progress"),
  advance_payment: z.coerce.number().min(0).default(0),
  items: z.array(orderItemSchema).min(1, "Add at least one item"),
});
export type OrderInput = z.infer<typeof orderSchema>;
export type OrderFormValues = z.input<typeof orderSchema>;

export const paymentSchema = z.object({
  party_id: z.coerce.number().int().positive("Select a party"),
  order_id: z
    .union([z.coerce.number().int().positive(), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v == null ? null : Number(v))),
  amount: z.coerce.number().positive("Amount must be > 0"),
  payment_date: z.string().min(1, "Date is required"),
});
export type PaymentInput = z.infer<typeof paymentSchema>;
export type PaymentFormValues = z.input<typeof paymentSchema>;

export const companyPaidSchema = z.object({
  ledger_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  amount_paid: z.coerce.number().min(0, "Must be ≥ 0"),
});
export type CompanyPaidInput = z.infer<typeof companyPaidSchema>;
