# CLA Assistant Security Hardening - Engineering Handoff

## Executive Summary

This document specifies complete security and identity verification hardening for the CLA Assistant GitHub Action. The implementation fixes identity verification gaps, adds fail-closed identity checks, prevents allowlist bypass via names, implements complete commit/comment pagination, and ensures durable signature storage.

**Repository:** devsy-org/cla-assistant-action  
**Baseline Commit:** df228cf2f4f0851215bb94a5a3b655a2bd0130b9 (v2.6.2)  
**Target Branch:** fix/cla-identity-hardening  
**Base Branch:** master  
**Delivery:** Single draft PR with all code, tests (I01–I23), and CI passing

## Section 1: Security Requirements & Constraints

### Identity Verification Policy

- **Core Constraint:** Verified GitHub user IDs are the single source of truth for CLA signatory identity
- **Fail-Closed:** Any identity ambiguity defaults to "not signed" (safety over convenience)
- **No Name-Based Bypass:** Allowlist checks must compare verified GitHub user IDs, NOT names
- **Verified Property:** Only users with a confirmed GitHub account (with a numeric ID) count as verified
- **Commit Author Verification:** Extracted from GitHub REST API paginated commit list, NOT SSH/GPG signatures

### Signature Persistence

- Signatures must be persisted atomically BEFORE any success response
- Storage failures must block success and trigger appropriate error handling
- No partial writes; all-or-nothing semantics

### Pagination Requirements

- Commits: Full collection via paginated REST API (max 250 per page)
- Comments: Full enumeration to find all signature comments
- Event Processing: Deterministic recheck at PR head after page 1

## Section 2: Task Breakdown (T0–T8)

### T0: Baseline Fixture & Package Setup
- [ ] Verify Node 24 compatibility
- [ ] Review current dependencies in package.json
- [ ] Add TypeScript interfaces for new typed author model
- [ ] Create test fixtures for identity verification scenarios

### T1: Typed Author Model
- [ ] Create `AuthorIdentity` interface with fields: `name`, `githubId` (number), `verified` (boolean)
- [ ] Create `CommitAuthor` interface with fields: `authorIdentity`, `commitSha`
- [ ] Update `CommitterMap` and related interfaces to use `AuthorIdentity` instead of name+id tuples
- [ ] Type-safe conversion utilities from REST API response to `AuthorIdentity`

### T2: Commit Collection with Pagination
- [ ] Implement `fetchAllCommits()` function using REST API paginated endpoint
- [ ] Handle max 250 commits per page; iterate until all collected
- [ ] Extract commit authors with verified GitHub IDs
- [ ] Type all responses as `CommitAuthor[]`
- [ ] Add test coverage for pagination (mock API with 500+ commits)

### T3: Secure Allowlist & Identity Checking
- [ ] Implement `isAllowlisted(identity: AuthorIdentity): boolean`
- [ ] Compare ONLY verified GitHub IDs against allowlist
- [ ] Reject name-based matching; fail closed if ID verification missing
- [ ] Replace existing allowlist logic with ID-only checks
- [ ] Add tests: valid ID allowlist, missing verification, name-based bypass attempts

### T4: Signing & Storage (Durable Persistence)
- [ ] Implement `persistSignature(userId: number, commitSha: string): Promise<void>`
- [ ] Call before returning success from main flow
- [ ] Atomic write to storage backend (fail entire operation if storage fails)
- [ ] Add error handling for storage failures
- [ ] Test: verify storage called before success response

### T5: Comment Enumeration & Pattern Matching
- [ ] Implement `getAllSignatureComments()` function with full pagination
- [ ] Enumerate all PR comments (max 30 per page)
- [ ] Match signature comments using robust regex
- [ ] Type results as `SignatureComment[]` with author identity
- [ ] Test: enumerate 100+ comments, verify all found

### T6: Event & Recheck Handling
- [ ] Implement deterministic recheck at PR head after page 1 processing
- [ ] Handle `synchronize` events (new commits) with full re-validation
- [ ] Store recheck state to avoid duplicate processing
- [ ] Add tests: synchronize event, head commit changes, idempotency

### T7: Test & CI (Full Regression Suite)
- [ ] Write 23 regression tests (I01–I23) covering all security gates
- [ ] All tests must pass locally (Jest)
- [ ] All tests must pass in GitHub Actions CI

### T8: Node 24 Compatibility
- [ ] Verify all code runs on Node 24
- [ ] Update CI matrix to test Node 24
- [ ] Confirm dist/ is rebuilt and committed

## Section 3: Regression Test Matrix (I01–I23)

