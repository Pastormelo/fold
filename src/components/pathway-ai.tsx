import { ActionForm } from '@/components/action-form'
import type { AuditRow, DiscoveryView, ReviewView } from '@/data/ai'
import { VERDICTS, type Verdict } from '@/domain/ai'
import { AI_NOT_CONFIGURED_SHORT } from '@/ai/config'
import {
  answerQuestion,
  generateBlueprint,
  generateQuestions,
  recordVerdict,
  runHealthCheck,
  runReview,
  summariseProfile,
} from '@/app/pathway/ai-actions'

/**
 * The four AI parts of the Pathway builder — Discovery, Blueprint, Health check,
 * Review — plus the audit trail that records what the AI did.
 *
 * Rendered as sections rather than tabs. The prototype's tabs hid three of the
 * four behind a click; on a page whose job is to show a church what state its
 * pathway is in, an unanswered discovery question or an undecided recommendation
 * should be visible without hunting for it.
 *
 * Every control here carries its reason when it is unavailable, from one
 * evaluation on the server (§8.3, §8.4). There are three separate reasons a control
 * can be off — no API key, no permission, nothing to work on — and they are
 * different sentences, because "you cannot do this" and "this is not set up" send
 * a person to different places.
 */

const CARD = {
  background: 'var(--surface-card)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-lg)',
  padding: '18px 20px',
} as const

const INPUT = {
  font: 'inherit',
  fontSize: '0.875rem',
  width: '100%',
  maxWidth: 620,
  padding: '8px 11px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-card)',
  color: 'var(--text-primary)',
} as const

const SECTION_LABELS: Record<string, string> = {
  church_and_context: 'Church and context',
  what_happens_now: 'What happens now',
  membership_and_theology: 'Membership and theology',
  people_and_capacity: 'People and capacity',
  discipleship: 'Discipleship',
  communication: 'Communication',
  review_and_governance: 'Review and governance',
}

/**
 * Why a control is off, in priority order.
 *
 * Permission first: somebody who may not edit the pathway does not need to be told
 * about an API key, and telling them would be an invitation to go and set one up
 * for a thing they still could not use.
 */
function unavailableReason(input: {
  gate: { allowed: boolean; note: string }
  configured: boolean
  extra?: string | null
}): string | null {
  if (!input.gate.allowed) return input.gate.note
  // The short form. The full explanation is in the banner at the top of the
  // block, once, where it will actually be read.
  if (!input.configured) return AI_NOT_CONFIGURED_SHORT
  return input.extra ?? null
}

export function PathwayAi({
  discovery,
  review,
  audit,
  hasDraft,
  stageCount,
}: {
  discovery: DiscoveryView
  review: ReviewView
  audit: readonly AuditRow[]
  /** Whether there is a working version for the AI to write to. */
  hasDraft: boolean
  stageCount: number
}) {
  const answeredCount = discovery.answered.length

  return (
    <>
      {/* Said once, at the top, rather than beside all seven controls. The
          buttons carry the four-word version. */}
      {!discovery.configured && discovery.configurationNote && (
        <p
          className="max-w-[680px] text-[0.9375rem]"
          style={{
            borderLeft: '3px solid var(--border-strong)',
            paddingLeft: 14,
            color: 'var(--text-secondary)',
            textWrap: 'pretty',
          }}
        >
          {discovery.configurationNote}
        </p>
      )}

      <Discovery discovery={discovery} />

      <Blueprint
        discovery={discovery}
        hasDraft={hasDraft}
        answeredCount={answeredCount}
      />

      <HealthCheck
        discovery={discovery}
        hasDraft={hasDraft}
        stageCount={stageCount}
      />

      <Review
        review={review}
        hasDraft={hasDraft}
        answeredCount={answeredCount}
        stageCount={stageCount}
      />

      {audit.length > 0 && <Audit audit={audit} />}
    </>
  )
}

/* ────────────────────────────── Discovery ────────────────────────────── */

