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

// Prices are whole rupees: 0 is allowed, fractions are not.
const wholePrice = z.coerce
  .number({ message: "Enter a price" })
  .refine(Number.isFinite, "Enter a valid price")
  .int("Whole numbers only")
  .min(0, "Must be ≥ 0");

export const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  unit_price: wholePrice,
  
  company_rate: z
    .union([z.literal(""), z.null(), wholePrice])
    .optional()
    .transform((v) => (v === "" || v == null ? null : Number(v))),
});
export type ProductInput = z.infer<typeof productSchema>;
export type ProductFormValues = z.input<typeof productSchema>;

export const orderItemSchema = z.object({
  product_id: z.coerce.number().int().positive("Select a product"),
  quantity: z.coerce.number().positive("Qty must be > 0"),
  unit_price: wholePrice,
});

export const orderSchema = z.object({
  party_id: z.coerce.number().int().positive("Select a customer"),
  order_date: z.string().min(1, "Date is required"),
  status: z.enum(["progress", "completed"]).default("progress"),
  advance_payment: z.coerce.number().int("Whole numbers only").min(0).default(0),
  items: z.array(orderItemSchema).min(1, "Add at least one item"),
});
export type OrderInput = z.infer<typeof orderSchema>;
export type OrderFormValues = z.input<typeof orderSchema>;


export const returnItemSchema = z.object({
  order_item_id: z.coerce.number().int().positive("Invalid line item"),
  quantity: z.coerce
    .number({ message: "Enter a quantity" })
    .refine(Number.isFinite, "Enter a valid quantity")
    .int("Whole numbers only")
    .min(0, "Qty must be ≥ 0")
    .default(0),
});

export const returnSchema = z
  .object({
    return_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
    note: optionalString,
    
    refund: z.boolean().default(true),
    payment_method: z.enum(["cash", "bank"]).default("cash"),
    items: z.array(returnItemSchema).min(1, "This order has no items to return"),
  })
  .refine((v) => v.items.some((i) => i.quantity > 0), {
    message: "Enter a quantity for at least one product",
    path: ["items"],
  });
export type ReturnInput = z.infer<typeof returnSchema>;
export type ReturnFormValues = z.input<typeof returnSchema>;


export const returnEditItemSchema = z.object({
  return_item_id: z.coerce.number().int().positive("Invalid return line"),
  quantity: z.coerce
    .number({ message: "Enter a quantity" })
    .refine(Number.isFinite, "Enter a valid quantity")
    .int("Whole numbers only")
    .min(0, "Qty must be ≥ 0")
    .default(0),
});

export const returnEditSchema = z
  .object({
    id: z.coerce.number().int().positive("Invalid return"),
    return_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
    note: optionalString,
    refund: z.boolean().default(true),
    payment_method: z.enum(["cash", "bank"]).default("cash"),
    items: z
      .array(returnEditItemSchema)
      .min(1, "A return needs at least one product"),
  })
  .refine((v) => v.items.some((i) => i.quantity > 0), {
    message: "Enter a quantity for at least one product, or delete the return",
    path: ["items"],
  });
export type ReturnEditInput = z.infer<typeof returnEditSchema>;
export type ReturnEditFormValues = z.input<typeof returnEditSchema>;

export const paymentSchema = z.object({
  party_id: z.coerce.number().int().positive("Select a party"),
  order_id: z
    .union([z.coerce.number().int().positive(), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v == null ? null : Number(v))),
  amount: z.coerce.number().int("Whole numbers only").positive("Amount must be > 0"),
  payment_date: z.string().min(1, "Date is required"),
  payment_method: z.enum(["cash", "bank"]).default("cash"),
});
export type PaymentInput = z.infer<typeof paymentSchema>;
export type PaymentFormValues = z.input<typeof paymentSchema>;

export const companyPaymentSchema = z.object({
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  amount: z.coerce
    .number({ message: "Enter an amount" })
    .refine(Number.isFinite, "Enter a valid amount")
    .int("Whole numbers only")
    .positive("Amount must be greater than 0"),
  payment_method: z.enum(["cash", "bank"]).default("cash"),
});
export type CompanyPaymentInput = z.infer<typeof companyPaymentSchema>;
export type CompanyPaymentFormValues = z.input<typeof companyPaymentSchema>;

export const companyPaymentEditSchema = companyPaymentSchema.extend({
  id: z.coerce.number().int().positive("Invalid payment"),
});
export type CompanyPaymentEditInput = z.infer<typeof companyPaymentEditSchema>;
export type CompanyPaymentEditFormValues = z.input<
  typeof companyPaymentEditSchema
>;

export const companyPaidSchema = z.object({
  ledger_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  amount_paid: z.coerce.number().int("Whole numbers only").min(0, "Must be ≥ 0"),
});
export type CompanyPaidInput = z.infer<typeof companyPaidSchema>;

export const companyDayPaidSchema = companyPaidSchema.extend({
  orders: z.array(
    z.object({
      order_id: z.coerce.number().int().positive("Invalid order"),
      amount_paid: z.coerce.number().int("Whole numbers only").min(0, "Must be ≥ 0"),
    }),
  ),
});
export type CompanyDayPaidInput = z.infer<typeof companyDayPaidSchema>;
export type CompanyDayPaidFormValues = z.input<typeof companyDayPaidSchema>;


export const orderPaidSchema = z.object({
  order_id: z.coerce.number().int().positive("Invalid order"),
  amount_paid: z.coerce.number().int("Whole numbers only").min(0, "Must be ≥ 0"),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  payment_method: z.enum(["cash", "bank"]).default("cash"),
});
export type OrderPaidInput = z.infer<typeof orderPaidSchema>;
