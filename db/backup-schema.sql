-- Schema that complete application backups (/api/backup/download) restore into.
-- Dumped from the live Supabase database on 2026-10-06 (pg_dump --schema-only
-- --no-owner). db/schema.sql + db/migrations/ do not have the user_id ownership
-- columns, composite foreign keys or row-level security below.
-- Applied by db/restore-backup.mjs to an empty database; not destructive.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'catalyst_app') then
    create role catalyst_app nologin;
  end if;
end $$;

--
-- PostgreSQL database dump
--

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _user_reassign_backup_20260926; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._user_reassign_backup_20260926 (
    tbl text,
    key text,
    old_user_id text
);

--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id bigint NOT NULL,
    name text NOT NULL,
    phone text,
    address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id text DEFAULT current_setting('app.current_user_id'::text) NOT NULL,
    CONSTRAINT companies_user_id_check CHECK ((user_id <> ''::text))
);

ALTER TABLE ONLY public.companies FORCE ROW LEVEL SECURITY;

--
-- Name: companies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.companies ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.companies_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: company_ledger_days; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_ledger_days (
    ledger_date date NOT NULL,
    amount_paid numeric DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id text DEFAULT current_setting('app.current_user_id'::text) NOT NULL,
    CONSTRAINT company_ledger_days_amount_paid_check CHECK ((amount_paid >= (0)::numeric)),
    CONSTRAINT company_ledger_days_user_id_check CHECK ((user_id <> ''::text))
);

ALTER TABLE ONLY public.company_ledger_days FORCE ROW LEVEL SECURITY;

--
-- Name: company_ledger_order_paid; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_ledger_order_paid (
    order_id bigint NOT NULL,
    amount_paid numeric NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id text DEFAULT current_setting('app.current_user_id'::text) NOT NULL,
    CONSTRAINT company_ledger_order_paid_amount_paid_check CHECK ((amount_paid > (0)::numeric)),
    CONSTRAINT company_ledger_order_paid_user_id_check CHECK ((user_id <> ''::text))
);

ALTER TABLE ONLY public.company_ledger_order_paid FORCE ROW LEVEL SECURITY;

--
-- Name: company_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_payments (
    id bigint NOT NULL,
    payment_date date NOT NULL,
    amount numeric NOT NULL,
    payment_method text DEFAULT 'cash'::text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id text DEFAULT current_setting('app.current_user_id'::text) NOT NULL,
    CONSTRAINT company_payments_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT company_payments_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'bank'::text]))),
    CONSTRAINT company_payments_user_id_check CHECK ((user_id <> ''::text))
);

ALTER TABLE ONLY public.company_payments FORCE ROW LEVEL SECURITY;

--
-- Name: company_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.company_payments ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.company_payments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: company_purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_purchases (
    id bigint NOT NULL,
    company_id bigint NOT NULL,
    product text NOT NULL,
    purchase_date date DEFAULT CURRENT_DATE NOT NULL,
    bill_amount numeric NOT NULL,
    amount_paid numeric DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id text DEFAULT current_setting('app.current_user_id'::text) NOT NULL,
    CONSTRAINT company_purchases_amount_paid_check CHECK ((amount_paid >= (0)::numeric)),
    CONSTRAINT company_purchases_bill_amount_check CHECK ((bill_amount >= (0)::numeric)),
    CONSTRAINT company_purchases_user_id_check CHECK ((user_id <> ''::text))
);

ALTER TABLE ONLY public.company_purchases FORCE ROW LEVEL SECURITY;

--
-- Name: company_purchases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.company_purchases ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.company_purchases_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id bigint NOT NULL,
    order_id bigint NOT NULL,
    product_id bigint NOT NULL,
    quantity numeric DEFAULT 1 NOT NULL,
    unit_price numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company_rate numeric,
    user_id text DEFAULT current_setting('app.current_user_id'::text) NOT NULL,
    CONSTRAINT order_items_company_rate_check CHECK ((company_rate >= (0)::numeric)),
    CONSTRAINT order_items_user_id_check CHECK ((user_id <> ''::text))
);

ALTER TABLE ONLY public.order_items FORCE ROW LEVEL SECURITY;

--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.order_items ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.order_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id bigint NOT NULL,
    order_number text NOT NULL,
    party_id bigint NOT NULL,
    order_date date DEFAULT CURRENT_DATE NOT NULL,
    status text DEFAULT 'progress'::text NOT NULL,
    advance_payment numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id text DEFAULT current_setting('app.current_user_id'::text) NOT NULL,
    CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY['progress'::text, 'completed'::text]))),
    CONSTRAINT orders_user_id_check CHECK ((user_id <> ''::text))
);

