import { format } from 'date-fns'
import type { DenGuest } from '@/lib/den-plan'

type Db = any

/**
 * The one page an officer takes onto the floor: guests and what to know about
 * hosting them, who is on which shift, what is still to do, and the
 * checklists. Built in the browser from what the officer is allowed to see,
 * so it never contains more than the page itself shows them.
 */
export async function downloadRunSheet(db: Db, programId: string, programName: string) {
  const [guests, team, shifts, tasks, checklists] = await Promise.all([
    db.rpc('den_guest_profiles', { target_program: programId }),
    db.rpc('den_programme_team', { target_program: programId }),
    db.from('den_shifts').select('title, starts_at, ends_at, officers_needed, members:den_shift_members(user_id)').eq('program_id', programId).order('starts_at'),
    db.from('unit_tasks')
      .select('title, assigned_to, due_at, status, project:unit_projects!inner(program_id, project_type)')
      .eq('project.program_id', programId).eq('project.project_type', 'programme_operation')
      .in('status', ['todo', 'in_progress', 'blocked']).order('due_at', { ascending: true, nullsFirst: false }),
    db.from('den_checklists').select('title, items:den_checklist_items(label, position, done_at)').eq('program_id', programId).order('created_at'),
  ])
  for (const result of [guests, team, shifts, tasks, checklists]) if (result.error) throw result.error

  const names = new Map<string, string>((team.data ?? []).map((member: any) => [member.user_id, member.full_name ?? 'Officer']))
  const nameOf = (id: string | null) => (id ? names.get(id) ?? 'Den officer' : 'Unassigned')

  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 14
  let y = margin

  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(120)
  doc.text('NOVEMBER (DEN) · RUN SHEET', margin, y + 3)
  doc.setFontSize(16); doc.setTextColor(20)
  doc.text(programName, margin, y + 11)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110)
  doc.text(`Printed ${format(new Date(), 'd MMM yyyy, HH:mm')}`, margin, y + 16)
  y += 22

  const table = (title: string, head: string[], body: (string | number)[][], empty: string) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(20)
    if (y > 270) { doc.addPage(); y = margin }
    doc.text(title, margin, y)
    y += 2
    autoTable(doc, {
      startY: y,
      head: [head],
      body: body.length ? body : [[empty, ...head.slice(1).map(() => '')]],
      margin: { left: margin, right: margin },
      styles: { fontSize: 8.5, cellPadding: 1.8, valign: 'top' },
      headStyles: { fillColor: [234, 88, 12], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 248, 248] },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  const guestRows = ((guests.data ?? []) as DenGuest[]).map(guest => [
    [guest.title, guest.full_name].filter(Boolean).join(' '),
    guest.dietary_restrictions ?? '',
    [guest.food_preferences, guest.water_temperature && `Water: ${guest.water_temperature}`, guest.special_requirements].filter(Boolean).join('\n'),
    guest.entourage ? String(guest.entourage) : '',
  ])
  table('Guests', ['Guest', 'Dietary needs', 'Preferences', 'Entourage'], guestRows, 'No guests on this programme')

  const shiftRows = (shifts.data ?? []).map((shift: any) => [
    `${format(new Date(shift.starts_at), 'EEE d MMM HH:mm')}–${format(new Date(shift.ends_at), 'HH:mm')}`,
    shift.title,
    (shift.members ?? []).map((member: any) => nameOf(member.user_id)).join(', ') || '—',
    `${(shift.members ?? []).length}/${shift.officers_needed}`,
  ])
  table('Roster', ['When', 'Shift', 'Officers', 'Cover'], shiftRows, 'No shifts set')

  const taskRows = (tasks.data ?? []).map((task: any) => [
    task.title,
    nameOf(task.assigned_to),
    task.due_at ? format(new Date(task.due_at), 'EEE d MMM HH:mm') : '',
    task.status === 'blocked' ? 'Blocked' : task.status === 'in_progress' ? 'In progress' : 'To do',
  ])
  table('Open tasks', ['Task', 'Owner', 'Due', 'Status'], taskRows, 'Nothing open')

  for (const list of checklists.data ?? []) {
    const items = [...(list.items ?? [])].sort((a: any, b: any) => a.position - b.position)
    table(`Checklist: ${list.title}`, ['', 'Item'], items.map((item: any) => [item.done_at ? '✓' : '☐', item.label]), 'No items')
  }

  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)
    doc.setFontSize(7.5); doc.setTextColor(150)
    doc.text(`Page ${page} of ${pages}`, doc.internal.pageSize.getWidth() - margin, doc.internal.pageSize.getHeight() - 7, { align: 'right' })
  }

  const slug = programName.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'programme'
  doc.save(`den-run-sheet-${slug}.pdf`)
}
