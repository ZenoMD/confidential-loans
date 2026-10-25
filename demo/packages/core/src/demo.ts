/** XLS-66 LoanSet minimum for `PaymentInterval` and `GracePeriod`, in seconds. */
const MIN_INTERVAL_SECONDS = 60

/** XLS-66 `PaymentTotal`, `PaymentInterval` and `GracePeriod` are `UINT32` fields. */
const UINT32_MAX = 0xffff_ffff

/**
 * The terms of one confidential loan. The three amounts are encrypted on the ledger; the
 * schedule is public.
 */
export interface LoanTerms {
  /** P: moves from the Lending Balance to the Borrower's inbox. */
  readonly principal: bigint
  /** O: the total the Borrower repays. */
  readonly amountOwed: bigint
  /** Q: due every `paymentInterval`. */
  readonly periodicPayment: bigint
  /** N: number of payments. */
  readonly paymentTotal: number
  /** Seconds between payments. */
  readonly paymentInterval: number
  /** Seconds after a missed due date before the Broker can default the loan. */
  readonly gracePeriod: number
}

function amountProblems({ principal, amountOwed, periodicPayment }: LoanTerms): string[] {
  const problems: string[] = []
  if (principal < 0n) problems.push(`principal ${principal} is negative`)
  if (amountOwed < 0n) problems.push(`amount owed ${amountOwed} is negative`)
  if (periodicPayment < 0n) problems.push(`periodic payment ${periodicPayment} is negative`)
  if (amountOwed < principal) {
    problems.push(`amount owed ${amountOwed} is below principal ${principal}`)
  }
  return problems
}

function scheduleProblems(terms: LoanTerms): string[] {
  const { paymentTotal, paymentInterval, gracePeriod } = terms
  const problems: string[] = []
  const fields = [
    ['payment total', paymentTotal],
    ['payment interval', paymentInterval],
    ['grace period', gracePeriod],
  ] as const
  for (const [name, value] of fields) {
    if (!Number.isSafeInteger(value)) {
      problems.push(`${name} ${value} is not a whole number`)
    } else if (value > UINT32_MAX) {
      problems.push(`${name} ${value} exceeds ${UINT32_MAX}`)
    }
  }
  if (problems.length > 0) return problems

  if (BigInt(paymentTotal) * terms.periodicPayment < terms.amountOwed) {
    problems.push(
      `${paymentTotal} payments of ${terms.periodicPayment} do not cover amount owed ` +
        `${terms.amountOwed}`,
    )
  }
  if (paymentTotal < 1) problems.push(`payment total ${paymentTotal} is below 1`)
  if (paymentInterval < MIN_INTERVAL_SECONDS) {
    problems.push(`payment interval ${paymentInterval} is below ${MIN_INTERVAL_SECONDS} seconds`)
  }
  if (gracePeriod < MIN_INTERVAL_SECONDS) {
    problems.push(`grace period ${gracePeriod} is below ${MIN_INTERVAL_SECONDS} seconds`)
  }
  if (gracePeriod > paymentInterval) {
    problems.push(`grace period ${gracePeriod} exceeds payment interval ${paymentInterval}`)
  }
  return problems
}

/**
 * Checks loan terms against these rules of a confidential `LoanSet`: the range proofs of SPEC
 * section 11.2 (O, Q >= 0, O >= P, N*Q >= O, and P >= 0 from the XLS-96 Send proof), the XLS-66
 * section 3.8.5.1 schedule checks 14-16 (N >= 1, `PaymentInterval` >= 60, 60 <= `GracePeriod` <=
 * `PaymentInterval`), and the `UINT32` range of those three fields. It does not check the
 * schedule overflow of XLS-66 section 3.8.5.2 item 2, which the ledger decides against its
 * protocol time limits.
 *
 * @param terms - The terms to check.
 * @throws {RangeError} Naming every rule the terms break.
 */
export function validateLoanTerms(terms: LoanTerms): void {
  const problems = [...amountProblems(terms), ...scheduleProblems(terms)]
  if (problems.length > 0) throw new RangeError(`Invalid loan terms: ${problems.join('; ')}`)
}