function Discovery({ discovery }: { discovery: DiscoveryView }) {
  const blocked = unavailableReason({
    gate: discovery.gate,
    configured: discovery.configured,
    extra:
      discovery.pending.length > 0
        ? `Answer the ${discovery.pending.length} open ${discovery.pending.length === 1 ? 'question' : 'questions'} first.`
        : null,
  })

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 style={{ fontSize: '1.125rem' }}>Discovery</h2>
        <span
          className="text-[0.8125rem]"
          style={{ color: 'var(--text-muted)' }}
        >
          {discovery.answered.length} answered
        </span>
      </div>

      <p
        className="max-w-[680px] text-[0.9375rem]"
        style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
      >
        An interview about how this church already receives people, in seven
        sections you can stop and resume. Everything the AI proposes later cites
        these answers by name — which is also why it will say a question is still
        open rather than filling a gap for you.
      </p>

      {/* Seven sections, with where the interview has got to. Derived in the
          domain rather than counted here, so the "current" one is the same one
          the action will ask about. */}
      <ol className="flex flex-wrap gap-2">
        {discovery.progress.map((entry) => (
          <li key={entry.section}>
            <span
              className="text-[0.8125rem]"
              style={{
                display: 'inline-block',
                padding: '5px 12px',
                borderRadius: 'var(--radius-pill)',
                border: entry.current
                  ? '1px solid var(--brand)'
                  : '1px solid var(--border-subtle)',
                background: entry.current
                  ? 'var(--brand-soft)'
                  : 'var(--surface-card)',
                color:
                  entry.answered > 0 || entry.current
                    ? 'var(--text-primary)'
                    : 'var(--text-muted)',
                whiteSpace: 'nowrap',
              }}
            >
              {SECTION_LABELS[entry.section] ?? entry.section}
              {entry.answered > 0 && ` · ${entry.answered}`}
            </span>
          </li>
        ))}
      </ol>

      <div>
        <ActionForm
          action={generateQuestions}
          label={
            discovery.answered.length === 0
              ? 'Start the interview'
              : 'Ask the next questions'
          }
          variant={discovery.pending.length === 0 ? 'primary' : 'secondary'}
          disabled={blocked !== null}
          disabledReason={blocked}
        />
      </div>

      {/* ── Questions waiting for an answer ── */}
      {discovery.pending.length > 0 && (
        <div className="flex flex-col gap-3">
          {discovery.pending.map((question) => (
            <article key={question.id} style={CARD}>
              <span className="eyebrow" style={{ fontSize: '0.5625rem' }}>
                {SECTION_LABELS[question.section] ?? question.section}
              </span>
              <p className="mt-2" style={{ textWrap: 'pretty' }}>
                {question.question}
              </p>
              {/* Why it is being asked, kept beside the question rather than
                  buried — a church answering questions about its own polity is
                  entitled to know what each one is for. */}
              <p
                className="mt-1 text-[0.875rem]"
                style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
              >
                {question.why}
              </p>
              <div className="mt-3">
                <ActionForm
                  action={answerQuestion}
                  fields={{ questionId: question.id }}
                  label="Record this answer"
                  disabled={!discovery.gate.allowed}
                  disabledReason={
                    discovery.gate.allowed ? null : discovery.gate.note
                  }
                >
                  <textarea
                    name="answer"
                    rows={3}
                    placeholder="In your own words. There is no wrong length."
                    style={INPUT}
                  />
                </ActionForm>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* ── The profile the answers establish ── */}
      {(discovery.answered.length > 0 || discovery.profile.length > 0) && (
        <div style={CARD}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 style={{ fontSize: '1rem' }}>What this establishes</h3>
            <ActionForm
              action={summariseProfile}
              label="Summarise the answers"
              disabled={
                unavailableReason({
                  gate: discovery.gate,
                  configured: discovery.configured,
                  extra:
                    discovery.answered.length === 0
                      ? 'Nothing has been answered yet.'
                      : null,
                }) !== null
              }
              disabledReason={unavailableReason({
                gate: discovery.gate,
                configured: discovery.configured,
                extra:
                  discovery.answered.length === 0
                    ? 'Nothing has been answered yet.'
                    : null,
              })}
            />
          </div>

          {/* §2: an inference is never treated as policy, said out loud rather
              than left for a reader to notice from the provenance labels. */}
          {discovery.inferenceNote && (
            <p
              className="mt-3 text-[0.875rem]"
              style={{
                borderLeft: '3px solid var(--ofc-warning)',
                paddingLeft: 12,
                color: 'var(--text-secondary)',
                textWrap: 'pretty',
              }}
            >
              {discovery.inferenceNote} Confirm or correct them before anything
              rests on them.
            </p>
          )}

          {discovery.profile.length === 0 ? (
            <p
              className="mt-3 text-[0.9375rem]"
              style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
            >
              Nothing summarised yet. The answers stand on their own until you
              ask for this.
            </p>
          ) : (
            <dl className="mt-3 flex flex-col gap-3">
              {discovery.profile.map((entry) => (
                <div key={entry.field}>
                  <dt className="flex flex-wrap items-baseline gap-2">
                    <span
                      className="text-[0.8125rem]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {entry.field.replace(/_/g, ' ')}
                    </span>
                    <span
                      className="eyebrow"
                      style={{
                        fontSize: '0.5rem',
                        padding: '2px 7px',
                        borderRadius: 'var(--radius-pill)',
                        background:
                          entry.provenance === 'inferred'
                            ? 'var(--surface-sunken)'
                            : 'var(--brand-soft)',
                        border:
                          entry.provenance === 'inferred'
                            ? '1px solid var(--border-default)'
                            : '1px solid var(--brand-soft-border)',
                      }}
                    >
                      {entry.provenance}
                    </span>
                  </dt>
                  <dd style={{ textWrap: 'pretty' }}>{entry.value}</dd>
                  {entry.sourceNote && (
                    <dd
                      className="text-[0.8125rem] italic"
                      style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                    >
                      From: {entry.sourceNote}
                    </dd>
                  )}
                </div>
              ))}
            </dl>
          )}
        </div>
      )}

      {/* ── The answers themselves ── */}
      {discovery.answered.length > 0 && (
        <details style={CARD}>
          <summary style={{ cursor: 'pointer' }}>
            {discovery.answered.length}{' '}
            {discovery.answered.length === 1 ? 'answer' : 'answers'} on the
            record
          </summary>
          <div className="mt-4 flex flex-col gap-4">
            {discovery.answered.map((answer) => (
              <div key={answer.id}>
                <div className="flex flex-wrap items-baseline gap-2">
                  {/* The label a recommendation cites, shown so a citation can
                      actually be followed. */}
                  <span
                    className="text-[0.75rem]"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                    }}
                  >
                    {answer.label}
                  </span>
                  <span
                    className="text-[0.8125rem]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {SECTION_LABELS[answer.section] ?? answer.section}
                  </span>
                </div>
                <p className="mt-1 text-[0.9375rem]" style={{ textWrap: 'pretty' }}>
                  {answer.question}
                </p>
                <p className="mt-1" style={{ textWrap: 'pretty' }}>
                  {answer.answer}
                </p>
                <p
                  className="mt-1 text-[0.8125rem]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {answer.answeredByName}
                </p>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  )
}

/* ────────────────────────────── Blueprint ────────────────────────────── */

function Blueprint({
  discovery,
  hasDraft,
  answeredCount,
}: {
  discovery: DiscoveryView
  hasDraft: boolean
  answeredCount: number
}) {
  const blocked = unavailableReason({
    gate: discovery.gate,
    configured: discovery.configured,
    extra: !hasDraft
      ? 'There is no draft to add stages to. Edit the published version to fork a new draft.'
      : answeredCount === 0
        ? 'Nothing has been answered yet, and a blueprint built on no answers would be somebody else’s pathway.'
        : null,
  })

  return (
    <section className="flex flex-col gap-3">
      <h2 style={{ fontSize: '1.125rem' }}>Blueprint</h2>
      <p
        className="max-w-[680px] text-[0.9375rem]"
        style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
      >
        Proposed stages, drawn from the answers above and citing them. They are
        added <em>after</em> anything you have already written — nothing you wrote
        is replaced — and each arrives with its stopping, escalation and
        reactivation rules blank, because those are the ones only this church can
        decide.
      </p>
      <div>
        <ActionForm
          action={generateBlueprint}
          label="Propose stages from the answers"
          disabled={blocked !== null}
          disabledReason={blocked}
        />
      </div>
    </section>
  )
}

/* ───────────────────────────── Health check ───────────────────────────── */

function HealthCheck({
  discovery,
  hasDraft,
  stageCount,
}: {
  discovery: DiscoveryView
  hasDraft: boolean
  stageCount: number
}) {
  const blocked = unavailableReason({
    gate: discovery.gate,
    configured: discovery.configured,
    extra: !hasDraft
      ? 'The published pathway is not checked. Fork a draft and the check runs on that.'
      : stageCount === 0
        ? 'There are no stages to check yet.'
        : null,
  })

  return (
    <section className="flex flex-col gap-3">
      <h2 style={{ fontSize: '1.125rem' }}>Check this draft</h2>
      <p
        className="max-w-[680px] text-[0.9375rem]"
        style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
      >
        Looks for a stage nobody owns, follow-up that never stops, a stage with no
        outcome, two rules that contradict each other, and anything that would put
        a person&rsquo;s private situation where the wrong people can read it.
        Fields you marked deliberately empty are left alone. Findings appear above,
        and a high-severity one stands between this draft and publishing until it
        is fixed or acknowledged with a reason.
      </p>
      <div>
        <ActionForm
          action={runHealthCheck}
          label="Run the health check"
          disabled={blocked !== null}
          disabledReason={blocked}
        />
      </div>
      <p
        className="text-[0.8125rem]"
        style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
      >
        Re-running replaces findings nobody has acted on. Anything you
        acknowledged with a reason stays — that reason is yours, not the
        check&rsquo;s, to clear.
      </p>
    </section>
  )
}

/* ─────────────────────────────── Review ─────────────────────────────── */

const VERDICT_LABELS: Record<Verdict, string> = {
  accepted: 'Accept',
  modified: 'Accept with changes',
  saved: 'Save for later',
  rejected: 'Reject',
}

function Review({
  review,
  hasDraft,
  answeredCount,
  stageCount,
}: {
  review: ReviewView
  hasDraft: boolean
  answeredCount: number
  stageCount: number
}) {
  const blocked = unavailableReason({
    gate: review.gate,
    configured: review.configured,
    extra: !hasDraft
      ? 'There is no draft to review.'
      : stageCount === 0
        ? 'There are no stages to review yet.'
        : answeredCount === 0
          ? 'Recommendations have to cite this church’s own answers, and there are none yet.'
          : null,
  })

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 style={{ fontSize: '1.125rem' }}>Review</h2>
        {review.rows.length > 0 && (
          <span
            className="text-[0.8125rem]"
            style={{ color: 'var(--text-muted)' }}
          >
            {review.openCount} still to decide · {review.rows.length} in total
          </span>
        )}
      </div>

      <p
        className="max-w-[680px] text-[0.9375rem]"
        style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
      >
        Where this draft does not match what you said you wanted. Each
        recommendation says what was noticed, why it matters, what happens if
        nothing changes, the options, and which part is your judgment rather than
        the AI&rsquo;s. Every verdict needs a reason, including an acceptance.
      </p>

      <div>
        <ActionForm
          action={runReview}
          label={
            review.rows.length === 0
              ? 'Review the draft'
              : 'Review it again'
          }
          disabled={blocked !== null}
          disabledReason={blocked}
        />
      </div>

      {review.rows.map((row) => (
        <article
          key={row.recommendation.id}
          style={{
            ...CARD,
            // A decided recommendation recedes but does not disappear. §7 keeps
            // rejections visible so a later leader can see the finding was
            // considered rather than missed.
            opacity: row.open ? 1 : 0.82,
          }}
        >
          <p className="font-semibold" style={{ textWrap: 'pretty' }}>
            {row.recommendation.noticed}
          </p>
          <p className="mt-2 text-[0.9375rem]" style={{ textWrap: 'pretty' }}>
            {row.recommendation.whyItMatters}
          </p>
          <p
            className="mt-2 text-[0.9375rem]"
            style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
          >
            If nothing changes: {row.recommendation.consequence}
          </p>

          <div className="mt-3">
            <span className="eyebrow" style={{ fontSize: '0.5625rem' }}>
              Options
            </span>
            <ul className="mt-1 list-disc pl-5 text-[0.9375rem]">
              {row.recommendation.options.map((option) => (
                <li key={option} style={{ textWrap: 'pretty' }}>
                  {option}
                </li>
              ))}
            </ul>
          </div>

          {/* The fifth part, given its own frame rather than a line at the end.
              It is what keeps this advice rather than authority. */}
          <p
            className="mt-3 text-[0.9375rem]"
            style={{
              borderLeft: '3px solid var(--brand)',
              paddingLeft: 12,
              textWrap: 'pretty',
            }}
          >
            Your judgment, not the AI&rsquo;s: {row.recommendation.humanJudgment}
          </p>

          <p
            className="mt-3 text-[0.8125rem]"
            style={{ color: 'var(--text-muted)' }}
          >
            Rests on {row.citations.join(', ')}
          </p>

          {row.verdict === null ? (
            <div className="mt-4 flex flex-col gap-2">
              {VERDICTS.map((verdict) => (
                <ActionForm
                  key={verdict}
                  action={recordVerdict}
                  fields={{
                    recommendationId: row.recommendation.id,
                    verdict,
                  }}
                  label={VERDICT_LABELS[verdict]}
                  disabled={!review.gate.allowed}
                  disabledReason={
                    review.gate.allowed ? null : review.gate.note
                  }
                >
                  <input
                    name="reason"
                    placeholder={
                      verdict === 'rejected'
                        ? 'Why you are not doing this — it stays on the record'
                        : 'Your reason, which is what a future leader will read'
                    }
                    style={INPUT}
                  />
                </ActionForm>
              ))}
            </div>
          ) : (
            <div
              className="mt-4"
              style={{
                borderTop: '1px solid var(--border-subtle)',
                paddingTop: 12,
              }}
            >
              <p className="text-[0.875rem]">
                <strong>{VERDICT_LABELS[row.verdict.verdict]}</strong> ·{' '}
                {row.verdict.decidedByName}
              </p>
              <p
                className="mt-1 text-[0.875rem]"
                style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
              >
                {row.verdict.reason}
              </p>
              {row.verdict.verdict === 'saved' && (
                <p
                  className="mt-1 text-[0.8125rem]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Still counted as needing a decision.
                </p>
              )}
            </div>
          )}
        </article>
      ))}
    </section>
  )
}

/* ──────────────────────────── Audit trail ──────────────────────────── */

const EVENT_LABELS: Record<string, string> = {
  prompt_sent: 'Asked the AI',
  recommendation_made: 'AI answered',
  verdict_recorded: 'Decision',
  manual_edit: 'Edited by hand',
  publication_decision: 'Publishing',
}

const WHEN = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

function Audit({ audit }: { audit: readonly AuditRow[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 style={{ fontSize: '1.125rem' }}>What the AI has been asked</h2>
      <p
        className="max-w-[680px] text-[0.9375rem]"
        style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
      >
        Every prompt, every answer and every decision, attributed to the person it
        was done for. A request that failed is here too — otherwise the only AI
        activity this church could see would be the successful kind.
      </p>
      <div style={CARD}>
        <ol className="flex flex-col gap-3">
          {audit.map((entry) => (
            <li key={entry.id}>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="eyebrow" style={{ fontSize: '0.5rem' }}>
                  {EVENT_LABELS[entry.event] ?? entry.event}
                </span>
                <span
                  className="text-[0.8125rem]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {entry.actorName} · {WHEN.format(entry.occurredAt)}
                </span>
              </div>
              <p className="text-[0.9375rem]" style={{ textWrap: 'pretty' }}>
                {entry.detail}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