| Test ID | Category | Scenario | Pass Criteria |
|---------|----------|----------|---------------|
| I01 | Identity | Valid GitHub ID, verified author | User marked signed |
| I02 | Identity | Missing GitHub ID (SSH/GPG only) | User marked not signed |
| I03 | Identity | Name in allowlist, ID not | Rejected (no name bypass) |
| I04 | Identity | Multiple authors, one missing ID | That author rejected |
| I05 | Pagination | 500 commits across 3 pages | All collected & verified |
| I06 | Pagination | Exact page boundary (250 commits) | Handles boundary correctly |
| I07 | Pagination | Single commit | Handled as page 1 |
| I08 | Comments | 100 signature comments | All enumerated |
| I09 | Comments | Comments across 5 pages | All found via pagination |
| I10 | Comments | Malformed comment | Skipped safely |
| I11 | Signature | Persist before success | Storage called first |
| I12 | Signature | Storage fails | Operation fails atomically |
| I13 | Signature | Duplicate signature | Idempotent (not error) |
| I14 | Allowlist | ID allowlist match | User marked signed |
| I15 | Allowlist | ID allowlist miss | User marked not signed |
| I16 | Allowlist | Empty allowlist | All unsigned |
| I17 | Event | Synchronize event recheck | Full re-validation |
| I18 | Event | Push event (single commit) | Processed correctly |
| I19 | Recheck | PR head commit changes | Detected & rechecked |
| I20 | Recheck | No new commits | Recheck skipped |
| I21 | Integration | E2E: sign + comment + persist | All gates pass |
| I22 | Integration | E2E: deny unsigned | Proper failure |
| I23 | Node 24 | Full suite on Node 24 | All I01–I22 pass |

## Section 4: Files Requiring Changes

### Core Implementation Files
- `src/interfaces.ts` — Add `AuthorIdentity`, `CommitAuthor` interfaces
- `src/typed-author/authorIdentity.ts` (NEW) — Type conversions & verification
- `src/commits/commitCollector.ts` (NEW) — Paginated commit fetching
- `src/allowlist/secureAllowlist.ts` (NEW) — ID-only allowlist checking
- `src/signature/signaturePersistence.ts` (NEW) — Atomic persistence
- `src/comments/commentEnumerator.ts` (NEW) — Comment pagination
- `src/recheck/recheckHandler.ts` (NEW) — Event & recheck logic
- `src/setupClaCheck.ts` — Integrate all new modules
- `src/octokit.ts` — Ensure paginated API calls

### Test Files
- `__tests__/typed-author.test.ts` (NEW) — Identity verification tests
- `__tests__/commitCollector.test.ts` (NEW) — Pagination tests
- `__tests__/secureAllowlist.test.ts` (NEW) — Allowlist security tests
- `__tests__/signaturePersistence.test.ts` (NEW) — Persistence tests
- `__tests__/commentEnumerator.test.ts` (NEW) — Comment enumeration tests
- `__tests__/recheckHandler.test.ts` (NEW) — Recheck logic tests
- Existing test files — Updated fixtures & mocks

### Configuration & Build
- `package.json` — Verify dependencies, Node 24 compat
- `tsconfig.json` — Ensure strict mode enabled
- `.github/workflows/ci.yml` — Add Node 24 to test matrix

## Section 5: Implementation Order (Strict)

1. **T0** → Baseline fixture, interfaces, package setup
2. **T1** → Typed author model (depends on T0)
3. **T2** → Commit pagination (depends on T1)
4. **T3** → Secure allowlist (depends on T1)
5. **T4** → Signature persistence (independent, but test with all)
6. **T5** → Comment enumeration (depends on T1)
7. **T6** → Event & recheck (depends on T2–T5)
8. **T7** → Regression tests (I01–I23, all tasks completed)
9. **T8** → Node 24 verification & CI (test all I01–I23)

## Section 6: Security Gates & Validation Checklist

- [ ] All identity checks use verified GitHub IDs only
- [ ] No allowlist matches on names; ID-only
- [ ] Fail-closed: ambiguity → "not signed"
- [ ] All commits paginated (250 per page)
- [ ] All comments paginated (30 per page)
- [ ] Signature persistence called before success
- [ ] Storage failures block success
- [ ] Recheck triggered on synchronize event
- [ ] No duplicate processing (recheck state)
- [ ] All 23 regression tests pass
- [ ] Node 24 compatibility verified
- [ ] CI passes (all checks green)

## Section 7: PR Delivery Criteria

**Draft PR:** `devsy-org/cla-assistant-action` on branch `fix/cla-identity-hardening`

**Requirements:**
- All T0–T8 tasks complete
- All I01–I23 regression tests passing
- CI matrix includes Node 24
- 100% of required checks green
- No changes to `devsy-org/devsy` workflow
- No changes to `devsy-org/cla-signatures` data
- Comprehensive commit history (squash before merge)
- Documentation: identity policy change in PR description

**Deliverable:**
- Draft PR URL (not merged)
- Full test output (jest summary)
- CI status (all checks passing)
- PR description documenting identity policy

---

**Version:** 1.0  
**Date:** October 2026  
**Status:** Ready for Implementation
