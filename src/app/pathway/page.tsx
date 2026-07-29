import { NotBuiltYet } from '@/components/not-built-yet'

export const metadata = { title: 'Pathway · Fold' }

export default function Page() {
  return (
    <NotBuiltYet
      title="Pathway"
      willHold="How a guest becomes a member here: the stages, who owns each one, and the stopping rules. Six designed phases, from discovery through to publishing a version."
      backedBy="The rules behind it are built and tested — the lifecycle state machine, the draft diff, and the publish gate with its approval requirement."
    />
  )
}
