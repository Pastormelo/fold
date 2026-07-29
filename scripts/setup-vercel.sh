#!/usr/bin/env bash
# Pushes the environment variables from .env.local to Vercel.
#
# The values go from your file to your Vercel project directly. They are never
# printed, and never pass through the conversation.
#
# DATABASE_URL is rewritten from port 5432 to 6543 on the way: 5432 is Supabase's
# session pooler, right for local work and migrations, while Vercel is serverless
# and needs the transaction pooler. Getting that wrong exhausts the connection
# limit under load rather than failing cleanly, so it is worth doing here rather
# than remembering later.
set -uo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "No .env.local found. Nothing to push."
  exit 1
fi

# A function rather than a string. `VERCEL="npx --yes vercel@latest"` followed by
# `vercel whoami` works in bash and silently does not in zsh, which does not
# word-split an unquoted variable — every call fails with
# `command not found: npx --yes vercel@latest`. macOS defaults to zsh, so the
# string version was broken on exactly the machine this script is for.
vercel() { npx --yes vercel@latest "$@"; }

echo
echo "1/4  Signing in to Vercel"
echo "     A browser window will open. This is the part only you can do."
echo
if ! vercel whoami >/dev/null 2>&1; then
  vercel login || { echo "Login failed or was cancelled."; exit 1; }
fi
echo "     Signed in as: $(vercel whoami 2>/dev/null)"

echo
echo "2/4  Linking this folder to your Vercel project"
# Either filename counts as linked. Recent CLI versions write repo.json for a
# folder inside a git repository and project.json otherwise, so checking only for
# project.json re-runs the interactive link every time on an already-linked repo.
if [ ! -f .vercel/project.json ] && [ ! -f .vercel/repo.json ]; then
  # Interactive: it asks which project. Pick the existing "fold" one rather than
  # creating a new project, or the variables land somewhere nothing deploys from.
  vercel link || { echo "Link failed."; exit 1; }
fi
echo "     Linked."

echo
echo "3/4  Reading values from .env.local"

read_var() {
  # Last match wins, and only the part after the first '=' is the value.
  grep -E "^$1=" .env.local | tail -1 | cut -d= -f2- || true
}

SUPA_URL=$(read_var NEXT_PUBLIC_SUPABASE_URL)
SUPA_KEY=$(read_var NEXT_PUBLIC_SUPABASE_ANON_KEY)
DB_LOCAL=$(read_var DATABASE_URL)

for pair in "NEXT_PUBLIC_SUPABASE_URL:$SUPA_URL" "NEXT_PUBLIC_SUPABASE_ANON_KEY:$SUPA_KEY" "DATABASE_URL:$DB_LOCAL"; do
  name="${pair%%:*}"
  value="${pair#*:}"
  if [ -z "$value" ]; then
    echo "     $name is empty in .env.local — stopping rather than pushing a blank."
    exit 1
  fi
  echo "     $name: found (${#value} chars)"
done

# Session pooler (5432) → transaction pooler (6543) for serverless.
DB_VERCEL="${DB_LOCAL/:5432\/postgres/:6543/postgres}"
if [ "$DB_VERCEL" = "$DB_LOCAL" ]; then
  echo "     DATABASE_URL: port left as-is (did not match :5432/postgres)"
else
  echo "     DATABASE_URL: port rewritten 5432 → 6543 for serverless"
fi

echo
echo "4/4  Pushing to Vercel (production, preview, development)"

push() {
  local name="$1" value="$2"
  for env in production preview development; do
    # Remove any existing value first; `env add` refuses to overwrite.
    vercel env rm "$name" "$env" --yes >/dev/null 2>&1 || true
    if printf '%s' "$value" | vercel env add "$name" "$env" >/dev/null 2>&1; then
      printf '     %-32s %s ✓\n' "$name" "$env"
    else
      printf '     %-32s %s ✗ failed\n' "$name" "$env"
    fi
  done
}

push NEXT_PUBLIC_SUPABASE_URL "$SUPA_URL"
push NEXT_PUBLIC_SUPABASE_ANON_KEY "$SUPA_KEY"
push DATABASE_URL "$DB_VERCEL"

echo
echo "Deploying so the new variables take effect…"
# Captured whole, then reported. Piping straight into `tail` would make the exit
# status tail's, so a failed deploy would print its error and still be treated as
# a success — the same shape of bug as an action that reports success without
# having done anything.
if DEPLOY_OUT=$(vercel deploy --prod 2>&1); then
  echo "$DEPLOY_OUT" | tail -3 | sed 's/^/     /'
else
  echo "     Deploy failed:"
  echo "$DEPLOY_OUT" | tail -8 | sed 's/^/     /'
  exit 1
fi

echo
echo "Done. Two things left that need the dashboard:"
echo
echo "  1. Supabase → Authentication → URL Configuration"
echo "     Add your Vercel URL to the redirect allow-list, or sign-in links"
echo "     will bounce."
echo
echo "  2. Supabase → Authentication → Providers → Google, if you want that"
echo "     option. Email and password works without it."
