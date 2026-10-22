#!/bin/sh
set -euo pipefail

# Maintainer script to apply the patch, create branch, push, and open a draft PR.
# Usage: ./scripts/open-feat-route-registry-pr.sh [--force]
# - --force : if branch exists locally, force checkout (will not delete remote branch)

PATCH="Artifacts/patches/0001-feat-route-registry-add-routes-table-migration-and-i.patch"
BRANCH="feat/route-registry"
PR_TITLE="feat: route registry (DB migration + API skeleton)"
BASE_BRANCH="master"
PR_BODY_FILE=""
ATTACH_SPEC="Artifacts/documents/UNI-7-orchestrator-routing-spec.md"

force=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --force) force=true; shift ;;
    --help) echo "Usage: $0 [--force]"; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [ ! -f "$PATCH" ]; then
  echo "ERROR: patch not found: $PATCH" >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "ERROR: git not found in PATH" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "WARNING: GitHub CLI 'gh' not found. The script will still apply the patch and push the branch, but you must create the PR manually or install gh." >&2
  use_gh=false
else
  use_gh=true
fi

# Apply the patch using git am (preserves commit metadata)
echo "Applying patch: $PATCH"
# If patch already applied, 'git am' may fail. Try to detect by dry-run.
set +e
git apply --check "$PATCH" >/dev/null 2>&1
apply_ok=$?
set -e

if [ $apply_ok -ne 0 ]; then
  echo "Patch does not apply cleanly or may already be applied. Attempting 'git am' may fail."
  echo "If the patch has already been applied, skip this step and checkout the branch: git checkout $BRANCH" >&2
  # Try git am anyway to preserve intent
fi

# Perform git am in a safe way
if git am --signoff < "$PATCH"; then
  echo "Patch applied with 'git am'."
else
  echo "'git am' failed. You may need to apply the patch manually or resolve conflicts." >&2
  echo "To apply manually: git apply $PATCH && git add -A && git commit -m \"feat(route-registry): add routes table migration and internal API + client skeleton\"" >&2
  exit 1
fi

# Create or switch to branch
if git rev-parse --verify --quiet "$BRANCH" >/dev/null; then
  echo "Branch '$BRANCH' already exists locally."
  if [ "$force" = true ]; then
    echo "Forcing checkout of existing branch '$BRANCH'."
    git checkout "$BRANCH"
  else
    echo "Please choose: run with --force to checkout existing branch, or push the existing branch manually." >&2
    echo "If the branch exists and you want to push it now: git checkout $BRANCH && git push -u origin $BRANCH" >&2
    exit 1
  fi
else
  git checkout -b "$BRANCH"
fi

# Push branch
echo "Pushing branch to origin: $BRANCH"
if git push -u origin "$BRANCH"; then
  echo "Branch pushed." 
else
  echo "Failed to push branch. Ensure you have push rights and authentication configured (gh auth login or GITHUB_TOKEN)." >&2
  exit 1
fi

# Create draft PR using gh if available
if [ "$use_gh" = true ]; then
  echo "Creating draft PR with gh..."
  # Prepare body: include short message + link to artifact path for reviewers
  PR_BODY="Adds DB migration for 'routes' table and minimal internal API skeleton + client (see issue UNI-7).\n\nArtifact: $ATTACH_SPEC\n\nDeveloper checklist included in spec."
  if gh pr create --title "$PR_TITLE" --body "$PR_BODY" --base "$BASE_BRANCH" --draft; then
    echo "Draft PR created."
  else
    echo "gh failed to create PR. You can create one manually or check gh auth." >&2
    echo "Manual PR creation: gh pr create --title \"$PR_TITLE\" --body \"$PR_BODY\" --base $BASE_BRANCH --draft" >&2
    exit 1
  fi
else
  echo "gh CLI not available. Please create the draft PR manually using GitHub UI or install gh and run: "
  echo "  gh pr create --title \"$PR_TITLE\" --body \"Adds DB migration for 'routes' table and minimal internal API skeleton + client (see issue UNI-7).\n\nArtifact: $ATTACH_SPEC\" --base $BASE_BRANCH --draft"
fi

echo "Done."
