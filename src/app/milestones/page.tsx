import { NotBuiltYet } from '@/components/not-built-yet'

export const metadata = { title: 'Milestones · Fold' }

export default function Page() {
  return (
    <NotBuiltYet
      title="Milestones"
      willHold="Baptisms, memberships, and the church's own recordable moments — and which of them map to a field that already exists in Planning Center."
      backedBy="The mapping constraints are built and tested: Fold offers only what Planning Center already has, and never invents a field or a value."
    />
  )
}
