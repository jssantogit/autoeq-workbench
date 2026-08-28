# AutoEQ Engine Validation v1

## Scope and frozen-version policy

This report records synthetic validation evidence for `standard-v1`. The benchmark detects deterministic filter or metric drift; it is not permission to tune the frozen algorithm. Timing is informational and excluded from drift comparisons.

## Synthetic corpus and methodology

The corpus contains ten curves generated in code from flat responses and core biquad/cascade primitives. No user measurements or copied rig data are included. Each case runs through the delivered Standard pipeline, including pruning, manual-grid quantization, discrete refinement, preamp derivation, and cancellation audit.

## Per-case result table

| Case | Filters | MAE dB | RMSE dB | Max dB | Max Q | Preamp dB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| flat_identity | 0 | 0.000 | 0.000 | 0.000 | 0.00 | 0.0 |
| broad_bass_shelf | 1 | 0.040 | 0.045 | 0.081 | 0.70 | -5.9 |
| single_mid_peak | 3 | 0.052 | 0.061 | 0.290 | 2.16 | -5.4 |
| vocal_multi_feature | 5 | 0.105 | 0.125 | 0.302 | 2.62 | -5.7 |
| irregular_treble | 3 | 0.030 | 0.058 | 0.228 | 3.47 | -3.8 |
| narrow_feature | 1 | 0.043 | 0.151 | 1.791 | 6.94 | -6.2 |
| filter_budget | 3 | 0.744 | 1.132 | 3.427 | 1.78 | -3.1 |
| quantization_sensitive | 1 | 0.378 | 0.407 | 0.497 | 1.76 | -4.0 |
| preamp_overlap | 6 | 0.125 | 0.149 | 0.484 | 2.67 | -1.0 |
| opposing_filters_pressure | 5 | 0.074 | 0.096 | 0.391 | 2.67 | -5.3 |

## Filter-count and residual observations

Flat identity correctly produces no filters. The explicit three-filter budget case reaches its limit and has the largest broadband residual, making the budget tradeoff visible without changing acceptance thresholds. Narrow-feature error is concentrated: its MAE remains low while maximum error is comparatively high.

## Q and cancellation observations

The narrow case produces the highest delivered Q at 6.94, within product bounds. No case produces a strong cancellation pair. The benchmark records moderate and strong counts so future version work can compare behavior without changing `standard-v1`.

## Quantization observations

All delivered frequencies, gains, and Q values lie on the Poweramp manual-entry grid and inside product bounds. The deliberately off-grid case retains a larger residual after delivery, documenting the effect of quantization rather than treating it as a tuning defect.

## Preamp observations

Every delivered preamp equals the dense combined-cascade calculation and is at least as attenuating as the maximum positive cascade requires. Overlapping filters demonstrate why preamp is derived from the combined response rather than the largest individual boost.

## Normalization-mode note

The corpus uses the product default `{ mode: 'hz', frequencyHz: 500, levelDb: 60 }`. dB-mode source-equivalence, fixed-domain sampling, relative recentering, and sampling invariance are covered separately by normalization tests.

## Known limitations

Synthetic evidence is not a claim about measurement-rig uncertainty, headphone-unit variation, or perceptual preference. The corpus does not provide population statistics, listening validation, confidence weighting, or timing guarantees.

## Future version/profile research

Future versioned work may investigate alternate filter budgets, quantization-aware objectives, difficult narrow features, uncertainty weighting, and cancellation policy. Such research must use a new algorithm version or profile and must not silently alter this frozen baseline.
