# Fresh Real Corpus V1.2 metadata repair

V1.1 is historically `CORPUS_V1_1_PROVENANCE_INVALID`: endpoint closure was retained, but its lossy metadata join was not. V1.2 joins processed names with only Unicode normalization, trim, whitespace collapse, and case folding; parenthetical qualifiers remain semantic.

Concrete identity is `collection|form|rig|exact processed curve name`. Device-family normalization separately removes qualifiers only for prior-device exclusion and global family non-reuse. Processed paths that encode a rig require exact agreement with metadata; matching metadata rows retain all source URLs in sorted order. No fuzzy fallback is permitted.
