# Technical memo TM-0412: Motor mounting bracket, structural assessment

**Project:** PSU-3K3 enclosure · **Author:** Structures group · **Revision:** B · **Status:** Released

## 1. Purpose

This memo reports the finite element analysis (FEA) of the cast motor mounting bracket that carries the cooling pump of the PSU-3K3 power supply. It checks the bracket against the stiffness and strength requirements of specification CS-210 and records the design change made after the first assessment.

## 2. Model and material

The bracket is machined from 6061-T6 aluminium. The model uses a yield strength of 276 MPa, an ultimate tensile strength of 310 MPa, a Young's modulus of 68.9 GPa and a Poisson's ratio of 0.33, from the material test report MTR-6061-07 at 20 °C.

The geometry was meshed with second-order tetrahedral elements. Mesh convergence was reached at an element size of 0.5 mm in the fillet region: halving it again changed the peak stress by less than 2%. The four M6 bolt holes were fixed, and the pump mass was applied as a point mass at its centre of gravity.

## 3. Load cases

| Load case | Description | Load |
| --- | --- | --- |
| LC1 | Static, pump weight and hose preload | 0.6 kN |
| LC2 | Transport shock, 30 g half-sine, 11 ms | 4.5 kN equivalent |
| LC3 | Modal analysis, free vibration | none |

## 4. Results, revision A

Under LC2, the FEA predicted a peak von Mises stress of 212 MPa at the inner fillet between the base plate and the upright. With the 276 MPa yield strength, this gives a safety factor of 1.30, below the 1.5 required by CS-210. The minimum principal stress at the lower bolt hole was −95 MPa, so that region is in compression.

The maximum deflection at the pump flange under LC2 was 0.84 mm, within the allowable 1.0 mm.

The modal analysis (LC3) found the first natural frequency at 142 Hz, above the minimum of 120 Hz that CS-210 requires to stay clear of the pump's running speed.

## 5. Design change, revision B

To raise the safety factor, the inner fillet radius was increased from 2 mm to 5 mm. The FEA of revision B shows the peak von Mises stress under LC2 reduced from 212 MPa to 168 MPa, a safety factor of 1.64. The first natural frequency rose slightly, to 147 Hz, and the maximum deflection fell to 0.79 mm.

## 6. Conclusion

Revision B meets the strength, stiffness and frequency requirements of CS-210. The FEA should be repeated if the pump is replaced by a heavier model.
