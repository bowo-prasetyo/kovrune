// Extra documents for measuring search in a larger library (eval/field/README.md, retrieval at
// scale). The field library has seven documents; a user's may have hundreds, and BM25 shows only
// three results, so similar passages from other documents can push the answer out of them.
//
// The documents are generated, from a fixed seed, so the measure repeats exactly and nothing with a
// licence of its own is committed. They are near the field documents' topics and share their words
// (install guides with servers, ports and context sizes; design reports with milestones, metrics
// and hardware classes; licences with notices, days and patents; encyclopedia leads with births,
// marriages and heritage listings), but describe other, fictional things, so none of them answers a
// field question. They are in English only, so they do not test the Japanese and Chinese tasks.

import type { SourceDocument } from "../../src/tools/search.ts";

/** IDs of generated documents start with this, so a measure can tell them from the real ones. */
export const DISTRACTOR_PREFIX = "distractor-";

/** mulberry32: a small seeded generator, so the same seed gives the same documents everywhere. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PROJECTS = "Nimbus Orchard Quarry Lattice Tallow Vesper Marrow Cinder Halyard Juniper Basalt Fennel Gossamer Kestrel Lumen Pewter".split(" ");
const PRODUCTS = "server desktop app browser extension command-line tool sync service notebook plugin reader".split(" ");
const BROWSERS = ["Chrome", "Edge", "Firefox", "Safari"];
const PERMISSIONS = ["Local network access", "Apps on device", "Notifications", "File system access", "Clipboard", "Camera"];
const HOSTS = ["Netlify", "Cloudflare Pages", "GitHub Pages", "Vercel", "a university server", "a Raspberry Pi"];
const LICENSES = ["Apache-2.0", "MIT", "GPL-3.0", "BSD-3-Clause", "MPL-2.0", "AGPL-3.0", "LGPL-2.1"];
const PLACES = "Lisbon Kraków Tampere Ghent Porto Leiden Bergen Utrecht Graz Aarhus Trieste Malmö".split(" ");
const FIRST = "Marion Theodora Augustin Helena Ferdinand Clara Edmund Beatrice Oswald Lucia Rupert Ingrid".split(" ");
const LAST = "Ashworth Fairbairn Hollis Merriweather Penrose Quill Rowntree Sallow Thornbury Vance Whitlock Yardley".split(" ");
const FIELDS = ["mathematician", "astronomer", "engineer", "botanist", "cartographer", "chemist", "poet", "composer"];
const SITES = ["volcano", "lake", "castle", "bridge", "canal", "observatory", "monastery", "lighthouse"];

function pick<T>(next: () => number, list: readonly T[]): T {
  return list[Math.floor(next() * list.length)]!;
}

const int = (next: () => number, low: number, high: number) => low + Math.floor(next() * (high - low + 1));

type Template = (next: () => number, name: string) => string;

// Each kind of document is a list of sentence templates; a document draws from one list.
const KINDS: Record<string, { title: (name: string, next: () => number) => string; sentences: Template[] }> = {
  guide: {
    title: (name) => `${name.toLowerCase()}-user-guide.md`,
    sentences: [
      (n, p) => `${p} runs as a ${pick(n, PRODUCTS)} on your computer, and nothing you add is sent to an online service.`,
      (n, p) => `Start the ${p} server with \`${p.toLowerCase()}-server --port ${int(n, 3000, 9999)} -c ${pick(n, [2048, 4096, 8192])}\` and open the address it prints.`,
      (n) => `If the port is in use, stop the other program or choose another port with --port ${int(n, 3000, 9999)}.`,
      (n) => `In ${pick(n, BROWSERS)}, allow ${pick(n, PERMISSIONS)} when the page asks, or the connection fails.`,
      (n) => `On a laptop with ${pick(n, [4, 8, 16, 32])} GB of memory, choose the smaller model, which downloads ${int(n, 1, 9)}.${int(n, 0, 9)} GB once.`,
      (n, p) => `The context size of ${p} is set with -c; a larger context needs more memory and answers more slowly.`,
      (n) => `Node.js ${pick(n, [18, 20, 22, 24])} or newer is needed to build the app from source.`,
      (n, p) => `Press ${pick(n, ["Ctrl+C", "Escape", "Ctrl+Q", "Stop"])} to stop ${p} while it is answering.`,
      (n) => `The model test takes about ${pick(n, ["a minute", "two minutes", "30 seconds", "five minutes"])} and checks that the model can answer.`,
      (n, p) => `${p} keeps your documents in the browser's storage, so they are still there after a reload.`,
      (n) => `Scanned PDFs without a text layer cannot be read; export the document again with text, or use a ${pick(n, ["text", "Markdown", "HTML"])} file.`,
      (n, p) => `Backups of ${p} are saved as a file you can restore in any browser, and include ${pick(n, ["documents and answers", "settings only", "answers only"])}.`,
      (n) => `If the download stops at ${int(n, 10, 99)}%, check the free disk space and try again.`,
      (n, p) => `${p} can also search ${pick(n, ["Wikipedia", "OpenAlex", "arXiv", "PubMed"])} when you tick it under Search in.`,
      (n) => `The server listens on 127.0.0.1 by default; add --host 0.0.0.0 to reach it from ${pick(n, ["WSL", "another computer", "a phone"])}.`,
      (n) => `An answer can be exported as ${pick(n, ["Markdown", "BibTeX", "PDF", "plain text"])} with its quotes and sources.`,
    ],
  },
  report: {
    title: (name, n) => `${name.toLowerCase()}-design-report-${int(n, 2019, 2026)}.pdf`,
    sentences: [
      (n, p) => `Milestone M${int(n, 0, 5)} of ${p} takes about ${int(n, 2, 8)} weeks and ends with a usability test with ${int(n, 3, 8)} participants.`,
      (n) => `The success rate on the evaluation set must stay above ${int(n, 50, 95)}%, and the false alarm rate below ${int(n, 2, 20)}%.`,
      (n) => `Reference hardware class ${int(n, 1, 3)} is a ${pick(n, ["laptop", "desktop", "workstation"])} with ${pick(n, ["integrated graphics", "a discrete GPU", "no GPU"])} and ${pick(n, [8, 16, 32, 64])} GB of memory.`,
      (n, p) => `The ${p} prototype uses ${pick(n, ["WebRTC", "libp2p", "a relay server", "Trystero-like signaling"])} for peers, and the production design replaces it later.`,
      (n, p) => `Releases of ${p} are signed with ${pick(n, ["minisign", "an SSH key", "Sigstore", "GPG"])}, and the build can be reproduced byte for byte.`,
      (n) => `The preview is hosted on ${pick(n, HOSTS)}, and a later release may move to ${pick(n, HOSTS)}.`,
      (n, p) => `${p} delegates whole tasks to peers in a circle, never parts of one computation.`,
      (n, p) => `A member of the ${p} community is called a ${p.toLowerCase()}er, and anyone may join a circle by invitation.`,
      (n) => `The steering committee meets every ${pick(n, ["month", "quarter", "two weeks"])} and approved the roadmap in ${int(n, 2020, 2026)}.`,
      (n) => `Decode speed on class ${int(n, 1, 3)} was ${int(n, 3, 40)} tokens per second, about ${int(n, 2, 9)} times slower in the browser.`,
      (n, p) => `The threat model of ${p} assumes that documents may contain instructions meant for the model.`,
      (n) => `Telemetry is opt-in, and retention is measured after ${pick(n, ["7", "14", "30", "90"])} days.`,
      (n, p) => `${p} is licensed under ${pick(n, LICENSES)}, and contributions are accepted under the same terms.`,
      (n) => `The model catalog lists ${int(n, 2, 6)} models, each pinned to a fixed revision and checked against its SHA-256.`,
    ],
  },
  license: {
    title: (name) => `${name.toLowerCase()}-license.txt`,
    sentences: [
      (n) => `If You fail to comply, Your rights terminate unless You cure the breach within ${pick(n, [10, 14, 15, 30, 45, 60, 90])} days after receiving notice.`,
      (n) => `Your rights are reinstated if the Licensor does not object within ${pick(n, [30, 60, 90, 120])} days after You come back into compliance.`,
      (n) => `Each Contributor grants You a patent license, which ends if You start litigation claiming that the Work infringes a patent.`,
      (n) => `Any dispute is brought in the courts of ${pick(n, PLACES)}, under the law of the country where the Licensor has its principal place of business.`,
      () => `The Work is provided "as is", without warranty of any kind, and no Contributor is liable for any damages.`,
      (n) => `You may distribute the Work under ${pick(n, LICENSES)} as a Secondary License, if the notice below is kept.`,
      () => `Notices of copyright and of this license must be kept in every copy of the Source Code Form.`,
      (n) => `This license is version ${int(n, 1, 3)}.${int(n, 0, 2)}; the Steward may publish new versions, and You may choose any later one.`,
      () => `Larger Works that combine the Covered Software with other code may be distributed under terms of Your choice.`,
      () => `A Contributor is each individual or legal entity that creates or contributes to the Work.`,
      (n) => `Termination does not affect sublicenses granted before it, and sections ${int(n, 2, 9)} and ${int(n, 2, 9)} survive it.`,
    ],
  },
  biography: {
    title: (name) => name,
    sentences: [
      (n, p) => `${p} (${int(n, 1780, 1880)}–${int(n, 1820, 1940)}) was an English ${pick(n, FIELDS)} and writer.`,
      (n, p) => `${p.split(" ")[0]} was the only child of a ${pick(n, ["poet", "banker", "clergyman", "merchant"])} and was educated privately by tutors.`,
      (n, p) => `In ${int(n, 1800, 1900)}, ${p.split(" ")[0]} married ${pick(n, FIRST)} ${pick(n, LAST)}, who later became an earl.`,
      (n) => `Her notes on the ${pick(n, ["calculating engine", "difference machine", "star charts", "tidal predictor"])} included what is described as the first published ${pick(n, ["algorithm", "table", "method"])}.`,
      (n, p) => `${p} corresponded with ${pick(n, FIRST)} ${pick(n, LAST)} for ${int(n, 2, 20)} years about mathematics and music.`,
      (n) => `An award in her name has been given since ${int(n, 1950, 2010)} for contributions to ${pick(n, ["computing", "science", "engineering"])}.`,
      (n) => `She died of illness at the age of ${int(n, 30, 80)} and was buried in ${pick(n, PLACES)}.`,
    ],
  },
  place: {
    title: (name) => name,
    sentences: [
      (n, p) => `${p} is a ${pick(n, SITES)} near ${pick(n, PLACES)}, ${int(n, 100, 4000)}.${int(n, 0, 99)} m above sea level.`,
      (n, p) => `${p} was listed as a World Heritage Site in ${int(n, 1975, 2020)}, as a cultural site.`,
      (n) => `About ${int(n, 1, 9)} million people visit it every year, most of them in ${pick(n, ["summer", "spring", "autumn"])}.`,
      (n) => `Its walls run for ${int(n, 2, 900)} km and have ${int(n, 10, 30000)} towers and buildings.`,
      (n) => `It became part of a national park in ${int(n, 1900, 1990)}, and was painted ${pick(n, ["red", "grey", "brown", "white"])} until ${int(n, 1890, 1990)}.`,
      (n) => `Construction began in ${int(n, 1100, 1890)} and took ${int(n, 2, 40)} years; its engineer was ${pick(n, FIRST)} ${pick(n, LAST)}.`,
    ],
  },
};

const KIND_NAMES = Object.keys(KINDS);

/**
 * `count` generated documents, the same for the same `seed`. About one in five is long enough to be
 * split into parts, as long PDFs are.
 */
export function distractorDocuments(count: number, seed = 1): SourceDocument[] {
  const next = random(seed);
  return Array.from({ length: count }, (_, i) => {
    const kind = KINDS[KIND_NAMES[i % KIND_NAMES.length]!]!;
    const name =
      kind === KINDS.biography
        ? `${pick(next, FIRST)} ${pick(next, LAST)}`
        : kind === KINDS.place
        ? `${pick(next, PLACES)} ${pick(next, SITES)}`
        : `${pick(next, PROJECTS)} ${pick(next, PROJECTS)}`;
    const sentences = next() < 0.2 ? int(next, 40, 90) : int(next, 6, 20);
    const paragraphs: string[] = [];
    for (let s = 0; s < sentences; s += 4) {
      paragraphs.push(Array.from({ length: Math.min(4, sentences - s) }, () => pick(next, kind.sentences)(next, name)).join(" "));
    }
    return { id: `${DISTRACTOR_PREFIX}${i + 1}`, title: kind.title(name, next), text: paragraphs.join("\n\n") };
  });
}
