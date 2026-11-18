# Can Kovrune search patents?

Patents are central to an engineer's prior-art and design work, and none of Kovrune's sources holds them: OpenAlex has no patent type among its works. Kovrune runs in the browser, so a patent source must answer requests from a web page (CORS), and, to be offered like Wikipedia or OpenAlex, should not need a key. This checks the candidates, on 15 November 2026.

**Method** (`npm run bench:patents`, [`eval/patent-sources.ts`](../patent-sources.ts)). Each API is asked, from a made-up page origin, for what a search would need: once without a key, and, for an API with a key, a preflight for the key's headers. A browser reads an answer only when it carries `Access-Control-Allow-Origin` for the page, so an API that leaves it off an error or a preflight can't be used from a page at all.

## Results

| API | Without a key | Readable by a page | A keyed request from a page |
| --- | --- | --- | --- |
| Europe PMC patents (`SRC:PAT`) | 200 | yes | no key needed |
| EPO Open Patent Services (OPS) | 403 | yes | allowed (`Authorization`), on the token endpoint too |
| USPTO Open Data Portal | 401 | yes | allowed (`X-Api-Key`) |
| The Lens | 401 | no | refused: the preflight answers 401 without CORS headers |
| PatentsView | unreachable: `search.patentsview.org` did not resolve from this environment | | |

- **No source is both free of a key and useful for engineering.** The only one without a key, Europe PMC, holds 4.2 million patents, but none published after 2012 (the newest is a 2009 WO application; 126,514 from 2012, none from 2013 on), and its selection follows the life sciences: "insulin" finds 18,082 and "antibody" 44,546, but "wind turbine blade" none, "silicon carbide MOSFET" none, "power factor correction" 13 and "brushless motor" 35. Its hits for "heat exchanger" are fertiliser plants and vinegar sterilisers. Its records hold a title, applicants and the abstract.
- **EPO OPS works from a page, with the user's own key.** It answers with the page's origin and allows `Authorization`, on its data and token endpoints. A key is free after registering an app with the EPO (a consumer key and secret, used for an OAuth client-credentials token); without one, OPS refuses even a search (403, "violation of Fair Use policy"). OPS holds the EPO's worldwide bibliographic data and abstracts (EP, WO, US, CN, JP and many more offices), and the claims and description of EP and WO documents, among others. Its free use has weekly limits; check the EPO's current fair-use terms before relying on them.
- **The USPTO's Open Data Portal works from a page, with a key**, for US patents and applications only. Getting a key involves the USPTO's identity verification.
- **The Lens can't be used from a page**: its preflight is refused without CORS headers, so a browser blocks every request, keyed or not.
- **PatentsView** could not be reached from here, so it is not judged.

**Not tested here:** a search with a real key for the USPTO. OPS was tried with a real key on 18 November 2026 (below).

## EPO OPS with a real key (18 November 2026)

With a 20-minute access token from the EPO developer portal's **Authorize** button, four engineering searches on titles and abstracts (`/published-data/search/biblio`, CQL `ta=…`) and the reads behind them:

| Search | Results | In the first 25: EP or WO | With `and (pn=EP or pn=WO)` |
| --- | --- | --- | --- |
| `ta="totem pole" and ta=rectifier` | 88 | 2 (21 CN) | 13 |
| `ta="silicon carbide" and ta=MOSFET and ta="gate driver"` | 9 | 3 of 9 (4 CN) | |
| `ta="wind turbine blade" and ta=lightning` | 296 | 6 (17 CN) | 146 |
| `ta="welded joint" and ta=fatigue` | 530 | 0 (20 CN, 4 JP) | 32 |

- **Search finds engineering patents, and current ones.** Every result had an English title and an English abstract (500 to 1,550 characters), Chinese patents included, with the applicant and the publication date; the newest were published in September 2026. The searches found Vestas' blade lightning protection, a Volvo gate driver for hybrid SiC MOSFET and Si IGBT modules, and a three-phase boost PFC rectifier with flying capacitors.
- **Results come newest first, not by relevance**, and most recent filings are Chinese (CN made up 17 to 21 of the first 25), so the first five a model would see are mostly recent Chinese utility models.
- **Full text is there for EP and WO only.** The claims and description of WO2026130641A1 (4 KB and 18 KB of XML) and EP4560905A1 (14 KB and 63 KB) were returned in English, through the `docdb` number format (`WO.2026130641.A1`); the `epodoc` format returned "not found". US and CN publications are refused ("unsupported country code"), so for most results the abstract is all there is. A US publication's family (`equivalents`) held only itself, so the family does not always lead to an EP or WO text.
- **Limiting a search to EP and WO** (`and (pn=EP or pn=WO)`) keeps results that can be read in full: 13 of 88, 32 of 530 and 146 of 296 here.
- **From a page:** a keyed search answers with `Access-Control-Allow-Origin` set to the page's origin.
- **Limits:** OPS reports its throttling with each answer; it allowed 5 searches and 50 retrievals a minute here. The whole test used under 1 MB of the weekly quota.
- **Not tested:** getting a token from a consumer key and secret (OAuth client credentials) from a page. The pair saved for the test was refused ("Developer account is blocked") although the portal's own token worked, most likely because it was not the app's consumer key and secret, which the portal shows under the app.


## Recommendation

Build a patent source only if prior-art searches are a regular need, and then on **EPO OPS, with the user's own key**, entered once like the optional OpenAlex key:

- **Search:** OPS's CQL search on titles and abstracts (`ta=…`), with `/biblio`, which gives each result's publication number, title, applicant, date and English abstract in one request. Since results come newest first, search EP and WO first (`and (pn=EP or pn=WO)`), which can be read in full, and add the others when those find few.
- **Read:** the claims and description for EP and WO publications (`docdb` numbers), and the abstract for the others, cited by publication number with a link to Espacenet.
- **Within OPS's limits:** at most 5 searches a minute, which a question's few searches stay under.
- **What it costs the user:** registering an app at the EPO for a consumer key and secret. Both are kept in this browser only, and sent only to ops.epo.org, as the OpenAlex key is to OpenAlex. The search words the model chooses go to the EPO.
- **What it costs to build:** a source like Europe PMC's (search, read, citation), plus the token step and the XML of OPS's answers: about the size of the DataCite source.
- **Done first:** a search and a read with a real key (above). What remains to check is the token step from a consumer key and secret, in the browser, as the app would do it.

Until then, patents can be added as documents: download their PDFs from Espacenet or Google Patents and add the folder ("Adding many papers at once", user guide).
