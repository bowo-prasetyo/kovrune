# How much of the engineering literature Kovrune can read

A question an engineering researcher asked of Kovrune: are local documents and the open sources enough? Kovrune reads a paper in full from arXiv, Europe PMC (its open-access subset) and Zenodo, and otherwise shows OpenAlex's abstract. This measures, for the works engineering reviews cite, how a researcher could get each one's text.

**Method** (`npm run bench:coverage`, [`eval/coverage.ts`](../coverage.ts)). Ten reviews published 2020–2023, with at least 30 references OpenAlex matched, are sampled at random (seed 1) from each of 14 engineering subfields in OpenAlex: every subfield of Engineering but Architecture, Media Technology and General Engineering, and Energy Engineering and Power Technology, where much of power electronics is classified. Every work they cite is sorted, with Kovrune's own code where it has some (`arxivIdIn`, `pmcidOf`):

- **Kovrune reads in full:** an arXiv version, a PubMed Central ID, or a Zenodo DOI. A PMCID is an upper bound, since Europe PMC serves the text of its open-access subset only; the works whose PubMed Central copy has a Creative Commons licence in OpenAlex estimate that subset.
- **Free elsewhere:** OpenAlex counts it open access, at no source Kovrune has: downloaded by hand and added as a document.
- **Abstract only:** not free, and OpenAlex has its abstract, which is what Kovrune shows.
- **Title only:** not free, and no abstract.

Each review counts its own citations, so the shares are of a review's reading list. Results: [json](../results/coverage-engineering.json).

## Results

140 reviews, 16,565 citations of 16,322 works:

| Subfield (reviews) | Citations | Kovrune reads in full | Free elsewhere | Abstract only | Title only |
| --- | --- | --- | --- | --- | --- |
| **All** | 16,565 | **12%** (9% estimated) | 28% | 26% | **34%** |
| Biomedical Engineering (10) | 1,119 | 32% | 17% | 24% | 27% |
| Ocean Engineering (10) | 1,016 | 17% | 27% | 23% | 33% |
| Computational Mechanics (10) | 1,377 | 16% | 25% | 29% | 30% |
| Electrical and Electronic Engineering (10) | 1,207 | 14% | 28% | 42% | 17% |
| Aerospace Engineering (10) | 904 | 13% | 23% | 42% | 22% |
| Control and Systems Engineering (10) | 937 | 13% | 27% | 26% | 34% |
| Industrial and Manufacturing Engineering (10) | 1,441 | 13% | 34% | 22% | 30% |
| Safety, Risk, Reliability and Quality (10) | 1,026 | 12% | 27% | 30% | 31% |
| Mechanics of Materials (10) | 1,405 | 11% | 19% | 28% | 42% |
| Automotive Engineering (10) | 753 | 10% | 30% | 36% | 25% |
| Civil and Structural Engineering (10) | 1,622 | 8% | 31% | 18% | 43% |
| Mechanical Engineering (10) | 1,248 | 7% | 27% | 27% | 38% |
| Building and Construction (10) | 903 | 7% | 36% | 19% | 38% |
| Energy Engineering and Power Technology (10) | 1,607 | 5% | 34% | 14% | 47% |

- **Kovrune reads 9 to 12% in full.** Of 2,046 citations it has a route to, 528 are on arXiv, 6 on Zenodo and 1,512 in PubMed Central, of which 934 have a Creative Commons licence there: about 1,468 (9%) it can read today. The other 578 are free to read in PubMed Central, but likely not served by Europe PMC.
- **About 40% are free somewhere.** Adding those free elsewhere (28%; by OpenAlex's status green 36%, bronze 18%, gold 18%, hybrid 18%, diamond 10%) and the PubMed Central works outside the open subset, a researcher could get about two in five without a library, most of them by downloading by hand.
- **60% need a library.** Of the citations that are not free, 41% are Elsevier's, 9% IEEE's, 7% Wiley's and 7% Springer's. For these Kovrune shows an abstract at best.
- **A third has no abstract either.** 73% of the title-only citations are Elsevier's: OpenAlex holds no abstract for most of them, so Kovrune's OpenAlex source gives only the title and details. With book chapters (78% title only) and books (60%), this is the largest group, and in Energy Engineering nearly half (47%).
- **Conference papers are mostly abstract only** (64% of 1,217), most of them IEEE's.
- **Repeatable:** another 140 reviews (seed 2) give 12%, 25%, 27% and 35%.

**What follows.** The open sources carry about a tenth of what an engineering review cites, and abstracts another quarter; the rest needs the researcher's own copies. So the largest gain for engineering is making those copies easy to add: a folder, or a reference manager's export, at once, each file matched to its DOI so its citation is complete. Biomedical engineering is the exception (32% in full), through Europe PMC.

**What this does not cover.** Only references OpenAlex matched to a work count (222 cited IDs returned nothing); standards, datasheets and application notes are rarely matched, and are never in these sources. A review's references stand in for a researcher's reading list. OpenAlex's open-access status can be out of date, and "free" does not mean Kovrune could fetch it from a web page.

## A defect this found (0.80.0)

The first run found Kovrune reading no citation through Europe PMC, though the biomedical reviews cite many papers in PubMed Central. OpenAlex gives a PMCID as the article's URL with the bare number, `https://www.ncbi.nlm.nih.gov/pmc/articles/8862100` (all 200 in a sample), and `src/sources/openalex.ts` looked for "PMC" followed by digits, so it never found one. So a paper OpenAlex found was never read in full from Europe PMC, though the user guide says it is when **Europe PMC** is ticked, and the BibTeX export left out its PMCID. `pmcidOf` reads both forms. With it, Kovrune's share of these citations read in full goes from 3% (arXiv and Zenodo) to 9–12%. No benchmark suite uses OpenAlex, so no model run is affected.
