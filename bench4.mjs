import postgres from 'postgres'
import { readFileSync } from 'node:fs'
const base = readFileSync('.env.local','utf8').match(/^DATABASE_URL=["']?(.+?)["']?$/m)[1]
const txn = base.replace(':5432/', ':6543/')
const AUTH = '00000000-0000-0000-0000-000000000001'
console.log('transaction pooler port present:', /:6543\//.test(txn))

for (const prepare of [true, false]) {
  const sql = postgres(txn, { max: 1, ssl: 'require', prepare })
  try {
    await sql`select 1`
    // The documented failure mode: same statement shape, run repeatedly.
    for (let i = 0; i < 5; i++) {
      await sql`select id from people where auth_user_id = ${AUTH} limit 1`
    }
    const burst = () => Promise.all([
      sql`select id from people where auth_user_id = ${AUTH}`,
      sql`select role from leader_roles where person_id = ${AUTH}`,
      sql`select * from permission_grants where person_id = ${AUTH}`,
      sql`select * from clearance_grants where person_id = ${AUTH}`,
      sql`select id from people where church_id = ${AUTH}`,
      sql`select id from folds where church_id = ${AUTH}`,
    ])
    await burst(); await burst()
    const b = []
    for (let i = 0; i < 4; i++) { const t = Date.now(); await burst(); b.push(Date.now()-t) }
    b.sort((a,b)=>a-b)
    console.log(`6543 prepare:${String(prepare).padEnd(5)} OK   6-query page ${b[2]}ms   all: ${b.join(' ')}`)
  } catch (e) {
    console.log(`6543 prepare:${String(prepare).padEnd(5)} FAILED: ${e.code ?? ''} ${e.message.slice(0,110)}`)
  }
  await sql.end()
}
