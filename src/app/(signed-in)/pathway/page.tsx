import { ActionForm } from '@/components/action-form'
import { PageShell } from '@/components/page-shell'
import { PathwayAi } from '@/components/pathway-ai'
import { getAiAudit, getDiscovery, getRecommendations } from '@/data/ai'
import { getPathwayOverview, getPathwayVersions } from '@/data/pathway'
import { PATHWAY_STATES, describeState } from '@/domain/pathway'

import {
  acknowledgeFinding,
  addressObjection,
  beginPathway,
  chooseMigration,
  recordReview,
  takePathwayAction,
} from './actions'

export const metadata = { title: 'Pathway · Fold' }

/**
 * What a stage records, in the order the editor asks for it.
 *
 * The field names are the keys of `EditableStage`, so this list and the thing it
 * describes cannot drift apart without the diff noticing. The questions are the
 * design's own wording.
 */
const STAGE_PROMPTS = [
  { field: 'Name', asks: 'What this church calls the stage internally.' },
  {
    field: 'Public name',
    asks: 'What a guest is told it is called, which is often gentler.',
  },
  { field: 'Purpose', asks: 'Why the stage exists at all.' },
  { field: 'Outcome', asks: 'What is different about the person afterwards.' },
  { field: 'Entry condition', asks: 'What puts somebody into this stage.' },
  {
    field: 'Owner',
    asks: 'Which job carries it. A stage nobody owns does not happen.',
  },
  {
    field: 'Required actions',
    asks: 'What has to happen before the stage is complete.',
  },
  { field: 'Optional actions', asks: 'What helps but is not required.' },
  {
    field: 'Completion condition',
    asks: 'How you know somebody is ready to move on.',
  },
  {
    field: 'Stopping rule',
    asks: 'When follow-up ends. Without this it ends arbitrarily, depending on who is holding it.',
  },
  {
    field: 'Reactivation rule',
    asks: 'What happens if they come back after follow-up stopped.',
  },
  {
    field: 'Escalation rule',
    asks: 'When this stops being a volunteer’s job.',
  },
  { field: 'Milestones', asks: 'What gets recorded against the person.' },
] as const

/**
 * Pathway — the versioned document that says how this church receives people.
 *
 * The prototype's Pathway view had ten tabs, four of them driven by an AI that
 * interviews the church and evaluates the draft. What is built here is the part
 * that does not depend on a model being wired up: the lifecycle, the stages, the
 * diff against what is live, the review record, and the publish gate. Those are
 * the parts §4 and §8 have rules about, and the rules live in
 * `@/domain/pathway*` — tested — rather than in this file.
 *
 * Every control is rendered from `availableActions`, which calls the same
 * `attemptTransition` the button's action calls. A button that is offered will
 * work; a button that is not carries the reason (§8.3, §8.4).
 */
