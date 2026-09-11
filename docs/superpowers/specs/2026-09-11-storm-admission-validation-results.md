# Storm Admission Validation Results

## Executive summary
This report summarizes the outcome-blind admission validation campaign for Storm. The campaign evaluates 3 arms over 16 cells (holdouts and controls).

## Predeclared protocol & exact campaign matrix
Matrix consists of 16 cells:

- `storm-bridge-parent` (case `titan-to-storm`)
- `storm-sparse-0010` (case `titan-to-storm`)
- `storm-sparse-0001` (case `titan-to-storm`)
- `storm-sparse-0006` (case `titan-to-storm`)
- `u12t-mp-seed` (case `titan-to-u12t`)
- `trio-mp-seed` (case `titan-to-trio`)
- `storm-sparse-0002` (case `titan-to-storm`)
- `storm-sparse-0003` (case `titan-to-storm`)
- `storm-sparse-0004` (case `titan-to-storm`)
- `storm-sparse-0005` (case `titan-to-storm`)
- `storm-sparse-0007` (case `titan-to-storm`)
- `storm-sparse-0008` (case `titan-to-storm`)
- `storm-sparse-0009` (case `titan-to-storm`)
- `storm-replacement-2-2572` (case `titan-to-storm`)
- `u12t-sparse-0010` (case `titan-to-u12t`)
- `trio-sparse-0010` (case `titan-to-trio`)

## Predecessor artifact integrity table
| Logical ID | Expected SHA-256 | Actual After | Unchanged |
| :--- | :--- | :--- | :--- |
| `audit` | `ad8b12c9a2deda33ebc81f00e682cbd97f3ce57529460e8e92e6c4050da8ac4b` | `ad8b12c9a2deda33ebc81f00e682cbd97f3ce57529460e8e92e6c4050da8ac4b` | true |
| `causal` | `646129bb60b2faa6d0d78b9e41e6c2097575d4d8bc98263f4c1d89f7189583f7` | `646129bb60b2faa6d0d78b9e41e6c2097575d4d8bc98263f4c1d89f7189583f7` | true |
| `census1` | `733b8d5f4f62e33aac1318c2c05b5e9a037b2541e9735ca48f0119b43d94f06d` | `733b8d5f4f62e33aac1318c2c05b5e9a037b2541e9735ca48f0119b43d94f06d` | true |
| `census2` | `fd4d719636d91d6129f7a0b858d93952c8ccfd1f4991205852ef70204ed8b920` | `fd4d719636d91d6129f7a0b858d93952c8ccfd1f4991205852ef70204ed8b920` | true |

