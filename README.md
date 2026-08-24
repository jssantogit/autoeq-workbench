# AutoEQ Workbench

A browser-based workbench for frequency-response analysis and parametric equalization.

[Open AutoEQ Workbench](https://jssantogit.github.io/autoeq-workbench/)

## About

AutoEQ Workbench is a local-first tool for working with measured frequency responses, target curves, normalization, and parametric EQ directly in the browser.

Load measurements and targets, compare responses, build a manual EQ, and inspect the resulting frequency response without sending your files to a backend.

## Features

### Frequency response

- Load frequency-response measurements and target curves
- Compare multiple responses on the same logarithmic FR graph
- Normalize around a configurable frequency and level
- Inspect frequency and dB values directly on the graph

### Parametric equalizer

- Peak (PK), Low Shelf (LS), and High Shelf (HS) filters
- Frequency, gain, and Q control
- Complete enabled filter cascade reflected in the equalized response
- Preamp derived from the combined EQ response

### AutoEQ *(in development)*

- Automatic matching of an active FR against a selected target
- Configurable optimization frequency range
- Configurable gain and Q bounds
- Configurable maximum filter count

## Privacy

All measurement and EQ processing happens locally in the browser. Files are not uploaded to a server.

## Status

AutoEQ Workbench is under active development. Manual PEQ and the analysis workbench are available now; the automatic EQ engine is the next major implementation stage.
