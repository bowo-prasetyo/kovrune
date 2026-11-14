# EMC test report EMC-3K3-02

**Equipment under test:** PSU-3K3, 3.3 kW power supply with totem-pole PFC front end
**Test laboratory:** in-house EMC laboratory · **Dates:** 2–4 June 2026

## 1. Introduction

This report gives the results of the electromagnetic compatibility tests of the PSU-3K3. Immunity was tested to the electrostatic discharge (ESD), electrical fast transient (EFT) and surge standards of the IEC 61000-4 series; emissions were measured to CISPR 32. Performance criteria are those of the product standard: criterion A, normal performance during and after the test; criterion B, temporary loss of function that recovers by itself; criterion C, loss of function that needs the operator or a restart.

## 2. Immunity results

| Test | Standard | Level | Required criterion | Result |
| --- | --- | --- | --- | --- |
| ESD, contact discharge | IEC 61000-4-2 | ±8 kV | B | Pass (criterion B) |
| ESD, air discharge | IEC 61000-4-2 | ±15 kV | B | Pass (criterion A) |
| EFT, AC power port | IEC 61000-4-4 | ±2 kV, 5 kHz | B | Pass (criterion A) |
| Surge, line to line | IEC 61000-4-5 | ±1 kV | B | Pass (criterion A) |
| Surge, line to earth | IEC 61000-4-5 | ±2 kV | B | Pass after modification (see 2.1) |

During the ESD contact discharges on the front panel screws, the status LED flickered and the output stayed in regulation, which is criterion B.

### 2.1 Surge, line to earth

At the first attempt, the ±2 kV line-to-earth surge failed: at +2 kV the PSU shut down and needed a restart, which is criterion C. The 275 V varistor between line and earth was replaced with a 320 V varistor with a higher surge current rating, and a gas discharge tube was added in series. The test was then repeated and passed with criterion A.

## 3. Emissions results

Conducted emissions on the AC power port met CISPR 32 class A, with a smallest margin of 4.2 dB to the quasi-peak limit at 150 kHz. Radiated emissions met class A with a smallest margin of 3.1 dB at 230 MHz.

## 4. Conclusion

After the varistor change, the PSU-3K3 passed all immunity tests and met the class A emission limits.