ALTER TABLE ONLY public.orders FORCE ROW LEVEL SECURITY;

--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.orders ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.orders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: parties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parties (
    id bigint NOT NULL,
    name text NOT NULL,
    phone text,
    address text,
    status text DEFAULT 'active'::text NOT NULL,
    opening_balance numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id text DEFAULT current_setting('app.current_user_id'::text) NOT NULL,
    CONSTRAINT parties_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text]))),
    CONSTRAINT parties_user_id_check CHECK ((user_id <> ''::text))
);

ALTER TABLE ONLY public.parties FORCE ROW LEVEL SECURITY;

--
-- Name: parties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.parties ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.parties_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id bigint NOT NULL,
    party_id bigint NOT NULL,
    order_id bigint,
    amount numeric NOT NULL,
    payment_date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_method text DEFAULT 'cash'::text NOT NULL,
    user_id text DEFAULT current_setting('app.current_user_id'::text) NOT NULL,
    CONSTRAINT payments_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'bank'::text]))),
    CONSTRAINT payments_user_id_check CHECK ((user_id <> ''::text))
);

ALTER TABLE ONLY public.payments FORCE ROW LEVEL SECURITY;

--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.payments ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.payments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: product_return_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_return_items (
    id bigint NOT NULL,
    return_id bigint NOT NULL,
    order_item_id bigint,
    product_id bigint NOT NULL,
    quantity numeric NOT NULL,
    unit_price numeric NOT NULL,
    company_rate numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id text DEFAULT current_setting('app.current_user_id'::text) NOT NULL,
    CONSTRAINT product_return_items_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT product_return_items_user_id_check CHECK ((user_id <> ''::text))
);

ALTER TABLE ONLY public.product_return_items FORCE ROW LEVEL SECURITY;

--
-- Name: product_return_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.product_return_items ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.product_return_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: product_returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_returns (
    id bigint NOT NULL,
    order_id bigint NOT NULL,
    return_date date DEFAULT CURRENT_DATE NOT NULL,
    total_amount numeric NOT NULL,
    company_amount numeric DEFAULT 0 NOT NULL,
    refund_amount numeric DEFAULT 0 NOT NULL,
    payment_id bigint,
    note text,
    created_by text,
    created_by_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id text DEFAULT current_setting('app.current_user_id'::text) NOT NULL,
    CONSTRAINT product_returns_company_amount_check CHECK ((company_amount >= (0)::numeric)),
    CONSTRAINT product_returns_refund_amount_check CHECK ((refund_amount >= (0)::numeric)),
    CONSTRAINT product_returns_total_amount_check CHECK ((total_amount >= (0)::numeric)),
    CONSTRAINT product_returns_user_id_check CHECK ((user_id <> ''::text))
);

ALTER TABLE ONLY public.product_returns FORCE ROW LEVEL SECURITY;

--
-- Name: product_returns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.product_returns ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.product_returns_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id bigint NOT NULL,
    name text NOT NULL,
    unit_price numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company_rate numeric,
    deleted_at timestamp with time zone,
    user_id text DEFAULT current_setting('app.current_user_id'::text) NOT NULL,
    CONSTRAINT products_company_rate_check CHECK ((company_rate >= (0)::numeric)),
    CONSTRAINT products_user_id_check CHECK ((user_id <> ''::text))
);

ALTER TABLE ONLY public.products FORCE ROW LEVEL SECURITY;

--
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.products ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.products_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: companies companies_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_id_user_id_key UNIQUE (id, user_id);

--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);

--
-- Name: company_ledger_days company_ledger_days_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_ledger_days
    ADD CONSTRAINT company_ledger_days_pkey PRIMARY KEY (user_id, ledger_date);

--
-- Name: company_ledger_order_paid company_ledger_order_paid_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_ledger_order_paid
    ADD CONSTRAINT company_ledger_order_paid_pkey PRIMARY KEY (order_id);

--
-- Name: company_payments company_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_payments
    ADD CONSTRAINT company_payments_pkey PRIMARY KEY (id);

--
-- Name: company_purchases company_purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_purchases
    ADD CONSTRAINT company_purchases_pkey PRIMARY KEY (id);

--
-- Name: order_items order_items_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_id_user_id_key UNIQUE (id, user_id);

--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);

--
-- Name: orders orders_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_id_user_id_key UNIQUE (id, user_id);

--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);

--
-- Name: orders orders_user_id_order_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_user_id_order_number_key UNIQUE (user_id, order_number);

--
-- Name: parties parties_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parties
    ADD CONSTRAINT parties_id_user_id_key UNIQUE (id, user_id);

