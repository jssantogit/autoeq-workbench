# AutoEQ Research Bench — Raw Corpus Amendment

**Status:** approved amendment
**Date:** 2026-08-30
**Applies to:** `docs/superpowers/specs/2026-08-30-autoeq-research-bench-design.md`

## Authority

This amendment records the explicit decision that the four provided measurement files may be committed to the repository in their original text form for the AutoEQ research corpus.

Where this amendment conflicts with the Research Bench design, **this amendment wins**.

## 1. Raw files are allowed

The following original text measurements may be versioned as benchmark source data:

```text
Dunu Titan S2.txt
Subtonic Storm [1].txt
64 Audio U12t [1].txt
64 Audio Trio [1].txt
```

They are not required to be sanitized, transformed, or stripped of absolute SPL before being committed.

The implementation may rename them to stable repository-safe names, for example:

```text
dunu-titan-s2.txt
subtonic-storm.txt
64-audio-u12t.txt
64-audio-trio.txt
```

Renaming must not alter file contents.

## 2. Corpus model

The Research Bench should prefer loading the raw curves through the existing core parsing/preparation/normalization path so the benchmark simulates the same numerical input path as a real AutoEQ run.

The fixed benchmark source is:

```text
Dunu Titan S2
```

The three targets are:

```text
Subtonic Storm
64 Audio U12t
64 Audio Trio
```

The stable research case IDs remain:

```text
titan-to-storm
titan-to-u12t
titan-to-trio
```

## 3. Integrity

Commit and verify the original byte-level corpus using these SHA-256 values before any rename:

```text
Dunu Titan S2.txt
baa46f7ff6516597d6483a50739a32d0484fea1a509797e717e32b7f39305e7f

Subtonic Storm [1].txt
13b3c259cb3b5c106eacac80aa5180c0ffb42d15196ff5e2bcce7d31aae6ed1a

64 Audio U12t [1].txt
593b25ea63fd02e886dd9f1892df9d9d4e17c41ce95fdfbc52492979c61c769e

64 Audio Trio [1].txt
d172c28fd5884ecb40338eb43b75a486c09842abfac185b16be7e56122c90f20
```

A filename-only rename must preserve these hashes.

## 4. Superseded design requirements

The following requirements in the original Research Bench design are superseded:

- the statement that original FR files must not be committed;
- the requirement that repository fixtures contain only a sanitized desired-correction vector;
- the `1e-6 dB` serialization requirement for sanitized fixture output;
- the requirement that baseline identity depend on sanitized desired-vector hashes.

Instead, baseline identity must include hashes of the four raw corpus files and a parser/preparation schema version.

## 5. Research loader

The preferred first implementation loads raw text with the existing core parser and then uses the existing canonical preparation/normalization path.

Do not create an alternate research-only interpolation, normalization, or desired-correction formula.

The resulting benchmark must therefore exercise:

```text
raw measurement text
  -> existing curve parser
  -> existing Standard-v2 curve preparation / canonical grid
  -> existing normalization
  -> Target - Titan desired correction
  -> Standard-v2 optimizer
```

This makes the real-world research cases closer to product behavior while retaining reproducibility through the committed raw corpus.

## 6. Acceptance adjustment

Research Bench acceptance now requires:

1. exactly four approved raw measurement files are present under the research corpus directory;
2. their SHA-256 hashes match the values in this amendment after any rename;
3. three cases are built from Titan as source and Storm/U12t/Trio as targets;
4. no separate sanitized desired-response file is required;
5. the raw corpus is used only for research/benchmark code and is not shipped as a new product UI feature;
6. the first implementation still does not retune or alter Standard v2 solver behavior.

## 7. Current repository handoff state

The four approved raw files are already committed on branch `research/autoeq-research-bench-design` under:

```text
packages/core/benchmarks/research/raw/Dunu Titan S2.txt
packages/core/benchmarks/research/raw/Subtonic Storm [1].txt
packages/core/benchmarks/research/raw/64 Audio U12t [1].txt
packages/core/benchmarks/research/raw/64 Audio Trio [1].txt
```

Each file has 480 lines and was copied from the chat-uploaded source file without intentional numerical transformation.

Implementation workers do **not** need access to the original chat VM or `/mnt/data`. Task 1 of the implementation plan should be interpreted as:

1. verify the four already-committed raw files against the SHA-256 values above;
2. rename/move them to the final repository-safe paths if desired;
3. verify the same hashes again after any filename-only move;
4. proceed to loader and research-case implementation.

Do not replace the files with reconstructed, downloaded, interpolated, or hand-copied alternatives.
