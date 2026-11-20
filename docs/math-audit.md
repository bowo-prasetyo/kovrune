# Mathematics Audit, November 2026

An audit of Kovrune from a research mathematician's point of view, at `cebc54f` (harness 0.93.0). It asks two things:

1. Is Kovrune already useful for research in mathematics?
2. What stands in the way, and what should change first?

It ran the app's own code (no model) on two kinds of input: small LaTeX and answer cases written for the audit, and the LaTeX sources of 48 recent arXiv papers, six each from math.AG, math.AP, math.CO, math.DG, math.GT, math.NT, math.PR and math.RT ([list below](#method)). Each figure comes from those runs. The earlier audits found the same kind of defect in their own fields: units for physics (0.90.0), chemistry formulas (0.93.0). This one finds it for theorems.

## Verdict

**Useful today for finding and quoting results in arXiv papers, but not yet for the question a mathematician asks most: what exactly does Theorem X state, and is it proven?**

What works well:

- **arXiv is where mathematics is, and Kovrune reads its papers from their LaTeX source.** 47 of the 48 papers convert to readable text (one falls back to the PDF). Displayed equations keep their LaTeX and their numbers, citations print as in the PDF, and the paper's own `\newcommand` macros are expanded. That is better than any PDF text layer.
- **Search copes with LaTeX.** On test documents, "Euler product for the zeta function" finds `$\zeta(s) = \prod_p (1-p^{-s})^{-1}$`, and "absolute Galois group of Q" finds `$\mathrm{Gal}(\bar{\mathbb Q}/\mathbb Q)$`.
- **Your drafts stay on your machine.** For unpublished results, that matters more than in most fields.
- **Quotes are checked, and papers export as BibTeX.** Both fit how mathematicians work.