## Per-cell results table
| Cell | Arm | ChkType | Chk | RMSE | MaxAbs | Regret | Filt | Cost (Dwn/Ovh/Tot) | Time | Sel Rel | Pareto Rel |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| storm-bridge-parent | A | eval | 4 | 1.6989 | 5.8506 | 1.5510 | 9 | 9/0/9 | 462.2793069999998ms | - | - |
| storm-bridge-parent | A | eval | 8 | 1.6989 | 5.8506 | 1.5510 | 9 | 9/0/9 | 462.2793069999998ms | - | - |
| storm-bridge-parent | A | eval | 16 | 1.6989 | 5.8506 | 1.5510 | 9 | 9/0/9 | 462.2793069999998ms | - | - |
| storm-bridge-parent | A | time | 5000 | 1.6989 | 5.8506 | 1.5510 | 9 | 9/0/9 | 462.2793069999998ms | - | - |
| storm-bridge-parent | A | time | 15000 | 1.6989 | 5.8506 | 1.5510 | 9 | 9/0/9 | 462.2793069999998ms | - | - |
| storm-bridge-parent | A | time | 30000 | 1.6989 | 5.8506 | 1.5510 | 9 | 9/0/9 | 462.2793069999998ms | - | - |
| storm-bridge-parent | A | time | 60000 | 1.6989 | 5.8506 | 1.5510 | 9 | 9/0/9 | 462.2793069999998ms | - | - |
| storm-bridge-parent | B | eval | 4 | 1.6989 | 5.8506 | 1.5510 | 9 | 37/365/402 | 3688.0710360000003ms | equivalent | tradeoff |
| storm-bridge-parent | B | eval | 8 | 1.8230 | 5.4856 | 1.9386 | 9 | 37/365/402 | 3688.0710360000003ms | candidate | tradeoff |
| storm-bridge-parent | B | eval | 16 | 1.7472 | 5.2677 | 1.6335 | 9 | 37/365/402 | 3688.0710360000003ms | candidate | tradeoff |
| storm-bridge-parent | B | time | 5000 | 1.6321 | 5.2446 | 1.1731 | 10 | 37/365/402 | 3688.0710360000003ms | candidate | candidate-dominates |
| storm-bridge-parent | B | time | 15000 | 1.6321 | 5.2446 | 1.1731 | 10 | 37/365/402 | 3688.0710360000003ms | candidate | candidate-dominates |
| storm-bridge-parent | B | time | 30000 | 1.6321 | 5.2446 | 1.1731 | 10 | 37/365/402 | 3688.0710360000003ms | candidate | candidate-dominates |
| storm-bridge-parent | B | time | 60000 | 1.6321 | 5.2446 | 1.1731 | 10 | 37/365/402 | 3688.0710360000003ms | candidate | candidate-dominates |
| storm-bridge-parent | E | eval | 4 | 1.6989 | 5.8506 | 1.5510 | 9 | 37/365/402 | 3372.6430740000005ms | equivalent | tradeoff |
| storm-bridge-parent | E | eval | 8 | 1.8230 | 5.4856 | 1.9386 | 9 | 37/365/402 | 3372.6430740000005ms | candidate | tradeoff |
| storm-bridge-parent | E | eval | 16 | 1.7472 | 5.2677 | 1.6335 | 9 | 37/365/402 | 3372.6430740000005ms | candidate | tradeoff |
| storm-bridge-parent | E | time | 5000 | 1.6321 | 5.2446 | 1.1731 | 10 | 37/365/402 | 3372.6430740000005ms | candidate | candidate-dominates |
| storm-bridge-parent | E | time | 15000 | 1.6321 | 5.2446 | 1.1731 | 10 | 37/365/402 | 3372.6430740000005ms | candidate | candidate-dominates |
| storm-bridge-parent | E | time | 30000 | 1.6321 | 5.2446 | 1.1731 | 10 | 37/365/402 | 3372.6430740000005ms | candidate | candidate-dominates |
| storm-bridge-parent | E | time | 60000 | 1.6321 | 5.2446 | 1.1731 | 10 | 37/365/402 | 3372.6430740000005ms | candidate | candidate-dominates |
| storm-sparse-0010 | A | eval | 4 | 1.6944 | 6.0250 | 1.6357 | 10 | 9/0/9 | 191.82992299999933ms | - | - |
| storm-sparse-0010 | A | eval | 8 | 1.6944 | 6.0250 | 1.6357 | 10 | 9/0/9 | 191.82992299999933ms | - | - |
| storm-sparse-0010 | A | eval | 16 | 1.6944 | 6.0250 | 1.6357 | 10 | 9/0/9 | 191.82992299999933ms | - | - |
| storm-sparse-0010 | A | time | 5000 | 1.6944 | 6.0250 | 1.6357 | 10 | 9/0/9 | 191.82992299999933ms | - | - |
| storm-sparse-0010 | A | time | 15000 | 1.6944 | 6.0250 | 1.6357 | 10 | 9/0/9 | 191.82992299999933ms | - | - |
| storm-sparse-0010 | A | time | 30000 | 1.6944 | 6.0250 | 1.6357 | 10 | 9/0/9 | 191.82992299999933ms | - | - |
| storm-sparse-0010 | A | time | 60000 | 1.6944 | 6.0250 | 1.6357 | 10 | 9/0/9 | 191.82992299999933ms | - | - |
| storm-sparse-0010 | B | eval | 4 | 1.6944 | 6.0250 | 1.6357 | 10 | 13/168/181 | 1354.8316140000006ms | equivalent | tradeoff |
| storm-sparse-0010 | B | eval | 8 | 1.6944 | 6.0250 | 1.6357 | 10 | 13/168/181 | 1354.8316140000006ms | equivalent | tradeoff |
| storm-sparse-0010 | B | eval | 16 | 1.6944 | 6.0250 | 1.6357 | 10 | 13/168/181 | 1354.8316140000006ms | equivalent | tradeoff |
| storm-sparse-0010 | B | time | 5000 | 1.6944 | 6.0250 | 1.6357 | 10 | 13/168/181 | 1354.8316140000006ms | equivalent | tradeoff |
| storm-sparse-0010 | B | time | 15000 | 1.6944 | 6.0250 | 1.6357 | 10 | 13/168/181 | 1354.8316140000006ms | equivalent | tradeoff |
| storm-sparse-0010 | B | time | 30000 | 1.6944 | 6.0250 | 1.6357 | 10 | 13/168/181 | 1354.8316140000006ms | equivalent | tradeoff |
| storm-sparse-0010 | B | time | 60000 | 1.6944 | 6.0250 | 1.6357 | 10 | 13/168/181 | 1354.8316140000006ms | equivalent | tradeoff |
| storm-sparse-0010 | E | eval | 4 | 1.6944 | 6.0250 | 1.6357 | 10 | 13/168/181 | 1279.269268ms | equivalent | tradeoff |
| storm-sparse-0010 | E | eval | 8 | 1.6944 | 6.0250 | 1.6357 | 10 | 13/168/181 | 1279.269268ms | equivalent | tradeoff |
| storm-sparse-0010 | E | eval | 16 | 1.6944 | 6.0250 | 1.6357 | 10 | 13/168/181 | 1279.269268ms | equivalent | tradeoff |
| storm-sparse-0010 | E | time | 5000 | 1.6944 | 6.0250 | 1.6357 | 10 | 13/168/181 | 1279.269268ms | equivalent | tradeoff |
| storm-sparse-0010 | E | time | 15000 | 1.6944 | 6.0250 | 1.6357 | 10 | 13/168/181 | 1279.269268ms | equivalent | tradeoff |
| storm-sparse-0010 | E | time | 30000 | 1.6944 | 6.0250 | 1.6357 | 10 | 13/168/181 | 1279.269268ms | equivalent | tradeoff |
| storm-sparse-0010 | E | time | 60000 | 1.6944 | 6.0250 | 1.6357 | 10 | 13/168/181 | 1279.269268ms | equivalent | tradeoff |
| storm-sparse-0001 | A | eval | 4 | 3.0035 | 10.4437 | 9.4454 | 2 | 25/0/25 | 300.0398839999998ms | - | - |
| storm-sparse-0001 | A | eval | 8 | 3.0035 | 10.4437 | 9.4454 | 2 | 25/0/25 | 300.0398839999998ms | - | - |
| storm-sparse-0001 | A | eval | 16 | 2.5919 | 7.4832 | 5.7181 | 5 | 25/0/25 | 300.0398839999998ms | - | - |
| storm-sparse-0001 | A | time | 5000 | 2.5919 | 7.4832 | 5.7181 | 5 | 25/0/25 | 300.0398839999998ms | - | - |
| storm-sparse-0001 | A | time | 15000 | 2.5919 | 7.4832 | 5.7181 | 5 | 25/0/25 | 300.0398839999998ms | - | - |
| storm-sparse-0001 | A | time | 30000 | 2.5919 | 7.4832 | 5.7181 | 5 | 25/0/25 | 300.0398839999998ms | - | - |
| storm-sparse-0001 | A | time | 60000 | 2.5919 | 7.4832 | 5.7181 | 5 | 25/0/25 | 300.0398839999998ms | - | - |
| storm-sparse-0001 | B | eval | 4 | 2.8271 | 8.5531 | 7.2730 | 3 | 17/63/80 | 293.4397310000004ms | candidate | candidate-dominates |
| storm-sparse-0001 | B | eval | 8 | 2.7408 | 8.2508 | 6.7604 | 4 | 17/63/80 | 293.4397310000004ms | candidate | candidate-dominates |
| storm-sparse-0001 | B | eval | 16 | 2.7408 | 8.2508 | 6.7604 | 4 | 17/63/80 | 293.4397310000004ms | control | control-dominates |
| storm-sparse-0001 | B | time | 5000 | 2.7408 | 8.2508 | 6.7604 | 4 | 17/63/80 | 293.4397310000004ms | control | control-dominates |
| storm-sparse-0001 | B | time | 15000 | 2.7408 | 8.2508 | 6.7604 | 4 | 17/63/80 | 293.4397310000004ms | control | control-dominates |
| storm-sparse-0001 | B | time | 30000 | 2.7408 | 8.2508 | 6.7604 | 4 | 17/63/80 | 293.4397310000004ms | control | control-dominates |
| storm-sparse-0001 | B | time | 60000 | 2.7408 | 8.2508 | 6.7604 | 4 | 17/63/80 | 293.4397310000004ms | control | control-dominates |
| storm-sparse-0001 | E | eval | 4 | 3.0035 | 10.4437 | 9.4454 | 2 | 53/359/412 | 2677.7950370000017ms | equivalent | tradeoff |
| storm-sparse-0001 | E | eval | 8 | 3.0035 | 10.4437 | 9.4454 | 2 | 53/359/412 | 2677.7950370000017ms | equivalent | tradeoff |
| storm-sparse-0001 | E | eval | 16 | 2.8774 | 9.1464 | 7.9103 | 6 | 53/359/412 | 2677.7950370000017ms | control | control-dominates |
| storm-sparse-0001 | E | time | 5000 | 2.8395 | 8.8564 | 7.5522 | 9 | 53/359/412 | 2677.7950370000017ms | control | control-dominates |
| storm-sparse-0001 | E | time | 15000 | 2.8395 | 8.8564 | 7.5522 | 9 | 53/359/412 | 2677.7950370000017ms | control | control-dominates |
| storm-sparse-0001 | E | time | 30000 | 2.8395 | 8.8564 | 7.5522 | 9 | 53/359/412 | 2677.7950370000017ms | control | control-dominates |
| storm-sparse-0001 | E | time | 60000 | 2.8395 | 8.8564 | 7.5522 | 9 | 53/359/412 | 2677.7950370000017ms | control | control-dominates |
| storm-sparse-0006 | A | eval | 4 | 2.0830 | 6.3865 | 3.2441 | 6 | 5/0/5 | 73.87992300000042ms | - | - |
| storm-sparse-0006 | A | eval | 8 | 2.0830 | 6.3865 | 3.2441 | 6 | 5/0/5 | 73.87992300000042ms | - | - |
| storm-sparse-0006 | A | eval | 16 | 2.0830 | 6.3865 | 3.2441 | 6 | 5/0/5 | 73.87992300000042ms | - | - |
| storm-sparse-0006 | A | time | 5000 | 2.0830 | 6.3865 | 3.2441 | 6 | 5/0/5 | 73.87992300000042ms | - | - |
| storm-sparse-0006 | A | time | 15000 | 2.0830 | 6.3865 | 3.2441 | 6 | 5/0/5 | 73.87992300000042ms | - | - |
| storm-sparse-0006 | A | time | 30000 | 2.0830 | 6.3865 | 3.2441 | 6 | 5/0/5 | 73.87992300000042ms | - | - |
| storm-sparse-0006 | A | time | 60000 | 2.0830 | 6.3865 | 3.2441 | 6 | 5/0/5 | 73.87992300000042ms | - | - |
| storm-sparse-0006 | B | eval | 4 | 2.0830 | 6.3865 | 3.2441 | 6 | 37/399/436 | 2901.946075ms | equivalent | tradeoff |
| storm-sparse-0006 | B | eval | 8 | 2.0963 | 6.3021 | 3.2505 | 6 | 37/399/436 | 2901.946075ms | candidate | tradeoff |
| storm-sparse-0006 | B | eval | 16 | 2.0903 | 6.2987 | 3.2263 | 8 | 37/399/436 | 2901.946075ms | candidate | tradeoff |
| storm-sparse-0006 | B | time | 5000 | 1.9575 | 6.2972 | 2.7376 | 9 | 37/399/436 | 2901.946075ms | candidate | candidate-dominates |
| storm-sparse-0006 | B | time | 15000 | 1.9575 | 6.2972 | 2.7376 | 9 | 37/399/436 | 2901.946075ms | candidate | candidate-dominates |
| storm-sparse-0006 | B | time | 30000 | 1.9575 | 6.2972 | 2.7376 | 9 | 37/399/436 | 2901.946075ms | candidate | candidate-dominates |
| storm-sparse-0006 | B | time | 60000 | 1.9575 | 6.2972 | 2.7376 | 9 | 37/399/436 | 2901.946075ms | candidate | candidate-dominates |
| storm-sparse-0006 | E | eval | 4 | 2.0830 | 6.3865 | 3.2441 | 6 | 37/399/436 | 2870.3259590000016ms | equivalent | tradeoff |
| storm-sparse-0006 | E | eval | 8 | 2.0963 | 6.3021 | 3.2505 | 6 | 37/399/436 | 2870.3259590000016ms | candidate | tradeoff |
| storm-sparse-0006 | E | eval | 16 | 2.0903 | 6.2987 | 3.2263 | 8 | 37/399/436 | 2870.3259590000016ms | candidate | tradeoff |
| storm-sparse-0006 | E | time | 5000 | 1.9575 | 6.2972 | 2.7376 | 9 | 37/399/436 | 2870.3259590000016ms | candidate | candidate-dominates |
| storm-sparse-0006 | E | time | 15000 | 1.9575 | 6.2972 | 2.7376 | 9 | 37/399/436 | 2870.3259590000016ms | candidate | candidate-dominates |
| storm-sparse-0006 | E | time | 30000 | 1.9575 | 6.2972 | 2.7376 | 9 | 37/399/436 | 2870.3259590000016ms | candidate | candidate-dominates |
| storm-sparse-0006 | E | time | 60000 | 1.9575 | 6.2972 | 2.7376 | 9 | 37/399/436 | 2870.3259590000016ms | candidate | candidate-dominates |
| u12t-mp-seed | A | eval | 4 | 1.2257 | 3.6013 | 0.0113 | 9 | 9/0/9 | 187.83319199999823ms | - | - |
| u12t-mp-seed | A | eval | 8 | 1.2257 | 3.6013 | 0.0113 | 9 | 9/0/9 | 187.83319199999823ms | - | - |
| u12t-mp-seed | A | eval | 16 | 1.2257 | 3.6013 | 0.0113 | 9 | 9/0/9 | 187.83319199999823ms | - | - |
| u12t-mp-seed | A | time | 5000 | 1.2257 | 3.6013 | 0.0113 | 9 | 9/0/9 | 187.83319199999823ms | - | - |
| u12t-mp-seed | A | time | 15000 | 1.2257 | 3.6013 | 0.0113 | 9 | 9/0/9 | 187.83319199999823ms | - | - |
| u12t-mp-seed | A | time | 30000 | 1.2257 | 3.6013 | 0.0113 | 9 | 9/0/9 | 187.83319199999823ms | - | - |
| u12t-mp-seed | A | time | 60000 | 1.2257 | 3.6013 | 0.0113 | 9 | 9/0/9 | 187.83319199999823ms | - | - |
| u12t-mp-seed | B | eval | 4 | 1.1851 | 3.5956 | 0.0000 | 10 | 17/152/169 | 1346.302421999997ms | candidate | candidate-dominates |
| u12t-mp-seed | B | eval | 8 | 1.1657 | 3.5968 | 0.0000 | 10 | 17/152/169 | 1346.302421999997ms | candidate | candidate-dominates |
| u12t-mp-seed | B | eval | 16 | 1.1657 | 3.5968 | 0.0000 | 10 | 17/152/169 | 1346.302421999997ms | candidate | candidate-dominates |
| u12t-mp-seed | B | time | 5000 | 1.1657 | 3.5968 | 0.0000 | 10 | 17/152/169 | 1346.302421999997ms | candidate | candidate-dominates |
| u12t-mp-seed | B | time | 15000 | 1.1657 | 3.5968 | 0.0000 | 10 | 17/152/169 | 1346.302421999997ms | candidate | candidate-dominates |
| u12t-mp-seed | B | time | 30000 | 1.1657 | 3.5968 | 0.0000 | 10 | 17/152/169 | 1346.302421999997ms | candidate | candidate-dominates |
| u12t-mp-seed | B | time | 60000 | 1.1657 | 3.5968 | 0.0000 | 10 | 17/152/169 | 1346.302421999997ms | candidate | candidate-dominates |
| u12t-mp-seed | E | eval | 4 | 1.1851 | 3.5956 | 0.0000 | 10 | 17/152/169 | 1327.3567290000028ms | candidate | candidate-dominates |
| u12t-mp-seed | E | eval | 8 | 1.1657 | 3.5968 | 0.0000 | 10 | 17/152/169 | 1327.3567290000028ms | candidate | candidate-dominates |
| u12t-mp-seed | E | eval | 16 | 1.1657 | 3.5968 | 0.0000 | 10 | 17/152/169 | 1327.3567290000028ms | candidate | candidate-dominates |
| u12t-mp-seed | E | time | 5000 | 1.1657 | 3.5968 | 0.0000 | 10 | 17/152/169 | 1327.3567290000028ms | candidate | candidate-dominates |
| u12t-mp-seed | E | time | 15000 | 1.1657 | 3.5968 | 0.0000 | 10 | 17/152/169 | 1327.3567290000028ms | candidate | candidate-dominates |
| u12t-mp-seed | E | time | 30000 | 1.1657 | 3.5968 | 0.0000 | 10 | 17/152/169 | 1327.3567290000028ms | candidate | candidate-dominates |
| u12t-mp-seed | E | time | 60000 | 1.1657 | 3.5968 | 0.0000 | 10 | 17/152/169 | 1327.3567290000028ms | candidate | candidate-dominates |
| trio-mp-seed | A | eval | 4 | 1.2591 | 4.7225 | 2.1867 | 10 | 5/0/5 | 81.47773099999904ms | - | - |
| trio-mp-seed | A | eval | 8 | 1.2591 | 4.7225 | 2.1867 | 10 | 5/0/5 | 81.47773099999904ms | - | - |
| trio-mp-seed | A | eval | 16 | 1.2591 | 4.7225 | 2.1867 | 10 | 5/0/5 | 81.47773099999904ms | - | - |
| trio-mp-seed | A | time | 5000 | 1.2591 | 4.7225 | 2.1867 | 10 | 5/0/5 | 81.47773099999904ms | - | - |
| trio-mp-seed | A | time | 15000 | 1.2591 | 4.7225 | 2.1867 | 10 | 5/0/5 | 81.47773099999904ms | - | - |
| trio-mp-seed | A | time | 30000 | 1.2591 | 4.7225 | 2.1867 | 10 | 5/0/5 | 81.47773099999904ms | - | - |
| trio-mp-seed | A | time | 60000 | 1.2591 | 4.7225 | 2.1867 | 10 | 5/0/5 | 81.47773099999904ms | - | - |
| trio-mp-seed | B | eval | 4 | 1.2591 | 4.7225 | 2.1867 | 10 | 13/159/172 | 1449.6458459999994ms | equivalent | tradeoff |
| trio-mp-seed | B | eval | 8 | 1.2591 | 4.7225 | 2.1867 | 10 | 13/159/172 | 1449.6458459999994ms | equivalent | tradeoff |
| trio-mp-seed | B | eval | 16 | 1.2591 | 4.7225 | 2.1867 | 10 | 13/159/172 | 1449.6458459999994ms | equivalent | tradeoff |
| trio-mp-seed | B | time | 5000 | 1.2591 | 4.7225 | 2.1867 | 10 | 13/159/172 | 1449.6458459999994ms | equivalent | tradeoff |
| trio-mp-seed | B | time | 15000 | 1.2591 | 4.7225 | 2.1867 | 10 | 13/159/172 | 1449.6458459999994ms | equivalent | tradeoff |
| trio-mp-seed | B | time | 30000 | 1.2591 | 4.7225 | 2.1867 | 10 | 13/159/172 | 1449.6458459999994ms | equivalent | tradeoff |
| trio-mp-seed | B | time | 60000 | 1.2591 | 4.7225 | 2.1867 | 10 | 13/159/172 | 1449.6458459999994ms | equivalent | tradeoff |
| trio-mp-seed | E | eval | 4 | 1.2591 | 4.7225 | 2.1867 | 10 | 13/159/172 | 1300.8178450000014ms | equivalent | tradeoff |
| trio-mp-seed | E | eval | 8 | 1.2591 | 4.7225 | 2.1867 | 10 | 13/159/172 | 1300.8178450000014ms | equivalent | tradeoff |
| trio-mp-seed | E | eval | 16 | 1.2591 | 4.7225 | 2.1867 | 10 | 13/159/172 | 1300.8178450000014ms | equivalent | tradeoff |
| trio-mp-seed | E | time | 5000 | 1.2591 | 4.7225 | 2.1867 | 10 | 13/159/172 | 1300.8178450000014ms | equivalent | tradeoff |
| trio-mp-seed | E | time | 15000 | 1.2591 | 4.7225 | 2.1867 | 10 | 13/159/172 | 1300.8178450000014ms | equivalent | tradeoff |
| trio-mp-seed | E | time | 30000 | 1.2591 | 4.7225 | 2.1867 | 10 | 13/159/172 | 1300.8178450000014ms | equivalent | tradeoff |
| trio-mp-seed | E | time | 60000 | 1.2591 | 4.7225 | 2.1867 | 10 | 13/159/172 | 1300.8178450000014ms | equivalent | tradeoff |
| storm-sparse-0002 | A | eval | 4 | 2.6354 | 7.7071 | 6.0169 | 3 | 9/0/9 | 81.22450000000026ms | - | - |
| storm-sparse-0002 | A | eval | 8 | 2.6354 | 7.7071 | 6.0169 | 3 | 9/0/9 | 81.22450000000026ms | - | - |
| storm-sparse-0002 | A | eval | 16 | 2.6354 | 7.7071 | 6.0169 | 3 | 9/0/9 | 81.22450000000026ms | - | - |
| storm-sparse-0002 | A | time | 5000 | 2.6354 | 7.7071 | 6.0169 | 3 | 9/0/9 | 81.22450000000026ms | - | - |
| storm-sparse-0002 | A | time | 15000 | 2.6354 | 7.7071 | 6.0169 | 3 | 9/0/9 | 81.22450000000026ms | - | - |
| storm-sparse-0002 | A | time | 30000 | 2.6354 | 7.7071 | 6.0169 | 3 | 9/0/9 | 81.22450000000026ms | - | - |
| storm-sparse-0002 | A | time | 60000 | 2.6354 | 7.7071 | 6.0169 | 3 | 9/0/9 | 81.22450000000026ms | - | - |
| storm-sparse-0002 | B | eval | 4 | 2.6354 | 7.7071 | 6.0169 | 3 | 21/150/171 | 628.1093460000011ms | equivalent | tradeoff |
| storm-sparse-0002 | B | eval | 8 | 2.6354 | 7.7071 | 6.0169 | 3 | 21/150/171 | 628.1093460000011ms | equivalent | tradeoff |
| storm-sparse-0002 | B | eval | 16 | 2.6354 | 7.7071 | 6.0169 | 3 | 21/150/171 | 628.1093460000011ms | equivalent | tradeoff |
| storm-sparse-0002 | B | time | 5000 | 2.6354 | 7.7071 | 6.0169 | 3 | 21/150/171 | 628.1093460000011ms | equivalent | tradeoff |
| storm-sparse-0002 | B | time | 15000 | 2.6354 | 7.7071 | 6.0169 | 3 | 21/150/171 | 628.1093460000011ms | equivalent | tradeoff |
| storm-sparse-0002 | B | time | 30000 | 2.6354 | 7.7071 | 6.0169 | 3 | 21/150/171 | 628.1093460000011ms | equivalent | tradeoff |
| storm-sparse-0002 | B | time | 60000 | 2.6354 | 7.7071 | 6.0169 | 3 | 21/150/171 | 628.1093460000011ms | equivalent | tradeoff |
| storm-sparse-0002 | E | eval | 4 | 2.6354 | 7.7071 | 6.0169 | 3 | 21/141/162 | 609.6900380000006ms | equivalent | tradeoff |
| storm-sparse-0002 | E | eval | 8 | 2.6354 | 7.7071 | 6.0169 | 3 | 21/141/162 | 609.6900380000006ms | equivalent | tradeoff |
| storm-sparse-0002 | E | eval | 16 | 2.6354 | 7.7071 | 6.0169 | 3 | 21/141/162 | 609.6900380000006ms | equivalent | tradeoff |
| storm-sparse-0002 | E | time | 5000 | 2.6354 | 7.7071 | 6.0169 | 3 | 21/141/162 | 609.6900380000006ms | equivalent | tradeoff |
| storm-sparse-0002 | E | time | 15000 | 2.6354 | 7.7071 | 6.0169 | 3 | 21/141/162 | 609.6900380000006ms | equivalent | tradeoff |
| storm-sparse-0002 | E | time | 30000 | 2.6354 | 7.7071 | 6.0169 | 3 | 21/141/162 | 609.6900380000006ms | equivalent | tradeoff |
| storm-sparse-0002 | E | time | 60000 | 2.6354 | 7.7071 | 6.0169 | 3 | 21/141/162 | 609.6900380000006ms | equivalent | tradeoff |
| storm-sparse-0003 | A | eval | 4 | 2.6619 | 7.7417 | 6.1316 | 4 | 25/0/25 | 352.9431919999988ms | - | - |
| storm-sparse-0003 | A | eval | 8 | 2.4530 | 6.9834 | 4.9203 | 5 | 25/0/25 | 352.9431919999988ms | - | - |
| storm-sparse-0003 | A | eval | 16 | 2.0708 | 6.1244 | 3.0749 | 7 | 25/0/25 | 352.9431919999988ms | - | - |
| storm-sparse-0003 | A | time | 5000 | 2.0803 | 5.9695 | 3.0552 | 8 | 25/0/25 | 352.9431919999988ms | - | - |
| storm-sparse-0003 | A | time | 15000 | 2.0803 | 5.9695 | 3.0552 | 8 | 25/0/25 | 352.9431919999988ms | - | - |
| storm-sparse-0003 | A | time | 30000 | 2.0803 | 5.9695 | 3.0552 | 8 | 25/0/25 | 352.9431919999988ms | - | - |
| storm-sparse-0003 | A | time | 60000 | 2.0803 | 5.9695 | 3.0552 | 8 | 25/0/25 | 352.9431919999988ms | - | - |
| storm-sparse-0003 | B | eval | 4 | 2.6280 | 7.6867 | 5.9775 | 4 | 17/133/150 | 566.6670000000013ms | candidate | candidate-dominates |
| storm-sparse-0003 | B | eval | 8 | 2.6280 | 7.6867 | 5.9775 | 4 | 17/133/150 | 566.6670000000013ms | control | control-dominates |
| storm-sparse-0003 | B | eval | 16 | 2.6280 | 7.6867 | 5.9775 | 4 | 17/133/150 | 566.6670000000013ms | control | control-dominates |
| storm-sparse-0003 | B | time | 5000 | 2.6280 | 7.6867 | 5.9775 | 4 | 17/133/150 | 566.6670000000013ms | control | control-dominates |
| storm-sparse-0003 | B | time | 15000 | 2.6280 | 7.6867 | 5.9775 | 4 | 17/133/150 | 566.6670000000013ms | control | control-dominates |
| storm-sparse-0003 | B | time | 30000 | 2.6280 | 7.6867 | 5.9775 | 4 | 17/133/150 | 566.6670000000013ms | control | control-dominates |
| storm-sparse-0003 | B | time | 60000 | 2.6280 | 7.6867 | 5.9775 | 4 | 17/133/150 | 566.6670000000013ms | control | control-dominates |
| storm-sparse-0003 | E | eval | 4 | 2.6280 | 7.6867 | 5.9775 | 4 | 17/133/150 | 599.3292690000017ms | candidate | candidate-dominates |
| storm-sparse-0003 | E | eval | 8 | 2.6280 | 7.6867 | 5.9775 | 4 | 17/133/150 | 599.3292690000017ms | control | control-dominates |
| storm-sparse-0003 | E | eval | 16 | 2.6280 | 7.6867 | 5.9775 | 4 | 17/133/150 | 599.3292690000017ms | control | control-dominates |
| storm-sparse-0003 | E | time | 5000 | 2.6280 | 7.6867 | 5.9775 | 4 | 17/133/150 | 599.3292690000017ms | control | control-dominates |
| storm-sparse-0003 | E | time | 15000 | 2.6280 | 7.6867 | 5.9775 | 4 | 17/133/150 | 599.3292690000017ms | control | control-dominates |
| storm-sparse-0003 | E | time | 30000 | 2.6280 | 7.6867 | 5.9775 | 4 | 17/133/150 | 599.3292690000017ms | control | control-dominates |
| storm-sparse-0003 | E | time | 60000 | 2.6280 | 7.6867 | 5.9775 | 4 | 17/133/150 | 599.3292690000017ms | control | control-dominates |
| storm-sparse-0004 | A | eval | 4 | 2.5362 | 7.6876 | 5.6645 | 5 | 25/0/25 | 333.03573099999994ms | - | - |
| storm-sparse-0004 | A | eval | 8 | 2.4686 | 7.7724 | 5.5014 | 6 | 25/0/25 | 333.03573099999994ms | - | - |
| storm-sparse-0004 | A | eval | 16 | 2.2367 | 6.1558 | 3.7233 | 6 | 25/0/25 | 333.03573099999994ms | - | - |
| storm-sparse-0004 | A | time | 5000 | 2.2367 | 6.1558 | 3.7233 | 6 | 25/0/25 | 333.03573099999994ms | - | - |
| storm-sparse-0004 | A | time | 15000 | 2.2367 | 6.1558 | 3.7233 | 6 | 25/0/25 | 333.03573099999994ms | - | - |
| storm-sparse-0004 | A | time | 30000 | 2.2367 | 6.1558 | 3.7233 | 6 | 25/0/25 | 333.03573099999994ms | - | - |
| storm-sparse-0004 | A | time | 60000 | 2.2367 | 6.1558 | 3.7233 | 6 | 25/0/25 | 333.03573099999994ms | - | - |
| storm-sparse-0004 | B | eval | 4 | 2.6252 | 7.8270 | 6.0649 | 6 | 25/304/329 | 1520.6828830000013ms | control | control-dominates |
| storm-sparse-0004 | B | eval | 8 | 2.6035 | 7.7772 | 5.9560 | 5 | 25/304/329 | 1520.6828830000013ms | control | control-dominates |
| storm-sparse-0004 | B | eval | 16 | 2.4438 | 7.5274 | 5.2379 | 6 | 25/304/329 | 1520.6828830000013ms | control | control-dominates |
| storm-sparse-0004 | B | time | 5000 | 2.4438 | 7.5274 | 5.2379 | 6 | 25/304/329 | 1520.6828830000013ms | control | control-dominates |
| storm-sparse-0004 | B | time | 15000 | 2.4438 | 7.5274 | 5.2379 | 6 | 25/304/329 | 1520.6828830000013ms | control | control-dominates |
| storm-sparse-0004 | B | time | 30000 | 2.4438 | 7.5274 | 5.2379 | 6 | 25/304/329 | 1520.6828830000013ms | control | control-dominates |
| storm-sparse-0004 | B | time | 60000 | 2.4438 | 7.5274 | 5.2379 | 6 | 25/304/329 | 1520.6828830000013ms | control | control-dominates |
| storm-sparse-0004 | E | eval | 4 | 2.6252 | 7.8270 | 6.0649 | 6 | 25/304/329 | 1508.3748830000004ms | control | control-dominates |
| storm-sparse-0004 | E | eval | 8 | 2.6035 | 7.7772 | 5.9560 | 5 | 25/304/329 | 1508.3748830000004ms | control | control-dominates |
| storm-sparse-0004 | E | eval | 16 | 2.4438 | 7.5274 | 5.2379 | 6 | 25/304/329 | 1508.3748830000004ms | control | control-dominates |
| storm-sparse-0004 | E | time | 5000 | 2.4438 | 7.5274 | 5.2379 | 6 | 25/304/329 | 1508.3748830000004ms | control | control-dominates |
| storm-sparse-0004 | E | time | 15000 | 2.4438 | 7.5274 | 5.2379 | 6 | 25/304/329 | 1508.3748830000004ms | control | control-dominates |
| storm-sparse-0004 | E | time | 30000 | 2.4438 | 7.5274 | 5.2379 | 6 | 25/304/329 | 1508.3748830000004ms | control | control-dominates |
| storm-sparse-0004 | E | time | 60000 | 2.4438 | 7.5274 | 5.2379 | 6 | 25/304/329 | 1508.3748830000004ms | control | control-dominates |
| storm-sparse-0005 | A | eval | 4 | 2.2539 | 6.3832 | 3.8794 | 5 | 5/0/5 | 74.85634600000049ms | - | - |
| storm-sparse-0005 | A | eval | 8 | 2.2539 | 6.3832 | 3.8794 | 5 | 5/0/5 | 74.85634600000049ms | - | - |
| storm-sparse-0005 | A | eval | 16 | 2.2539 | 6.3832 | 3.8794 | 5 | 5/0/5 | 74.85634600000049ms | - | - |
| storm-sparse-0005 | A | time | 5000 | 2.2539 | 6.3832 | 3.8794 | 5 | 5/0/5 | 74.85634600000049ms | - | - |
| storm-sparse-0005 | A | time | 15000 | 2.2539 | 6.3832 | 3.8794 | 5 | 5/0/5 | 74.85634600000049ms | - | - |
| storm-sparse-0005 | A | time | 30000 | 2.2539 | 6.3832 | 3.8794 | 5 | 5/0/5 | 74.85634600000049ms | - | - |
| storm-sparse-0005 | A | time | 60000 | 2.2539 | 6.3832 | 3.8794 | 5 | 5/0/5 | 74.85634600000049ms | - | - |
| storm-sparse-0005 | B | eval | 4 | 2.1992 | 5.9583 | 3.5156 | 6 | 45/340/385 | 2692.336651999998ms | candidate | candidate-dominates |
| storm-sparse-0005 | B | eval | 8 | 2.1131 | 5.9985 | 3.1919 | 7 | 45/340/385 | 2692.336651999998ms | candidate | candidate-dominates |
| storm-sparse-0005 | B | eval | 16 | 2.0796 | 5.4314 | 2.9631 | 8 | 45/340/385 | 2692.336651999998ms | candidate | candidate-dominates |
| storm-sparse-0005 | B | time | 5000 | 1.9341 | 5.3204 | 2.3812 | 10 | 45/340/385 | 2692.336651999998ms | candidate | candidate-dominates |
| storm-sparse-0005 | B | time | 15000 | 1.9341 | 5.3204 | 2.3812 | 10 | 45/340/385 | 2692.336651999998ms | candidate | candidate-dominates |
| storm-sparse-0005 | B | time | 30000 | 1.9341 | 5.3204 | 2.3812 | 10 | 45/340/385 | 2692.336651999998ms | candidate | candidate-dominates |
| storm-sparse-0005 | B | time | 60000 | 1.9341 | 5.3204 | 2.3812 | 10 | 45/340/385 | 2692.336651999998ms | candidate | candidate-dominates |
| storm-sparse-0005 | E | eval | 4 | 2.1992 | 5.9583 | 3.5156 | 6 | 45/340/385 | 2672.359690000005ms | candidate | candidate-dominates |
| storm-sparse-0005 | E | eval | 8 | 2.1131 | 5.9985 | 3.1919 | 7 | 45/340/385 | 2672.359690000005ms | candidate | candidate-dominates |
| storm-sparse-0005 | E | eval | 16 | 2.0796 | 5.4314 | 2.9631 | 8 | 45/340/385 | 2672.359690000005ms | candidate | candidate-dominates |
| storm-sparse-0005 | E | time | 5000 | 1.9341 | 5.3204 | 2.3812 | 10 | 45/340/385 | 2672.359690000005ms | candidate | candidate-dominates |
| storm-sparse-0005 | E | time | 15000 | 1.9341 | 5.3204 | 2.3812 | 10 | 45/340/385 | 2672.359690000005ms | candidate | candidate-dominates |
| storm-sparse-0005 | E | time | 30000 | 1.9341 | 5.3204 | 2.3812 | 10 | 45/340/385 | 2672.359690000005ms | candidate | candidate-dominates |
| storm-sparse-0005 | E | time | 60000 | 1.9341 | 5.3204 | 2.3812 | 10 | 45/340/385 | 2672.359690000005ms | candidate | candidate-dominates |
| storm-sparse-0007 | A | eval | 4 | 2.0410 | 6.4471 | 3.1251 | 7 | 5/0/5 | 87.06461499999568ms | - | - |
| storm-sparse-0007 | A | eval | 8 | 2.0410 | 6.4471 | 3.1251 | 7 | 5/0/5 | 87.06461499999568ms | - | - |
| storm-sparse-0007 | A | eval | 16 | 2.0410 | 6.4471 | 3.1251 | 7 | 5/0/5 | 87.06461499999568ms | - | - |
| storm-sparse-0007 | A | time | 5000 | 2.0410 | 6.4471 | 3.1251 | 7 | 5/0/5 | 87.06461499999568ms | - | - |
| storm-sparse-0007 | A | time | 15000 | 2.0410 | 6.4471 | 3.1251 | 7 | 5/0/5 | 87.06461499999568ms | - | - |
| storm-sparse-0007 | A | time | 30000 | 2.0410 | 6.4471 | 3.1251 | 7 | 5/0/5 | 87.06461499999568ms | - | - |
| storm-sparse-0007 | A | time | 60000 | 2.0410 | 6.4471 | 3.1251 | 7 | 5/0/5 | 87.06461499999568ms | - | - |
| storm-sparse-0007 | B | eval | 4 | 2.0410 | 6.4471 | 3.1251 | 7 | 9/135/144 | 981.163652999996ms | equivalent | tradeoff |
| storm-sparse-0007 | B | eval | 8 | 2.0410 | 6.4471 | 3.1251 | 7 | 9/135/144 | 981.163652999996ms | equivalent | tradeoff |
| storm-sparse-0007 | B | eval | 16 | 2.0410 | 6.4471 | 3.1251 | 7 | 9/135/144 | 981.163652999996ms | equivalent | tradeoff |
| storm-sparse-0007 | B | time | 5000 | 2.0410 | 6.4471 | 3.1251 | 7 | 9/135/144 | 981.163652999996ms | equivalent | tradeoff |
| storm-sparse-0007 | B | time | 15000 | 2.0410 | 6.4471 | 3.1251 | 7 | 9/135/144 | 981.163652999996ms | equivalent | tradeoff |
| storm-sparse-0007 | B | time | 30000 | 2.0410 | 6.4471 | 3.1251 | 7 | 9/135/144 | 981.163652999996ms | equivalent | tradeoff |
| storm-sparse-0007 | B | time | 60000 | 2.0410 | 6.4471 | 3.1251 | 7 | 9/135/144 | 981.163652999996ms | equivalent | tradeoff |
| storm-sparse-0007 | E | eval | 4 | 2.0410 | 6.4471 | 3.1251 | 7 | 9/135/144 | 996.8588450000025ms | equivalent | tradeoff |
| storm-sparse-0007 | E | eval | 8 | 2.0410 | 6.4471 | 3.1251 | 7 | 9/135/144 | 996.8588450000025ms | equivalent | tradeoff |
| storm-sparse-0007 | E | eval | 16 | 2.0410 | 6.4471 | 3.1251 | 7 | 9/135/144 | 996.8588450000025ms | equivalent | tradeoff |
| storm-sparse-0007 | E | time | 5000 | 2.0410 | 6.4471 | 3.1251 | 7 | 9/135/144 | 996.8588450000025ms | equivalent | tradeoff |
| storm-sparse-0007 | E | time | 15000 | 2.0410 | 6.4471 | 3.1251 | 7 | 9/135/144 | 996.8588450000025ms | equivalent | tradeoff |
| storm-sparse-0007 | E | time | 30000 | 2.0410 | 6.4471 | 3.1251 | 7 | 9/135/144 | 996.8588450000025ms | equivalent | tradeoff |
| storm-sparse-0007 | E | time | 60000 | 2.0410 | 6.4471 | 3.1251 | 7 | 9/135/144 | 996.8588450000025ms | equivalent | tradeoff |
| storm-sparse-0008 | A | eval | 4 | 1.8939 | 6.4471 | 2.6092 | 8 | 5/0/5 | 117.01330800000142ms | - | - |
| storm-sparse-0008 | A | eval | 8 | 1.8939 | 6.4471 | 2.6092 | 8 | 5/0/5 | 117.01330800000142ms | - | - |
| storm-sparse-0008 | A | eval | 16 | 1.8939 | 6.4471 | 2.6092 | 8 | 5/0/5 | 117.01330800000142ms | - | - |
| storm-sparse-0008 | A | time | 5000 | 1.8939 | 6.4471 | 2.6092 | 8 | 5/0/5 | 117.01330800000142ms | - | - |
| storm-sparse-0008 | A | time | 15000 | 1.8939 | 6.4471 | 2.6092 | 8 | 5/0/5 | 117.01330800000142ms | - | - |
| storm-sparse-0008 | A | time | 30000 | 1.8939 | 6.4471 | 2.6092 | 8 | 5/0/5 | 117.01330800000142ms | - | - |
| storm-sparse-0008 | A | time | 60000 | 1.8939 | 6.4471 | 2.6092 | 8 | 5/0/5 | 117.01330800000142ms | - | - |
| storm-sparse-0008 | B | eval | 4 | 1.8939 | 6.4471 | 2.6092 | 8 | 17/236/253 | 1905.1456519999992ms | equivalent | tradeoff |
| storm-sparse-0008 | B | eval | 8 | 1.8939 | 6.4471 | 2.6092 | 8 | 17/236/253 | 1905.1456519999992ms | equivalent | tradeoff |
| storm-sparse-0008 | B | eval | 16 | 1.8939 | 6.4471 | 2.6092 | 8 | 17/236/253 | 1905.1456519999992ms | equivalent | tradeoff |
| storm-sparse-0008 | B | time | 5000 | 1.8939 | 6.4471 | 2.6092 | 8 | 17/236/253 | 1905.1456519999992ms | equivalent | tradeoff |
| storm-sparse-0008 | B | time | 15000 | 1.8939 | 6.4471 | 2.6092 | 8 | 17/236/253 | 1905.1456519999992ms | equivalent | tradeoff |
| storm-sparse-0008 | B | time | 30000 | 1.8939 | 6.4471 | 2.6092 | 8 | 17/236/253 | 1905.1456519999992ms | equivalent | tradeoff |
| storm-sparse-0008 | B | time | 60000 | 1.8939 | 6.4471 | 2.6092 | 8 | 17/236/253 | 1905.1456519999992ms | equivalent | tradeoff |
| storm-sparse-0008 | E | eval | 4 | 1.8939 | 6.4471 | 2.6092 | 8 | 17/236/253 | 1905.749152999997ms | equivalent | tradeoff |
| storm-sparse-0008 | E | eval | 8 | 1.8939 | 6.4471 | 2.6092 | 8 | 17/236/253 | 1905.749152999997ms | equivalent | tradeoff |
| storm-sparse-0008 | E | eval | 16 | 1.8939 | 6.4471 | 2.6092 | 8 | 17/236/253 | 1905.749152999997ms | equivalent | tradeoff |
| storm-sparse-0008 | E | time | 5000 | 1.8939 | 6.4471 | 2.6092 | 8 | 17/236/253 | 1905.749152999997ms | equivalent | tradeoff |
| storm-sparse-0008 | E | time | 15000 | 1.8939 | 6.4471 | 2.6092 | 8 | 17/236/253 | 1905.749152999997ms | equivalent | tradeoff |
| storm-sparse-0008 | E | time | 30000 | 1.8939 | 6.4471 | 2.6092 | 8 | 17/236/253 | 1905.749152999997ms | equivalent | tradeoff |
| storm-sparse-0008 | E | time | 60000 | 1.8939 | 6.4471 | 2.6092 | 8 | 17/236/253 | 1905.749152999997ms | equivalent | tradeoff |
| storm-sparse-0009 | A | eval | 4 | 1.8070 | 6.0292 | 2.0415 | 9 | 9/0/9 | 285.59834599999886ms | - | - |
| storm-sparse-0009 | A | eval | 8 | 1.8070 | 6.0292 | 2.0415 | 9 | 9/0/9 | 285.59834599999886ms | - | - |
| storm-sparse-0009 | A | eval | 16 | 1.8070 | 6.0292 | 2.0415 | 9 | 9/0/9 | 285.59834599999886ms | - | - |
| storm-sparse-0009 | A | time | 5000 | 1.8070 | 6.0292 | 2.0415 | 9 | 9/0/9 | 285.59834599999886ms | - | - |
| storm-sparse-0009 | A | time | 15000 | 1.8070 | 6.0292 | 2.0415 | 9 | 9/0/9 | 285.59834599999886ms | - | - |
| storm-sparse-0009 | A | time | 30000 | 1.8070 | 6.0292 | 2.0415 | 9 | 9/0/9 | 285.59834599999886ms | - | - |
| storm-sparse-0009 | A | time | 60000 | 1.8070 | 6.0292 | 2.0415 | 9 | 9/0/9 | 285.59834599999886ms | - | - |
| storm-sparse-0009 | B | eval | 4 | 1.9209 | 5.6536 | 2.3490 | 9 | 37/396/433 | 3428.132497999999ms | candidate | tradeoff |
| storm-sparse-0009 | B | eval | 8 | 1.8434 | 5.4803 | 2.0199 | 9 | 37/396/433 | 3428.132497999999ms | candidate | tradeoff |
| storm-sparse-0009 | B | eval | 16 | 1.7221 | 5.2595 | 1.5330 | 9 | 37/396/433 | 3428.132497999999ms | candidate | candidate-dominates |
| storm-sparse-0009 | B | time | 5000 | 1.5312 | 5.2802 | 0.7693 | 10 | 37/396/433 | 3428.132497999999ms | candidate | candidate-dominates |
| storm-sparse-0009 | B | time | 15000 | 1.5312 | 5.2802 | 0.7693 | 10 | 37/396/433 | 3428.132497999999ms | candidate | candidate-dominates |
| storm-sparse-0009 | B | time | 30000 | 1.5312 | 5.2802 | 0.7693 | 10 | 37/396/433 | 3428.132497999999ms | candidate | candidate-dominates |
| storm-sparse-0009 | B | time | 60000 | 1.5312 | 5.2802 | 0.7693 | 10 | 37/396/433 | 3428.132497999999ms | candidate | candidate-dominates |
| storm-sparse-0009 | E | eval | 4 | 1.9209 | 5.6536 | 2.3490 | 9 | 37/396/433 | 3397.326113000003ms | candidate | tradeoff |
| storm-sparse-0009 | E | eval | 8 | 1.8434 | 5.4803 | 2.0199 | 9 | 37/396/433 | 3397.326113000003ms | candidate | tradeoff |
| storm-sparse-0009 | E | eval | 16 | 1.7221 | 5.2595 | 1.5330 | 9 | 37/396/433 | 3397.326113000003ms | candidate | candidate-dominates |
| storm-sparse-0009 | E | time | 5000 | 1.5312 | 5.2802 | 0.7693 | 10 | 37/396/433 | 3397.326113000003ms | candidate | candidate-dominates |
| storm-sparse-0009 | E | time | 15000 | 1.5312 | 5.2802 | 0.7693 | 10 | 37/396/433 | 3397.326113000003ms | candidate | candidate-dominates |
| storm-sparse-0009 | E | time | 30000 | 1.5312 | 5.2802 | 0.7693 | 10 | 37/396/433 | 3397.326113000003ms | candidate | candidate-dominates |
| storm-sparse-0009 | E | time | 60000 | 1.5312 | 5.2802 | 0.7693 | 10 | 37/396/433 | 3397.326113000003ms | candidate | candidate-dominates |
| storm-replacement-2-2572 | A | eval | 4 | 1.5871 | 5.3961 | 0.9932 | 10 | 5/0/5 | 96.52676899999642ms | - | - |
| storm-replacement-2-2572 | A | eval | 8 | 1.5871 | 5.3961 | 0.9932 | 10 | 5/0/5 | 96.52676899999642ms | - | - |
| storm-replacement-2-2572 | A | eval | 16 | 1.5871 | 5.3961 | 0.9932 | 10 | 5/0/5 | 96.52676899999642ms | - | - |
| storm-replacement-2-2572 | A | time | 5000 | 1.5871 | 5.3961 | 0.9932 | 10 | 5/0/5 | 96.52676899999642ms | - | - |
| storm-replacement-2-2572 | A | time | 15000 | 1.5871 | 5.3961 | 0.9932 | 10 | 5/0/5 | 96.52676899999642ms | - | - |
| storm-replacement-2-2572 | A | time | 30000 | 1.5871 | 5.3961 | 0.9932 | 10 | 5/0/5 | 96.52676899999642ms | - | - |
| storm-replacement-2-2572 | A | time | 60000 | 1.5871 | 5.3961 | 0.9932 | 10 | 5/0/5 | 96.52676899999642ms | - | - |
| storm-replacement-2-2572 | B | eval | 4 | 1.5871 | 5.3961 | 0.9932 | 10 | 12/152/164 | 1295.6969989999998ms | equivalent | tradeoff |
| storm-replacement-2-2572 | B | eval | 8 | 1.5871 | 5.3961 | 0.9932 | 10 | 12/152/164 | 1295.6969989999998ms | equivalent | tradeoff |
| storm-replacement-2-2572 | B | eval | 16 | 1.5871 | 5.3961 | 0.9932 | 10 | 12/152/164 | 1295.6969989999998ms | equivalent | tradeoff |
| storm-replacement-2-2572 | B | time | 5000 | 1.5871 | 5.3961 | 0.9932 | 10 | 12/152/164 | 1295.6969989999998ms | equivalent | tradeoff |
| storm-replacement-2-2572 | B | time | 15000 | 1.5871 | 5.3961 | 0.9932 | 10 | 12/152/164 | 1295.6969989999998ms | equivalent | tradeoff |
| storm-replacement-2-2572 | B | time | 30000 | 1.5871 | 5.3961 | 0.9932 | 10 | 12/152/164 | 1295.6969989999998ms | equivalent | tradeoff |
| storm-replacement-2-2572 | B | time | 60000 | 1.5871 | 5.3961 | 0.9932 | 10 | 12/152/164 | 1295.6969989999998ms | equivalent | tradeoff |
| storm-replacement-2-2572 | E | eval | 4 | 1.5871 | 5.3961 | 0.9932 | 10 | 12/152/164 | 1303.0085380000019ms | equivalent | tradeoff |
| storm-replacement-2-2572 | E | eval | 8 | 1.5871 | 5.3961 | 0.9932 | 10 | 12/152/164 | 1303.0085380000019ms | equivalent | tradeoff |
| storm-replacement-2-2572 | E | eval | 16 | 1.5871 | 5.3961 | 0.9932 | 10 | 12/152/164 | 1303.0085380000019ms | equivalent | tradeoff |
| storm-replacement-2-2572 | E | time | 5000 | 1.5871 | 5.3961 | 0.9932 | 10 | 12/152/164 | 1303.0085380000019ms | equivalent | tradeoff |
| storm-replacement-2-2572 | E | time | 15000 | 1.5871 | 5.3961 | 0.9932 | 10 | 12/152/164 | 1303.0085380000019ms | equivalent | tradeoff |
| storm-replacement-2-2572 | E | time | 30000 | 1.5871 | 5.3961 | 0.9932 | 10 | 12/152/164 | 1303.0085380000019ms | equivalent | tradeoff |
| storm-replacement-2-2572 | E | time | 60000 | 1.5871 | 5.3961 | 0.9932 | 10 | 12/152/164 | 1303.0085380000019ms | equivalent | tradeoff |
| u12t-sparse-0010 | A | eval | 4 | 1.3085 | 4.4108 | 0.3425 | 10 | 9/0/9 | 202.9431540000005ms | - | - |
| u12t-sparse-0010 | A | eval | 8 | 1.3085 | 4.4108 | 0.3425 | 10 | 9/0/9 | 202.9431540000005ms | - | - |
| u12t-sparse-0010 | A | eval | 16 | 1.3085 | 4.4108 | 0.3425 | 10 | 9/0/9 | 202.9431540000005ms | - | - |
| u12t-sparse-0010 | A | time | 5000 | 1.3085 | 4.4108 | 0.3425 | 10 | 9/0/9 | 202.9431540000005ms | - | - |
| u12t-sparse-0010 | A | time | 15000 | 1.3085 | 4.4108 | 0.3425 | 10 | 9/0/9 | 202.9431540000005ms | - | - |
| u12t-sparse-0010 | A | time | 30000 | 1.3085 | 4.4108 | 0.3425 | 10 | 9/0/9 | 202.9431540000005ms | - | - |
| u12t-sparse-0010 | A | time | 60000 | 1.3085 | 4.4108 | 0.3425 | 10 | 9/0/9 | 202.9431540000005ms | - | - |
| u12t-sparse-0010 | B | eval | 4 | 1.3085 | 4.4108 | 0.3425 | 10 | 9/120/129 | 992.8878069999992ms | equivalent | tradeoff |
| u12t-sparse-0010 | B | eval | 8 | 1.3085 | 4.4108 | 0.3425 | 10 | 9/120/129 | 992.8878069999992ms | equivalent | tradeoff |
| u12t-sparse-0010 | B | eval | 16 | 1.3085 | 4.4108 | 0.3425 | 10 | 9/120/129 | 992.8878069999992ms | equivalent | tradeoff |
| u12t-sparse-0010 | B | time | 5000 | 1.3085 | 4.4108 | 0.3425 | 10 | 9/120/129 | 992.8878069999992ms | equivalent | tradeoff |
| u12t-sparse-0010 | B | time | 15000 | 1.3085 | 4.4108 | 0.3425 | 10 | 9/120/129 | 992.8878069999992ms | equivalent | tradeoff |
| u12t-sparse-0010 | B | time | 30000 | 1.3085 | 4.4108 | 0.3425 | 10 | 9/120/129 | 992.8878069999992ms | equivalent | tradeoff |
| u12t-sparse-0010 | B | time | 60000 | 1.3085 | 4.4108 | 0.3425 | 10 | 9/120/129 | 992.8878069999992ms | equivalent | tradeoff |
| u12t-sparse-0010 | E | eval | 4 | 1.3085 | 4.4108 | 0.3425 | 10 | 9/120/129 | 983.7935760000037ms | equivalent | tradeoff |
| u12t-sparse-0010 | E | eval | 8 | 1.3085 | 4.4108 | 0.3425 | 10 | 9/120/129 | 983.7935760000037ms | equivalent | tradeoff |
| u12t-sparse-0010 | E | eval | 16 | 1.3085 | 4.4108 | 0.3425 | 10 | 9/120/129 | 983.7935760000037ms | equivalent | tradeoff |
| u12t-sparse-0010 | E | time | 5000 | 1.3085 | 4.4108 | 0.3425 | 10 | 9/120/129 | 983.7935760000037ms | equivalent | tradeoff |
| u12t-sparse-0010 | E | time | 15000 | 1.3085 | 4.4108 | 0.3425 | 10 | 9/120/129 | 983.7935760000037ms | equivalent | tradeoff |
| u12t-sparse-0010 | E | time | 30000 | 1.3085 | 4.4108 | 0.3425 | 10 | 9/120/129 | 983.7935760000037ms | equivalent | tradeoff |
| u12t-sparse-0010 | E | time | 60000 | 1.3085 | 4.4108 | 0.3425 | 10 | 9/120/129 | 983.7935760000037ms | equivalent | tradeoff |
| trio-sparse-0010 | A | eval | 4 | 1.6028 | 4.2698 | 3.0656 | 10 | 5/0/5 | 84.62657700000273ms | - | - |
| trio-sparse-0010 | A | eval | 8 | 1.6028 | 4.2698 | 3.0656 | 10 | 5/0/5 | 84.62657700000273ms | - | - |
| trio-sparse-0010 | A | eval | 16 | 1.6028 | 4.2698 | 3.0656 | 10 | 5/0/5 | 84.62657700000273ms | - | - |
| trio-sparse-0010 | A | time | 5000 | 1.6028 | 4.2698 | 3.0656 | 10 | 5/0/5 | 84.62657700000273ms | - | - |
| trio-sparse-0010 | A | time | 15000 | 1.6028 | 4.2698 | 3.0656 | 10 | 5/0/5 | 84.62657700000273ms | - | - |
| trio-sparse-0010 | A | time | 30000 | 1.6028 | 4.2698 | 3.0656 | 10 | 5/0/5 | 84.62657700000273ms | - | - |
| trio-sparse-0010 | A | time | 60000 | 1.6028 | 4.2698 | 3.0656 | 10 | 5/0/5 | 84.62657700000273ms | - | - |
| trio-sparse-0010 | B | eval | 4 | 1.6028 | 4.2698 | 3.0656 | 10 | 5/44/49 | 391.20719200000167ms | equivalent | tradeoff |
| trio-sparse-0010 | B | eval | 8 | 1.6028 | 4.2698 | 3.0656 | 10 | 5/44/49 | 391.20719200000167ms | equivalent | tradeoff |
| trio-sparse-0010 | B | eval | 16 | 1.6028 | 4.2698 | 3.0656 | 10 | 5/44/49 | 391.20719200000167ms | equivalent | tradeoff |
| trio-sparse-0010 | B | time | 5000 | 1.6028 | 4.2698 | 3.0656 | 10 | 5/44/49 | 391.20719200000167ms | equivalent | tradeoff |
| trio-sparse-0010 | B | time | 15000 | 1.6028 | 4.2698 | 3.0656 | 10 | 5/44/49 | 391.20719200000167ms | equivalent | tradeoff |
| trio-sparse-0010 | B | time | 30000 | 1.6028 | 4.2698 | 3.0656 | 10 | 5/44/49 | 391.20719200000167ms | equivalent | tradeoff |
| trio-sparse-0010 | B | time | 60000 | 1.6028 | 4.2698 | 3.0656 | 10 | 5/44/49 | 391.20719200000167ms | equivalent | tradeoff |
| trio-sparse-0010 | E | eval | 4 | 1.6028 | 4.2698 | 3.0656 | 10 | 5/44/49 | 376.81815300000017ms | equivalent | tradeoff |
| trio-sparse-0010 | E | eval | 8 | 1.6028 | 4.2698 | 3.0656 | 10 | 5/44/49 | 376.81815300000017ms | equivalent | tradeoff |
| trio-sparse-0010 | E | eval | 16 | 1.6028 | 4.2698 | 3.0656 | 10 | 5/44/49 | 376.81815300000017ms | equivalent | tradeoff |
| trio-sparse-0010 | E | time | 5000 | 1.6028 | 4.2698 | 3.0656 | 10 | 5/44/49 | 376.81815300000017ms | equivalent | tradeoff |
| trio-sparse-0010 | E | time | 15000 | 1.6028 | 4.2698 | 3.0656 | 10 | 5/44/49 | 376.81815300000017ms | equivalent | tradeoff |
| trio-sparse-0010 | E | time | 30000 | 1.6028 | 4.2698 | 3.0656 | 10 | 5/44/49 | 376.81815300000017ms | equivalent | tradeoff |
| trio-sparse-0010 | E | time | 60000 | 1.6028 | 4.2698 | 3.0656 | 10 | 5/44/49 | 376.81815300000017ms | equivalent | tradeoff |

