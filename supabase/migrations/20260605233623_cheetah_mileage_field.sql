
-- Add mileage tracking to cheetahs (SOP: flag vehicles approaching 35,000 miles for service)
alter table public.cheetahs add column if not exists mileage integer default 0;
alter table public.cheetahs add column if not exists last_service_mileage integer default 0;
alter table public.cheetahs add column if not exists last_service_date date;
comment on column public.cheetahs.mileage is 'Current mileage in miles. Alert at 35,000+ miles per SOP.';
comment on column public.cheetahs.last_service_mileage is 'Mileage at last service/FLOWER check.';
;
