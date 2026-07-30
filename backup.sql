--
-- PostgreSQL database dump
--

\restrict 9fhtfmY0HznwxvuvnIcLnoAb05AawcpQ3kpoydrzUTtCiWnCyetwMCgn5R1bJFj

-- Dumped from database version 16.14 (daf32eb)
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: _system; Type: SCHEMA; Schema: -; Owner: neondb_owner
--

CREATE SCHEMA _system;


ALTER SCHEMA _system OWNER TO neondb_owner;

--
-- Name: file_type; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.file_type AS ENUM (
    'text',
    'photo',
    'document',
    'gif',
    'video',
    'animation'
);


ALTER TYPE public.file_type OWNER TO neondb_owner;

--
-- Name: product_status; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.product_status AS ENUM (
    'available',
    'reserved',
    'sold'
);


ALTER TYPE public.product_status OWNER TO neondb_owner;

--
-- Name: tier_metric; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.tier_metric AS ENUM (
    'purchase_count',
    'eur_spent'
);


ALTER TYPE public.tier_metric OWNER TO neondb_owner;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: replit_database_migrations_v1; Type: TABLE; Schema: _system; Owner: neondb_owner
--

CREATE TABLE _system.replit_database_migrations_v1 (
    id bigint NOT NULL,
    build_id text NOT NULL,
    deployment_id text NOT NULL,
    statement_count bigint NOT NULL,
    applied_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE _system.replit_database_migrations_v1 OWNER TO neondb_owner;

--
-- Name: replit_database_migrations_v1_id_seq; Type: SEQUENCE; Schema: _system; Owner: neondb_owner
--

CREATE SEQUENCE _system.replit_database_migrations_v1_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE _system.replit_database_migrations_v1_id_seq OWNER TO neondb_owner;

--
-- Name: replit_database_migrations_v1_id_seq; Type: SEQUENCE OWNED BY; Schema: _system; Owner: neondb_owner
--

ALTER SEQUENCE _system.replit_database_migrations_v1_id_seq OWNED BY _system.replit_database_migrations_v1.id;


--
-- Name: bot_admins; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.bot_admins (
    id integer NOT NULL,
    telegram_id bigint NOT NULL,
    username text,
    added_at timestamp without time zone DEFAULT now() NOT NULL,
    notify_on_purchase boolean DEFAULT true NOT NULL
);


ALTER TABLE public.bot_admins OWNER TO neondb_owner;

--
-- Name: bot_admins_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.bot_admins_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bot_admins_id_seq OWNER TO neondb_owner;

--
-- Name: bot_admins_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.bot_admins_id_seq OWNED BY public.bot_admins.id;


--
-- Name: bot_backup_tokens; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.bot_backup_tokens (
    id integer NOT NULL,
    token text NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    added_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.bot_backup_tokens OWNER TO neondb_owner;

--
-- Name: bot_backup_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.bot_backup_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bot_backup_tokens_id_seq OWNER TO neondb_owner;

--
-- Name: bot_backup_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.bot_backup_tokens_id_seq OWNED BY public.bot_backup_tokens.id;


--
-- Name: bot_baskets; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.bot_baskets (
    id integer NOT NULL,
    user_id bigint NOT NULL,
    city_id integer NOT NULL,
    district_id integer NOT NULL,
    type_id integer NOT NULL,
    size text NOT NULL,
    price numeric(10,2) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.bot_baskets OWNER TO neondb_owner;

--
-- Name: bot_baskets_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.bot_baskets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bot_baskets_id_seq OWNER TO neondb_owner;

--
-- Name: bot_baskets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.bot_baskets_id_seq OWNED BY public.bot_baskets.id;


--
-- Name: bot_cities; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.bot_cities (
    id integer NOT NULL,
    name text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.bot_cities OWNER TO neondb_owner;

--
-- Name: bot_cities_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.bot_cities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bot_cities_id_seq OWNER TO neondb_owner;

--
-- Name: bot_cities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.bot_cities_id_seq OWNED BY public.bot_cities.id;


--
-- Name: bot_discount_codes; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.bot_discount_codes (
    id integer NOT NULL,
    code text NOT NULL,
    percent_off integer NOT NULL,
    max_uses integer,
    uses_count integer DEFAULT 0 NOT NULL,
    stacks_with_sale boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.bot_discount_codes OWNER TO neondb_owner;

--
-- Name: bot_discount_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.bot_discount_codes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bot_discount_codes_id_seq OWNER TO neondb_owner;

--
-- Name: bot_discount_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.bot_discount_codes_id_seq OWNED BY public.bot_discount_codes.id;


--
-- Name: bot_districts; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.bot_districts (
    id integer NOT NULL,
    city_id integer NOT NULL,
    name text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.bot_districts OWNER TO neondb_owner;

--
-- Name: bot_districts_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.bot_districts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bot_districts_id_seq OWNER TO neondb_owner;

--
-- Name: bot_districts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.bot_districts_id_seq OWNED BY public.bot_districts.id;


--
-- Name: bot_invoice_intents; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.bot_invoice_intents (
    id integer NOT NULL,
    user_id bigint NOT NULL,
    sol_amount numeric(18,9) NOT NULL,
    eur_amount numeric(10,2) NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    tx_signature text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    expires_at timestamp without time zone NOT NULL
);


ALTER TABLE public.bot_invoice_intents OWNER TO neondb_owner;

--
-- Name: bot_invoice_intents_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.bot_invoice_intents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bot_invoice_intents_id_seq OWNER TO neondb_owner;

--
-- Name: bot_invoice_intents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.bot_invoice_intents_id_seq OWNED BY public.bot_invoice_intents.id;


--
-- Name: bot_payment_receipts; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.bot_payment_receipts (
    id integer NOT NULL,
    tx_signature text NOT NULL,
    user_id bigint NOT NULL,
    kind text NOT NULL,
    received_sol numeric(18,9),
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.bot_payment_receipts OWNER TO neondb_owner;

--
-- Name: bot_payment_receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.bot_payment_receipts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bot_payment_receipts_id_seq OWNER TO neondb_owner;

--
-- Name: bot_payment_receipts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.bot_payment_receipts_id_seq OWNED BY public.bot_payment_receipts.id;


--
-- Name: bot_product_discounts; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.bot_product_discounts (
    id integer NOT NULL,
    city_id integer,
    district_id integer,
    type_id integer,
    size text,
    percent_off integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.bot_product_discounts OWNER TO neondb_owner;

--
-- Name: bot_product_discounts_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.bot_product_discounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bot_product_discounts_id_seq OWNER TO neondb_owner;

--
-- Name: bot_product_discounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.bot_product_discounts_id_seq OWNED BY public.bot_product_discounts.id;


--
-- Name: bot_product_slots; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.bot_product_slots (
    id integer NOT NULL,
    city_id integer NOT NULL,
    district_id integer NOT NULL,
    type_id integer NOT NULL,
    size text NOT NULL,
    price numeric(10,2) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.bot_product_slots OWNER TO neondb_owner;

--
-- Name: bot_product_slots_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.bot_product_slots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bot_product_slots_id_seq OWNER TO neondb_owner;

--
-- Name: bot_product_slots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.bot_product_slots_id_seq OWNED BY public.bot_product_slots.id;


--
-- Name: bot_product_types; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.bot_product_types (
    id integer NOT NULL,
    name text NOT NULL,
    emoji text DEFAULT '📦'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.bot_product_types OWNER TO neondb_owner;

--
-- Name: bot_product_types_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.bot_product_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bot_product_types_id_seq OWNER TO neondb_owner;

--
-- Name: bot_product_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.bot_product_types_id_seq OWNED BY public.bot_product_types.id;


--
-- Name: bot_products; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.bot_products (
    id integer NOT NULL,
    city_id integer,
    district_id integer,
    type_id integer NOT NULL,
    size text NOT NULL,
    price numeric(10,2) NOT NULL,
    content text,
    file_id text,
    file_type public.file_type DEFAULT 'text'::public.file_type NOT NULL,
    status public.product_status DEFAULT 'available'::public.product_status NOT NULL,
    reserved_by bigint,
    reserved_until timestamp without time zone,
    added_by bigint,
    worker_tag text,
    media_files text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.bot_products OWNER TO neondb_owner;

--
-- Name: bot_products_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.bot_products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bot_products_id_seq OWNER TO neondb_owner;

--
-- Name: bot_products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.bot_products_id_seq OWNED BY public.bot_products.id;


--
-- Name: bot_purchases; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.bot_purchases (
    id integer NOT NULL,
    queue_id text NOT NULL,
    user_id bigint NOT NULL,
    product_id integer NOT NULL,
    price_paid numeric(10,2) NOT NULL,
    discount_code_used text,
    payment_method text DEFAULT 'balance'::text NOT NULL,
    refunded boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    tx_signature text,
    sender_wallet text
);


ALTER TABLE public.bot_purchases OWNER TO neondb_owner;

--
-- Name: bot_purchases_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.bot_purchases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bot_purchases_id_seq OWNER TO neondb_owner;

--
-- Name: bot_purchases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.bot_purchases_id_seq OWNED BY public.bot_purchases.id;


--
-- Name: bot_reseller_discounts; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.bot_reseller_discounts (
    id integer NOT NULL,
    city_id integer,
    district_id integer,
    type_id integer,
    size text,
    percent_off integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.bot_reseller_discounts OWNER TO neondb_owner;

--
-- Name: bot_reseller_discounts_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.bot_reseller_discounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bot_reseller_discounts_id_seq OWNER TO neondb_owner;

--
-- Name: bot_reseller_discounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.bot_reseller_discounts_id_seq OWNED BY public.bot_reseller_discounts.id;


--
-- Name: bot_reviews; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.bot_reviews (
    id integer NOT NULL,
    user_id bigint NOT NULL,
    username text,
    text text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.bot_reviews OWNER TO neondb_owner;

--
-- Name: bot_reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.bot_reviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bot_reviews_id_seq OWNER TO neondb_owner;

--
-- Name: bot_reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.bot_reviews_id_seq OWNED BY public.bot_reviews.id;


--
-- Name: bot_settings; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.bot_settings (
    key text NOT NULL,
    value text NOT NULL
);


ALTER TABLE public.bot_settings OWNER TO neondb_owner;

--
-- Name: bot_tier_discount_rules; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.bot_tier_discount_rules (
    id integer NOT NULL,
    tier_name text NOT NULL,
    city_id integer,
    district_id integer,
    type_id integer,
    size text,
    percent_off integer NOT NULL
);


ALTER TABLE public.bot_tier_discount_rules OWNER TO neondb_owner;

--
-- Name: bot_tier_discount_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.bot_tier_discount_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bot_tier_discount_rules_id_seq OWNER TO neondb_owner;

--
-- Name: bot_tier_discount_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.bot_tier_discount_rules_id_seq OWNED BY public.bot_tier_discount_rules.id;


--
-- Name: bot_tier_levels; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.bot_tier_levels (
    id integer NOT NULL,
    name text NOT NULL,
    threshold integer DEFAULT 0 NOT NULL,
    global_discount_percent integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.bot_tier_levels OWNER TO neondb_owner;

--
-- Name: bot_tier_levels_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.bot_tier_levels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bot_tier_levels_id_seq OWNER TO neondb_owner;

--
-- Name: bot_tier_levels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.bot_tier_levels_id_seq OWNED BY public.bot_tier_levels.id;


--
-- Name: bot_tier_settings; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.bot_tier_settings (
    id integer NOT NULL,
    metric public.tier_metric DEFAULT 'purchase_count'::public.tier_metric NOT NULL
);


ALTER TABLE public.bot_tier_settings OWNER TO neondb_owner;

--
-- Name: bot_tier_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.bot_tier_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bot_tier_settings_id_seq OWNER TO neondb_owner;

--
-- Name: bot_tier_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.bot_tier_settings_id_seq OWNED BY public.bot_tier_settings.id;


--
-- Name: bot_topup_invoices; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.bot_topup_invoices (
    id integer NOT NULL,
    user_id bigint NOT NULL,
    eur_amount numeric(10,2) NOT NULL,
    sol_amount numeric(18,9) NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    tx_signature text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    expires_at timestamp without time zone NOT NULL
);


ALTER TABLE public.bot_topup_invoices OWNER TO neondb_owner;

--
-- Name: bot_topup_invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.bot_topup_invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bot_topup_invoices_id_seq OWNER TO neondb_owner;

--
-- Name: bot_topup_invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.bot_topup_invoices_id_seq OWNED BY public.bot_topup_invoices.id;


--
-- Name: bot_users; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.bot_users (
    id integer NOT NULL,
    telegram_id bigint NOT NULL,
    username text,
    first_name text,
    balance numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    is_banned boolean DEFAULT false NOT NULL,
    is_reseller boolean DEFAULT false NOT NULL,
    purchase_count integer DEFAULT 0 NOT NULL,
    eur_spent numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    tier_name text DEFAULT 'New'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    last_active_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.bot_users OWNER TO neondb_owner;

--
-- Name: bot_users_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.bot_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bot_users_id_seq OWNER TO neondb_owner;

--
-- Name: bot_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.bot_users_id_seq OWNED BY public.bot_users.id;


--
-- Name: bot_welcome_templates; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.bot_welcome_templates (
    id integer NOT NULL,
    text text NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.bot_welcome_templates OWNER TO neondb_owner;

--
-- Name: bot_welcome_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.bot_welcome_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bot_welcome_templates_id_seq OWNER TO neondb_owner;

--
-- Name: bot_welcome_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.bot_welcome_templates_id_seq OWNED BY public.bot_welcome_templates.id;


--
-- Name: bot_workers; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.bot_workers (
    id integer NOT NULL,
    telegram_id bigint NOT NULL,
    username text,
    enabled boolean DEFAULT true NOT NULL,
    total_uploads integer DEFAULT 0 NOT NULL,
    added_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.bot_workers OWNER TO neondb_owner;

--
-- Name: bot_workers_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.bot_workers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bot_workers_id_seq OWNER TO neondb_owner;

--
-- Name: bot_workers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.bot_workers_id_seq OWNED BY public.bot_workers.id;


--
-- Name: replit_database_migrations_v1 id; Type: DEFAULT; Schema: _system; Owner: neondb_owner
--

ALTER TABLE ONLY _system.replit_database_migrations_v1 ALTER COLUMN id SET DEFAULT nextval('_system.replit_database_migrations_v1_id_seq'::regclass);


--
-- Name: bot_admins id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_admins ALTER COLUMN id SET DEFAULT nextval('public.bot_admins_id_seq'::regclass);


--
-- Name: bot_backup_tokens id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_backup_tokens ALTER COLUMN id SET DEFAULT nextval('public.bot_backup_tokens_id_seq'::regclass);


--
-- Name: bot_baskets id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_baskets ALTER COLUMN id SET DEFAULT nextval('public.bot_baskets_id_seq'::regclass);


--
-- Name: bot_cities id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_cities ALTER COLUMN id SET DEFAULT nextval('public.bot_cities_id_seq'::regclass);


--
-- Name: bot_discount_codes id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_discount_codes ALTER COLUMN id SET DEFAULT nextval('public.bot_discount_codes_id_seq'::regclass);


--
-- Name: bot_districts id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_districts ALTER COLUMN id SET DEFAULT nextval('public.bot_districts_id_seq'::regclass);


--
-- Name: bot_invoice_intents id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_invoice_intents ALTER COLUMN id SET DEFAULT nextval('public.bot_invoice_intents_id_seq'::regclass);


--
-- Name: bot_payment_receipts id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_payment_receipts ALTER COLUMN id SET DEFAULT nextval('public.bot_payment_receipts_id_seq'::regclass);


--
-- Name: bot_product_discounts id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_product_discounts ALTER COLUMN id SET DEFAULT nextval('public.bot_product_discounts_id_seq'::regclass);


--
-- Name: bot_product_slots id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_product_slots ALTER COLUMN id SET DEFAULT nextval('public.bot_product_slots_id_seq'::regclass);


--
-- Name: bot_product_types id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_product_types ALTER COLUMN id SET DEFAULT nextval('public.bot_product_types_id_seq'::regclass);


--
-- Name: bot_products id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_products ALTER COLUMN id SET DEFAULT nextval('public.bot_products_id_seq'::regclass);


--
-- Name: bot_purchases id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_purchases ALTER COLUMN id SET DEFAULT nextval('public.bot_purchases_id_seq'::regclass);


--
-- Name: bot_reseller_discounts id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_reseller_discounts ALTER COLUMN id SET DEFAULT nextval('public.bot_reseller_discounts_id_seq'::regclass);


--
-- Name: bot_reviews id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_reviews ALTER COLUMN id SET DEFAULT nextval('public.bot_reviews_id_seq'::regclass);


--
-- Name: bot_tier_discount_rules id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_tier_discount_rules ALTER COLUMN id SET DEFAULT nextval('public.bot_tier_discount_rules_id_seq'::regclass);


--
-- Name: bot_tier_levels id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_tier_levels ALTER COLUMN id SET DEFAULT nextval('public.bot_tier_levels_id_seq'::regclass);


--
-- Name: bot_tier_settings id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_tier_settings ALTER COLUMN id SET DEFAULT nextval('public.bot_tier_settings_id_seq'::regclass);


--
-- Name: bot_topup_invoices id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_topup_invoices ALTER COLUMN id SET DEFAULT nextval('public.bot_topup_invoices_id_seq'::regclass);


--
-- Name: bot_users id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_users ALTER COLUMN id SET DEFAULT nextval('public.bot_users_id_seq'::regclass);


--
-- Name: bot_welcome_templates id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_welcome_templates ALTER COLUMN id SET DEFAULT nextval('public.bot_welcome_templates_id_seq'::regclass);


--
-- Name: bot_workers id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_workers ALTER COLUMN id SET DEFAULT nextval('public.bot_workers_id_seq'::regclass);


--
-- Data for Name: replit_database_migrations_v1; Type: TABLE DATA; Schema: _system; Owner: neondb_owner
--

COPY _system.replit_database_migrations_v1 (id, build_id, deployment_id, statement_count, applied_at) FROM stdin;
1	d5c6fac9-1d96-48be-b2af-17d8fec21d20	55714596-27f1-43d3-9639-28fd9f52b8af	2	2026-06-15 14:18:03.187672+00
2	10697951-ef61-4be1-b22b-bc60df01d4fe	dc5043ae-07a3-4480-bb6f-5bbb22ee35f7	2	2026-06-16 21:15:59.97616+00
3	584b8c50-b7ab-4038-8bfd-1644a09e02cc	dc5043ae-07a3-4480-bb6f-5bbb22ee35f7	1	2026-06-17 19:47:54.024279+00
4	1950ae14-0e22-4c5b-a4df-b3f310eb2ce7	dc5043ae-07a3-4480-bb6f-5bbb22ee35f7	1	2026-06-17 20:50:14.578674+00
\.


--
-- Data for Name: bot_admins; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.bot_admins (id, telegram_id, username, added_at, notify_on_purchase) FROM stdin;
1	8725051269	\N	2026-05-14 11:02:17.753408	t
2	8235754313	SAINTGERMAINNV	2026-06-14 19:41:38.808519	t
3	8273673238	pinokis666	2026-06-14 20:59:00.884134	t
\.


--
-- Data for Name: bot_backup_tokens; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.bot_backup_tokens (id, token, is_active, added_at) FROM stdin;
1	8720270946:AAHWIiiIKnAc4jNweFxF80l_VEplm6wAlSo	f	2026-05-14 20:24:25.166787
\.


--
-- Data for Name: bot_baskets; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.bot_baskets (id, user_id, city_id, district_id, type_id, size, price, created_at) FROM stdin;
10	1886732282	2	9	34	2g	30.00	2026-06-17 08:57:28.120596
11	5938976384	2	6	1	1g	30.00	2026-06-17 13:27:03.350981
13	6244077325	2	6	1	1g	30.00	2026-06-17 22:05:10.78386
\.


--
-- Data for Name: bot_cities; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.bot_cities (id, name, created_at) FROM stdin;
2	Panevezys	2026-06-14 21:00:07.900621
3	Siauliai	2026-06-14 21:00:24.349022
4	Kedainiai	2026-06-14 21:00:40.796378
5	Pasvalys	2026-06-14 21:00:47.149785
6	Ukmerge	2026-06-14 21:15:07.112391
7	Anyksciai	2026-06-14 21:15:15.409715
8	Utena	2026-06-14 21:15:23.840104
9	Radviliškis	2026-06-16 20:55:33.411209
\.


--
-- Data for Name: bot_discount_codes; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.bot_discount_codes (id, code, percent_off, max_uses, uses_count, stacks_with_sale, created_at) FROM stdin;
1	PSG	10	10	3	f	2026-06-17 10:44:12.53035
\.


--
-- Data for Name: bot_districts; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.bot_districts (id, city_id, name, created_at) FROM stdin;
5	4	geguciu parkas	2026-06-14 21:01:02.718843
6	2	STANIUNAI	2026-06-14 21:01:29.061761
7	2	DARIAUS IR GIRENO	2026-06-14 21:01:57.609693
8	2	EKRANAS	2026-06-14 21:02:24.2228
9	2	DEMBAVA	2026-06-14 21:02:44.139096
10	3	pietinis rajonas garazu g	2026-06-14 21:04:11.593749
11	5	didysis parkas	2026-06-14 21:04:57.238874
12	9	Miestas	2026-06-16 20:55:59.419571
13	5	Miestas	2026-06-17 13:15:52.01191
14	6	Miesto ribos	2026-06-17 13:54:14.174522
\.


--
-- Data for Name: bot_invoice_intents; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.bot_invoice_intents (id, user_id, sol_amount, eur_amount, status, tx_signature, created_at, expires_at) FROM stdin;
2	7975509218	0.480697000	30.00	expired	\N	2026-06-17 21:31:04.261764	2026-06-17 21:46:03.902
3	7769771713	0.434704000	27.00	expired	\N	2026-06-17 21:49:20.833436	2026-06-17 22:04:20.6
1	8906343709	0.481850000	30.00	expired	\N	2026-06-17 20:55:14.616849	2026-06-17 21:10:14.317
4	8906343709	0.482520000	30.00	open	\N	2026-06-17 22:46:54.404861	2026-06-17 23:01:54.225
5	7639594163	0.432535000	27.00	fulfilled	wmm75bdvdvqTC223LJC8vaH4zQuXSApovrmF4CFWRsWnxK9orTdisSEYgHQzJgB6VHvj5s2ojPDueygt1ABdZKJ	2026-06-17 22:51:39.445493	2026-06-17 23:06:39.26
6	1943289524	0.488008000	30.00	open	\N	2026-06-18 05:05:27.105017	2026-06-18 05:20:26.88
8	7292357177	0.482988000	30.00	open	\N	2026-06-18 08:02:37.988719	2026-06-18 08:17:37.783
9	6080324727	0.483535000	30.00	fulfilled	4q1UvvQsArJNnJ5EA4np2FqhPzoqLn6kTDFLpFB1ttAuoHRXbqKcKUZdM1aTJPm6ytRfvwA5PEpnPkJJEqsvgmji	2026-06-18 08:03:43.104035	2026-06-18 08:18:42.897
7	8856762548	0.434035000	27.00	expired	\N	2026-06-18 07:53:53.921194	2026-06-18 08:08:53.709
\.


--
-- Data for Name: bot_payment_receipts; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.bot_payment_receipts (id, tx_signature, user_id, kind, received_sol, created_at) FROM stdin;
1	QKE954E6HSmy5f52zsNL5yeS3EJJFjqobeiARzLTMmaaoMMCygQDfRaH7tckGMx1oZYi6AVvJuCs7YwDgtQpU9A	8235754313	topup	0.034270047	2026-06-14 20:02:39.783284
2	5ciL5vrwisU6vccgMqMHJzN7Nr2cCADFHNhVNdCeon2DgpqaUadstrQD4VSy3rREmP8pdL3KTRdpxSZP7b5ViEEU	8725051269	topup	0.017047000	2026-06-14 20:56:13.131309
3	52kMSCS86Roop5K6LLPneXVUx8NAeuojGrtrGYrcYqstov5FQyvws64LVVW6x8wkufbm4YnHYXQokH1Jme4kGAjJ	6913860260	purchase	0.478578210	2026-06-17 01:20:42.270567
4	58ZW6pimB2wXboxooenMWTZy3Ndes5tQHLo7jZBLfCmfskeRArxbDNZPNpkkaqvE4DbY1BzfTd3UvVbPrrpXYvHc	1929796123	purchase	0.481909000	2026-06-17 08:56:28.37292
5	jHwgjw9fPr7sML7Gsd4rvPVv6xsyVUVQLbpt32vhCQLkcWzZwXWc3r4ftdGBSAcGcXrvhAMmCvZRksFQTEGemcD	8135297519	purchase	0.518482640	2026-06-17 18:28:13.237137
6	45XfkEU6dgbmCMRNNsK5GfHCQTQt1dLa2mo4dqqvbMUuHrU67ZLFWr9PwBsv97FhGTc6ufiecig7cdPdHEbFBoaa	8708986712	purchase	0.425331000	2026-06-17 18:36:08.586355
7	U4tn7i253GRmEmAYAo7ttqCf5C6fR8km3d1jCftCPM4XVxGH3v7wMspVuNYCXpLkvu9RcTBJmuEfUwBrENuCG5n	5262239053	purchase	0.791777000	2026-06-17 20:36:28.718123
8	wmm75bdvdvqTC223LJC8vaH4zQuXSApovrmF4CFWRsWnxK9orTdisSEYgHQzJgB6VHvj5s2ojPDueygt1ABdZKJ	7639594163	purchase	0.432535000	2026-06-17 22:53:59.660279
9	4q1UvvQsArJNnJ5EA4np2FqhPzoqLn6kTDFLpFB1ttAuoHRXbqKcKUZdM1aTJPm6ytRfvwA5PEpnPkJJEqsvgmji	6080324727	purchase	0.483535000	2026-06-18 08:08:31.172258
\.


--
-- Data for Name: bot_product_discounts; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.bot_product_discounts (id, city_id, district_id, type_id, size, percent_off, created_at) FROM stdin;
\.


--
-- Data for Name: bot_product_slots; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.bot_product_slots (id, city_id, district_id, type_id, size, price, created_at) FROM stdin;
22	4	5	1	1g	30.00	2026-06-14 21:55:21.868952
23	2	6	1	1g	30.00	2026-06-14 21:55:21.868952
24	2	7	1	1g	30.00	2026-06-14 21:55:21.868952
25	2	8	1	1g	30.00	2026-06-14 21:55:21.868952
26	2	9	1	1g	30.00	2026-06-14 21:55:21.868952
27	3	10	1	1g	30.00	2026-06-14 21:55:21.868952
28	5	11	1	1g	30.00	2026-06-14 21:55:21.868952
29	4	5	1	2g	55.00	2026-06-14 21:55:57.771824
30	2	6	1	2g	55.00	2026-06-14 21:55:57.771824
31	2	7	1	2g	55.00	2026-06-14 21:55:57.771824
32	2	8	1	2g	55.00	2026-06-14 21:55:57.771824
33	2	9	1	2g	55.00	2026-06-14 21:55:57.771824
34	3	10	1	2g	55.00	2026-06-14 21:55:57.771824
35	5	11	1	2g	55.00	2026-06-14 21:55:57.771824
36	4	5	34	2g	30.00	2026-06-14 21:56:31.073576
37	2	6	34	2g	30.00	2026-06-14 21:56:31.073576
38	2	7	34	2g	30.00	2026-06-14 21:56:31.073576
39	2	8	34	2g	30.00	2026-06-14 21:56:31.073576
40	2	9	34	2g	30.00	2026-06-14 21:56:31.073576
41	3	10	34	2g	30.00	2026-06-14 21:56:31.073576
42	5	11	34	2g	30.00	2026-06-14 21:56:31.073576
43	5	13	1	1g	30.00	2026-06-17 13:21:54.279055
44	5	13	1	2g	55.00	2026-06-17 13:21:54.279055
45	6	14	1	1g	30.00	2026-06-17 13:58:50.956011
46	6	14	1	2g	55.00	2026-06-17 13:58:50.956011
47	6	14	34	2g	30.00	2026-06-17 13:59:38.425537
\.


--
-- Data for Name: bot_product_types; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.bot_product_types (id, name, emoji, created_at) FROM stdin;
1	Krilai	💎	2026-05-14 11:05:03.214672
35	Snaigės	❄️	2026-05-14 20:27:31.864054
34	Rukalas	🍀	2026-05-14 19:45:38.960456
\.


--
-- Data for Name: bot_products; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.bot_products (id, city_id, district_id, type_id, size, price, content, file_id, file_type, status, reserved_by, reserved_until, added_by, worker_tag, media_files, created_at) FROM stdin;
55	5	11	1	1g	30.00	\N	AgACAgQAAxkBAAPXai8llTr2Z7hPex8sGhgTVDtMryAAAvQOaxuZaXhRTezKNv2uNRMBAAMCAAN5AAM8BA	photo	sold	\N	\N	8725051269	savaszmogus	\N	2026-06-14 22:15:21.123168
56	5	11	1	1g	30.00	\N	AgACAgQAAxkBAAPzai8oMp8kLMP98O-xlhMJHonBe9gAAvgOaxuZaXhRK13t2AoAAdHvAQADAgADeAADPAQ	photo	sold	\N	\N	8725051269	savaszmogus	[{"fileId":"dede","fileType":"text"},{"fileId":"/done","fileType":"text"}]	2026-06-14 22:16:19.11125
57	5	11	1	1g	30.00	\N	AgACAgQAAxkBAAPkai8l4GF8rCY84fnzGCx5TwAB_areAAKfDmsbCEJ4UTNVxEJcw0WyAQADAgADeQADPAQ	photo	sold	\N	\N	8273673238	pinokis666	[{"fileId":"56,0462893, 24,3689428","fileType":"text"},{"fileId":"/done","fileType":"text"}]	2026-06-14 22:18:34.583817
59	4	5	1	1g	30.00	\N	AgACAgQAAxkBAAIBGWovKgiBtmjUJrPaFsroZjX9NStyAAKjDmsbCEJ4UWG6_oZQpBSRAQADAgADeQADPAQ	photo	available	\N	\N	8273673238	pinokis666	[{"fileId":"55°17′13.13″N, 23°57′42.83″E","fileType":"text"}]	2026-06-14 22:24:08.30575
48	4	5	1	1g	12.00	.	\N	text	sold	\N	\N	8725051269	savaszmogus	\N	2026-06-14 21:09:37.481923
49	5	11	1	1g	30.00	\N	AgACAgQAAxkBAAOfai8hWmodKZ-UeTDUJ1-xX9REu2gAAkwOaxvYE5hQLYbdPhRfMUIBAAMCAAN5AAM8BA	photo	sold	\N	\N	8273673238	pinokis666	\N	2026-06-14 21:47:06.706098
50	5	11	1	1g	30.00	56,0462893, 24,3689428	\N	text	sold	\N	\N	8273673238	pinokis666	\N	2026-06-14 21:47:06.725834
51	5	11	1	1g	30.00	\N	AgACAgQAAxkBAAOfai8hWmodKZ-UeTDUJ1-xX9REu2gAAkwOaxvYE5hQLYbdPhRfMUIBAAMCAAN5AAM8BA	photo	sold	\N	\N	8273673238	pinokis666	\N	2026-06-14 22:01:23.091364
52	5	11	1	1g	30.00	56,0462893, 24,3689428	\N	text	sold	\N	\N	8273673238	pinokis666	\N	2026-06-14 22:01:23.131791
53	5	11	1	1g	30.00	\N	AgACAgQAAxkBAAPXai8llTr2Z7hPex8sGhgTVDtMryAAAvQOaxuZaXhRTezKNv2uNRMBAAMCAAN5AAM8BA	photo	sold	\N	\N	8725051269	savaszmogus	\N	2026-06-14 22:05:09.79647
60	3	10	34	2g	30.00	\N	AgACAgQAAxkBAAIBImovKmGc7TRoOZ2vmxEXarR6pBNWAAKkDmsbCEJ4UfHYbvaXMO2YAQADAgADeQADPAQ	photo	available	\N	\N	8273673238	pinokis666	[{"fileId":"55°54′32.26″N, 23°17′10.68″E","fileType":"text"}]	2026-06-14 22:25:37.302824
54	5	11	1	1g	30.00	\N	AgACAgQAAxkBAAPkai8l4GF8rCY84fnzGCx5TwAB_areAAKfDmsbCEJ4UTNVxEJcw0WyAQADAgADeQADPAQ	photo	sold	\N	\N	8273673238	pinokis666	[{"fileId":"56,0462893, 24,3689428","fileType":"text"}]	2026-06-14 22:06:24.474747
68	2	6	1	1g	30.00	\N	AgACAgEAAxkBAAIER2owKbQOLxOSDBvtjFucRBlTTG6FAAIoDGsbM2iBRSAkXg-TclfTAQADAgADeQADPAQ	photo	sold	\N	\N	8725051269	SAINTGERMAINNV	\N	2026-06-16 21:17:29.698184
63	2	9	34	2g	30.00	\N	AgACAgEAAxkBAAIFiGoxijJkPHKjQ9LbhdA72mTLaceyAALIDGsbAAHSiEXPl3E4AXIzOQEAAwIAA3kAAzwE	photo	sold	\N	\N	8725051269	SAINTGERMAINNV	\N	2026-06-16 21:17:29.155695
64	2	9	34	2g	30.00	\N	AgACAgEAAxkBAAIFqWoxi13BE1BEtw2yONQonx47mSzNAALNDGsbAAHSiEUf9Chc6snQhQEAAwIAA3kAAzwE	photo	sold	\N	\N	8725051269	SAINTGERMAINNV	\N	2026-06-16 21:17:29.264542
65	2	9	34	2g	30.00	\N	AgACAgEAAxkBAAIFomoxixZePgWu6Lj0fA3xc5OWdAABjQACzAxrGwAB0ohFyMcrTwpB5XUBAAMCAAN5AAM8BA	photo	sold	\N	\N	8725051269	SAINTGERMAINNV	\N	2026-06-16 21:17:29.373693
66	2	9	34	2g	30.00	\N	AgACAgEAAxkBAAIFlmoxirfRBupNecAfGaa7sdEOfIxYAALLDGsbAAHSiEX4NGvmQ7cWQgEAAwIAA3kAAzwE	photo	sold	\N	\N	8725051269	SAINTGERMAINNV	\N	2026-06-16 21:17:29.481985
67	2	9	34	2g	30.00	\N	AgACAgEAAxkBAAIFj2oxim25kGgd02nRump5bNp97XmMAALJDGsbAAHSiEVJeYkHxfsYYwEAAwIAA3kAAzwE	photo	sold	\N	\N	8725051269	SAINTGERMAINNV	\N	2026-06-16 21:17:29.589976
69	2	6	1	1g	30.00	\N	AgACAgEAAxkBAAIEYWowKrei0CLjn3JjRbKwOLcgA_MTAAInDGsbM2iBRY2-GcoD04L4AQADAgADeQADPAQ	photo	sold	\N	\N	8725051269	SAINTGERMAINNV	\N	2026-06-16 21:17:29.806133
70	2	6	1	2g	55.00	\N	AgACAgEAAxkBAAIEWmowKnGJJ-vpAAGpHnisOlzLMD4RUwACJgxrGzNogUW_YAodiW9LrwEAAwIAA3kAAzwE	photo	sold	\N	\N	8725051269	SAINTGERMAINNV	\N	2026-06-16 21:17:29.914161
71	2	6	1	2g	55.00	\N	AgACAgEAAxkBAAIEUGowKiHiL9SKN0IdydN3eNWo-QLXAAIkDGsbM2iBRXaCBDFbiiR6AQADAgADeQADPAQ	photo	sold	\N	\N	8725051269	SAINTGERMAINNV	\N	2026-06-16 21:17:30.022094
72	2	6	1	2g	55.00	\N	AgACAgEAAxkDAAIG-moxsmB-3UWJWGSXK-e2EUNoXbZVAAIkDGsbM2iBRXaCBDFbiiR6AQADAgADeQADPAQ	photo	sold	\N	\N	8273673238	pinokis666	[{"fileId":"(55.7109157, 24.3714678) 2kr kur pazymeta po paralonu padėta","fileType":"text"}]	2026-06-16 21:42:23.399402
77	2	6	1	2g	55.00	\N	AgACAgEAAxkDAAIG-moxsmB-3UWJWGSXK-e2EUNoXbZVAAIkDGsbM2iBRXaCBDFbiiR6AQADAgADeQADPAQ	photo	available	\N	\N	8273673238	pinokis666	[{"fileId":"(55.7109157, 24.3714678) 2kr kur pazymeta po paralonu padėta","fileType":"text"}]	2026-06-16 21:56:11.181192
75	2	6	1	1g	30.00	\N	AgACAgEAAxkDAAIIL2oxvhJdzwYHuZ9UNYfIBcAJc3h0AAImDGsbM2iBRb9gCh2Jb0uvAQADAgADeQADPAQ	photo	sold	\N	\N	8273673238	pinokis666	[{"fileId":"(55.7102355, 24.3720686) 1kr pakasta kur pazymeta","fileType":"text"}]	2026-06-16 21:47:58.934787
73	2	6	1	2g	55.00	(55.7102355, 24.3720686) 1kr pakasta kur pazymeta	\N	text	sold	\N	\N	8273673238	pinokis666	\N	2026-06-16 21:46:15.518522
76	2	6	1	1g	30.00	\N	AgACAgEAAxkDAAIIN2oxwJ_2KG4mrmaLDCgLN9r028H_AAInDGsbM2iBRY2-GcoD04L4AQADAgADeQADPAQ	photo	sold	\N	\N	8273673238	pinokis666	[{"fileId":"(55.7104760, 24.3719693) 1kr pakastas kur pazymeta","fileType":"text"}]	2026-06-16 21:49:44.729928
74	2	6	1	2g	55.00	\N	AgACAgEAAxkDAAIIL2oxvhJdzwYHuZ9UNYfIBcAJc3h0AAImDGsbM2iBRb9gCh2Jb0uvAQADAgADeQADPAQ	photo	sold	\N	\N	8273673238	pinokis666	\N	2026-06-16 21:46:15.52284
78	2	6	1	2g	55.00	\N	AgACAgEAAxkDAAIIL2oxvhJdzwYHuZ9UNYfIBcAJc3h0AAImDGsbM2iBRb9gCh2Jb0uvAQADAgADeQADPAQ	photo	available	\N	\N	8273673238	pinokis666	[{"fileId":"(55.7110184, 24.3711932) 2kr prie medžio pakasta kur pazymeta","fileType":"text"}]	2026-06-16 21:57:10.801295
62	5	11	1	1g	30.00	56.046289, 24.368943	\N	text	sold	\N	\N	8273673238	pinokis666	\N	2026-06-16 20:45:32.715964
80	2	6	1	1g	30.00	\N	AgACAgEAAxkDAAIF3Woxj7ZZ9sTOuqEtjtBBmyfvTZugAAIoDGsbM2iBRSAkXg-TclfTAQADAgADeQADPAQ	photo	available	\N	\N	8273673238	pinokis666	[{"fileId":"(55.7104760, 24.3719693) 1kr pakastas kur pazymeta","fileType":"text"}]	2026-06-16 21:59:05.219889
79	2	6	1	1g	30.00	\N	AgACAgEAAxkDAAIIN2oxwJ_2KG4mrmaLDCgLN9r028H_AAInDGsbM2iBRY2-GcoD04L4AQADAgADeQADPAQ	photo	sold	\N	\N	8273673238	pinokis666	[{"fileId":"(55.7102355, 24.3720686) 1kr pakasta kur pazymeta","fileType":"text"}]	2026-06-16 21:57:53.476249
83	2	9	34	2g	30.00	\N	AgACAgEAAxkBAAIJeGoxx7PXDjQymQxqu1-NmJctnDOjAAL5C2sbM2iRRZcQbPQ8mDIiAQADAgADeQADPAQ	photo	available	\N	\N	8273673238	pinokis666	[{"fileId":"(55.7381729, 24.4096513) 2cherry","fileType":"text"}]	2026-06-16 22:01:23.343281
61	3	10	1	1g	30.00	\N	AgACAgQAAxkBAAIBKWovKrCnYlWns5-owWiIZj2gRf3KAAKlDmsbCEJ4UQHi8Nf9tOJEAQADAgADeQADPAQ	photo	sold	\N	\N	8273673238	pinokis666	[{"fileId":"55°54′33.17″N, 23°17′08.03″E","fileType":"text"}]	2026-06-14 22:26:56.971669
81	2	9	34	2g	30.00	\N	AgACAgEAAxkBAAIJZmoxx2Pq4Zf6yLVCKF9pcFmbny0uAAL2C2sbM2iRRS4ndAL6hKf7AQADAgADeQADPAQ	photo	sold	\N	\N	8273673238	pinokis666	[{"fileId":"(55.7376170, 24.4096866) 2cherry","fileType":"text"}]	2026-06-16 22:00:04.367679
58	4	5	34	2g	30.00	\N	AgACAgQAAxkBAAIBEmovKYWc-W-Mt8exgHbv_M_NAV69AAKiDmsbCEJ4UVa26zFC4oUaAQADAgADeQADPAQ	photo	sold	\N	\N	8273673238	pinokis666	[{"fileId":"55°17′11.72″N, 23°57′40.26″E","fileType":"text"}]	2026-06-14 22:21:57.670953
82	2	9	34	2g	30.00	\N	AgACAgEAAxkBAAIJb2oxx477tMsjh1pJP2D7Lkp6MsICAAL3C2sbM2iRReE1CiwCOFBiAQADAgADeQADPAQ	photo	sold	\N	\N	8273673238	pinokis666	[{"fileId":"(55.7381637, 24.4093794) 2cherry","fileType":"text"}]	2026-06-16 22:00:46.498851
84	2	9	34	2g	30.00	\N	AgACAgEAAxkBAAIJgWoxx9um-_c_xN1GcpDXDTGisr_CAAL6C2sbM2iRRdKnRLK0S_oTAQADAgADeQADPAQ	photo	available	\N	\N	8273673238	pinokis666	[{"fileId":"(55.7383351, 24.4098881) 2cherry","fileType":"text"}]	2026-06-16 22:02:03.750261
85	2	9	34	2g	30.00	\N	AgACAgEAAxkBAAIJimoxyAL-ehvAuIxQim0-5k7V9vEeAAL7C2sbM2iRRU6qGY9MZ9eJAQADAgADeQADPAQ	photo	available	\N	\N	8273673238	pinokis666	[{"fileId":"(55.7375521, 24.4090432) 2cherry","fileType":"text"}]	2026-06-16 22:02:42.243043
107	3	10	34	2g	30.00	\N	AgACAgQAAxkBAAIOeWozFknopCGIXXcWxA6cFu1pnxgHAAKvEGsbEe5RUdeYsCR2KjmQAQADAgADeQADPAQ	photo	available	\N	\N	8273673238	pinokis666	[{"fileId":"55,9088579, 23,2855184","fileType":"text"}]	2026-06-17 21:48:57.83363
91	5	11	1	1g	30.00	\N	AgACAgQAAxkBAAILHmoyoPLG5sZWYv2rTUn4ne2EuT-CAAIaD2sbMPOZUWWUFH7F2IXoAQADAgADeQADPAQ	photo	sold	\N	\N	8273673238	pinokis666	[{"fileId":"56,0449641, 24,3789146","fileType":"text"}]	2026-06-17 13:28:18.971953
88	5	13	1	2g	55.00	\N	AgACAgQAAxkBAAIK_moyoAFKcXie6RZ4KBdOE4m-P9MCAAIRD2sbMPOZUXq1LwLr1RubAQADAgADeQADPAQ	photo	available	\N	\N	8273673238	pinokis666	[{"fileId":"56,0549560, 24,3909034","fileType":"text"}]	2026-06-17 13:24:18.359351
89	5	13	1	2g	55.00	\N	AgACAgQAAxkBAAILB2oyoGyJHGA-GSUr6J3QvJb1lyNKAAITD2sbMPOZUYi16zxyImsBAQADAgADeQADPAQ	photo	available	\N	\N	8273673238	pinokis666	[{"fileId":"56,0550287, 24,3908548","fileType":"text"}]	2026-06-17 13:26:04.582703
90	5	13	1	2g	55.00	\N	AgACAgQAAxkBAAILEGoyoI_hGYuM9AtSbpf76X81GINnAAIUD2sbMPOZUaUQWuxHXZ8fAQADAgADeQADPAQ	photo	available	\N	\N	8273673238	pinokis666	[{"fileId":"56,0553541, 24,3905393","fileType":"text"}]	2026-06-17 13:26:40.203105
92	5	11	1	1g	30.00	\N	AgACAgQAAxkBAAILJ2oyoR2xp7h_nrW5ni1rFp_WrqljAAIcD2sbMPOZURrIM8CS_hMEAQADAgADeQADPAQ	photo	available	\N	\N	8273673238	pinokis666	[{"fileId":"56,0450240, 24,3790252","fileType":"text"}]	2026-06-17 13:29:01.975411
94	5	11	34	2g	30.00	\N	AgACAgQAAxkBAAILPGoyofu1nu2egp29YAomdgv0oHCmAAJmD2sbMPOZUdq_V_mKBxEUAQADAgADeQADPAQ	photo	available	\N	\N	8273673238	pinokis666	[{"fileId":"56,0462794, 24,3774290","fileType":"text"}]	2026-06-17 13:32:43.69117
95	5	11	34	2g	30.00	\N	AgACAgQAAxkBAAILRWoyokegPWuvNxcH5FJFta7l0CaKAAJkD2sbMPOZUfFkuuRoYzVwAQADAgADeQADPAQ	photo	available	\N	\N	8273673238	pinokis666	[{"fileId":"56,0460073, 24,3776154","fileType":"text"}]	2026-06-17 13:34:00.005554
96	6	14	1	1g	30.00	\N	AgACAgQAAxkBAAILYGoyqJoLl5vWCovhDbb-8OY0tJ5SAALNEWsb_ruZUbHy6gNHw_lLAQADAgADeQADPAQ	photo	available	\N	\N	8273673238	pinokis666	[{"fileId":"55.249550,24.788887","fileType":"text"}]	2026-06-17 14:00:59.151315
97	6	14	34	2g	30.00	\N	AgACAgQAAxkBAAILaWoyqQhDfq8w-uoay4CjGlx_dzoDAALFEWsb_ruZURQRhOdmOvbOAQADAgADeQADPAQ	photo	available	\N	\N	8273673238	pinokis666	[{"fileId":"55.249556,24.789204","fileType":"text"}]	2026-06-17 14:02:49.292121
98	6	14	34	2g	30.00	\N	AgACAgQAAxkBAAILcmoyqV6FQYsQsUplo9XqqY4icw6PAALaEWsb_ruZUTQunRYzlMbDAQADAgADeQADPAQ	photo	available	\N	\N	8273673238	pinokis666	[{"fileId":"55.241091,24.802274","fileType":"text"}]	2026-06-17 14:04:14.502011
99	6	14	1	1g	30.00	\N	AgACAgQAAxkBAAILe2oyqapYz25trOCgb8JdWAa3MJ65AALfEWsb_ruZURARi3GHDEEDAQADAgADeQADPAQ	photo	available	\N	\N	8273673238	pinokis666	[{"fileId":"55.240396,24.804647","fileType":"text"}]	2026-06-17 14:05:31.122909
93	5	11	34	2g	30.00	\N	AgACAgQAAxkBAAILM2oyoYZVs8N2WtYVcIK9DEtMj-6IAAJpD2sbMPOZUVwOFIcthQtLAQADAgADeQADPAQ	photo	sold	\N	\N	8273673238	pinokis666	[{"fileId":"56,0463599, 24,3775480","fileType":"text"}]	2026-06-17 13:30:46.396845
100	5	11	34	2g	30.00	\N	AgACAgQAAxkBAAIMO2oy6hB7xviOyEY2zByXP3TiFW0-AAJGD2sbMPOZUTWiDJTyolFSAQADAgADeQADPAQ	photo	available	\N	\N	8273673238	pinokis666	[{"fileId":"56,0453317, 24,3786219","fileType":"text"}]	2026-06-17 18:40:16.948629
101	4	5	1	1g	30.00	\N	AgACAgQAAxkBAAIMW2oy7WzJBx4ydzXuXyBm8oLud8UgAAJcD2sbvxZYUb7uDlw9BN_tAQADAgADeQADPAQ	photo	available	\N	\N	8273673238	pinokis666	[{"fileId":"55,2866587, 23,9645793","fileType":"text"}]	2026-06-17 18:54:36.594621
102	5	11	34	2g	30.00	\N	AgACAgQAAxkBAAILM2oyoYZVs8N2WtYVcIK9DEtMj-6IAAJpD2sbMPOZUVwOFIcthQtLAQADAgADeQADPAQ	photo	available	\N	\N	8273673238	pinokis666	[{"fileId":"56,0463599, 24,3775480","fileType":"text"}]	2026-06-17 19:31:48.924886
86	3	10	1	1g	30.00	\N	AgACAgQAAxkBAAIKBWoyQI2KhymgGaNd6KoAAcPxdANVHgACyBBrGxHuUVF-rXuvKEDongEAAwIAA3kAAzwE	photo	sold	\N	\N	8273673238	pinokis666	[{"fileId":"55,9097216, 23,2849880","fileType":"text"}]	2026-06-17 06:37:01.830457
103	3	10	1	1g	30.00	\N	AgACAgQAAxkBAAINAWozBM5F_Y1Xp2ToWz80twdx-kNVAAK_EGsbEe5RUf7E32eIRjAJAQADAgADeQADPAQ	photo	available	\N	\N	8273673238	pinokis666	[{"fileId":"55,9094301, 23,2858396","fileType":"text"}]	2026-06-17 20:34:23.534455
87	5	13	1	2g	55.00	\N	AgACAgQAAxkBAAIK8moyn6o8uxswrotr7RPW1p3134-IAAIJD2sbMPOZUb8mz6l-GOcRAQADAgADeQADPAQ	photo	sold	\N	\N	8273673238	pinokis666	[{"fileId":"56,0567990, 24,3771433","fileType":"text"}]	2026-06-17 13:22:50.4885
104	3	10	1	1g	30.00	\N	AgACAgQAAxkBAAINs2ozDiswmwi1CKzuiWlubOx0c0dxAALAEGsbEe5RUVEkJG0-auUyAQADAgADeQADPAQ	photo	available	\N	\N	8273673238	pinokis666	[{"fileId":"55,9094433, 23,2857776","fileType":"text"}]	2026-06-17 21:14:19.823233
105	3	10	1	1g	30.00	\N	AgACAgQAAxkBAAINvGozDlZ-dPHfp8ojT4oZ_NP79xb1AALCEGsbEe5RUciWFZT8ZopuAQADAgADeQADPAQ	photo	available	\N	\N	8273673238	pinokis666	[{"fileId":"55,9092452, 23,2854373","fileType":"text"}]	2026-06-17 21:15:03.087353
106	3	10	1	1g	30.00	\N	AgACAgQAAxkBAAINyWozDoFbR5awgUINkkUhsKev1XIJAALDEGsbEe5RUdo68J8sSmlEAQADAgADeQADPAQ	photo	available	\N	\N	8273673238	pinokis666	[{"fileId":"55,9091567, 23,2853099","fileType":"text"}]	2026-06-17 21:15:45.435149
\.


--
-- Data for Name: bot_purchases; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.bot_purchases (id, queue_id, user_id, product_id, price_paid, discount_code_used, payment_method, refunded, created_at, tx_signature, sender_wallet) FROM stdin;
1	CDCB1C000393	8725051269	1	21.00	\N	balance	t	2026-05-14 11:06:10.013728	\N	\N
34	90A46F2479B9	8725051269	40	80.00	\N	balance	t	2026-05-14 20:29:34.427292	\N	\N
35	DF6930B6719B	8725051269	34	21.00	\N	balance	t	2026-05-29 09:21:33.634393	\N	\N
36	0E6F8C16D204	8278242200	44	80.00	\N	balance	f	2026-05-29 10:43:50.785184	\N	\N
37	B9DBD96C7F6C	8725051269	46	22.00	\N	balance	t	2026-06-05 06:16:26.906971	\N	\N
38	F9687183694B	8725051269	49	30.00	\N	balance	f	2026-06-14 21:50:01.237384	\N	\N
39	BDF1775CC71D	8725051269	50	30.00	\N	balance	f	2026-06-14 21:51:00.22292	\N	\N
40	5E04EB78D49C	8725051269	51	30.00	\N	balance	f	2026-06-14 22:02:48.804084	\N	\N
41	CF933CDE9878	8725051269	52	30.00	\N	balance	f	2026-06-14 22:03:01.235884	\N	\N
42	FFBDA5CBF28D	8725051269	53	30.00	\N	balance	f	2026-06-14 22:06:05.05767	\N	\N
43	4222CACC8FA7	8725051269	54	30.00	\N	balance	f	2026-06-14 22:07:17.376484	\N	\N
44	3157E80B7113	8725051269	55	30.00	\N	balance	f	2026-06-14 22:15:33.731336	\N	\N
45	D810C54C5BE8	8725051269	56	30.00	\N	balance	f	2026-06-14 22:16:40.761725	\N	\N
46	14D895D66090	8725051269	57	30.00	\N	balance	f	2026-06-14 22:18:44.470893	\N	\N
47	04A3838B4F18	8725051269	68	30.00	\N	balance	f	2026-06-16 21:18:29.375454	\N	\N
48	68D01F69A993	8725051269	63	30.00	\N	balance	f	2026-06-16 21:37:14.195553	\N	\N
49	02C402EB05A3	8725051269	64	28.50	\N	balance	f	2026-06-16 21:37:26.664172	\N	\N
50	3BD0A382AB09	8725051269	65	28.50	\N	balance	f	2026-06-16 21:37:40.360682	\N	\N
51	388A672D46DD	8725051269	66	28.50	\N	balance	f	2026-06-16 21:38:24.486955	\N	\N
52	B81DA61B159D	8725051269	67	28.50	\N	balance	f	2026-06-16 21:38:39.956316	\N	\N
53	5B5637F28B16	8725051269	69	28.50	\N	balance	f	2026-06-16 21:38:54.627047	\N	\N
54	A31E4A6C80BC	8725051269	70	52.25	\N	balance	f	2026-06-16 21:39:08.558485	\N	\N
55	01003774E20F	8725051269	71	52.25	\N	balance	f	2026-06-16 21:39:55.013758	\N	\N
56	B3F8167DF4BC	8725051269	72	52.25	\N	balance	f	2026-06-16 21:44:02.338963	\N	\N
57	32DF292A2A35	8725051269	75	40.38	\N	balance	f	2026-06-16 21:53:43.08744	\N	\N
58	BA4991655EDD	8725051269	73	40.38	\N	balance	f	2026-06-16 21:53:43.193511	\N	\N
59	6F28BB80188B	8725051269	76	40.38	\N	balance	f	2026-06-16 21:54:11.425728	\N	\N
60	702104335D6F	8725051269	74	40.38	\N	balance	f	2026-06-16 21:54:11.535439	\N	\N
61	2BED6EA092D8	6913860260	61	30.00	\N	sol	f	2026-06-17 01:20:42.498627	52kMSCS86Roop5K6LLPneXVUx8NAeuojGrtrGYrcYqstov5FQyvws64LVVW6x8wkufbm4YnHYXQokH1Jme4kGAjJ	\N
62	14EFB6082C06	1929796123	81	30.00	\N	sol	f	2026-06-17 08:56:28.68598	58ZW6pimB2wXboxooenMWTZy3Ndes5tQHLo7jZBLfCmfskeRArxbDNZPNpkkaqvE4DbY1BzfTd3UvVbPrrpXYvHc	\N
63	B5398608E900	8135297519	93	30.00	\N	sol	f	2026-06-17 18:28:13.420111	jHwgjw9fPr7sML7Gsd4rvPVv6xsyVUVQLbpt32vhCQLkcWzZwXWc3r4ftdGBSAcGcXrvhAMmCvZRksFQTEGemcD	\N
64	D888539ED563	8708986712	79	27.00	PSG	sol	f	2026-06-17 18:36:08.708182	45XfkEU6dgbmCMRNNsK5GfHCQTQt1dLa2mo4dqqvbMUuHrU67ZLFWr9PwBsv97FhGTc6ufiecig7cdPdHEbFBoaa	\N
65	EA3FEEDA14BA	8725051269	86	28.50	\N	balance	f	2026-06-17 20:32:00.28592	\N	\N
66	4F8065218302	5262239053	87	49.50	PSG	sol	f	2026-06-17 20:36:28.867644	U4tn7i253GRmEmAYAo7ttqCf5C6fR8km3d1jCftCPM4XVxGH3v7wMspVuNYCXpLkvu9RcTBJmuEfUwBrENuCG5n	3jnRpBrGwhE82jpMN1FffShtKBRbrcbjo6rT5jt7ykJ1
67	AA43F99ABA01	8725051269	62	28.50	\N	balance	f	2026-06-17 22:20:39.810607	\N	\N
68	D0448A85870F	8725051269	91	28.50	\N	balance	f	2026-06-17 22:22:02.935232	\N	\N
69	2052DD641657	7639594163	58	27.00	PSG	sol	f	2026-06-17 22:53:59.780377	wmm75bdvdvqTC223LJC8vaH4zQuXSApovrmF4CFWRsWnxK9orTdisSEYgHQzJgB6VHvj5s2ojPDueygt1ABdZKJ	5iGMgTnhnCg9iqZ1fGfi8gw3kwPtHYLHih6m6reFj4Md
70	881D7459B38C	6080324727	82	30.00	\N	sol	f	2026-06-18 08:08:31.316756	4q1UvvQsArJNnJ5EA4np2FqhPzoqLn6kTDFLpFB1ttAuoHRXbqKcKUZdM1aTJPm6ytRfvwA5PEpnPkJJEqsvgmji	Dm6ChVKE5RKK2S8CXx6kohNB23vhFjwozttJuw5j3yEz
\.


--
-- Data for Name: bot_reseller_discounts; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.bot_reseller_discounts (id, city_id, district_id, type_id, size, percent_off, created_at) FROM stdin;
\.


--
-- Data for Name: bot_reviews; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.bot_reviews (id, user_id, username, text, created_at) FROM stdin;
3	8725051269	savaszmogus	labas	2026-05-14 20:26:28.590448
4	8708986712	euforiskasis	lobis rastas	2026-06-17 19:15:01.324398
5	6913860260	spaceblack666	Geriausias boto administratorius, labai greitai padėjo išspręsti mano problemą, patariu visiems pirkti tik čia👌🏽❤️🫡	2026-06-17 20:35:43.624214
6	6913860260	spaceblack666	Geriausias boto administratorius, labai greitai padėjo išspręsti mano problemą, patariu visiems pirkti tik čia👌🏽❤️🫡	2026-06-17 20:36:40.11437
7	5262239053	Kubils342	Pirma kart jėmiau per bota viskas paėjo ahjn nusiskundimu 0 ačiū mirla malonu	2026-06-17 20:47:23.657564
8	7769771713	DumaiZjbs	Zjbs loc lengvai radau kr zjbs ipisi ir buni kaip naujagimis😆😂🫡	2026-06-17 23:33:30.911968
\.


--
-- Data for Name: bot_settings; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.bot_settings (key, value) FROM stdin;
sol_wallet	9cuWfNTS3qJMkuKKdCaqkX9urVzdQMKY9qvFxMtK6iZi
home_media_file_id	AgACAgQAAxkBAAPzai8oMp8kLMP98O-xlhMJHonBe9gAAvgOaxuZaXhRK13t2AoAAdHvAQADAgADeAADPAQ
home_media_type	photo
\.


--
-- Data for Name: bot_tier_discount_rules; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.bot_tier_discount_rules (id, tier_name, city_id, district_id, type_id, size, percent_off) FROM stdin;
\.


--
-- Data for Name: bot_tier_levels; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.bot_tier_levels (id, name, threshold, global_discount_percent) FROM stdin;
1	New	0	0
2	Regular	5	0
3	VIP	15	5
4	Legend	30	10
\.


--
-- Data for Name: bot_tier_settings; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.bot_tier_settings (id, metric) FROM stdin;
1	purchase_count
\.


--
-- Data for Name: bot_topup_invoices; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.bot_topup_invoices (id, user_id, eur_amount, sol_amount, status, tx_signature, created_at, expires_at) FROM stdin;
1	8725051269	20.00	0.251319000	cancelled	\N	2026-05-14 19:57:32.430748	2026-05-14 20:27:32.426
2	8725051269	10.00	0.125660000	cancelled	\N	2026-05-14 19:57:43.351643	2026-05-14 20:27:43.349
3	8725051269	5.00	0.062846000	cancelled	\N	2026-05-14 19:59:44.976508	2026-05-14 20:29:44.974
34	8725051269	5.00	0.062941000	cancelled	\N	2026-05-14 20:19:09.813	2026-05-14 20:49:09.81
35	8725051269	5.00	0.063710000	cancelled	\N	2026-05-15 07:37:58.931682	2026-05-15 08:07:58.922
36	8725051269	5.00	0.063492000	cancelled	\N	2026-05-15 07:57:47.822313	2026-05-15 08:27:47.819
37	8906343709	50.00	0.705716000	pending	\N	2026-05-29 09:32:06.296242	2026-05-29 10:02:06.292
38	8725051269	10.00	0.142005000	cancelled	\N	2026-05-30 09:03:30.307646	2026-05-30 09:33:30.302
40	8725051269	2.00	0.034264000	cancelled	\N	2026-06-14 20:00:50.543904	2026-06-14 20:30:50.541
39	8235754313	2.00	0.034264000	completed	QKE954E6HSmy5f52zsNL5yeS3EJJFjqobeiARzLTMmaaoMMCygQDfRaH7tckGMx1oZYi6AVvJuCs7YwDgtQpU9A	2026-06-14 19:59:46.740418	2026-06-14 20:29:46.568
41	8725051269	1.00	0.017047000	cancelled	\N	2026-06-14 20:52:15.52681	2026-06-14 21:22:15.524
42	8725051269	1.00	0.017047000	completed	5ciL5vrwisU6vccgMqMHJzN7Nr2cCADFHNhVNdCeon2DgpqaUadstrQD4VSy3rREmP8pdL3KTRdpxSZP7b5ViEEU	2026-06-14 20:55:03.868719	2026-06-14 21:25:03.864
43	8725051269	2.00	0.032541000	cancelled	\N	2026-06-15 06:50:22.699678	2026-06-15 07:20:22.672
44	8135297519	60.00	0.941767000	cancelled	\N	2026-06-17 16:57:43.522091	2026-06-17 17:27:43.481
45	8135297519	60.00	0.942803000	cancelled	\N	2026-06-17 17:32:24.702643	2026-06-17 18:02:24.656
46	8135297519	35.00	0.549969000	cancelled	\N	2026-06-17 17:35:21.519178	2026-06-17 18:05:21.483
\.


--
-- Data for Name: bot_users; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.bot_users (id, telegram_id, username, first_name, balance, is_banned, is_reseller, purchase_count, eur_spent, tier_name, created_at, last_active_at) FROM stdin;
2	8746917099	Yoliukasz	Yolas	0.00	f	f	0	0.00	New	2026-05-14 19:48:48.702963	2026-06-15 14:18:03.187672
3	8745952663	wadiyatalkin	Pavasarelis	0.00	f	f	0	0.00	New	2026-05-15 08:08:45.655239	2026-06-15 14:18:03.187672
21	2026860592	geriartric	Geriartric	0.00	f	f	0	0.00	New	2026-06-14 22:31:30.690259	2026-06-15 14:18:03.187672
5	8278242200	vietinis98	Yolas	0.00	f	f	1	80.00	New	2026-05-29 10:40:52.462286	2026-06-15 14:18:03.187672
22	8441225758	ItsShelbyHere	Thomas	0.00	f	f	0	0.00	New	2026-06-14 22:32:10.753464	2026-06-15 14:18:03.187672
23	8891360638	lengvamatematika	Rolandas	0.00	f	f	0	0.00	New	2026-06-14 22:32:22.915746	2026-06-15 14:18:03.187672
9	5832442791	sponkes	Šponkės	0.00	f	f	0	0.00	New	2026-06-14 20:40:37.159689	2026-06-15 14:18:03.187672
10	7291263727	uznorfos	Norfos Kasininkė	0.00	f	f	0	0.00	New	2026-06-14 20:43:04.335979	2026-06-15 14:18:03.187672
12	8576698851	Entuziastas42	Crypto Entuziastas	0.00	f	f	0	0.00	New	2026-06-14 20:47:19.451775	2026-06-15 14:18:03.187672
24	8244107998	nelegaliai	999	0.00	f	f	0	0.00	New	2026-06-14 22:33:38.479207	2026-06-15 14:18:03.187672
18	8286602907	co1las	Hydra_Pilot	0.00	f	f	0	0.00	New	2026-06-14 21:19:26.826838	2026-06-15 14:18:03.187672
26	8736014243	tonyss123	Tonys	0.00	f	f	0	0.00	New	2026-06-14 22:35:47.987171	2026-06-15 14:18:03.187672
27	7970886971	ix1une	Ixas	0.00	f	f	0	0.00	New	2026-06-14 22:39:04.601343	2026-06-15 14:18:03.187672
28	8204825769	Dzigidzigi1	Jaronimas	0.00	f	f	0	0.00	New	2026-06-14 22:41:05.858361	2026-06-15 14:18:03.187672
61	6911209854	Ledinuks	Ledi	0.00	f	f	0	0.00	New	2026-06-15 06:42:26.686831	2026-06-15 14:18:03.187672
62	8054086909	eccv1	&&	0.00	f	f	0	0.00	New	2026-06-15 06:45:19.512003	2026-06-15 14:18:03.187672
63	8321456023	Microvienas	Adrián Mills	0.00	f	f	0	0.00	New	2026-06-15 07:15:44.3938	2026-06-15 14:18:03.187672
72	8674161955	SiaurinisV4	SIAURINIS	0.00	f	f	0	0.00	New	2026-06-16 21:58:21.404774	2026-06-18 08:44:22.92
8	8273673238	pinokis666	Pinokis666	0.00	f	f	0	0.00	New	2026-06-14 20:40:35.255505	2026-06-18 06:27:52.193
84	982540677	ragnarloftbryk	Ragnarok	0.00	f	f	0	0.00	New	2026-06-17 06:44:31.446501	2026-06-18 07:49:59.164
83	7114652380	loch270	Arvydas	0.00	f	f	0	0.00	New	2026-06-17 06:24:44.427082	2026-06-17 08:14:15.952
71	6299291651	minimohaha	Minimo	0.00	f	f	0	0.00	New	2026-06-16 21:31:15.331901	2026-06-17 21:34:04.508
96	8359984580	\N	Bahas	0.00	f	f	0	0.00	New	2026-06-17 09:24:58.066672	2026-06-18 09:06:43.009
4	8906343709	\N	Mamacita	0.00	f	f	0	0.00	New	2026-05-29 08:59:32.996048	2026-06-17 22:46:37.529
66	1840011562	spjk0	.	0.00	f	f	0	0.00	New	2026-06-16 20:44:30.63001	2026-06-17 20:56:46.422
79	8694723603	bumcikas	Bumbum	0.00	f	f	0	0.00	New	2026-06-17 03:43:16.854445	2026-06-17 03:43:16.854445
73	8749284636	L1umzirgis2	Laumžirgis	0.00	f	f	0	0.00	New	2026-06-16 22:16:00.099856	2026-06-18 07:47:48.358
16	8002340759	nesuprasi	nesuprasi	0.00	f	f	0	0.00	New	2026-06-14 21:10:28.535239	2026-06-17 21:22:31.323
85	8473292049	marmadukas7	Žaliaveidis	0.00	f	f	0	0.00	New	2026-06-17 07:07:43.306987	2026-06-17 07:07:43.306987
17	6122040762	boris696	hypnose666	0.00	f	f	0	0.00	New	2026-06-14 21:11:02.858259	2026-06-17 04:41:19.081
6	8235754313	SAINTGERMAINNV	SAINT GERMAIN	2.00	f	f	0	0.00	New	2026-06-14 13:18:17.864431	2026-06-18 09:01:17.124
88	1886732282	Dlyght	D	0.00	f	f	0	0.00	New	2026-06-17 07:58:47.690463	2026-06-17 08:57:20.743
81	7987677875	Ushszlk	Fryswitch	0.00	f	f	0	0.00	New	2026-06-17 04:43:28.15829	2026-06-17 04:43:28.15829
99	8080796082	Balandziukas	Hcisksh	0.00	f	f	0	0.00	New	2026-06-17 09:32:36.969501	2026-06-17 17:50:15.923
109	7088319546	paulmarrk	paul	0.00	f	f	0	0.00	New	2026-06-17 12:36:22.739959	2026-06-17 13:05:00.616
80	8518007410	\N	pasvale	0.00	f	f	0	0.00	New	2026-06-17 03:58:13.75062	2026-06-17 04:54:15.152
70	8418094747	Labrad0ras	Cyvyrikas	0.00	f	f	0	0.00	New	2026-06-16 21:21:44.718304	2026-06-18 05:04:19.575
82	7551060316	makelakon	Makkela	0.00	f	f	0	0.00	New	2026-06-17 05:03:42.16509	2026-06-17 05:03:42.16509
77	5314150131	blackxspace	Black	0.00	f	f	0	0.00	New	2026-06-17 01:17:11.672621	2026-06-17 20:22:05.256
102	5796674055	PlbmMayer	Mayer	0.00	f	f	0	0.00	New	2026-06-17 09:45:50.489208	2026-06-17 14:11:37.199
15	7956793486	Bomzpax	Mortal	0.00	f	f	0	0.00	New	2026-06-14 21:01:32.017594	2026-06-18 07:34:18.941
91	7830298840	Nutrukes	Nutrukes	0.00	f	f	0	0.00	New	2026-06-17 08:34:11.046751	2026-06-17 08:34:11.046751
105	8639472602	zinokus	ZincTT	0.00	f	f	0	0.00	New	2026-06-17 10:59:38.714156	2026-06-17 21:35:43.159
20	8206771501	vmidirix	Vmidiriks	0.00	f	f	0	0.00	New	2026-06-14 21:50:51.631175	2026-06-17 09:15:10.347
68	6913860260	spaceblack666	Artur	0.26	f	f	1	30.00	New	2026-06-16 20:46:49.624464	2026-06-17 21:18:20.283
19	2088279418	Pasendzers	Pasendžers	0.00	f	f	0	0.00	New	2026-06-14 21:36:49.599395	2026-06-17 10:03:27.35
86	2083897846	viensdutrys1du3	Pasi	0.00	f	f	0	0.00	New	2026-06-17 07:52:24.911136	2026-06-17 07:52:24.911136
87	7637570829	Ispanas2	Ispanas Antrasis	0.00	f	f	0	0.00	New	2026-06-17 07:54:46.196526	2026-06-17 07:54:46.196526
100	7255639886	\N	Arnas	0.00	f	f	0	0.00	New	2026-06-17 09:33:58.546516	2026-06-17 09:33:58.546516
93	7870846186	Baltas_sniegas	Fortunas	0.00	f	f	0	0.00	New	2026-06-17 08:48:59.338669	2026-06-17 08:48:59.338669
94	8378192849	ko_1100001001	KO	0.00	f	f	0	0.00	New	2026-06-17 08:56:05.872643	2026-06-17 20:40:01.588
1	8725051269	savaszmogus	ㅤSavas	252.75	f	f	30	1020.25	Legend	2026-05-14 11:01:32.138022	2026-06-18 08:57:46.008
89	1929796123	Rokenas	Rokenas	0.00	f	f	1	30.00	New	2026-06-17 08:03:57.938027	2026-06-17 08:53:31.254
92	6051185404	piam_piam	50 Ant	0.00	f	f	0	0.00	New	2026-06-17 08:35:29.359906	2026-06-18 03:55:09.446
98	2025944947	EGE316	Paryzius10	0.00	f	f	0	0.00	New	2026-06-17 09:29:38.160633	2026-06-17 09:29:38.160633
106	455998026	LacosaNostraPiskBan	Lacosa	0.00	f	f	0	0.00	New	2026-06-17 11:10:39.858739	2026-06-17 17:51:39.891
101	8527252755	krimasas	Krimas	0.00	f	f	0	0.00	New	2026-06-17 09:39:41.233577	2026-06-17 09:39:41.233577
74	7434642647	sviesusis4xn	Pašvaistė	0.00	f	f	0	0.00	New	2026-06-16 22:46:59.347731	2026-06-18 08:12:16.926
97	5051431614	Brucl3	Graikas	0.00	f	f	0	0.00	New	2026-06-17 09:28:43.959561	2026-06-17 17:15:38.478
67	6991182357	mrluccianno	Mr	0.00	f	f	0	0.00	New	2026-06-16 20:45:00.863312	2026-06-18 08:57:28.781
104	1257464273	Snufkinas	Snufkinas	0.00	f	f	0	0.00	New	2026-06-17 10:31:55.466059	2026-06-17 12:02:32.925
64	864047815	obywantufu	Obywan	0.00	f	f	0	0.00	New	2026-06-15 07:16:02.628357	2026-06-17 18:06:03.858
76	8728173040	stumiudurapuciuduma	Kalantukas	0.00	f	f	0	0.00	New	2026-06-17 00:35:48.105492	2026-06-17 11:16:15.224
107	5779898789	Ernizas808	Ernizas	0.00	f	f	0	0.00	New	2026-06-17 12:07:04.043908	2026-06-17 12:07:04.043908
69	8505582385	Vyja_lt	Briedis	0.00	f	f	0	0.00	New	2026-06-16 20:55:36.730549	2026-06-18 09:01:34.163
108	8573701990	conkretu	conkretu	0.00	f	f	0	0.00	New	2026-06-17 12:24:51.887707	2026-06-17 12:24:51.887707
11	8457878753	wotankah	Garaz	0.00	f	f	0	0.00	New	2026-06-14 20:47:14.838701	2026-06-17 18:58:14.911
65	795102057	dvimmg	20mg	0.00	f	f	0	0.00	New	2026-06-15 07:32:01.796846	2026-06-18 06:24:43.753
103	8561938487	tiksusalotom	ㅤ	0.00	f	f	0	0.00	New	2026-06-17 10:03:36.462727	2026-06-17 12:36:40.763
110	7612986547	Smdmoit	Gingun	0.00	f	f	0	0.00	New	2026-06-17 12:58:49.112569	2026-06-17 22:29:41.686
90	7544910198	a11223339990000	1111	0.00	f	f	0	0.00	New	2026-06-17 08:25:28.641832	2026-06-18 07:44:29.217
111	5938976384	kr_top78	mmda	0.00	f	f	0	0.00	New	2026-06-17 13:26:44.830139	2026-06-17 13:26:44.830139
75	5262239053	Kubils342	Kubilius	0.07	f	f	1	49.50	New	2026-06-16 23:23:03.692497	2026-06-17 20:46:22.051
112	8683745011	Bizyukas	W	0.00	f	f	0	0.00	New	2026-06-17 13:35:56.214161	2026-06-17 13:35:56.214161
14	1163064455	Vvvvvv320	V	0.00	f	f	0	0.00	New	2026-06-14 20:54:15.179589	2026-06-17 16:17:21.195
25	6397862501	\N	Dncs	0.00	f	f	0	0.00	New	2026-06-14 22:34:01.570297	2026-06-17 14:47:37.524
13	7971579689	Vaiduoklis420	Vaiduoklis	0.00	f	f	0	0.00	New	2026-06-14 20:50:11.695049	2026-06-18 08:29:33.731
7	8249208174	LabStoryBackup	LAB STORY BACKUP	0.00	f	f	0	0.00	New	2026-06-14 20:40:33.888781	2026-06-18 03:13:08.789
95	8856762548	parukom	:)	0.00	f	f	0	0.00	New	2026-06-17 09:16:43.065065	2026-06-18 07:58:52.693
137	5871072103	Teqila404	Teqila	0.00	f	f	0	0.00	New	2026-06-17 19:57:10.599177	2026-06-17 19:57:10.599177
134	5117638226	Saime93	Tankistas	0.00	f	f	0	0.00	New	2026-06-17 19:10:21.595268	2026-06-17 20:01:51.15
152	8933644123	PimpaloTrosas	D ;))	0.00	f	f	0	0.00	New	2026-06-17 21:06:35.076819	2026-06-18 08:56:46.051
115	8344559574	\N	Jibat	0.00	f	f	0	0.00	New	2026-06-17 14:42:26.480789	2026-06-17 14:42:26.480789
139	6121351551	labas_vakaras1	Labas	0.00	f	f	0	0.00	New	2026-06-17 20:20:21.022135	2026-06-17 20:20:21.022135
116	7902103975	duffman555	duffman	0.00	f	f	0	0.00	New	2026-06-17 15:49:43.614703	2026-06-17 15:49:43.614703
117	8427935805	dundukas1	Dundukas	0.00	f	f	0	0.00	New	2026-06-17 16:18:14.777365	2026-06-17 16:18:14.777365
119	7344921636	Big_Time420	Big	0.00	f	f	0	0.00	New	2026-06-17 16:54:08.049118	2026-06-17 16:54:08.049118
120	6166103188	Briedalas	Briedalas	0.00	f	f	0	0.00	New	2026-06-17 16:57:03.750105	2026-06-17 16:57:03.750105
141	8395517685	Aeosaass	9oooo9	0.00	f	f	0	0.00	New	2026-06-17 20:35:22.406271	2026-06-17 20:35:22.406271
140	8521817533	Prizvairaves	Uzjudejas	0.00	f	f	0	0.00	New	2026-06-17 20:30:04.984483	2026-06-17 20:42:27.165
122	2034963585	mokausirasyti	Mokausi	0.00	f	f	0	0.00	New	2026-06-17 17:49:53.146542	2026-06-17 17:49:53.146542
123	8557732683	valteris0	d	0.00	f	f	0	0.00	New	2026-06-17 17:53:54.436756	2026-06-17 17:53:54.436756
124	7342932608	Ggggggyyuuugggggg	Kris	0.00	f	f	0	0.00	New	2026-06-17 17:55:04.369259	2026-06-17 17:55:04.369259
125	8732423906	G0st3e	G0st3	0.00	f	f	0	0.00	New	2026-06-17 18:03:25.489693	2026-06-17 18:03:25.489693
143	6124754631	Duokratu	😊	0.00	f	f	0	0.00	New	2026-06-17 20:44:37.365719	2026-06-17 20:44:37.365719
161	8497010866	kolumbenas	Kolumbas	0.00	f	f	0	0.00	New	2026-06-18 01:06:29.507195	2026-06-18 01:19:05.161
156	6244077325	rimidarbuotojas1	Pirdinikas	0.00	f	f	0	0.00	New	2026-06-17 22:03:54.455845	2026-06-17 22:03:54.455845
146	6006785041	HVH420	HVH	0.00	f	f	0	0.00	New	2026-06-17 20:50:46.477647	2026-06-17 20:50:46.477647
118	8135297519	Hihiha777	Hihihaha	2.84	f	f	1	30.00	New	2026-06-17 16:54:01.527192	2026-06-17 18:13:23.999
129	1930261465	cntzas	cntz	0.00	f	f	0	0.00	New	2026-06-17 18:33:03.734754	2026-06-17 18:33:03.734754
147	7221802301	wallcot187	dzimis	0.00	f	f	0	0.00	New	2026-06-17 20:51:11.054832	2026-06-17 20:51:11.054832
130	8767885666	w33dboyz	S	0.00	f	f	0	0.00	New	2026-06-17 18:51:25.272274	2026-06-17 18:51:25.272274
127	8395474226	Hanekoraa	Hanekora	0.00	f	f	0	0.00	New	2026-06-17 18:05:07.631796	2026-06-17 18:52:16.073
131	7108551290	radzzis	Radži	0.00	f	f	0	0.00	New	2026-06-17 18:56:29.590185	2026-06-17 18:56:29.590185
162	8925832520	h1h1magaz	Tikras Hiltonas	0.00	f	f	0	0.00	New	2026-06-18 03:07:45.649874	2026-06-18 03:07:45.649874
133	8266871013	Isgeriu	Shamanas.ru	0.00	f	f	0	0.00	New	2026-06-17 19:00:12.390435	2026-06-17 19:00:12.390435
148	6345329439	MCN30	Kugelis8	0.00	f	f	0	0.00	New	2026-06-17 20:51:40.025978	2026-06-17 20:51:40.025978
121	8708986712	euforiskasis	Rasta	0.00	f	f	1	27.00	New	2026-06-17 17:49:19.392034	2026-06-17 19:14:51.582
135	8547071635	Skaniausias	Skaniausias	0.00	f	f	0	0.00	New	2026-06-17 19:37:53.224296	2026-06-17 19:37:53.224296
136	5944250495	Draugelis45	Sup	0.00	f	f	0	0.00	New	2026-06-17 19:50:32.320599	2026-06-17 19:50:32.320599
149	6362256925	GerasisGurmanas	Gerasis	0.00	f	f	0	0.00	New	2026-06-17 20:56:01.702875	2026-06-17 20:56:01.702875
150	8283497495	BiGleZZ2000	BiGleZZ💎	0.00	f	f	0	0.00	New	2026-06-17 20:56:37.488124	2026-06-17 20:56:37.488124
151	5350743124	Abugelis	Juozapas Alausis	0.00	f	f	0	0.00	New	2026-06-17 20:58:32.051669	2026-06-17 20:58:32.051669
180	7292357177	viskasbusgerai1	👉	0.00	f	f	0	0.00	New	2026-06-18 08:00:20.714156	2026-06-18 08:58:24.82
144	5829260675	Nerasyk_islekes	Violetusas	0.00	f	f	0	0.00	New	2026-06-17 20:49:15.6959	2026-06-17 21:20:59.126
164	8082680360	Linksmakotis	Belekabelekur	0.00	f	f	0	0.00	New	2026-06-18 03:17:44.116441	2026-06-18 03:17:44.116441
154	8180110550	Luksnekazka	Luks	0.00	f	f	0	0.00	New	2026-06-17 21:22:56.929068	2026-06-17 21:22:56.929068
155	7975509218	baxuriukas	xrcc	0.00	f	f	0	0.00	New	2026-06-17 21:30:34.471708	2026-06-17 21:30:34.471708
176	8314786079	NiekoNebus777	SANTA	0.00	f	f	0	0.00	New	2026-06-18 07:23:11.658001	2026-06-18 07:23:11.658001
165	5736943813	Bemikrobanges	Ne	0.00	f	f	0	0.00	New	2026-06-18 04:12:19.375697	2026-06-18 04:12:19.375697
142	8948491851	pamarskomu	999	0.00	f	f	0	0.00	New	2026-06-17 20:37:15.226354	2026-06-17 21:53:30.019
166	8694952789	Bbzkasciadaros	Franklin	0.00	f	f	0	0.00	New	2026-06-18 04:17:58.321625	2026-06-18 04:17:58.321625
128	7639594163	RealGrudakas	Grudakas (KacelkaBOT Soon) 🤖	0.01	f	f	1	27.00	New	2026-06-17 18:08:51.915512	2026-06-17 22:57:57.814
157	5569231449	donkey3458	Donkey	0.00	f	f	0	0.00	New	2026-06-17 23:07:36.05992	2026-06-17 23:07:36.05992
158	7759217391	Valius_labadaukas	Valius_Labadauskas	0.00	f	f	0	0.00	New	2026-06-17 23:13:52.061362	2026-06-17 23:13:52.061362
159	6939130706	Babatukas	Valode	0.00	f	f	0	0.00	New	2026-06-17 23:17:19.051442	2026-06-17 23:17:19.051442
132	8949321620	\N	Pika	0.00	f	f	0	0.00	New	2026-06-17 18:59:32.216642	2026-06-17 23:21:54.485
167	8210342657	Beleka12345	Ash	0.00	f	f	0	0.00	New	2026-06-18 04:23:04.906818	2026-06-18 04:23:04.906818
153	8249187807	\N	H U X	0.00	f	f	0	0.00	New	2026-06-17 21:22:48.810839	2026-06-18 00:15:33.254
160	6034202086	Smooky7	Smooky	0.00	f	f	0	0.00	New	2026-06-18 00:52:25.502642	2026-06-18 00:52:25.502642
138	7681682117	Kokosiniss	Bob	0.00	f	f	0	0.00	New	2026-06-17 20:03:00.003622	2026-06-18 04:47:10.886
168	1935272426	belekuris	A	0.00	f	f	0	0.00	New	2026-06-18 04:51:19.627609	2026-06-18 04:51:19.627609
169	8184873887	\N	Crokodilas	0.00	f	f	0	0.00	New	2026-06-18 05:03:17.354048	2026-06-18 05:03:17.354048
170	6053694559	vaivulee	Balndernar	0.00	f	f	0	0.00	New	2026-06-18 05:05:17.120812	2026-06-18 05:05:17.120812
177	8529304899	dolscas	exchange	0.00	f	f	0	0.00	New	2026-06-18 07:30:52.111362	2026-06-18 07:30:52.111362
172	6341089259	Liudis8	Liudis	0.00	f	f	0	0.00	New	2026-06-18 05:15:13.663705	2026-06-18 05:58:47.315
145	7769771713	DumaiZjbs	Pablito	0.00	f	f	0	0.00	New	2026-06-17 20:50:37.959358	2026-06-18 05:59:49.214
163	1943289524	duokproba	666	0.00	f	f	0	0.00	New	2026-06-18 03:12:00.965467	2026-06-18 06:24:54.366
174	7736958248	NuMuSkKaLpOKa	KAL	0.00	f	f	0	0.00	New	2026-06-18 06:56:00.559544	2026-06-18 06:56:00.559544
114	7643193548	\N	Pola	0.00	f	f	0	0.00	New	2026-06-17 14:33:24.238536	2026-06-18 06:57:35.88
171	7224334366	blagadariuuu	Blagadariu	0.00	f	f	0	0.00	New	2026-06-18 05:08:22.402739	2026-06-18 07:40:31.031
178	6247363454	shponke	Šponke	0.00	f	f	0	0.00	New	2026-06-18 07:41:57.187766	2026-06-18 07:41:57.187766
179	6080324727	dubajausprincas	Dmcckr	0.09	f	f	1	30.00	New	2026-06-18 07:54:01.056793	2026-06-18 08:08:13.471
181	1429029537	Zoideris	Luke	0.00	f	f	0	0.00	New	2026-06-18 08:04:10.121491	2026-06-18 08:04:10.121491
182	8777865194	polozicd	mino	0.00	f	f	0	0.00	New	2026-06-18 08:08:37.020738	2026-06-18 08:08:37.020738
183	8544070533	Showmeboob1es	Nico Ramirez	0.00	f	f	0	0.00	New	2026-06-18 08:09:33.06583	2026-06-18 08:09:33.06583
184	1763658751	Kuperis666	Kuperis	0.00	f	f	0	0.00	New	2026-06-18 08:10:40.880381	2026-06-18 08:10:40.880381
126	7289538090	Bboymenno7	Bboyslimshady	0.00	f	f	0	0.00	New	2026-06-17 18:04:24.501865	2026-06-18 08:13:02.877
185	7799101861	XxamygoxX	XxamygoxX	0.00	f	f	0	0.00	New	2026-06-18 08:14:21.429708	2026-06-18 08:14:21.429708
186	1895809939	Voidboy	void	0.00	f	f	0	0.00	New	2026-06-18 08:16:18.747546	2026-06-18 08:16:18.747546
175	5814788376	Ministerija007	Reikalu	0.00	f	f	0	0.00	New	2026-06-18 07:02:01.451305	2026-06-18 08:22:02.445
113	7816291557	kamtoreikia	KamToReikia?	0.00	f	f	0	0.00	New	2026-06-17 14:14:27.697762	2026-06-18 08:50:39.479
187	8525541359	pilktriusis87	Gera	0.00	f	f	0	0.00	New	2026-06-18 08:27:51.773617	2026-06-18 08:33:11.063
188	6195263451	itsdagz	R	0.00	f	f	0	0.00	New	2026-06-18 08:40:06.509575	2026-06-18 08:40:06.509575
173	8956003461	trapecy	Trap	0.00	f	f	0	0.00	New	2026-06-18 06:32:43.171526	2026-06-18 08:40:26.075
189	6044857215	\N	kirilas	0.00	f	f	0	0.00	New	2026-06-18 09:04:47.276314	2026-06-18 09:09:28.524
\.


--
-- Data for Name: bot_welcome_templates; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.bot_welcome_templates (id, text, is_active, created_at) FROM stdin;
4	⚠️ Nepamirškit siųsti tikslios sumos, nurodytos bote\n💬 Jei pervedėt per mažą arba per didelę sumą – susisiekit su @savaszmogus arba @pinokis666\n📦 Jei domina didmena – kreipkitės į @SAINTGERMAINNV	t	2026-06-17 21:24:08.251251
\.


--
-- Data for Name: bot_workers; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.bot_workers (id, telegram_id, username, enabled, total_uploads, added_at) FROM stdin;
1	8235754313	SAINTGERMAINNV	t	0	2026-06-14 19:48:04.365921
2	8725051269	savaszmogus	t	5	2026-06-14 19:58:22.276323
3	8273673238	pinokis666	t	44	2026-06-14 21:42:51.886281
\.


--
-- Name: replit_database_migrations_v1_id_seq; Type: SEQUENCE SET; Schema: _system; Owner: neondb_owner
--

SELECT pg_catalog.setval('_system.replit_database_migrations_v1_id_seq', 4, true);


--
-- Name: bot_admins_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.bot_admins_id_seq', 9, true);


--
-- Name: bot_backup_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.bot_backup_tokens_id_seq', 1, true);


--
-- Name: bot_baskets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.bot_baskets_id_seq', 13, true);


--
-- Name: bot_cities_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.bot_cities_id_seq', 9, true);


--
-- Name: bot_discount_codes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.bot_discount_codes_id_seq', 1, true);


--
-- Name: bot_districts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.bot_districts_id_seq', 14, true);


--
-- Name: bot_invoice_intents_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.bot_invoice_intents_id_seq', 9, true);


--
-- Name: bot_payment_receipts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.bot_payment_receipts_id_seq', 9, true);


--
-- Name: bot_product_discounts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.bot_product_discounts_id_seq', 1, false);


--
-- Name: bot_product_slots_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.bot_product_slots_id_seq', 47, true);


--
-- Name: bot_product_types_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.bot_product_types_id_seq', 35, true);


--
-- Name: bot_products_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.bot_products_id_seq', 107, true);


--
-- Name: bot_purchases_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.bot_purchases_id_seq', 70, true);


--
-- Name: bot_reseller_discounts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.bot_reseller_discounts_id_seq', 1, false);


--
-- Name: bot_reviews_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.bot_reviews_id_seq', 8, true);


--
-- Name: bot_tier_discount_rules_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.bot_tier_discount_rules_id_seq', 1, false);


--
-- Name: bot_tier_levels_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.bot_tier_levels_id_seq', 4, true);


--
-- Name: bot_tier_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.bot_tier_settings_id_seq', 1, true);


--
-- Name: bot_topup_invoices_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.bot_topup_invoices_id_seq', 46, true);


--
-- Name: bot_users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.bot_users_id_seq', 189, true);


--
-- Name: bot_welcome_templates_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.bot_welcome_templates_id_seq', 4, true);


--
-- Name: bot_workers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.bot_workers_id_seq', 3, true);


--
-- Name: replit_database_migrations_v1 replit_database_migrations_v1_pkey; Type: CONSTRAINT; Schema: _system; Owner: neondb_owner
--

ALTER TABLE ONLY _system.replit_database_migrations_v1
    ADD CONSTRAINT replit_database_migrations_v1_pkey PRIMARY KEY (id);


--
-- Name: bot_admins bot_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_admins
    ADD CONSTRAINT bot_admins_pkey PRIMARY KEY (id);


--
-- Name: bot_admins bot_admins_telegram_id_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_admins
    ADD CONSTRAINT bot_admins_telegram_id_unique UNIQUE (telegram_id);


--
-- Name: bot_backup_tokens bot_backup_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_backup_tokens
    ADD CONSTRAINT bot_backup_tokens_pkey PRIMARY KEY (id);


--
-- Name: bot_backup_tokens bot_backup_tokens_token_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_backup_tokens
    ADD CONSTRAINT bot_backup_tokens_token_unique UNIQUE (token);


--
-- Name: bot_baskets bot_baskets_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_baskets
    ADD CONSTRAINT bot_baskets_pkey PRIMARY KEY (id);


--
-- Name: bot_cities bot_cities_name_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_cities
    ADD CONSTRAINT bot_cities_name_unique UNIQUE (name);


--
-- Name: bot_cities bot_cities_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_cities
    ADD CONSTRAINT bot_cities_pkey PRIMARY KEY (id);


--
-- Name: bot_discount_codes bot_discount_codes_code_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_discount_codes
    ADD CONSTRAINT bot_discount_codes_code_unique UNIQUE (code);


--
-- Name: bot_discount_codes bot_discount_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_discount_codes
    ADD CONSTRAINT bot_discount_codes_pkey PRIMARY KEY (id);


--
-- Name: bot_districts bot_districts_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_districts
    ADD CONSTRAINT bot_districts_pkey PRIMARY KEY (id);


--
-- Name: bot_invoice_intents bot_invoice_intents_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_invoice_intents
    ADD CONSTRAINT bot_invoice_intents_pkey PRIMARY KEY (id);


--
-- Name: bot_payment_receipts bot_payment_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_payment_receipts
    ADD CONSTRAINT bot_payment_receipts_pkey PRIMARY KEY (id);


--
-- Name: bot_payment_receipts bot_payment_receipts_tx_signature_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_payment_receipts
    ADD CONSTRAINT bot_payment_receipts_tx_signature_unique UNIQUE (tx_signature);


--
-- Name: bot_product_discounts bot_product_discounts_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_product_discounts
    ADD CONSTRAINT bot_product_discounts_pkey PRIMARY KEY (id);


--
-- Name: bot_product_slots bot_product_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_product_slots
    ADD CONSTRAINT bot_product_slots_pkey PRIMARY KEY (id);


--
-- Name: bot_product_types bot_product_types_name_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_product_types
    ADD CONSTRAINT bot_product_types_name_unique UNIQUE (name);


--
-- Name: bot_product_types bot_product_types_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_product_types
    ADD CONSTRAINT bot_product_types_pkey PRIMARY KEY (id);


--
-- Name: bot_products bot_products_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_products
    ADD CONSTRAINT bot_products_pkey PRIMARY KEY (id);


--
-- Name: bot_purchases bot_purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_purchases
    ADD CONSTRAINT bot_purchases_pkey PRIMARY KEY (id);


--
-- Name: bot_purchases bot_purchases_queue_id_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_purchases
    ADD CONSTRAINT bot_purchases_queue_id_unique UNIQUE (queue_id);


--
-- Name: bot_reseller_discounts bot_reseller_discounts_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_reseller_discounts
    ADD CONSTRAINT bot_reseller_discounts_pkey PRIMARY KEY (id);


--
-- Name: bot_reviews bot_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_reviews
    ADD CONSTRAINT bot_reviews_pkey PRIMARY KEY (id);


--
-- Name: bot_settings bot_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_settings
    ADD CONSTRAINT bot_settings_pkey PRIMARY KEY (key);


--
-- Name: bot_tier_discount_rules bot_tier_discount_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_tier_discount_rules
    ADD CONSTRAINT bot_tier_discount_rules_pkey PRIMARY KEY (id);


--
-- Name: bot_tier_levels bot_tier_levels_name_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_tier_levels
    ADD CONSTRAINT bot_tier_levels_name_unique UNIQUE (name);


--
-- Name: bot_tier_levels bot_tier_levels_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_tier_levels
    ADD CONSTRAINT bot_tier_levels_pkey PRIMARY KEY (id);


--
-- Name: bot_tier_settings bot_tier_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_tier_settings
    ADD CONSTRAINT bot_tier_settings_pkey PRIMARY KEY (id);


--
-- Name: bot_topup_invoices bot_topup_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_topup_invoices
    ADD CONSTRAINT bot_topup_invoices_pkey PRIMARY KEY (id);


--
-- Name: bot_users bot_users_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_users
    ADD CONSTRAINT bot_users_pkey PRIMARY KEY (id);


--
-- Name: bot_users bot_users_telegram_id_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_users
    ADD CONSTRAINT bot_users_telegram_id_unique UNIQUE (telegram_id);


--
-- Name: bot_welcome_templates bot_welcome_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_welcome_templates
    ADD CONSTRAINT bot_welcome_templates_pkey PRIMARY KEY (id);


--
-- Name: bot_workers bot_workers_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_workers
    ADD CONSTRAINT bot_workers_pkey PRIMARY KEY (id);


--
-- Name: bot_workers bot_workers_telegram_id_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_workers
    ADD CONSTRAINT bot_workers_telegram_id_unique UNIQUE (telegram_id);


--
-- Name: idx_replit_database_migrations_v1_build_id; Type: INDEX; Schema: _system; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_replit_database_migrations_v1_build_id ON _system.replit_database_migrations_v1 USING btree (build_id);


--
-- Name: bot_product_slots_uniq; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX bot_product_slots_uniq ON public.bot_product_slots USING btree (city_id, district_id, type_id, size);


--
-- Name: bot_districts bot_districts_city_id_bot_cities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_districts
    ADD CONSTRAINT bot_districts_city_id_bot_cities_id_fk FOREIGN KEY (city_id) REFERENCES public.bot_cities(id);


--
-- Name: bot_product_slots bot_product_slots_city_id_bot_cities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_product_slots
    ADD CONSTRAINT bot_product_slots_city_id_bot_cities_id_fk FOREIGN KEY (city_id) REFERENCES public.bot_cities(id);


--
-- Name: bot_product_slots bot_product_slots_district_id_bot_districts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_product_slots
    ADD CONSTRAINT bot_product_slots_district_id_bot_districts_id_fk FOREIGN KEY (district_id) REFERENCES public.bot_districts(id);


--
-- Name: bot_product_slots bot_product_slots_type_id_bot_product_types_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_product_slots
    ADD CONSTRAINT bot_product_slots_type_id_bot_product_types_id_fk FOREIGN KEY (type_id) REFERENCES public.bot_product_types(id);


--
-- Name: bot_products bot_products_city_id_bot_cities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_products
    ADD CONSTRAINT bot_products_city_id_bot_cities_id_fk FOREIGN KEY (city_id) REFERENCES public.bot_cities(id);


--
-- Name: bot_products bot_products_district_id_bot_districts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_products
    ADD CONSTRAINT bot_products_district_id_bot_districts_id_fk FOREIGN KEY (district_id) REFERENCES public.bot_districts(id);


--
-- Name: bot_products bot_products_type_id_bot_product_types_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bot_products
    ADD CONSTRAINT bot_products_type_id_bot_product_types_id_fk FOREIGN KEY (type_id) REFERENCES public.bot_product_types(id);


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO neon_superuser WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON TABLES TO neon_superuser WITH GRANT OPTION;


--
-- PostgreSQL database dump complete
--

\unrestrict 9fhtfmY0HznwxvuvnIcLnoAb05AawcpQ3kpoydrzUTtCiWnCyetwMCgn5R1bJFj

