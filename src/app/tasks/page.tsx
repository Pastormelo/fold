import { NotBuiltYet } from '@/components/not-built-yet'

export const metadata = { title: 'Tasks · Fold' }

export default function Page() {
  return (
    <NotBuiltYet
      title="Tasks"
      willHold="What each leader owes, and to whom, with a due window rather than an open-ended list."
      backedBy="Nothing built behind this one yet."
    />
  )
}