What gets in the way (details in [Findings](#findings)):

1. **Theorem-like environments lose their heading when the paper names them its own way** (`thm`, `lem`, `conj`). 37 of the 48 papers do that. In 14 papers a **Conjecture** reads as a plain statement, with nothing to tell it from a proven result.
2. **Theorems are not numbered, and every reference to one gives its section's number instead.** "We prove Theorem 1.2 … and Theorem 1.4" reads as "we prove Theorem 1 … and Theorem 1". The 48 papers have 2,480 such references.
3. **The sentence check doesn't see changes to a mathematical statement.** Of nine wrong sentences tried (≤ for ≥, ∀ for ∃, a hypothesis left out, a conjecture called proven), it caught only the one with a changed digit.
4. **A quote that writes math in Unicode is often not found** ("p ≥ 5" for `$p \geq 5$`), so right answers can lose their label.

The first two are converter defects. They are deterministic, can be fixed without running a model, and can be measured on the 48-paper sample. They should come first.

**Status (harness 0.94.0):** M1 and M2 are fixed, and the suite of M6 is built (`eval/math/`). On the 48 papers, 1,514 of 1,518 numbered statement headings and 3,385 of 3,403 references to statements now match the PDF, against 2,171 of 3,239 references before ([field README](../eval/field/README.md#mathematics-theorem-like-statements-numbered-as-amsthm-numbers-them-0940-defect-fix)). **Harness 0.95.0:** M4 is fixed, for quotes in any mix of LaTeX, ASCII and Unicode, outside dollar signs too; on the suite, 16/24 and 6/10, from 11/24 and 5/10 ([suite](../eval/math/README.md#quotes-of-math-in-any-common-form-0950)). **Harness 0.96.0:** M3 is fixed in part: five of its nine wrong sentences are now marked, against one ([field README](../eval/field/README.md#the-questions-formula-quoted-no-answers-and-formulas-quantifiers-and-status-0960)); an answer about another formula than the question's is no longer labelled; and a quoted "no" is no longer reported as not found. On the suite, 19/24 and 6/10, with no wrong held-out label. **Harness 0.97.0:** M5: zbMATH Open can't be a source, since its API allows no requests from web pages; arXiv searches can instead be limited to subjects, and each paper shows its arXiv categories and MSC codes. M7: a statement is kept with the start of its proof, and a part that starts inside a proof says whose ([field README](../eval/field/README.md#arxiv-subjects-and-proofs-across-parts-0970)). **Harness 0.100.0:** M8: inline formulas shown as raw LaTeX in the 48 papers go from 5,838 to 1,165 of 62,667. M3: a dropped hypothesis, a quantifier swapped on the noun it binds, and a conjecture quoted without its heading are now marked, so eight of the nine wrong sentences are; the one left is "O(n³ log n)" for "O(n^{3/2} log n)". M7 is measured: on a paper whose two proofs run over several parts, the notes alone did not change Qwen3.5-4B's answers (1 of 3); search now finds a part by the proof it continues (2 of 3), and an answer quoting another proof than the one asked about is not labelled ([field README](../eval/field/README.md#more-formulas-as-text-hypotheses-and-bound-quantifiers-and-proofs-found-by-search-01000)). Every finding is now addressed.

## Findings

### M1. High: theorem environments with the paper's own names lose their heading

`convertBody` in `src/documents/latex.ts` writes a heading only for a fixed list of environment names: `theorem|lemma|proposition|corollary|definition|remark|example|proof|assumption|claim`. Most papers declare their own names with `\newtheorem{thm}{Theorem}`, `\newtheorem{conj}{Conjecture}` and so on. The converter drops `\newtheorem` (it is in `DROP` and `DEFINITIONS`), and any other `\begin{…}` becomes a paragraph break. So the heading is gone, and `conjecture`, `problem` and `question` are lost even under their standard names.

On the 48 papers:

| Measure | Count |
| --- | --- |
| Papers with a theorem environment outside the fixed list | 37 of 48 |
| Theorem-like blocks in those environments, whose heading is lost | 507 of 1,616 |
| Of those, Theorem / Lemma / Definition / Proposition / Corollary | 89 / 89 / 77 / 75 / 53 |
| Conjectures read as plain statements | 23, in 14 papers |

A real case, arXiv 2611.24215 (math.RT):

| The source says | Kovrune reads |
| --- | --- |
| `\begin{conj} For $\chi=1$ (the trivial character), there is an isomorphism $\pi_{\chi,N}\cong\mathcal{O}(\widehat{T}_{\chi})$ …` | For $\chi=1$ (the trivial character), there is an isomorphism $\pi_{\chi,N}\cong\mathcal{O}(\widehat{T}_{\chi})$ … |

**Why it matters:** ask "Is there an isomorphism π ≅ O(T̂) for the trivial character?" and the model can answer "Yes", quote that passage word for word, and get **Quotes found**. In mathematics, telling a conjecture from a theorem is the difference between right and wrong.

**Fix:** read each `\newtheorem{env}[shared]{Printed}[within]` (and `\newtheorem*`, `\declaretheorem`, `\spnewtheorem`) before it is dropped, and give every declared environment its printed name as its heading. Add `conjecture`, `problem`, `question`, `hypothesis`, `notation` and `fact` to the standard names.

### M2. High: theorems are unnumbered, and references to them give the section's number

`numberLabels` numbers sections, floats and equations only. A `\label` inside a theorem falls through to the section around it, so `Theorem~\ref{thm:main}` reads "Theorem 2" when the paper prints "Theorem 2.3", and `\cref{thm:main}` reads "Section 2". The block itself is written "Theorem." with no number, so a reader or model can't match a reference to it at all.

A paper written for the audit (`\newtheorem{theorem}{Theorem}[section]`, lemma, theorem and conjecture in Section 2, all sharing one counter):

| The source says | The PDF prints | Kovrune reads |
| --- | --- | --- |
| `\begin{lemma}\label{l}` | Lemma 2.1. | Lemma. |
| `\begin{theorem}[Hardy--Littlewood]\label{t}` | Theorem 2.2 (Hardy–Littlewood). | Theorem (Hardy–Littlewood). |
| `\begin{conjecture}\label{c}` | Conjecture 2.3. | *(nothing: M1)* |
| `\begin{proof}[Proof of Theorem~\ref{t}]` | Proof of Theorem 2.2. | Proof (Proof of Theorem 2). |
| `Conjecture~\ref{c} … see \cref{t}` | Conjecture 2.3 … see Theorem 2.2 | Conjecture 2 … see Section 2 |

And a real case, arXiv 2611.23874 (math.RT): "In Section 4, we prove Theorem~\ref{arb}. In the final Section~\ref{1.2}, we prove Theorem~\ref{bounds}" reads "In Section 4, we prove Theorem 1. In the final Section 5, we prove Theorem 1." Two different theorems get the same, wrong, number.

The 48 papers have 2,480 `\ref` and `\cref` commands to labels named like theorems (`thm:`, `lem:`, `prop:` and so on). Each one is read this way.

**Why it matters:** "What does Lemma 3.4 assume?" and "Which result does the proof of Theorem 1.2 use?" are the most common questions about a paper. Kovrune can't answer them, and worse, its text gives wrong numbers that a model will quote faithfully.

**Fix:** number theorem-like blocks the way amsthm does: one counter per environment, shared when declared with `[env]`, reset by `[section]` or `\numberwithin`. Give their labels a `theorem` kind whose `\cref` name is the printed name. Write the heading as "**Theorem 2.2** (Hardy–Littlewood)." and a proof's optional title in place of "Proof" ("Proof of Theorem 2.2."). A wrong number doesn't show as `??`, so `readableLatex` can't see this. Measure it instead by comparing, on the 48 papers, each reference's number with the number of the block its label is in.

### M3. Medium-high: the sentence check doesn't see changes to a statement

`sentenceSupport` (`src/agent/support.ts`) checks words, numbers, units, months, negation, directions ("higher") and names. Mathematical statements change in other ways. With a verified quote, these sentences were checked:

| The quote says | The answer says | Backed |
| --- | --- | --- |
| For every prime $p \geq 5$, the group … has order $p$ | For every prime p ≥ 3, the group … has order p. | **no** ✅ |
| If $n \mid m$ then $\varphi(n) \leq \varphi(m)$ | If n divides m then φ(n) **≥** φ(m). | yes ❌ |
| If $n \mid m$ then $\varphi(n) \leq \varphi(m)$ | φ(n) ≤ φ(m) holds for all n and m. *(hypothesis dropped)* | yes ❌ |
| Conjecture. Every toy ring of characteristic zero is finite | The paper **proves** that every toy ring … is finite. | yes ❌ |
| running time is $O(n^{3/2} \log n)$ | The running time is O(n^{**1/2**} log n). | yes ❌ |
| There **exists** a constant $c > 0$ such that … | For **every** constant c > 0, … | yes ❌ |
| converges absolutely for $\Re(s) > 1$ | … for Re(s) **≥** 1. | yes ❌ |
| converges absolutely for $\Re(s) > 1$ | … for **Im**(s) > 1. | yes ❌ |

The model's check comes next, and [audit F2](ai-ml-audit.md) found it catches few such errors. These are exactly the slips a 4B model makes when it restates a formula.

**Fix:** a "mathematical opposites" rule like the physics and chemistry ones (0.90.0, 0.93.0), tested the same way:
- **Relations:** ≤/≥, </>, strict against non-strict (`<` vs `≤`, "at most" vs "less than"), ⊂/⊃, and their LaTeX (`\leq`, `\geq`, `\le`, `\subseteq`) and word forms ("at least", "at most", "divides").
- **Quantifiers:** "for every / for all / any" against "there exists / some / there is".
- **Status:** a sentence that says "proves / shows / theorem" backed only by a quote under a Conjecture, or that says "conjectured / open / expected" ("it is expected that", "remains open").
- **Exponents and fractions:** the numbers in a formula's scripts compared as a whole (3/2 is not 1/2).

A dropped hypothesis is harder. The completeness check (`src/agent/completeness.ts`) is the place to ask for it on questions about a theorem.

### M4. Medium: a quote with Unicode math symbols but no Greek letter isn't found

`checkEvidence` (`src/agent/evidence.ts:180`) reads math in a quote only when the quote has `$`, `\`, a control character or a Greek letter. A model that writes a formula in Unicode without Greek ("≥", "ℤ", "→", "∈") doesn't trigger it, so its quote is compared with the raw LaTeX and fails:

| The document says | The model quotes | Found |
| --- | --- | --- |
| If $n \mid m$ then $\varphi(n) \leq \varphi(m)$ | If n ∣ m then φ(n) ≤ φ(m) | yes (has φ) |
| For every prime $p \geq 5$ the group is cyclic. | For every prime p ≥ 5 the group is cyclic | **no** |
| It converges for $\Re(s) > 1$ always. | It converges for Re(s) > 1 always | **no** |
| the ring $\mathbb{Z}[i]$ of Gaussian integers | the ring ℤ[i] of Gaussian integers | **no** |

The answer then gets **Quotes not found** though it is right and the quote is real.

**Fix:** also read math when the quote has a mathematical symbol (`\p{Sm}`, the double-struck letters ℕℤℚℝℂ, sub- and superscript digits and letters). Read `\Re`, `\Im` and `\operatorname{Re}` as "Re" and "Im", and allow "Z" for `\mathbb{Z}` when the rest matches.

### M5. Medium: no source made for mathematics

Kovrune searches arXiv (through DataCite), OpenAlex, Europe PMC, INSPIRE-HEP, DataCite and Wikipedia. Physics has INSPIRE and medicine has Europe PMC. Mathematics has nothing of its own:

- **zbMATH Open** is the natural choice: open since 2021, every record has its MSC classification, many have a review, and it links to arXiv. Its API (`api.zbmath.org`) needs checking first, for `Access-Control-Allow-Origin`, as INSPIRE and NASA ADS were checked (0.92.0). It was not reachable from the audit's network.
- **arXiv subject classes** ("math.NT") can't be used to narrow a search now. Check whether DataCite's arXiv records carry them as subjects.
- The **Stacks Project** and **nLab** are open references for definitions, with stable tags. They are worth a look after zbMATH, but check their licences and CORS first.

### M6. Medium: no mathematics suite

Every field Kovrune has audited has a suite: CS, physics, laboratory, clinical, engineering, patents. Mathematics has none, so the fixes above can't be measured on answers. A suite like the physics one would do: a few made-up papers (`amsart` with `\newtheorem{thm}`, `conj` and `\DeclareMathOperator`; a two-column PDF; lecture notes in Markdown), and questions of these kinds:
- **status:** "Is X proven in the paper, or conjectured?"
- **numbering:** "What does Lemma 3.4 state?", "Which lemma does the proof of Theorem 2.1 use?"
- **hypotheses:** "Under what condition on p does Theorem 1.2 hold?"
- **formulas:** "What is the exponent in the bound of Theorem 1.3?", with ≤/≥ and </≤ distractors
- **unanswerable:** a result the paper cites but doesn't prove

### M7. Medium: parts are cut without regard for statements and proofs

Documents are split into parts of about 2,400 characters (`src/documents/chunk.ts`), and the model reads a few with a 4,096-token context. A theorem often refers to "the setting of Section 2", and a proof runs across several parts. A part in the middle of a proof doesn't say which result it proves. The physics suite README notes the same limit for derivations.

**Fix:** keep a theorem-like block whole in one part when it fits, and give a part that starts inside a proof a note: "(from the proof of Theorem 3.2)". This uses the numbers from M2. Tables already get notes like that.

### M8. Low: some formulas are shown as raw LaTeX

The answer view shows inline math as text with symbols (`src/app/research/math.ts`). A formula with any command it doesn't know is shown as written. That is 7,437 of the 62,691 inline formulas in the 48 papers (12%). The commands most often found in those formulas are `\mathbb`, `\mathfrak`, `\mathcal`, `\operatorname`, and operators the papers declare themselves (`\Irr`, `\End`). The 185 `\DeclareMathOperator` lines in the sample are dropped, not read. Mathematicians read LaTeX well, so this matters least. Reading `\operatorname{X}` and declared operators as upright names, and `\mathfrak` and `\mathcal` as their Unicode letters, would cover most of them.

## Expectations

Kovrune runs a 4B model on your own machine. It is a careful finder and quoter, not a prover: it doesn't check proofs, and it doesn't follow derivations across sections. "Quotes found" means the passage is real, not that the mathematics is right. The user guide should say so for mathematics as it does in general, and should say that, until M1 and M2 are fixed, theorem numbers in answers from arXiv sources aren't reliable.

## Recommendations, in order

1. **Read theorem environments as the paper declares them, and number them (M1, M2).** It is converter-only, needs no model run, and fixes the most serious error: a conjecture read as a fact. Measure it on the 48 papers: headings recovered, references that now resolve, and a `latex.test.ts` case for each table row above.
2. **Build the mathematics suite (M6),** before or with the next item, so later changes can be measured on answers.
3. **Add mathematical opposites to the sentence check (M3),** following the 0.90.0 and 0.93.0 pattern: the table above as tests, then a re-score of the recorded runs to show no right answer loses its label.
4. **Read Unicode math in quotes (M4).** A small change in `evidence.ts`, tested with the table above.
5. **Check zbMATH Open's API for web pages, and add it if it allows them (M5).**
6. **Cut parts around statements and proofs (M7)** once M2 gives them numbers.
7. **Show more formulas as text (M8)** when convenient.

## Method

No model was run. The audit's checks are the app's own functions, called from short scripts: `latexToText`, `readableLatex` and `readSourceFiles` for the papers; `checkEvidence` and `sentenceSupport` for quotes and sentences; `DocumentIndex.search` for search; `readableMath` for the display.

The 48 papers were the six most recent in each category's listing on arxiv.org on 19 November 2026, downloaded once from `arxiv.org/src`. The counts in M1 come from each paper's `\newtheorem` declarations and its `\begin{…}` of those environments, counted in its `.tex` and `.sty` files with comments removed. The count in M2 is of `\ref`, `\cref` and `\Cref` to labels starting `thm`, `lem`, `prop`, `cor`, `conj`, `def`, `defn` or `rem`. It is a lower bound, since some papers name labels otherwise.

| Category | arXiv IDs |
| --- | --- |
| math.AG | 2611.24868 2611.24751 2611.24732 2611.24717 2611.24695 2611.24692 |
| math.AP | 2611.24906 2611.24903 2611.24855 2611.24842 2611.24828 2611.24819 |
| math.CO | 2611.24865 2611.24860 2611.24835 2611.24832 2611.24775 2611.24740 |
| math.DG | 2611.24879 2611.24863 2611.24851 2611.24817 2611.24815 2611.24712 |
| math.GT | 2611.24826 2611.24824 2611.24813 2611.24670 2611.24539 2611.24532 |
| math.NT | 2611.24933 2611.24847 2501.11076 2611.24820 2611.24802 2611.24748 |
| math.PR | 2611.24875 2611.24729 2611.24724 2611.24713 2611.24656 2611.24610 |
| math.RT | 2611.24471 2611.24427 2611.24405 2611.24215 2611.23874 2611.23687 |

**Limits:** one reader, eight categories and the newest papers only, so older styles (plain TeX, AMS-TeX) are not sampled. The answer cases in M3 and M4 were written for the audit, not taken from recorded runs, so they show what the checks miss, not how often a model makes those mistakes. The suite in M6 would measure that.
