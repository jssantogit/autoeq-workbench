# MP Reallocation Corrective Amendment

## Purpose

Correct the two methodological limitations in the 2026-09-09 MP
reallocation campaign without changing production, Standard AutoEQ v1, Max10,
canonical delivered evaluation, the frozen reference snapshot, or the frozen
selector.

## Root causes

The width-two selection beam retained its next parent frontier only after a
complete replacement pass. Storm can reach the deadline during that pass, so a
zero transition did not test multi-parent traversal. Separately,
`structuralCandidateEvaluations` was derived from a composition aggregate that
also counted Matching Pursuit replacements; the reported value `762` was not a
pure structural-beam evaluation count. `usefulHandoff` also treated existence
of a local structural best as sufficient.

## Corrective design

The selection beam will update its Pareto-first frontier after each admissible
canonical replacement. A work queue will then select retained parents for
further expansion without waiting for a completed pass. The global
`visitedSelections` set remains the cycle guard. The frozen selector is used
only when more than two nondominated parents need deterministic trimming.

Composition accounting will maintain independent counters for MP candidate
evaluations, MP replacement operations, structural-beam candidate evaluations,
and state-bank evaluations. `structuralCandidateEvaluations` names only
observed structural-beam canonical evaluations. Configured structural and
polish allowances remain allowances; observed polish work is emitted only if
the implementation directly measures it.

A useful handoff requires an observed descendant that improves its seed. The
artifact also records the stricter, independent events: descendant produced,
seed improvement, selected-global-best change, and reference improvement.

## Experimental decision rules

Storm is the only required case. Use continuous 5/15/30/60-second checkpoints
and a new evidence root. The beam is exercised only if it records incremental
retention/promotion within budget and an alternate retained parent is expanded.
A zero transition or absence of alternate-parent expansion is a scheduling or
granularity result, never evidence against beam diversity.

The one-shot versus feedback claim is causal only when the observed structural
beam evaluation counts are equalized under the shared deadline. Otherwise the
report records raw results and `not equalized`. U12t and Trio remain out of
scope unless Storm yields a signal worth positive-control validation.

## Required evidence

Beam artifacts record canonical RMSE/maxAbs, Directed Reference Regret v1,
reference improvement, depth, transitions, active/retained parents,
descendants by parent, candidates/novelty/selector changes by depth, unique
selections, and dominated/equivalent counts. Scheduler artifacts record the
configured target, observed per-component evaluations, handoffs, seeds,
descendants, seed/global/reference improvements, configured and (if measured)
observed polish work, and wall-clock time.
