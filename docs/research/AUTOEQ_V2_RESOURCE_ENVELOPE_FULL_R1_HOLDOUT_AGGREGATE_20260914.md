# AutoEQ V2 full-r1 holdout aggregate

Raw timing JSONL is uncommitted. Failed pre-execution records are preserved separately from corrected completed records.

## Fixed capacity (q30 median)

| Case | C | RMSE | violation | maxAbs | filters | frontier | pressure | work invocations | elapsed ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| titan-to-storm | 10 | 1.390 | 6.130 | 4.598 | 10 | 10 | 86 | 6 | 30040 |
| titan-to-storm | 15 | 1.092 | 4.670 | 3.503 | 15 | 15 | 24 | 6 | 30065 |
| titan-to-storm | 23 | 1.001 | 4.004 | 3.003 | 17 | 21 | 0 | 6 | 30044 |
| titan-to-storm | 35 | 1.124 | 4.527 | 3.395 | 12 | 15 | 0 | 6 | 30049 |
| titan-to-storm | 43 | 1.193 | 4.771 | 3.571 | 15 | 15 | 0 | 6 | 30127 |
| titan-to-trio | 10 | 0.546 | 2.185 | 1.623 | 10 | 10 | 46 | 6 | 29111 |
| titan-to-trio | 15 | 0.838 | 3.399 | 2.549 | 14 | 15 | 34 | 6 | 30123 |
| titan-to-trio | 23 | 0.681 | 2.810 | 2.107 | 16 | 19 | 0 | 6 | 30122 |
| titan-to-trio | 35 | 0.697 | 2.810 | 2.107 | 17 | 19 | 0 | 6 | 30122 |
| titan-to-trio | 43 | 0.700 | 2.810 | 2.107 | 17 | 19 | 0 | 6 | 30067 |
| titan-to-u12t | 10 | 0.948 | 3.988 | 2.991 | 10 | 10 | 110 | 6 | 30036 |
| titan-to-u12t | 15 | 0.842 | 3.368 | 2.526 | 11 | 13 | 0 | 6 | 30066 |
| titan-to-u12t | 23 | 0.982 | 3.945 | 2.958 | 10 | 12 | 0 | 6 | 30023 |
| titan-to-u12t | 35 | 0.982 | 3.945 | 2.958 | 10 | 12 | 0 | 6 | 30034 |
| titan-to-u12t | 43 | 0.842 | 3.368 | 2.526 | 11 | 13 | 0 | 6 | 30022 |

## Effort endpoint q30 median RMSE

| Case | C | e0 | e6 | delta e0-e6 |
|---|---:|---:|---:|---:|
| titan-to-storm | 10 | 1.558 | 0.897 | 0.661 |
| titan-to-storm | 23 | 1.081 | 0.925 | 0.156 |
| titan-to-storm | 43 | 1.081 | 0.901 | 0.180 |
| titan-to-trio | 10 | 0.699 | 0.546 | 0.153 |
| titan-to-trio | 23 | 0.634 | 0.570 | 0.064 |
| titan-to-trio | 43 | 0.608 | 0.572 | 0.036 |
| titan-to-u12t | 10 | 0.834 | 0.664 | 0.170 |
| titan-to-u12t | 23 | 0.682 | 0.878 | -0.196 |
| titan-to-u12t | 43 | 0.897 | 0.878 | 0.019 |

## Legacy expansions

Expansions: 72; demand-aligned=33, ambiguous=7, clearly-premature=32
- titan-to-storm: demand-aligned=12, ambiguous=1, clearly-premature=11
- titan-to-trio: demand-aligned=12, clearly-premature=11, ambiguous=1
- titan-to-u12t: demand-aligned=9, clearly-premature=10, ambiguous=5
