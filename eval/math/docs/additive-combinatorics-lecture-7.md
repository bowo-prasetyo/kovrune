# Additive Combinatorics, Lecture 7: Teller sets

*Lecture notes, autumn term 2023 (made up). Notes taken by the course assistant and checked by the lecturer. These notes predate the paper of Marlow and Odum.*

## 7.1 Definitions

**Definition 7.1.** A subset A of a finite abelian group G is a *Teller set* if there are no four distinct elements a, b, c, d of A with a + b + c = 3d. We write τ(G) for the largest size of a Teller set in G.

The equation a + b + c = 3d says that d is the average of a, b and c. A Teller set is therefore a set in which no element is the average of three others. Compare this with sets without three-term progressions, in which no element is the average of two others.

**Example 7.2.** In Z/7Z the set {0, 1, 3} is a Teller set, simply because it has fewer than four elements. One can check by hand that every set of four elements of Z/7Z contains a Teller quadruple, so τ(Z/7Z) = 3.

## 7.2 A lower bound in F_5^n

**Proposition 7.3.** For every n ≥ 1, the set {0, 1}^n of vectors in F_5^n whose entries are all 0 or 1 is a Teller set. Hence τ(F_5^n) ≥ 2^n.

*Proof.* Let a, b, c, d be vectors with entries in {0, 1} and a + b + c = 3d. Look at one coordinate. The left side is a_i + b_i + c_i, an integer from 0 to 3, and the right side 3d_i is 0 or 3. Since these integers are less than 5, they are equal as integers, not only modulo 5. If d_i = 0, then a_i = b_i = c_i = 0; if d_i = 1, then a_i = b_i = c_i = 1. So a = b = c = d, and the four vectors are not distinct. ∎

## 7.3 Upper bounds

The polynomial method of Croot, Lev and Pach, in the slice rank form of Tao, gives exponential improvements over the trivial bound 5^n.

**Theorem 7.4 (Kessler, 2019).** For every n ≥ 1, τ(F_5^n) ≤ 4.8100^n.

This is the best known upper bound. The gap between 2^n and 4.8100^n is large, and closing it is a research problem.

In cyclic groups of prime order no bound of the form (1/4 + o(1))p is known; the best bound we know is τ(Z/pZ) ≤ p/3 + 5 for p ≥ 11, from a density increment argument.

## 7.4 Exercises

**Exercise 7.5.** Show that τ(Z/7Z) = 3, as claimed in Example 7.2.

**Exercise 7.6.** Show that if 3 does not divide |G| and |H|, then τ(G × H) ≥ τ(G) τ(H).

**Exercise 7.7.** Show that the set {0, 1}^n is not a largest Teller set in F_5^n for n = 2, by finding a Teller set of size 5 in F_5^2.
