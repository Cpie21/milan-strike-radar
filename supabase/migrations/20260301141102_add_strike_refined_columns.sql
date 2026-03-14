ALTER TABLE "public"."strikes"
ADD COLUMN "category" text,
ADD COLUMN "display_time" text,
ADD COLUMN "duration_hours" text,
ADD COLUMN "guarantee_windows" jsonb;

-- Optional: we can drop the old ones if they are truly unused, but let's keep them and make them nullable just in case.
ALTER TABLE "public"."strikes" ALTER COLUMN "categories" DROP NOT NULL;
ALTER TABLE "public"."strikes" ALTER COLUMN "duration" DROP NOT NULL;
