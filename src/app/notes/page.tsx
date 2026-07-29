import { NotBuiltYet } from '@/components/not-built-yet'

export const metadata = { title: 'Notes · Fold' }

export default function Page() {
  return (
    <NotBuiltYet
      title="Notes"
      willHold="Every care note across the church, searchable, each at the tier it was written at."
      backedBy="The tier model that redacts them is built and tested; this is the cross-church view of it."
    />
  )
}
