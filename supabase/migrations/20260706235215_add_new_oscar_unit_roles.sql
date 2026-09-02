-- New protocol unit roles: Sierra (social media), Compliance, Welfare, Hospitality
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'sierra_oscar';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'head_sierra_oscar';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'compliance_oscar';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'head_compliance_oscar';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'welfare_oscar';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'head_welfare_oscar';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'hospitality_oscar';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'head_hospitality_oscar';;
