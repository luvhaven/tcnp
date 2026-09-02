-- Each of these checklist/log tables is a specific unit's SOP-mandated
-- responsibility (FLOWER=Tango 1.05, Den=Victor 1.09, Comfort=November 1.07,
-- DO feedback=Delta 1.08). They were insertable by ANY authenticated user
-- regardless of unit, which undermines the SOP's "complete and accurate
-- record of the Unit's activities" success factor. Read access stays broad
-- (command centre / other units legitimately need visibility).

DROP POLICY IF EXISTS "Authenticated can insert flower logs" ON public.cheetah_flower_logs;
CREATE POLICY "flower_logs_tango_insert" ON public.cheetah_flower_logs
  FOR INSERT WITH CHECK (is_admin() OR is_tango_oscar());

DROP POLICY IF EXISTS "Authenticated can insert den logs" ON public.den_checklist_logs;
CREATE POLICY "den_logs_victor_insert" ON public.den_checklist_logs
  FOR INSERT WITH CHECK (is_admin() OR is_victor_oscar());

DROP POLICY IF EXISTS "Authenticated can insert comfort logs" ON public.nest_comfort_logs;
CREATE POLICY "comfort_logs_november_insert" ON public.nest_comfort_logs
  FOR INSERT WITH CHECK (is_admin() OR is_november_oscar());

DROP POLICY IF EXISTS "DOs can insert feedback" ON public.do_feedback_forms;
CREATE POLICY "feedback_delta_insert" ON public.do_feedback_forms
  FOR INSERT WITH CHECK (is_admin() OR is_delta_oscar());

-- Echo Oscar (equipment/AV) is a legacy standalone unit but still has an
-- active checklist page — scope by oscar unit match rather than a
-- dedicated function since Echo has no is_echo_oscar() helper yet.
DROP POLICY IF EXISTS "Authenticated can insert EO logs" ON public.eo_checklist_logs;
CREATE POLICY "eo_logs_echo_insert" ON public.eo_checklist_logs
  FOR INSERT WITH CHECK (is_admin() OR oscar_unit_matches('echo'));
;