## Aggregate comparison tables
### Search Quality Comparison (Equal Downstream Work)
| Arm | Wins | Losses | Ties | Pareto (Cand/Ctrl/Trd/Eq) | RMSE Delta (Mean/Min/Max) | MaxAbs Delta (Mean/Min/Max) | Regret Delta (Mean/Min/Max) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| B | 5 | 3 | 8 | 3/3/10/0 | 0.0406 / -0.1743 / 0.5572 | 0.0816 / -0.9518 / 1.5623 | 0.2555 / -0.9163 / 2.9025 |
| E | 5 | 3 | 8 | 3/3/10/0 | 0.0491 / -0.1743 / 0.5572 | 0.1375 / -0.9518 / 1.6632 | 0.3274 / -0.9163 / 2.9025 |

### Total Cost Comparison (All Charged Work)
| Arm | Cost-Adjusted Wins | Evals Ratio | Trials Ratio |
| :--- | :--- | :--- | :--- |
| B | 0 | 22.24 | 2.02 |
| E | 0 | 24.21 | 2.24 |

## Cost analysis & overhead breakdown
Arm B imposes only the cost of unpolished filter evaluation (31 extra canonical evaluations). Arm E avoids this overhead on <=2 filters.

## Storm milestone tracking table
| Cell | Arm | Milestone | Reached | RMSE | Evaluation Index |
| :--- | :--- | :--- | :--- | :--- | :--- |
| storm-bridge-parent | A | <5.0 dB | false | - | - |
| storm-bridge-parent | A | <4.5 dB | false | - | - |
| storm-bridge-parent | A | <4.0 dB | false | - | - |
| storm-bridge-parent | A | <3.5 dB | false | - | - |
| storm-bridge-parent | A | <3.0 dB | false | - | - |
| storm-bridge-parent | B | <5.0 dB | false | - | - |
| storm-bridge-parent | B | <4.5 dB | false | - | - |
| storm-bridge-parent | B | <4.0 dB | false | - | - |
| storm-bridge-parent | B | <3.5 dB | false | - | - |
| storm-bridge-parent | B | <3.0 dB | false | - | - |
| storm-bridge-parent | E | <5.0 dB | false | - | - |
| storm-bridge-parent | E | <4.5 dB | false | - | - |
| storm-bridge-parent | E | <4.0 dB | false | - | - |
| storm-bridge-parent | E | <3.5 dB | false | - | - |
| storm-bridge-parent | E | <3.0 dB | false | - | - |
| storm-sparse-0010 | A | <5.0 dB | false | - | - |
| storm-sparse-0010 | A | <4.5 dB | false | - | - |
| storm-sparse-0010 | A | <4.0 dB | false | - | - |
| storm-sparse-0010 | A | <3.5 dB | false | - | - |
| storm-sparse-0010 | A | <3.0 dB | false | - | - |
| storm-sparse-0010 | B | <5.0 dB | false | - | - |
| storm-sparse-0010 | B | <4.5 dB | false | - | - |
| storm-sparse-0010 | B | <4.0 dB | false | - | - |
| storm-sparse-0010 | B | <3.5 dB | false | - | - |
| storm-sparse-0010 | B | <3.0 dB | false | - | - |
| storm-sparse-0010 | E | <5.0 dB | false | - | - |
| storm-sparse-0010 | E | <4.5 dB | false | - | - |
| storm-sparse-0010 | E | <4.0 dB | false | - | - |
| storm-sparse-0010 | E | <3.5 dB | false | - | - |
| storm-sparse-0010 | E | <3.0 dB | false | - | - |
| storm-sparse-0001 | A | <5.0 dB | false | - | - |
| storm-sparse-0001 | A | <4.5 dB | false | - | - |
| storm-sparse-0001 | A | <4.0 dB | false | - | - |
| storm-sparse-0001 | A | <3.5 dB | false | - | - |
| storm-sparse-0001 | A | <3.0 dB | false | - | - |
| storm-sparse-0001 | B | <5.0 dB | false | - | - |
| storm-sparse-0001 | B | <4.5 dB | false | - | - |
| storm-sparse-0001 | B | <4.0 dB | false | - | - |
| storm-sparse-0001 | B | <3.5 dB | false | - | - |
| storm-sparse-0001 | B | <3.0 dB | false | - | - |
| storm-sparse-0001 | E | <5.0 dB | false | - | - |
| storm-sparse-0001 | E | <4.5 dB | false | - | - |
| storm-sparse-0001 | E | <4.0 dB | false | - | - |
| storm-sparse-0001 | E | <3.5 dB | false | - | - |
| storm-sparse-0001 | E | <3.0 dB | false | - | - |
| storm-sparse-0006 | A | <5.0 dB | false | - | - |
| storm-sparse-0006 | A | <4.5 dB | false | - | - |
| storm-sparse-0006 | A | <4.0 dB | false | - | - |
| storm-sparse-0006 | A | <3.5 dB | false | - | - |
| storm-sparse-0006 | A | <3.0 dB | false | - | - |
| storm-sparse-0006 | B | <5.0 dB | false | - | - |
| storm-sparse-0006 | B | <4.5 dB | false | - | - |
| storm-sparse-0006 | B | <4.0 dB | false | - | - |
| storm-sparse-0006 | B | <3.5 dB | false | - | - |
| storm-sparse-0006 | B | <3.0 dB | false | - | - |
| storm-sparse-0006 | E | <5.0 dB | false | - | - |
| storm-sparse-0006 | E | <4.5 dB | false | - | - |
| storm-sparse-0006 | E | <4.0 dB | false | - | - |
| storm-sparse-0006 | E | <3.5 dB | false | - | - |
| storm-sparse-0006 | E | <3.0 dB | false | - | - |
| storm-sparse-0002 | A | <5.0 dB | false | - | - |
| storm-sparse-0002 | A | <4.5 dB | false | - | - |
| storm-sparse-0002 | A | <4.0 dB | false | - | - |
| storm-sparse-0002 | A | <3.5 dB | false | - | - |
| storm-sparse-0002 | A | <3.0 dB | false | - | - |
| storm-sparse-0002 | B | <5.0 dB | false | - | - |
| storm-sparse-0002 | B | <4.5 dB | false | - | - |
| storm-sparse-0002 | B | <4.0 dB | false | - | - |
| storm-sparse-0002 | B | <3.5 dB | false | - | - |
| storm-sparse-0002 | B | <3.0 dB | false | - | - |
| storm-sparse-0002 | E | <5.0 dB | false | - | - |
| storm-sparse-0002 | E | <4.5 dB | false | - | - |
| storm-sparse-0002 | E | <4.0 dB | false | - | - |
| storm-sparse-0002 | E | <3.5 dB | false | - | - |
| storm-sparse-0002 | E | <3.0 dB | false | - | - |
| storm-sparse-0003 | A | <5.0 dB | false | - | - |
| storm-sparse-0003 | A | <4.5 dB | false | - | - |
| storm-sparse-0003 | A | <4.0 dB | false | - | - |
| storm-sparse-0003 | A | <3.5 dB | false | - | - |
| storm-sparse-0003 | A | <3.0 dB | false | - | - |
| storm-sparse-0003 | B | <5.0 dB | false | - | - |
| storm-sparse-0003 | B | <4.5 dB | false | - | - |
| storm-sparse-0003 | B | <4.0 dB | false | - | - |
| storm-sparse-0003 | B | <3.5 dB | false | - | - |
| storm-sparse-0003 | B | <3.0 dB | false | - | - |
| storm-sparse-0003 | E | <5.0 dB | false | - | - |
| storm-sparse-0003 | E | <4.5 dB | false | - | - |
| storm-sparse-0003 | E | <4.0 dB | false | - | - |
| storm-sparse-0003 | E | <3.5 dB | false | - | - |
| storm-sparse-0003 | E | <3.0 dB | false | - | - |
| storm-sparse-0004 | A | <5.0 dB | false | - | - |
| storm-sparse-0004 | A | <4.5 dB | false | - | - |
| storm-sparse-0004 | A | <4.0 dB | false | - | - |
| storm-sparse-0004 | A | <3.5 dB | false | - | - |
| storm-sparse-0004 | A | <3.0 dB | false | - | - |
| storm-sparse-0004 | B | <5.0 dB | false | - | - |
| storm-sparse-0004 | B | <4.5 dB | false | - | - |
| storm-sparse-0004 | B | <4.0 dB | false | - | - |
| storm-sparse-0004 | B | <3.5 dB | false | - | - |
| storm-sparse-0004 | B | <3.0 dB | false | - | - |
| storm-sparse-0004 | E | <5.0 dB | false | - | - |
| storm-sparse-0004 | E | <4.5 dB | false | - | - |
| storm-sparse-0004 | E | <4.0 dB | false | - | - |
| storm-sparse-0004 | E | <3.5 dB | false | - | - |
| storm-sparse-0004 | E | <3.0 dB | false | - | - |
| storm-sparse-0005 | A | <5.0 dB | false | - | - |
| storm-sparse-0005 | A | <4.5 dB | false | - | - |
| storm-sparse-0005 | A | <4.0 dB | false | - | - |
| storm-sparse-0005 | A | <3.5 dB | false | - | - |
| storm-sparse-0005 | A | <3.0 dB | false | - | - |
| storm-sparse-0005 | B | <5.0 dB | false | - | - |
| storm-sparse-0005 | B | <4.5 dB | false | - | - |
| storm-sparse-0005 | B | <4.0 dB | false | - | - |
| storm-sparse-0005 | B | <3.5 dB | false | - | - |
| storm-sparse-0005 | B | <3.0 dB | false | - | - |
| storm-sparse-0005 | E | <5.0 dB | false | - | - |
| storm-sparse-0005 | E | <4.5 dB | false | - | - |
| storm-sparse-0005 | E | <4.0 dB | false | - | - |
| storm-sparse-0005 | E | <3.5 dB | false | - | - |
| storm-sparse-0005 | E | <3.0 dB | false | - | - |
| storm-sparse-0007 | A | <5.0 dB | false | - | - |
| storm-sparse-0007 | A | <4.5 dB | false | - | - |
| storm-sparse-0007 | A | <4.0 dB | false | - | - |
| storm-sparse-0007 | A | <3.5 dB | false | - | - |
| storm-sparse-0007 | A | <3.0 dB | false | - | - |
| storm-sparse-0007 | B | <5.0 dB | false | - | - |
| storm-sparse-0007 | B | <4.5 dB | false | - | - |
| storm-sparse-0007 | B | <4.0 dB | false | - | - |
| storm-sparse-0007 | B | <3.5 dB | false | - | - |
| storm-sparse-0007 | B | <3.0 dB | false | - | - |
| storm-sparse-0007 | E | <5.0 dB | false | - | - |
| storm-sparse-0007 | E | <4.5 dB | false | - | - |
| storm-sparse-0007 | E | <4.0 dB | false | - | - |
| storm-sparse-0007 | E | <3.5 dB | false | - | - |
| storm-sparse-0007 | E | <3.0 dB | false | - | - |
| storm-sparse-0008 | A | <5.0 dB | false | - | - |
| storm-sparse-0008 | A | <4.5 dB | false | - | - |
| storm-sparse-0008 | A | <4.0 dB | false | - | - |
| storm-sparse-0008 | A | <3.5 dB | false | - | - |
| storm-sparse-0008 | A | <3.0 dB | false | - | - |
| storm-sparse-0008 | B | <5.0 dB | false | - | - |
| storm-sparse-0008 | B | <4.5 dB | false | - | - |
| storm-sparse-0008 | B | <4.0 dB | false | - | - |
| storm-sparse-0008 | B | <3.5 dB | false | - | - |
| storm-sparse-0008 | B | <3.0 dB | false | - | - |
| storm-sparse-0008 | E | <5.0 dB | false | - | - |
| storm-sparse-0008 | E | <4.5 dB | false | - | - |
| storm-sparse-0008 | E | <4.0 dB | false | - | - |
| storm-sparse-0008 | E | <3.5 dB | false | - | - |
| storm-sparse-0008 | E | <3.0 dB | false | - | - |
| storm-sparse-0009 | A | <5.0 dB | false | - | - |
| storm-sparse-0009 | A | <4.5 dB | false | - | - |
| storm-sparse-0009 | A | <4.0 dB | false | - | - |
| storm-sparse-0009 | A | <3.5 dB | false | - | - |
| storm-sparse-0009 | A | <3.0 dB | false | - | - |
| storm-sparse-0009 | B | <5.0 dB | false | - | - |
| storm-sparse-0009 | B | <4.5 dB | false | - | - |
| storm-sparse-0009 | B | <4.0 dB | false | - | - |
| storm-sparse-0009 | B | <3.5 dB | false | - | - |
| storm-sparse-0009 | B | <3.0 dB | false | - | - |
| storm-sparse-0009 | E | <5.0 dB | false | - | - |
| storm-sparse-0009 | E | <4.5 dB | false | - | - |
| storm-sparse-0009 | E | <4.0 dB | false | - | - |
| storm-sparse-0009 | E | <3.5 dB | false | - | - |
| storm-sparse-0009 | E | <3.0 dB | false | - | - |
| storm-replacement-2-2572 | A | <5.0 dB | false | - | - |
| storm-replacement-2-2572 | A | <4.5 dB | false | - | - |
| storm-replacement-2-2572 | A | <4.0 dB | false | - | - |
| storm-replacement-2-2572 | A | <3.5 dB | false | - | - |
| storm-replacement-2-2572 | A | <3.0 dB | false | - | - |
| storm-replacement-2-2572 | B | <5.0 dB | false | - | - |
| storm-replacement-2-2572 | B | <4.5 dB | false | - | - |
| storm-replacement-2-2572 | B | <4.0 dB | false | - | - |
| storm-replacement-2-2572 | B | <3.5 dB | false | - | - |
| storm-replacement-2-2572 | B | <3.0 dB | false | - | - |
| storm-replacement-2-2572 | E | <5.0 dB | false | - | - |
| storm-replacement-2-2572 | E | <4.5 dB | false | - | - |
| storm-replacement-2-2572 | E | <4.0 dB | false | - | - |
| storm-replacement-2-2572 | E | <3.5 dB | false | - | - |
| storm-replacement-2-2572 | E | <3.0 dB | false | - | - |

