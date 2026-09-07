-- Migration 010: Migrate MIRABAL CAFE data from Supabase to Neon
-- Fix org name
UPDATE organizations SET name = 'MIRABAL CAFE', slug = 'mirabal-cafe' WHERE id = 'a45521c0-d218-4916-be3e-e28ce5b7dffa';

-- Create categories for MIRABAL CAFE
INSERT INTO categories (id, organization_id, name, sort_order, created_at)
VALUES
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'All Day Dining', 1, NOW()),
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'Appetizers', 2, NOW()),
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'Baguettes', 3, NOW()),
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'Booster Coffees', 4, NOW()),
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'Bread Loaves', 5, NOW()),
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'Breakfast', 6, NOW()),
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'Burgers', 7, NOW()),
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'Cake Slices', 8, NOW()),
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'Cappuccinos', 9, NOW()),
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'Coladas', 10, NOW()),
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'Desserts', 11, NOW()),
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'Drinks', 12, NOW()),
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'Espresso Bar', 13, NOW()),
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'Flavoured Lattes', 14, NOW()),
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'Fresh Juice', 15, NOW()),
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'Lemonades', 16, NOW()),
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'Local', 17, NOW()),
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'Main Course', 18, NOW()),
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'Mains', 19, NOW()),
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'Milkshakes', 20, NOW()),
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'Mojitos', 21, NOW()),
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'Pastas', 22, NOW()),
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'Pastries', 23, NOW()),
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'Pies & Samosas', 24, NOW()),
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'Pizzas', 25, NOW()),
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'Sandwiches', 26, NOW()),
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'Smoothies', 27, NOW()),
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'Sourdough Breads', 28, NOW()),
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'Teas', 29, NOW()),
  (uuid_generate_v4(), 'a45521c0-d218-4916-be3e-e28ce5b7dffa', 'Whole Cakes', 30, NOW())
ON CONFLICT DO NOTHING;
