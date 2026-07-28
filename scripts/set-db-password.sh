#!/usr/bin/env bash
# Sets the database password in .env.local, but only after proving it works.
# Retries until it connects or you quit.
set -uo pipefail
cd "$(dirname "$0")/.."

REF='luavwuwnluzdgfmxptac'
HOST='aws-1-us-west-2.pooler.supabase.com'

while true; do
  echo
  printf 'Database password (hidden — paste, then Enter): '
  IFS= read -rs PW1; echo
  printf 'Again, to catch a bad paste:                    '
  IFS= read -rs PW2; echo

  if [ -z "$PW1" ]; then
    echo "  Nothing entered."
    continue
  fi
  if [ "$PW1" != "$PW2" ]; then
    echo "  Those did not match (${#PW1} vs ${#PW2} characters). Try again."
    continue
  fi

  echo "  Got ${#PW1} characters. Testing against Supabase…"

  # Command substitution, so $? is node's own exit status. An earlier version
  # piped into grep and tested *that*, which reported success on failure — the
  # exact bug this script exists to prevent.
  OUTPUT=$(FOLD_PW="$PW1" FOLD_REF="$REF" FOLD_HOST="$HOST" node --input-type=module -e '
    import postgres from "postgres";
    const pw = encodeURIComponent(process.env.FOLD_PW);
    const url = `postgresql://postgres.${process.env.FOLD_REF}:${pw}@${process.env.FOLD_HOST}:5432/postgres`;
    const sql = postgres(url, { prepare: false, max: 1, ssl: "require", connect_timeout: 15 });
    try {
      await sql`select 1`;
      console.log("connected");
      process.exit(0);
    } catch (e) {
      console.log(e.code === "28P01" ? "wrong-password" : "other:" + (e.code || "") + " " + (e.message || ""));
      process.exit(1);
    } finally {
      try { await sql.end({ timeout: 2 }); } catch {}
    }
  ' 2>&1)
  STATUS=$?

  if [ "$STATUS" -eq 0 ]; then
    FOLD_PW="$PW1" FOLD_REF="$REF" FOLD_HOST="$HOST" python3 - <<'PY'
import os, urllib.parse
pw = urllib.parse.quote(os.environ['FOLD_PW'], safe='')
url = (f"postgresql://postgres.{os.environ['FOLD_REF']}:{pw}"
       f"@{os.environ['FOLD_HOST']}:5432/postgres")
lines = open('.env.local').read().split('\n')
open('.env.local', 'w').write('\n'.join(
    f'DATABASE_URL={url}' if line.startswith('DATABASE_URL=') else line
    for line in lines))
print('  Connected, and saved to .env.local.')
PY
    echo '  Tell Claude "go".'
    unset PW1 PW2
    exit 0
  fi

  echo
  case "$OUTPUT" in
    *wrong-password*)
      echo "  That password is not right — .env.local was NOT changed."
      echo
      echo "  Get a new one here:"
      echo "  https://supabase.com/dashboard/project/${REF}/settings/database"
      echo "  → 'Reset database password'. Set your own, letters and numbers only,"
      echo "    so there is no doubt about what the terminal did with the paste."
      ;;
    *)
      echo "  Could not connect, and it was not the password:"
      echo "  ${OUTPUT}"
      ;;
  esac

  printf '  Try again? [Y/n] '
  read -r AGAIN
  case "$AGAIN" in [Nn]*) exit 1 ;; esac
done
