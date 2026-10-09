---
type: Rule
title: Fold knowledge inline before deleting referenced docs
description: Guideline
tags: [docs, cleanup, references, knowledge-preservation]
timestamp: "2026-10-09T14:43:40.310Z"
---

# Fold knowledge inline before deleting referenced docs

## Guideline

When a cleanup pass deletes a documentation file, first rewrite every place that cites it — source comments, README sections, wiki pages — so the essential knowledge is carried inline by the surviving artifacts. Never leave dangling references, and never delete the citation without rescuing the content.

## When it applies

- Any doc-strip, repo-cleanup, or "remove non-app-surface files" task.
- Any deletion of research notes, findings, plans, or specs that code comments or docs point to.

## Rationale / evidence

During the 2026-10-09 mapmaker strip, `research_plan.md`, `research_report.md`, and `docs/findings_0..5_*.md` were deleted while source comments in `projection.ts`, `extrude.ts`, `osmToScene.ts`, `overpass.ts`, and `scripts/verify.mjs` cited them. Those comments were rewritten to state the math/Overpass knowledge directly, and the README gained an inline "Design basis" section. A final grep confirmed zero references to the deleted files, so the deletion lost no knowledge.

## Practice

1. Grep the repo for the filenames (and their basenames) before deleting.
2. For each hit, rewrite the citing text to carry the load-bearing facts inline (or link a surviving replacement, e.g. the README section or wiki page).
3. Delete, then re-grep to prove zero dangling references remain.
