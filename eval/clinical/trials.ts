// Which trial a paper reports: the registration numbers its text gives (eval/europepmc-model.ts).

/** Trial registration numbers in a text: ISRCTN, ClinicalTrials.gov, and the Australian New Zealand and Pan African registries. */
export function registrations(text: string): Set<string> {
  return new Set(text.match(/\b(?:ISRCTN\d{8}|NCT\d{8}|ACTRN\d{14}|PACTR\d{15})\b/g) ?? []);
}
