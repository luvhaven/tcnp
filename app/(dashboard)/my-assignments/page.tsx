import { redirect } from 'next/navigation'

// The old My Assignments screen duplicated My Operations with a separate,
// out-of-date call-sign flow and was no longer linked from navigation. Keep the
// URL working (bookmarks, old notifications) by sending officers to the page
// that owns DO assignments now.
export default function MyAssignmentsPage() {
  redirect('/my-operations')
}
