-- Migration: Fix User Deletion Foreign Key Constraints
-- Sets ON DELETE SET NULL on all author/reporter/assigner columns referencing public.users
-- and ensures dependent operational logs do not block officer account deletions.

DO $$
BEGIN
    -- Journeys
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'journeys_created_by_fkey') THEN
        ALTER TABLE journeys DROP CONSTRAINT journeys_created_by_fkey;
        ALTER TABLE journeys ADD CONSTRAINT journeys_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'journeys_deleted_by_fkey') THEN
        ALTER TABLE journeys DROP CONSTRAINT journeys_deleted_by_fkey;
        ALTER TABLE journeys ADD CONSTRAINT journeys_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'journeys_assigned_duty_officer_id_fkey') THEN
        ALTER TABLE journeys DROP CONSTRAINT journeys_assigned_duty_officer_id_fkey;
        ALTER TABLE journeys ADD CONSTRAINT journeys_assigned_duty_officer_id_fkey FOREIGN KEY (assigned_duty_officer_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'journeys_assigned_do_id_fkey') THEN
        ALTER TABLE journeys DROP CONSTRAINT journeys_assigned_do_id_fkey;
        ALTER TABLE journeys ADD CONSTRAINT journeys_assigned_do_id_fkey FOREIGN KEY (assigned_do_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    -- Journey Events
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'journey_events_triggered_by_fkey') THEN
        ALTER TABLE journey_events DROP CONSTRAINT journey_events_triggered_by_fkey;
        ALTER TABLE journey_events ADD CONSTRAINT journey_events_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    -- Incidents
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'incidents_created_by_fkey') THEN
        ALTER TABLE incidents DROP CONSTRAINT incidents_created_by_fkey;
        ALTER TABLE incidents ADD CONSTRAINT incidents_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'incidents_reported_by_fkey') THEN
        ALTER TABLE incidents DROP CONSTRAINT incidents_reported_by_fkey;
        ALTER TABLE incidents ADD CONSTRAINT incidents_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'incidents_resolved_by_fkey') THEN
        ALTER TABLE incidents DROP CONSTRAINT incidents_resolved_by_fkey;
        ALTER TABLE incidents ADD CONSTRAINT incidents_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    -- Papas
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'papas_created_by_fkey') THEN
        ALTER TABLE papas DROP CONSTRAINT papas_created_by_fkey;
        ALTER TABLE papas ADD CONSTRAINT papas_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'papas_deleted_by_fkey') THEN
        ALTER TABLE papas DROP CONSTRAINT papas_deleted_by_fkey;
        ALTER TABLE papas ADD CONSTRAINT papas_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    -- Checklists & Feedback logs
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'cheetah_flower_logs_performed_by_fkey') THEN
        ALTER TABLE cheetah_flower_logs DROP CONSTRAINT cheetah_flower_logs_performed_by_fkey;
        ALTER TABLE cheetah_flower_logs ADD CONSTRAINT cheetah_flower_logs_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'nest_comfort_logs_performed_by_fkey') THEN
        ALTER TABLE nest_comfort_logs DROP CONSTRAINT nest_comfort_logs_performed_by_fkey;
        ALTER TABLE nest_comfort_logs ADD CONSTRAINT nest_comfort_logs_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'eo_checklist_logs_performed_by_fkey') THEN
        ALTER TABLE eo_checklist_logs DROP CONSTRAINT eo_checklist_logs_performed_by_fkey;
        ALTER TABLE eo_checklist_logs ADD CONSTRAINT eo_checklist_logs_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'den_checklist_logs_performed_by_fkey') THEN
        ALTER TABLE den_checklist_logs DROP CONSTRAINT den_checklist_logs_performed_by_fkey;
        ALTER TABLE den_checklist_logs ADD CONSTRAINT den_checklist_logs_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'do_feedback_forms_submitted_by_fkey') THEN
        ALTER TABLE do_feedback_forms DROP CONSTRAINT do_feedback_forms_submitted_by_fkey;
        ALTER TABLE do_feedback_forms ADD CONSTRAINT do_feedback_forms_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    -- Other author / reference columns
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'compliance_posts_created_by_fkey') THEN
        ALTER TABLE compliance_posts DROP CONSTRAINT compliance_posts_created_by_fkey;
        ALTER TABLE compliance_posts ADD CONSTRAINT compliance_posts_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'hospitality_places_created_by_fkey') THEN
        ALTER TABLE hospitality_places DROP CONSTRAINT hospitality_places_created_by_fkey;
        ALTER TABLE hospitality_places ADD CONSTRAINT hospitality_places_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'finance_documents_uploaded_by_fkey') THEN
        ALTER TABLE finance_documents DROP CONSTRAINT finance_documents_uploaded_by_fkey;
        ALTER TABLE finance_documents ADD CONSTRAINT finance_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'mission_requests_created_by_fkey') THEN
        ALTER TABLE mission_requests DROP CONSTRAINT mission_requests_created_by_fkey;
        ALTER TABLE mission_requests ADD CONSTRAINT mission_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'noscar_assignments_created_by_fkey') THEN
        ALTER TABLE noscar_assignments DROP CONSTRAINT noscar_assignments_created_by_fkey;
        ALTER TABLE noscar_assignments ADD CONSTRAINT noscar_assignments_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'papa_accommodations_created_by_fkey') THEN
        ALTER TABLE papa_accommodations DROP CONSTRAINT papa_accommodations_created_by_fkey;
        ALTER TABLE papa_accommodations ADD CONSTRAINT papa_accommodations_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'program_menus_created_by_fkey') THEN
        ALTER TABLE program_menus DROP CONSTRAINT program_menus_created_by_fkey;
        ALTER TABLE program_menus ADD CONSTRAINT program_menus_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'seat_arrangements_created_by_fkey') THEN
        ALTER TABLE seat_arrangements DROP CONSTRAINT seat_arrangements_created_by_fkey;
        ALTER TABLE seat_arrangements ADD CONSTRAINT seat_arrangements_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'theatre_vips_created_by_fkey') THEN
        ALTER TABLE theatre_vips DROP CONSTRAINT theatre_vips_created_by_fkey;
        ALTER TABLE theatre_vips ADD CONSTRAINT theatre_vips_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'training_schedules_created_by_fkey') THEN
        ALTER TABLE training_schedules DROP CONSTRAINT training_schedules_created_by_fkey;
        ALTER TABLE training_schedules ADD CONSTRAINT training_schedules_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;
