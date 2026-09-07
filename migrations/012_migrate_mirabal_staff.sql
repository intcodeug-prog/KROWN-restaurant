-- Migration 012: Migrate MIRABAL CAFE staff from Supabase to Neon
-- 4 staff members: 2 managers, 2 cashiers
-- Branch: ce9e7783-5a93-4dee-b237-aaed8e7ec746, Org: a45521c0-d218-4916-be3e-e28ce5b7dffa

INSERT INTO staff (id, name, email, role, branch, assigned_branch_id, status, organization_id, created_at, updated_at)
VALUES
  (uuid_generate_v4(), 'Mercy', 'mehret293@gmail.com', 'Branch Manager', 'MRABAL CAFE', 'ce9e7783-5a93-4dee-b237-aaed8e7ec746', 'active', 'a45521c0-d218-4916-be3e-e28ce5b7dffa', NOW(), NOW()),
  (uuid_generate_v4(), 'TUJA ADMIN', 'tuja2@aol.com', 'Branch Manager', 'MRABAL CAFE', 'ce9e7783-5a93-4dee-b237-aaed8e7ec746', 'active', 'a45521c0-d218-4916-be3e-e28ce5b7dffa', NOW(), NOW()),
  (uuid_generate_v4(), 'Krown-Admin', 'ugandalaptops@gnail.com', 'Cashier', 'MRABAL CAFE', 'ce9e7783-5a93-4dee-b237-aaed8e7ec746', 'active', 'a45521c0-d218-4916-be3e-e28ce5b7dffa', NOW(), NOW()),
  (uuid_generate_v4(), 'Nandawula Latifah', 'nandawulaquintifah@gmail.com', 'Cashier', 'MRABAL CAFE', 'ce9e7783-5a93-4dee-b237-aaed8e7ec746', 'active', 'a45521c0-d218-4916-be3e-e28ce5b7dffa', NOW(), NOW())
ON CONFLICT (email) DO NOTHING;
