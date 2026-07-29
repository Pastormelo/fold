import { NotBuiltYet } from '@/components/not-built-yet'

export const metadata = { title: 'Setup · Fold' }

export default function Page() {
  return (
    <NotBuiltYet
      title="Setup"
      willHold="Roles and who holds them, individual grants and the review list of access beyond role, Planning Center sync scope, and AI settings."
      backedBy="The grant model, the sync categories, and the AI guardrails are all built and tested behind this."
    />
  )
}
