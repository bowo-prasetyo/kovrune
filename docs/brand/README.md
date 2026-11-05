# Kovrune brand

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="kovrune-logo-dark.svg" />
  <img src="kovrune-logo.svg" alt="Kovrune" height="64" />
</picture>

## The idea

Kovrune's promise is *Your documents. Your machine. Answers you can check.* The mark says that in a single glyph: a **K drawn like a rune, whose leg ends in a check mark**.

- **The rune.** The mark is made of straight strokes only, with no curves, like a mark cut into wood or stone: plain, honest and lasting. That suits a tool whose code, models and protocols are open to inspection.
- **The check.** The K's arm comes down to meet its leg, and the leg turns into a tick. Kovrune doesn't ask to be trusted: every quote is checked against its source, so verification is part of the letter itself.
- **Two parts.** The stem stands apart from the stroke that makes the arm and the check. One stands for the person and their own machine, the other for the work their agent does; they stay independent but read as one letter. This is the motto, *Think Freely. Build Together. Stay Decentralized.*, in miniature.

## Files

| File | Use |
| --- | --- |
| [`kovrune-logo.svg`](kovrune-logo.svg) | Mark and wordmark, for light backgrounds |
| [`kovrune-logo-dark.svg`](kovrune-logo-dark.svg) | Mark and wordmark, for dark backgrounds |
| [`kovrune-mark.svg`](kovrune-mark.svg) | The mark on its own: avatars, social cards, small spaces |
| [`../../public/favicon.svg`](../../public/favicon.svg) | The browser tab icon, the same drawing as the mark |
| [`../../public/favicon.ico`](../../public/favicon.ico) | 16, 32 and 48 px, for browsers and tools that ask for `/favicon.ico` |
| [`../../public/apple-touch-icon.png`](../../public/apple-touch-icon.png) | 180 px home screen icon, square: iOS rounds the corners itself |

In the app, `KovruneMark` in `src/app/App.tsx` draws the mark inline beside the name in the header.

## Construction

The mark sits on a 32 × 32 grid, in a tile with corners of radius 7. The strokes are 3.2 units wide, with round caps and joins:

```
stem              M7.5 7.5 v17
arm, leg, check   M20.5 7.5  L12.5 16  l4.5 6.5  l7.5 -11
```

The stem's right edge and the stroke's point leave a gap of 1.8 units, which stays open at 16 px.

The wordmark is drawn, not typeset, so it needs no font: lowercase monoline letters on the same stroke logic as the mark (3.6 units wide on a 32 unit height, round caps), with geometric round letters. It is always lowercase: *kovrune*. In running text the name is written **Kovrune**.

## Colours

The colours are the app's own (`src/app/styles.css`), so the logo, the favicon and the interface match.

| Name | Hex | Use |
| --- | --- | --- |
| Kovrune teal | `#0f766e` | The tile; the app's accent in light mode; `theme-color` |
| Light teal | `#2dd4bf` | The app's accent in dark mode |
| Stone 900 | `#1c1917` | The wordmark on light backgrounds; the dark background |
| Stone 100 | `#f5f5f4` | The wordmark on dark backgrounds |
| White | `#ffffff` | The strokes of the mark |

## Use

- Keep clear space around the logo of at least half the tile's height.
- Don't show the mark smaller than 16 px. Below 24 px high, use the mark without the wordmark.
- On a teal or busy background, use the mark on its own; its tile carries its own contrast.
- Don't recolour, stretch, rotate, outline or add shadows to the mark, and don't set the wordmark in a font.
