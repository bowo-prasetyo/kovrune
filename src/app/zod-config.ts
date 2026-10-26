// Imported first by main.tsx, so it runs before any module that uses Zod.
// Zod otherwise tries `new Function` to speed up parsing, which the Content Security
// Policy blocks and reports as a violation.
import { z } from "zod";

z.config({ jitless: true });
