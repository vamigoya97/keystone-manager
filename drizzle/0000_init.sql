CREATE TABLE "chip_counters" (
	"key" text PRIMARY KEY NOT NULL,
	"counter" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_locks" (
	"key" text PRIMARY KEY NOT NULL,
	"holder" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigserial NOT NULL,
	"operator_id" text NOT NULL,
	"name" text NOT NULL,
	"tokens" text[] NOT NULL,
	"chip_security" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keystones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"slug" text NOT NULL,
	"previous_slugs" text[] DEFAULT '{}'::text[] NOT NULL,
	"chip_scope" text,
	"operator_id" text NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "keystones_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "members" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"keystone_id" uuid NOT NULL,
	"address" text NOT NULL,
	"privy_user_id" text NOT NULL,
	"chip_id" text NOT NULL,
	"claimed_at" timestamp with time zone NOT NULL,
	"tx_hash" text,
	"revoked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "members_keystone_address" UNIQUE("keystone_id","address"),
	CONSTRAINT "members_keystone_chip" UNIQUE("keystone_id","chip_id")
);
--> statement-breakpoint
CREATE TABLE "operators" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigserial NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "item_batches" ADD CONSTRAINT "item_batches_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keystones" ADD CONSTRAINT "keystones_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_keystone_id_keystones_id_fk" FOREIGN KEY ("keystone_id") REFERENCES "public"."keystones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "keystones_previous_slugs_idx" ON "keystones" USING gin ("previous_slugs");--> statement-breakpoint
CREATE INDEX "members_keystone_privy_idx" ON "members" USING btree ("keystone_id","privy_user_id");