--
-- Name: parties parties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parties
    ADD CONSTRAINT parties_pkey PRIMARY KEY (id);

--
-- Name: payments payments_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_id_user_id_key UNIQUE (id, user_id);

--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);

--
-- Name: product_return_items product_return_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_return_items
    ADD CONSTRAINT product_return_items_pkey PRIMARY KEY (id);

--
-- Name: product_returns product_returns_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_returns
    ADD CONSTRAINT product_returns_id_user_id_key UNIQUE (id, user_id);

--
-- Name: product_returns product_returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_returns
    ADD CONSTRAINT product_returns_pkey PRIMARY KEY (id);

--
-- Name: products products_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_id_user_id_key UNIQUE (id, user_id);

--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);

--
-- Name: companies_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX companies_user_id_idx ON public.companies USING btree (user_id);

--
-- Name: company_ledger_days_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_ledger_days_user_id_idx ON public.company_ledger_days USING btree (user_id);

--
-- Name: company_ledger_order_paid_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_ledger_order_paid_user_id_idx ON public.company_ledger_order_paid USING btree (user_id);

--
-- Name: company_payments_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_payments_user_id_idx ON public.company_payments USING btree (user_id);

--
-- Name: company_purchases_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_purchases_user_id_idx ON public.company_purchases USING btree (user_id);

--
-- Name: order_items_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_items_user_id_idx ON public.order_items USING btree (user_id);

--
-- Name: orders_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_user_id_idx ON public.orders USING btree (user_id);

--
-- Name: parties_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX parties_user_id_idx ON public.parties USING btree (user_id);

--
-- Name: payments_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_user_id_idx ON public.payments USING btree (user_id);

--
-- Name: product_return_items_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_return_items_user_id_idx ON public.product_return_items USING btree (user_id);

--
-- Name: product_returns_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_returns_user_id_idx ON public.product_returns USING btree (user_id);

--
-- Name: products_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_user_id_idx ON public.products USING btree (user_id);

--
-- Name: company_ledger_order_paid company_ledger_order_paid_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_ledger_order_paid
    ADD CONSTRAINT company_ledger_order_paid_order_id_fkey FOREIGN KEY (order_id, user_id) REFERENCES public.orders(id, user_id) ON DELETE CASCADE;

--
-- Name: company_purchases company_purchases_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_purchases
    ADD CONSTRAINT company_purchases_company_id_fkey FOREIGN KEY (company_id, user_id) REFERENCES public.companies(id, user_id) ON DELETE RESTRICT;

--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id, user_id) REFERENCES public.orders(id, user_id) ON DELETE CASCADE;

--
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id, user_id) REFERENCES public.products(id, user_id) ON DELETE RESTRICT;

--
-- Name: orders orders_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_party_id_fkey FOREIGN KEY (party_id, user_id) REFERENCES public.parties(id, user_id) ON DELETE RESTRICT;

--
-- Name: payments payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id, user_id) REFERENCES public.orders(id, user_id) ON DELETE SET NULL (order_id);

--
-- Name: payments payments_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_party_id_fkey FOREIGN KEY (party_id, user_id) REFERENCES public.parties(id, user_id) ON DELETE RESTRICT;

--
-- Name: product_return_items product_return_items_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_return_items
    ADD CONSTRAINT product_return_items_order_item_id_fkey FOREIGN KEY (order_item_id, user_id) REFERENCES public.order_items(id, user_id) ON DELETE SET NULL (order_item_id);

--
-- Name: product_return_items product_return_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_return_items
    ADD CONSTRAINT product_return_items_product_id_fkey FOREIGN KEY (product_id, user_id) REFERENCES public.products(id, user_id) ON DELETE RESTRICT;

--
-- Name: product_return_items product_return_items_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_return_items
    ADD CONSTRAINT product_return_items_return_id_fkey FOREIGN KEY (return_id, user_id) REFERENCES public.product_returns(id, user_id) ON DELETE CASCADE;

--
-- Name: product_returns product_returns_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_returns
    ADD CONSTRAINT product_returns_order_id_fkey FOREIGN KEY (order_id, user_id) REFERENCES public.orders(id, user_id) ON DELETE CASCADE;

--
-- Name: product_returns product_returns_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_returns
    ADD CONSTRAINT product_returns_payment_id_fkey FOREIGN KEY (payment_id, user_id) REFERENCES public.payments(id, user_id) ON DELETE SET NULL (payment_id);

--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: company_ledger_days; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_ledger_days ENABLE ROW LEVEL SECURITY;

