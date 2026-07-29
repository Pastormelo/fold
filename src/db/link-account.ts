/**
 * Links a Supabase Auth user to a person, so signing in resolves to somebody.
 *
 *   npm run db:link-account -- <auth-user-id> <email>
 *
 * This is the step §"the auth gap" describes: authenticating proves you control
 * a mailbox, and Fold still has to be told which person that is. Without the
 * link, `getViewer` raises `NoPersonForAccountError` rather than guessing — which
 * is the behaviour you want, and also why this script exists.
 *
 * Find the auth user id in the Supabase dashboard under Authentication → Users.
 */

import { eq, and } from 'drizzle-orm'

import { db, schema } from './client'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function link() {
  const [authUserId, email] = process.argv.slice(2)

  if (!authUserId || !email) {
    console.error(
      'Usage: npm run db:link-account -- <auth-user-id> <email>\n\n' +
        'The auth user id is in Supabase → Authentication → Users.'
    )
    process.exit(1)
  }
  if (!UUID.test(authUserId)) {
    console.error(
      `"${authUserId}" is not a UUID. Copy the id from Supabase → Authentication → Users, not the email.`
    )
    process.exit(1)
  }

  const [person] = await db
    .select({
      id: schema.people.id,
      firstName: schema.people.firstName,
      lastName: schema.people.lastName,
      existing: schema.people.authUserId,
    })
    .from(schema.people)
    .where(eq(schema.people.email, email))
    .limit(1)

  if (!person) {
    console.error(
      `No person has the email ${email}. Run "npm run db:seed" first, or add the person.`
    )
    process.exit(1)
  }

  // Refuse to steal a link from another person rather than silently moving it.
  const [clash] = await db
    .select({
      id: schema.people.id,
      firstName: schema.people.firstName,
      lastName: schema.people.lastName,
    })
    .from(schema.people)
    .where(and(eq(schema.people.authUserId, authUserId)))
    .limit(1)

  if (clash && clash.id !== person.id) {
    console.error(
      `That account is already linked to ${clash.firstName} ${clash.lastName}. ` +
        'One account maps to one person; unlink that one first.'
    )
    process.exit(1)
  }

  if (person.existing === authUserId) {
    console.log(
      `Already linked: ${person.firstName} ${person.lastName} ← ${authUserId}`
    )
    process.exit(0)
  }

  await db
    .update(schema.people)
    .set({ authUserId })
    .where(eq(schema.people.id, person.id))

  console.log(
    `Linked ${person.firstName} ${person.lastName} to auth user ${authUserId}.`
  )
  console.log('Signing in with that account will now resolve to this person.')
}

link()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed:', error instanceof Error ? error.message : error)
    process.exit(1)
  })
