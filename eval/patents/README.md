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

**Not tested:** a search with a real key, for OPS or the USPTO. Both allow the key's headers from a page, but what their answers hold, and how fast they are, was not measured.

## Recommendation

Build a patent source only if prior-art searches are a regular need, and then on **EPO OPS, with the user's own key**, entered once like the optional OpenAlex key:

- **Search:** OPS's CQL search on titles and abstracts (`ta=…`), which gives each result's publication number, title and applicant, and its abstract.
- **Read:** the abstract, and the claims and description where OPS has them (EP and WO documents), cited by publication number with a link to Espacenet.
- **What it costs the user:** registering an app at the EPO for a consumer key and secret. Both are kept in this browser only, and sent only to ops.epo.org, as the OpenAlex key is to OpenAlex. The search words the model chooses go to the EPO.
- **What it costs to build:** a source like Europe PMC's (search, read, citation), plus the token step and the XML of OPS's answers: about the size of the DataCite source.
- **First step:** a search and a read with a real key, to see what OPS returns for engineering questions, before any code in the app.

Until then, patents can be added as documents: download their PDFs from Espacenet or Google Patents and add the folder ("Adding many papers at once", user guide).