--
-- Name: company_ledger_order_paid; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_ledger_order_paid ENABLE ROW LEVEL SECURITY;

--
-- Name: company_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: company_purchases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_purchases ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: parties; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;

--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: product_return_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_return_items ENABLE ROW LEVEL SECURITY;

--
-- Name: product_returns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_returns ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: companies user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_isolation ON public.companies TO catalyst_app USING ((user_id = current_setting('app.current_user_id'::text, true))) WITH CHECK ((user_id = current_setting('app.current_user_id'::text, true)));

--
-- Name: company_ledger_days user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_isolation ON public.company_ledger_days TO catalyst_app USING ((user_id = current_setting('app.current_user_id'::text, true))) WITH CHECK ((user_id = current_setting('app.current_user_id'::text, true)));

--
-- Name: company_ledger_order_paid user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_isolation ON public.company_ledger_order_paid TO catalyst_app USING ((user_id = current_setting('app.current_user_id'::text, true))) WITH CHECK ((user_id = current_setting('app.current_user_id'::text, true)));

--
-- Name: company_payments user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_isolation ON public.company_payments TO catalyst_app USING ((user_id = current_setting('app.current_user_id'::text, true))) WITH CHECK ((user_id = current_setting('app.current_user_id'::text, true)));

--
-- Name: company_purchases user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_isolation ON public.company_purchases TO catalyst_app USING ((user_id = current_setting('app.current_user_id'::text, true))) WITH CHECK ((user_id = current_setting('app.current_user_id'::text, true)));

--
-- Name: order_items user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_isolation ON public.order_items TO catalyst_app USING ((user_id = current_setting('app.current_user_id'::text, true))) WITH CHECK ((user_id = current_setting('app.current_user_id'::text, true)));

--
-- Name: orders user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_isolation ON public.orders TO catalyst_app USING ((user_id = current_setting('app.current_user_id'::text, true))) WITH CHECK ((user_id = current_setting('app.current_user_id'::text, true)));

--
-- Name: parties user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_isolation ON public.parties TO catalyst_app USING ((user_id = current_setting('app.current_user_id'::text, true))) WITH CHECK ((user_id = current_setting('app.current_user_id'::text, true)));

--
-- Name: payments user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_isolation ON public.payments TO catalyst_app USING ((user_id = current_setting('app.current_user_id'::text, true))) WITH CHECK ((user_id = current_setting('app.current_user_id'::text, true)));

--
-- Name: product_return_items user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_isolation ON public.product_return_items TO catalyst_app USING ((user_id = current_setting('app.current_user_id'::text, true))) WITH CHECK ((user_id = current_setting('app.current_user_id'::text, true)));

--
-- Name: product_returns user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_isolation ON public.product_returns TO catalyst_app USING ((user_id = current_setting('app.current_user_id'::text, true))) WITH CHECK ((user_id = current_setting('app.current_user_id'::text, true)));

--
-- Name: products user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_isolation ON public.products TO catalyst_app USING ((user_id = current_setting('app.current_user_id'::text, true))) WITH CHECK ((user_id = current_setting('app.current_user_id'::text, true)));

--
-- PostgreSQL database dump complete
--


GRANT USAGE ON SCHEMA public TO catalyst_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.companies TO catalyst_app;
GRANT SELECT,USAGE ON SEQUENCE public.companies_id_seq TO catalyst_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.company_ledger_days TO catalyst_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.company_ledger_order_paid TO catalyst_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.company_payments TO catalyst_app;
GRANT SELECT,USAGE ON SEQUENCE public.company_payments_id_seq TO catalyst_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.company_purchases TO catalyst_app;
GRANT SELECT,USAGE ON SEQUENCE public.company_purchases_id_seq TO catalyst_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.order_items TO catalyst_app;
GRANT SELECT,USAGE ON SEQUENCE public.order_items_id_seq TO catalyst_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.orders TO catalyst_app;
GRANT SELECT,USAGE ON SEQUENCE public.orders_id_seq TO catalyst_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.parties TO catalyst_app;
GRANT SELECT,USAGE ON SEQUENCE public.parties_id_seq TO catalyst_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.payments TO catalyst_app;
GRANT SELECT,USAGE ON SEQUENCE public.payments_id_seq TO catalyst_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_return_items TO catalyst_app;
GRANT SELECT,USAGE ON SEQUENCE public.product_return_items_id_seq TO catalyst_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_returns TO catalyst_app;
GRANT SELECT,USAGE ON SEQUENCE public.product_returns_id_seq TO catalyst_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.products TO catalyst_app;
GRANT SELECT,USAGE ON SEQUENCE public.products_id_seq TO catalyst_app;