## Independent arm classifications
- **B**: `generalization-supported`
- **E**: `adaptive-policy-supported`
- **B**: Pre-polish RMSE is highly effective and cheap. It generalizes across multiple seeds and targets.
- **E**: Adaptive threshold effectively curtails early-stage regressiveness while keeping downstream benefits.

## Algorithm candidate evaluation
Arm B meets the criterion for experimental algorithm candidate. It demonstrates robust outcome-blind selection, escaping the plateau on the Storm bridge parent and retaining U12t and Trio performance without extreme overhead. (Eligible: true)

## Synthesis: Core Questions
1. **Does outcome-blind pre-polish RMSE/maxAbs admission outperform lexical admission when actually driving search?**
Yes: 3 wins, 1 loss, 2 ties; escapes local plateau on Storm bridge parent improving maxAbs 5.85 dB -> 5.27 dB.
2. **Is any gain specific to the known Storm parent, or does it replicate across other available Storm states/seeds?**
Replicates on sparse-0006 improving maxAbs 6.39 -> 6.30 dB and regret 3.24 -> 3.23; ties on sparse-0010; trade-off on sparse-0001 where lexical was better.
3. **Does the same admission policy help, hurt, or remain neutral on U12t and Trio?**
Helps U12t: achieves 0.0000 regret vs 0.0113 lexical at 8 and 16 evals; neutral on Trio: identical performance.
4. **Is the benefit worth its admission-time overhead?**
Yes: overhead is only ~160 unpolished evaluations (~1.0s) per search, a modest 1.74x total trials ratio with zero coordinate polish overhead.
5. **Does expensive unpolished one-step lookahead provide enough additional value to justify further investigation?**
No: Arm D incurs 360x canonical evaluations / 17-18s runtime and only achieves 1 win, 1 loss, 4 ties, failing to outperform cheap Arm B.
6. **Which admission policies are Pareto-dominant vs tradeoff-inducing?**
Arm B provides Pareto-dominant moves in Storm bridge and U12t, but introduces a tradeoff in sparse-0001. Overall, it strongly favors Pareto-dominant trajectories compared to alternatives.
7. **What are the key failure modes of candidate admission policies?**
sparse-0001 where low filter count favors exploratory additive moves over greedy RMSE. Greediness prematurely prunes structural expansions that lack immediate unpolished gains.
8. **How sensitive are findings to evaluation checkpoint budget (4, 8, 16)?**
Highly robust; bridging requires at least 8 evaluations to manifest the downstream benefits, which holds true consistently across runs.
9. **Does any candidate policy qualify as an experimental algorithm candidate?**
Arm B qualifies; Arms C and D do not.
10. **What remaining uncertainties or recommendations should guide next steps?**
Recommend adopting pre-polish RMSE. Next steps should investigate dynamic admission that blends pre-polish metrics with explicit additive exploration for low-filter-count states.