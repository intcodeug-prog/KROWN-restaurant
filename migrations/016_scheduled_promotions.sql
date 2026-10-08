-- KROWN ERP — scheduled promotions
-- Mirabal Cafe weekend promotion: 20% off selected pizza and burger meals.
-- Starts Friday 2026-10-09 and recurs every Friday/Saturday/Sunday until paused.

CREATE TABLE IF NOT EXISTS promotions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  discount_percentage numeric(5,2) NOT NULL CHECK (discount_percentage > 0 AND discount_percentage <= 100),
  start_date date NOT NULL,
  end_date date,
  active_weekdays smallint[] NOT NULL DEFAULT ARRAY[]::smallint[],
  timezone varchar(64) NOT NULL DEFAULT 'Africa/Kampala',
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','ended')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CHECK (end_date IS NULL OR end_date >= start_date),
  CHECK (active_weekdays <@ ARRAY[1,2,3,4,5,6,7]::smallint[])
);

CREATE UNIQUE INDEX IF NOT EXISTS promotions_branch_name_start_uidx
  ON promotions (organization_id, branch_id, lower(name), start_date);

CREATE INDEX IF NOT EXISTS promotions_active_lookup_idx
  ON promotions (organization_id, branch_id, status, start_date, end_date);

CREATE TABLE IF NOT EXISTS promotion_products (
  promotion_id uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (promotion_id, product_id)
);

CREATE INDEX IF NOT EXISTS promotion_products_product_idx
  ON promotion_products (organization_id, branch_id, product_id);

INSERT INTO promotions (
  id, organization_id, branch_id, name, discount_percentage,
  start_date, end_date, active_weekdays, timezone, status
)
VALUES (
  'c6e3e3bc-bec8-4f64-b73c-20c05e1ff020',
  'a45521c0-d218-4916-be3e-e28ce5b7dffa',
  'ce9e7783-5a93-4dee-b237-aaed8e7ec746',
  'Mirabal Weekend Pizza & Burger - 20% Off',
  20.00,
  DATE '2026-10-09',
  NULL,
  ARRAY[5,6,7]::smallint[],
  'Africa/Kampala',
  'active'
)
ON CONFLICT DO NOTHING;

INSERT INTO promotion_products (promotion_id, product_id, organization_id, branch_id)
VALUES
  ('c6e3e3bc-bec8-4f64-b73c-20c05e1ff020','2d2de329-deb9-4a16-a8ee-2cc80d941526','a45521c0-d218-4916-be3e-e28ce5b7dffa','ce9e7783-5a93-4dee-b237-aaed8e7ec746'),
  ('c6e3e3bc-bec8-4f64-b73c-20c05e1ff020','2323285c-5e55-479e-85d2-ec8b80f6f873','a45521c0-d218-4916-be3e-e28ce5b7dffa','ce9e7783-5a93-4dee-b237-aaed8e7ec746'),
  ('c6e3e3bc-bec8-4f64-b73c-20c05e1ff020','acee0f1c-ccfd-4ed6-afe6-0e6660234d41','a45521c0-d218-4916-be3e-e28ce5b7dffa','ce9e7783-5a93-4dee-b237-aaed8e7ec746'),
  ('c6e3e3bc-bec8-4f64-b73c-20c05e1ff020','109b2bab-0634-4140-a5df-2fb69770cd01','a45521c0-d218-4916-be3e-e28ce5b7dffa','ce9e7783-5a93-4dee-b237-aaed8e7ec746'),
  ('c6e3e3bc-bec8-4f64-b73c-20c05e1ff020','e7ee2aa4-88d1-430b-aa1a-b4abb349aecf','a45521c0-d218-4916-be3e-e28ce5b7dffa','ce9e7783-5a93-4dee-b237-aaed8e7ec746'),
  ('c6e3e3bc-bec8-4f64-b73c-20c05e1ff020','b640bea0-ced7-41a2-820b-034fd9fd0ac8','a45521c0-d218-4916-be3e-e28ce5b7dffa','ce9e7783-5a93-4dee-b237-aaed8e7ec746'),
  ('c6e3e3bc-bec8-4f64-b73c-20c05e1ff020','b27db789-29da-4d31-8b94-fee0f9924a3d','a45521c0-d218-4916-be3e-e28ce5b7dffa','ce9e7783-5a93-4dee-b237-aaed8e7ec746'),
  ('c6e3e3bc-bec8-4f64-b73c-20c05e1ff020','f63bbd28-05e4-4179-a74a-aa5c5b561e66','a45521c0-d218-4916-be3e-e28ce5b7dffa','ce9e7783-5a93-4dee-b237-aaed8e7ec746')
ON CONFLICT DO NOTHING;
