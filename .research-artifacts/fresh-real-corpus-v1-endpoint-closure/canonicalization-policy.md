# Fresh Real Corpus V1.1 terminal endpoint closure

V1 remains historically `CORPUS_V1_INSUFFICIENT` under its strict raw processed coverage rule. V1.1 does not alter the V2 numeric policy or reselect any device identity.

For each parsed curve, require the existing V2 lower endpoint (20 Hz), derive the V2 evaluation grid from its frozen `20..20000 Hz / 96 points-per-octave` policy, and require the observed terminal point to reach the grid's penultimate frequency. A curve already reaching 20,000 Hz is unchanged. Otherwise exactly one point `[20000, lastObservedDb]` is appended, recorded as `terminal-flat-hold-to-v2-max`. Curves ending before the penultimate grid point are rejected. No other endpoint, internal gap, or interpolation rule is extended.

The cases reuse the exact ordered candidate identities selected by V1 before any solver observation. Cached bytes are external and ignored; the provenance records immutable upstream paths, blob SHA, byte SHA-256, original/canonical parsed-point hashes, and the terminal transformation.