export default async function PathwayPage() {
  const overview = await getPathwayOverview()

  if (overview.kind === 'none') {
    // Discovery comes *before* a draft — it is the first of §4's states, and the
    // interview is how a church gets to a draft in the first place. Rendering the
    // AI block here too means a church with nothing yet can start answering
    // questions; Blueprint, the health check and Review each say plainly that
    // there is no draft to work on, which is true and is the next thing to do.
    const [discovery, review, audit] = await Promise.all([
      getDiscovery(),
      getRecommendations(),
      getAiAudit(),
    ])

    return (
      <PageShell eyebrow="Nothing published" title="Pathway">
        <div className="flex flex-col gap-9">
          <div className="flex max-w-[680px] flex-col gap-4">
            <p style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}>
              A pathway is how this church says it receives someone — the stages
              between a first visit and being known by name, who owns each one,
              and when follow-up stops. Nothing here is filled in for you: a
              four-step pathway is one church&rsquo;s answer, not the
              product&rsquo;s.
            </p>
            <ActionForm
              action={beginPathway}
              label="Begin a draft"
              variant="primary"
              disabled={!overview.offer.available}
              disabledReason={overview.offer.reason}
            />
            {overview.offer.inferredNote && (
              <Inferred note={overview.offer.inferredNote} />
            )}
          </div>

          {/* The interview, before there is anything to interview about. A church
              with no pathway is exactly who discovery is for. */}
          <PathwayAi
            discovery={discovery}
            review={review}
            audit={audit}
            hasDraft={false}
            stageCount={0}
          />

          {/* An empty page with one button teaches nothing. These two sections
              are the real shape of what a draft will hold, read out of the
              domain rather than described in prose that could drift from it. */}
          <section className="flex flex-col gap-3">
            <h2 style={{ fontSize: '1.125rem' }}>What each stage will ask</h2>
            <p
              className="text-[0.9375rem]"
              style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
            >
              Not every stage needs every field. A stage left deliberately empty
              is marked as such and stops being flagged — a decision not to have
              a rule is a different thing from forgetting one.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {STAGE_PROMPTS.map((prompt) => (
                <div
                  key={prompt.field}
                  style={{
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '14px 16px',
                  }}
                >
                  <span className="eyebrow" style={{ fontSize: '0.5625rem' }}>
                    {prompt.field}
                  </span>
                  <p
                    className="mt-2 text-[0.9375rem]"
                    style={{ textWrap: 'pretty' }}
                  >
                    {prompt.asks}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 style={{ fontSize: '1.125rem' }}>
              What it goes through before it is live
            </h2>
            <p
              className="text-[0.9375rem]"
              style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
            >
              A pathway moves when somebody does something — submits it,
              requests changes, approves it, publishes it. There is no way to
              set a state directly, and publishing needs a recorded approval,
              every blocking health finding either resolved or acknowledged with
              a reason, and a decision about the people already mid-pathway.
            </p>
            <ol className="flex flex-wrap gap-2">
              {PATHWAY_STATES.map((state, index) => (
                <li
                  key={state}
                  className="flex items-center gap-2 text-[0.9375rem]"
                >
                  <span
                    style={{
                      background: 'var(--surface-card)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-pill)',
                      padding: '5px 13px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {describeState(state)}
                  </span>
                  {index < PATHWAY_STATES.length - 1 && (
                    <span style={{ color: 'var(--text-muted)' }}>→</span>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </PageShell>
    )
  }

  // Four reads in parallel rather than in sequence: they are independent, and on
  // a page this size sequential round trips are what a slow page is made of.
  const [versions, discovery, review, audit] = await Promise.all([
    getPathwayVersions(),
    getDiscovery(),
    getRecommendations(),
    getAiAudit(),
  ])
  const { diff, readiness } = overview

  return (
    <PageShell
      eyebrow={`Version ${overview.versionNumber} · ${overview.stateLabel}`}
      title={overview.internalName || 'Pathway'}
    >
      <div className="flex flex-col gap-9">
        {/* ── What is live, and what this version is ── */}
        <section
          style={{
            background: 'var(--surface-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '18px 20px',
          }}
        >
          <p style={{ textWrap: 'pretty' }}>{overview.liveNote}</p>
          {overview.publicName && (
            <p
              className="mt-2 text-[0.9375rem]"
              style={{ color: 'var(--text-muted)' }}
            >
              Called <strong>{overview.publicName}</strong> in front of guests.
            </p>
          )}
          <p
            className="mt-3 text-[0.9375rem]"
            style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
          >
            {diff.summary}
          </p>
        </section>

        {/* ── Stages ── */}
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.125rem' }}>
            {overview.stages.length}{' '}
            {overview.stages.length === 1 ? 'stage' : 'stages'}
          </h2>
          {overview.stages.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>
              No stages yet. A pathway with no stages does not receive anyone.
            </p>
          ) : (
            overview.stages.map((stage, index) => {
              const stageDiff = diff.stages.find(
                (entry) => entry.stageId === stage.id
              )
              return (
                <article
                  key={stage.id}
                  style={{
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '18px 20px',
                  }}
                >
                  <div className="flex flex-wrap items-baseline gap-3">
                    <span
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: 'var(--text-muted)',
                      }}
                    >
                      {index + 1}
                    </span>
                    <h3 style={{ fontSize: '1.0625rem' }}>{stage.name}</h3>
                    {stage.ownerRole && (
                      <span
                        className="text-[0.8125rem]"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {stage.ownerRole}
                      </span>
                    )}
                    {stageDiff && stageDiff.status !== 'unchanged' && (
                      <span
                        className="eyebrow"
                        style={{
                          fontSize: '0.5rem',
                          background: 'var(--brand-soft)',
                          border: '1px solid var(--brand-soft-border)',
                          borderRadius: 'var(--radius-pill)',
                          padding: '3px 9px',
                        }}
                      >
                        {stageDiff.status}
                      </span>
                    )}
                  </div>

                  {stage.subtitle && (
                    <p
                      className="mt-2 text-[0.9375rem]"
                      style={{
                        color: 'var(--text-secondary)',
                        textWrap: 'pretty',
                      }}
                    >
                      {stage.subtitle}
                    </p>
                  )}

                  <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Field label="Purpose" value={stage.purpose} />
                    <Field label="Outcome" value={stage.outcome} />
                    <Field label="Entry" value={stage.entryCondition} />
                    <Field
                      label="Complete when"
                      value={stage.completionCondition}
                      deliberatelyAbsent={stage.intentionallyAbsent.includes(
                        'completionCondition'
                      )}
                    />
                    {/* Named separately because §8 keeps returning to it: a
                        pathway with no stopping rule is one where follow-up ends
                        arbitrarily, depending on who happens to be holding it. */}
                    <Field
                      label="Follow-up stops when"
                      value={stage.stoppingRule}
                      deliberatelyAbsent={stage.intentionallyAbsent.includes(
                        'stoppingRule'
                      )}
                    />
                    <Field
                      label="If they come back"
                      value={stage.reactivationRule}
                      deliberatelyAbsent={stage.intentionallyAbsent.includes(
                        'reactivationRule'
                      )}
                    />
                  </dl>

                  {stage.requiredActions.length > 0 && (
                    <List label="Required" items={stage.requiredActions} />
                  )}
                  {stage.optionalActions.length > 0 && (
                    <List label="Optional" items={stage.optionalActions} />
                  )}
                  {stage.milestones.length > 0 && (
                    <List label="Milestones" items={stage.milestones} />
                  )}

                  {stageDiff && stageDiff.changes.length > 0 && (
                    <div className="mt-4 flex flex-col gap-2">
                      <span
                        className="eyebrow"
                        style={{ fontSize: '0.5625rem' }}
                      >
                        Changed since version {overview.live?.versionNumber}
                      </span>
                      {stageDiff.changes.map((change) => (
                        <p
                          key={change.field}
                          className="text-[0.8125rem]"
                          style={{
                            color: 'var(--text-secondary)',
                            textWrap: 'pretty',
                          }}
                        >
                          <strong>{change.label}:</strong>{' '}
                          <span style={{ color: 'var(--text-muted)' }}>
                            {change.before || '(empty)'}
                          </span>{' '}
                          → {change.after || '(empty)'}
                        </p>
                      ))}
                    </div>
                  )}
                </article>
              )
            })
          )}

          {/* §8.8: only the absences that look like oversights. */}
          {overview.absences.length > 0 && (
            <div
              style={{
                borderLeft: '3px solid var(--ofc-warning)',
                paddingLeft: 14,
              }}
            >
              <p className="font-semibold">
                {overview.absences.length}{' '}
                {overview.absences.length === 1 ? 'rule is' : 'rules are'} not
                filled in
              </p>
              <p
                className="mt-1 text-[0.875rem]"
                style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
              >
                These may be deliberate. Marked as such on the stage, they stop
                being listed here — a decision not to have a rule is a different
                thing from forgetting one.
              </p>
              <ul className="mt-2 list-disc pl-5 text-[0.875rem]">
                {overview.absences.map((absence) => (
                  <li
                    key={`${absence.stageId}-${absence.field}`}
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {absence.stageName} — {absence.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* ── Review ── */}
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.125rem' }}>Review</h2>
          <p
            className="text-[0.9375rem]"
            style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
          >
            Nothing skips review, and review is not a formality when a reviewer
            can hold publication.
          </p>

          {overview.reviews.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>
              Nobody has reviewed this version.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {overview.reviews.map((review) => (
                <div
                  key={review.reviewerId}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
                  style={{
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '12px 14px',
                  }}
                >
                  <span className="font-semibold">{review.reviewerName}</span>
                  <span
                    className="text-[0.875rem]"
                    style={{
                      color: review.holdsPublication
                        ? 'var(--ofc-danger)'
                        : review.approved
                          ? 'var(--ofc-success)'
                          : 'var(--text-muted)',
                    }}
                  >
                    {review.standing}
                  </span>
                  {review.note && (
                    <span
                      className="basis-full text-[0.875rem]"
                      style={{
                        color: 'var(--text-secondary)',
                        textWrap: 'pretty',
                      }}
                    >
                      &ldquo;{review.note}&rdquo;
                    </span>
                  )}
                  {review.holdsPublication && (
                    <div className="basis-full">
                      <ActionForm
                        action={addressObjection}
                        fields={{ reviewerId: review.reviewerId }}
                        label="Mark addressed"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {overview.isWorkingVersion && (
            <div className="mt-2 flex flex-col gap-4">
              <ActionForm
                action={recordReview}
                fields={{ position: 'approve' }}
                label="Approve this version"
              />
              <ActionForm
                action={recordReview}
                fields={{ position: 'request_changes' }}
                label="Request changes"
              >
                <textarea
                  name="note"
                  rows={2}
                  placeholder="What needs to change, and why"
                  style={{
                    font: 'inherit',
                    fontSize: '0.9375rem',
                    maxWidth: 520,
                    padding: '9px 11px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--surface-card)',
                  }}
                />
              </ActionForm>
            </div>
          )}
        </section>

        {/* ── Health findings ── */}
        {overview.findings.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 style={{ fontSize: '1.125rem' }}>Health check</h2>
            {overview.findings.map((finding) => {
              const acknowledged =
                finding.dismissedById !== null &&
                finding.dismissalReason !== null
              return (
                <article
                  key={finding.id}
                  style={{
                    background: 'var(--surface-card)',
                    borderLeft: `3px solid ${
                      finding.blocksPublishing && !acknowledged
                        ? 'var(--ofc-danger)'
                        : 'var(--border-strong)'
                    }`,
                    borderTop: '1px solid var(--border-subtle)',
                    borderRight: '1px solid var(--border-subtle)',
                    borderBottom: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '14px 16px',
                  }}
                >
                  <div className="flex flex-wrap items-baseline gap-3">
                    <span className="eyebrow" style={{ fontSize: '0.5625rem' }}>
                      {finding.category}
                    </span>
                    <span
                      className="text-[0.8125rem]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {finding.severity}
                      {finding.blocksPublishing && ' · blocks publishing'}
                    </span>
                  </div>
                  <p className="mt-2" style={{ textWrap: 'pretty' }}>
                    {finding.evidence}
                  </p>
                  <p
                    className="mt-1 text-[0.875rem]"
                    style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                  >
                    {finding.why}
                  </p>
                  {acknowledged ? (
                    <p
                      className="mt-3 text-[0.875rem] italic"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Acknowledged: {finding.dismissalReason}
                    </p>
                  ) : (
                    finding.blocksPublishing && (
                      <div className="mt-3">
                        <ActionForm
                          action={acknowledgeFinding}
                          fields={{ findingId: finding.id }}
                          label="Acknowledge and publish past this"
                        >
                          <input
                            name="reason"
                            placeholder="The reason, which goes on the version record"
                            style={{
                              font: 'inherit',
                              fontSize: '0.875rem',
                              maxWidth: 520,
                              padding: '8px 11px',
                              borderRadius: 'var(--radius-sm)',
                              border: '1px solid var(--border-default)',
                              background: 'var(--surface-card)',
                            }}
                          />
                        </ActionForm>
                      </div>
                    )
                  )}
                </article>
              )
            })}
          </section>
        )}

        {/* ── The AI parts: discovery, blueprint, health check, review ──
            Placed after the draft itself and before the publish gate, which is
            the order they matter in: what the draft says, then what the AI has
            noticed about it, then whether it can go live. Every control inside
            carries its own reason for being unavailable, so this block renders
            whether or not an API key is configured. */}
        <PathwayAi
          discovery={discovery}
          review={review}
          audit={audit}
          hasDraft={overview.isWorkingVersion}
          stageCount={overview.stages.length}
        />

        {/* ── The publish gate ── */}
        {readiness && (
          <section className="flex flex-col gap-4">
            <h2 style={{ fontSize: '1.125rem' }}>Publishing</h2>
            <p style={{ textWrap: 'pretty' }}>{readiness.summary}</p>

            {readiness.blockers.length > 0 && (
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {readiness.blockers.map((blocker) => (
                  <li
                    key={blocker.code}
                    className="text-[0.9375rem]"
                    style={{ color: 'var(--ofc-danger)', textWrap: 'pretty' }}
                  >
                    {blocker.reason}
                  </li>
                ))}
              </ul>
            )}

            {readiness.approvals.length > 0 && (
              <p
                className="text-[0.9375rem]"
                style={{ color: 'var(--text-secondary)' }}
              >
                Approved by{' '}
                {readiness.approvals
                  .map((entry) => entry.reviewerName)
                  .join(', ')}
                .
              </p>
            )}

            <div className="flex flex-col gap-3">
              <span className="eyebrow" style={{ fontSize: '0.5625rem' }}>
                People already in the pathway
              </span>
              <p
                className="text-[0.9375rem]"
                style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
              >
                {readiness.peopleInFlight === 1
                  ? '1 person is mid-pathway.'
                  : `${readiness.peopleInFlight} people are mid-pathway.`}{' '}
                Nobody moves unless somebody says so. There is no default here,
                and that is deliberate.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {overview.migrationOptions.map((option) => (
                  <div
                    key={option.choice}
                    style={{
                      background: option.chosen
                        ? 'var(--brand-soft)'
                        : 'var(--surface-card)',
                      border: option.chosen
                        ? '1px solid var(--brand-soft-border)'
                        : '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 14px',
                    }}
                  >
                    <p
                      className="text-[0.9375rem]"
                      style={{ textWrap: 'pretty' }}
                    >
                      {option.label}
                    </p>
                    <div className="mt-2">
                      <ActionForm
                        action={chooseMigration}
                        fields={{ choice: option.choice }}
                        label={option.chosen ? 'Chosen' : 'Choose this'}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── What can be done from here ── */}
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.125rem' }}>What you can do from here</h2>
          <div className="flex flex-col gap-4">
            {overview.actions.map((offer) => (
              <div key={offer.action} className="flex flex-col gap-1">
                <ActionForm
                  action={takePathwayAction}
                  fields={{ action: offer.action }}
                  label={offer.label}
                  variant={offer.action === 'publish' ? 'primary' : 'secondary'}
                  disabled={!offer.available}
                  disabledReason={offer.reason}
                />
                {offer.available && offer.inferredNote && (
                  <Inferred note={offer.inferredNote} />
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── History ── */}
        {overview.history.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 style={{ fontSize: '1.125rem' }}>
              Where this version has been
            </h2>
            <p
              className="text-[0.9375rem]"
              style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
            >
              A record, not a control. A pathway moves when somebody does
              something, and this is who.
            </p>
            <ol className="flex flex-col gap-2">
              {overview.history.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-baseline gap-x-3 text-[0.9375rem]"
                >
                  <span className="font-semibold">{entry.label}</span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {entry.fromLabel} → {entry.toLabel}
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {entry.actorName} · {entry.when}
                  </span>
                  {entry.detail && (
                    <span
                      className="basis-full text-[0.875rem]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {entry.detail}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* ── Versions ── */}
        {versions.length > 1 && (
          <section className="flex flex-col gap-3">
            <h2 style={{ fontSize: '1.125rem' }}>Versions</h2>
            {versions.map((version) => (
              <div
                key={version.versionNumber}
                style={{
                  background: 'var(--surface-card)',
                  border: version.isLive
                    ? '2px solid var(--brand)'
                    : '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px 14px',
                }}
              >
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="font-semibold">
                    Version {version.versionNumber}
                  </span>
                  <span
                    className="text-[0.875rem]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {version.stateLabel} · {version.stageCountLabel}
                  </span>
                  {version.publishedOn && (
                    <span
                      className="text-[0.875rem]"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      published {version.publishedOn}
                      {version.publishedByName &&
                        ` by ${version.publishedByName}`}
                    </span>
                  )}
                </div>
                {version.approvedByNames.length > 0 && (
                  <p
                    className="mt-1 text-[0.875rem]"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Approved by {version.approvedByNames.join(', ')}
                  </p>
                )}
                {/* §4: its own line, because this is the claim a version record
                    must not round up into an approval. */}
                {version.addressedNotApproved.length > 0 && (
                  <p
                    className="mt-1 text-[0.875rem]"
                    style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                  >
                    {version.addressedNotApproved.join(', ')} had an objection
                    marked addressed by someone else and never approved this
                    version.
                  </p>
                )}
                {version.migrationLabel && (
                  <p
                    className="mt-1 text-[0.875rem]"
                    style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                  >
                    {version.migrationLabel}
                  </p>
                )}
              </div>
            ))}
          </section>
        )}
      </div>
    </PageShell>
  )
}

function Field({
  label,
  value,
  deliberatelyAbsent,
}: {
  label: string
  value: string
  deliberatelyAbsent?: boolean
}) {
  if (!value && !deliberatelyAbsent) return null
  return (
    <div>
      <dt className="eyebrow" style={{ fontSize: '0.5625rem' }}>
        {label}
      </dt>
      <dd
        className="mt-1 text-[0.9375rem]"
        style={{
          color: value ? 'var(--text-secondary)' : 'var(--text-muted)',
          textWrap: 'pretty',
        }}
      >
        {/* Not the same as blank. §8.8 in one line of interface. */}
        {value || 'Deliberately none'}
      </dd>
    </div>
  )
}

function List({ label, items }: { label: string; items: readonly string[] }) {
  return (
    <div className="mt-4">
      <span className="eyebrow" style={{ fontSize: '0.5625rem' }}>
        {label}
      </span>
      <ul className="mt-1 list-disc pl-5 text-[0.9375rem]">
        {items.map((item) => (
          <li key={item} style={{ color: 'var(--text-secondary)' }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * §4's table does not cover every transition its own state list implies. Where
 * behaviour was assumed, the assumption is shown rather than presented as
 * policy — the same instinct as the `provenance` column.
 */
function Inferred({ note }: { note: string }) {
  return (
    <p
      className="text-[0.8125rem] italic"
      style={{ color: 'var(--text-muted)', textWrap: 'pretty', maxWidth: 640 }}
    >
      {note}
    </p>
  )
}
