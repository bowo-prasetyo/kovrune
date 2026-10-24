// Fixed document set for the research tasks.
//
// Every project, person, organization and number here is fictional, so a model
// cannot answer from memorized training data and must use the search and read
// tools. Some documents deliberately contradict or supersede others.

export interface CorpusDocument {
  id: string;
  title: string;
  text: string;
}

export const corpus: CorpusDocument[] = [
  {
    id: "lumen-overview",
    title: "LumenDB project overview",
    text: `LumenDB is an embedded key-value store written in Rust. It was created in 2019 by Mira Okafor as a side project and has been maintained by the Tessel Foundation since 2022.

LumenDB stores data in a copy-on-write B-tree with a write-ahead log. The default page size in the 3.x series is 8 KiB.

Licensing: LumenDB was released under the Apache-2.0 license until version 2.x. Starting with version 3.0, released in March 2024, the project is licensed under the Mozilla Public License 2.0 (MPL-2.0). The maintainers said the change keeps improvements to the core open while still allowing LumenDB to be embedded in proprietary applications.

LumenDB has bindings for Python, Go and JavaScript. The project does not offer a hosted service.`,
  },
  {
    id: "lumen-3-2-release",
    title: "LumenDB 3.2 release notes",
    text: `LumenDB 3.2.0 was released in September 2024.

New features:
- A background compaction scheduler called "tidewater" that reclaims free pages during idle periods.
- The maximum key size is raised from 1 KiB to 4 KiB. The maximum value size is unchanged at 64 MiB.
- Read transactions can now be pinned to a snapshot for up to 30 minutes.

Deprecations:
- lumen.open_legacy() is deprecated and will be removed in LumenDB 4.0. Use lumen.open() instead.

Security:
- This release includes the fix for advisory LSA-2024-07.

Upgrading from 3.1 does not require a data migration.`,
  },
  {
    id: "lumen-advisory-2024-07",
    title: "Security advisory LSA-2024-07: path traversal in backup restore",
    text: `Advisory ID: LSA-2024-07
Severity: High (CVSS 8.1)
Published: July 2024

A path traversal vulnerability exists in LumenDB's backup restore function, restore_from(). A crafted backup archive could write files outside the target directory.

Affected versions: LumenDB 3.0.0 through 3.1.4.
Fixed versions: LumenDB 3.1.5 and 3.2.0.

Workaround: if you cannot upgrade, only restore backups from trusted sources and validate archive entry paths before calling restore_from().

Credit: the issue was reported by Jonas Feld through the Tessel Foundation's security reporting process.`,
  },
  {
    id: "brisk-overview",
    title: "Brisk compression library",
    text: `Brisk is a general-purpose compression library written in C. It was created by Jonas Feld in 2020 and is released under the BSD-3-Clause license.

Brisk offers compression levels 1 through 12. The default level is 5, which the documentation describes as a balance between speed and ratio. Levels above 9 use a larger search window and are recommended only for archival data.

Brisk is maintained by a single maintainer. The README states that the project is looking for co-maintainers, particularly for the Windows build.

Brisk is used as an optional compression backend by several storage projects, including LumenDB's backup tool.`,
  },
  {
    id: "brisk-1-4-release",
    title: "Brisk 1.4 release notes",
    text: `Brisk 1.4 was released in August 2024.

Highlights:
- New compression level 13 ("ultra"), intended for cold archival storage. Brisk now supports levels 1 through 13. The default level remains 5.
- Official Zig bindings.
- Decompression is about 7% faster on ARM64.

Removed:
- Support for Windows XP and for compilers older than C99.

Known issues:
- Level 13 uses up to 1.5 GiB of memory during compression.`,
  },
  {
    id: "bench-blog-2024",
    title: "Comparing embedded stores (blog post by Priya Raman, May 2024)",
    text: `Author: Priya Raman. Published May 2024.

I benchmarked two embedded key-value stores, LumenDB 3.1 and Cobble 2.4, on an 8-core laptop with an NVMe drive, using 16-byte keys and 100-byte values.

Random reads: LumenDB reached 410,000 operations per second; Cobble reached 290,000 operations per second.

Random writes: Cobble reached 180,000 operations per second; LumenDB reached 150,000 operations per second.

My takeaway: LumenDB looks better for read-heavy workloads and Cobble for write-heavy workloads. Benchmark scripts are linked at the end of the post.`,
  },
  {
    id: "bench-correction",
    title: "Correction to the embedded store benchmark (mailing list, June 2024)",
    text: `From: Priya Raman
Date: June 2024
Subject: Correction to my May benchmark of LumenDB and Cobble

A reader pointed out that my LumenDB read benchmark ran with the page cache configured larger than the dataset, so many reads never touched the disk. I re-ran it with the same cache settings for both stores.

Corrected random-read result for LumenDB 3.1: 330,000 operations per second (previously reported as 410,000).

The Cobble read result (290,000 operations per second) and both write results are unchanged.

I have updated the blog post with a note pointing to this correction.`,
  },
  {
    id: "cobble-overview",
    title: "Cobble embedded store overview",
    text: `Cobble is an embedded key-value store written in Go and developed by Harrow Labs. It uses a log-structured merge tree (LSM) and a default block size of 4 KiB.

Licensing: Cobble is released under the Business Source License 1.1 (BSL). Each release converts to the Apache-2.0 license four years after its release date. Until then, production use in a competing hosted database service requires a commercial license.

Cobble 2.5, released in August 2024, adds encryption at rest using AES-256-GCM and a new bulk-loading API.`,
  },
  {
    id: "harrow-press",
    title: "Harrow Labs press release, September 2024",
    text: `Harrow Labs today announced that Cobble, its embedded key-value store, has passed one million downloads.

The company also announced Cobble Cloud, a hosted service built on Cobble, available in early access from November 2024.

"Cobble remains source-available, and every release still converts to an open source license over time," the announcement said.

Harrow Labs is headquartered in Rotterdam and has 40 employees.`,
  },
  {
    id: "tessel-governance",
    title: "Tessel Foundation governance",
    text: `The Tessel Foundation stewards open-source data infrastructure projects. Its current projects are LumenDB and Quillstate.

The foundation is led by a steering committee of five members elected by project maintainers for two-year terms. In 2024 the steering committee is chaired by Ana Lindqvist.

Decision-making: day-to-day decisions use lazy consensus. Breaking changes to a project's public API require a written RFC that stays open for comment for at least two weeks before a decision.

Security reports are handled by a private security team and disclosed through numbered advisories.`,
  },
  {
    id: "quillstate-overview",
    title: "Quillstate overview",
    text: `Quillstate is a state management library for TypeScript applications. It was created in 2021 by Ana Lindqvist and joined the Tessel Foundation in 2023.

Quillstate 2.0 was released in February 2024. It dropped support for Node.js 16; the minimum supported version is now Node.js 18. The library is 3.1 KB minified and gzipped and has no runtime dependencies.

Quillstate works with React, Vue and plain TypeScript.`,
  },
  {
    id: "quillstate-migration",
    title: "Quillstate migration guide: v1 to v2",
    text: `This guide covers the breaking changes in Quillstate 2.0.

1. createStore() has been renamed to defineStore(). The arguments are unchanged.
2. subscribe() now returns an unsubscribe function instead of a numeric subscription ID. Replace calls to store.unsubscribe(id) with the returned function.
3. The middleware API has been removed in favour of plugins. Most middleware can be rewritten as a plugin with an onAction hook.
4. Node.js 16 is no longer supported.

A codemod is available for change 1 and change 2.`,
  },
  {
    id: "lumen-4-roadmap",
    title: "LumenDB 4.0 roadmap (draft, October 2024)",
    text: `Status: draft. Dates are tentative and may change.

LumenDB 4.0 is planned for the second quarter of 2025 (Q2 2025).

Planned changes:
- Remove lumen.open_legacy(), deprecated since 3.2.
- Change the default page size from 8 KiB to 16 KiB for new databases. Existing databases keep their page size.
- Add an asynchronous API for the Rust and JavaScript bindings.

Because the page size change affects the on-disk format defaults, it requires an RFC under the Tessel Foundation's governance process.`,
  },
  {
    id: "priya-talk",
    title: "Talk abstract: Embedded Data Days 2024",
    text: `Speaker: Priya Raman
Event: Embedded Data Days 2024, Lisbon

Title: Write amplification in LSM-tree and B-tree stores

Abstract: Using LumenDB (a B-tree store) and Cobble (an LSM-tree store) as examples, this talk explains where write amplification comes from in each design, how to measure it, and how compaction and page size settings change the result. It also covers common mistakes in published benchmarks, including cache configuration errors.`,
  },
];
