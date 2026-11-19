// LaTeX math shown as text people read (harness 0.88.0). The reader lives in documents/math.ts since harness
// 0.91.0, where the sentence check and the LaTeX converter read math with it too.
export { mathSegments, readableFormula, readableMath, type MathSegment } from "../../documents/math.ts";
