import { NotBuiltYet } from '@/components/not-built-yet'

export const metadata = { title: 'Prayer · Fold' }

export default function Page() {
  return (
    <NotBuiltYet
      title="Prayer"
      willHold="Requests and their recorded outcomes, kept after they are answered rather than cleared away."
      backedBy="Nothing built behind this one yet."
    />
  )
}
