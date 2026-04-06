-- Migration: Rename billing plan tiers pro→creator, ultra→business
-- Run this BEFORE deploying the new code.
-- ---------------------------------------------------------------

-- 1. Rename plan records in subscription_plans
UPDATE subscription_plans SET name = 'creator', display_name = 'Creator', updated_at = NOW() WHERE name = 'pro';
UPDATE subscription_plans SET name = 'business', display_name = 'Business', updated_at = NOW() WHERE name = 'ultra';

-- 2. Update users' subscription tier references
UPDATE users SET subscription_tier = 'creator' WHERE subscription_tier = 'pro';
UPDATE users SET subscription_tier = 'business' WHERE subscription_tier = 'ultra';

-- 3. Update Stripe settings price map keys (JSON stored in settings table, key='stripe')
-- This renames 'pro'→'creator' and 'ultra'→'business' inside both test.prices and live.prices
UPDATE settings
SET value = REPLACE(REPLACE(value, '"pro":', '"creator":'), '"ultra":', '"business":')
WHERE key = 'stripe';

-- Verify results
SELECT name, display_name FROM subscription_plans ORDER BY sort_order;
SELECT subscription_tier, COUNT(*) FROM users GROUP BY subscription_tier;
SELECT key, value FROM settings WHERE key = 'stripe';
