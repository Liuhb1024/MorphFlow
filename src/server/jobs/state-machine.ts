export const JOB_STATUSES = [
  "draft",
  "awaiting_confirmation",
  "queued",
  "submitting",
  "polling",
  "downloading",
  "succeeded",
  "failed",
  "cancelled",
  "unknown",
  "result_expired",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

const ALLOWED_TRANSITIONS: Readonly<Record<JobStatus, ReadonlySet<JobStatus>>> = {
  draft: new Set(["awaiting_confirmation", "cancelled"]),
  awaiting_confirmation: new Set(["queued", "cancelled"]),
  queued: new Set(["submitting", "failed", "cancelled"]),
  submitting: new Set(["polling", "failed", "unknown"]),
  polling: new Set(["downloading", "failed", "result_expired"]),
  downloading: new Set(["succeeded", "failed", "result_expired"]),
  unknown: new Set(["polling", "failed"]),
  succeeded: new Set(),
  failed: new Set(),
  cancelled: new Set(),
  result_expired: new Set(),
};

/**
 * Paid jobs may move only through explicitly reviewed transitions. In
 * particular, `unknown` can never be leased for another automatic submit.
 */
export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return ALLOWED_TRANSITIONS[from].has(to);
}

export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidJobTransitionError(from, to);
  }
}

export class InvalidJobTransitionError extends Error {
  readonly from: JobStatus;
  readonly to: JobStatus;

  constructor(from: JobStatus, to: JobStatus) {
    super(`Illegal job state transition: ${from} -> ${to}`);
    this.name = "InvalidJobTransitionError";
    this.from = from;
    this.to = to;
  }
}

export type SubmissionErrorDisposition = Readonly<{
  /**
   * True unless the transport can prove that no request bytes were sent.
   * An indeterminate paid submission must not be retried automatically.
   */
  requestMayHaveBeenSent: boolean;
}>;

export function nextStateAfterSubmissionError(
  disposition: SubmissionErrorDisposition,
): Extract<JobStatus, "failed" | "unknown"> {
  return disposition.requestMayHaveBeenSent ? "unknown" : "failed";
}
