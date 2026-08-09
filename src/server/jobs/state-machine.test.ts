import { describe, expect, it } from "vitest";

import { canTransition, nextStateAfterSubmissionError } from "./state-machine";

describe("job state machine", () => {
  it("does not allow a paid submission to jump directly to success", () => {
    expect(canTransition("submitting", "succeeded")).toBe(false);
  });

  it("moves an indeterminate submission to unknown", () => {
    expect(nextStateAfterSubmissionError({ requestMayHaveBeenSent: true })).toBe(
      "unknown",
    );
  });

  it("allows polling and downloads to progress to a local success", () => {
    expect(canTransition("polling", "downloading")).toBe(true);
    expect(canTransition("downloading", "succeeded")).toBe(true);
  });

  it("allows only explicit recovery from an unknown paid submission", () => {
    expect(canTransition("unknown", "polling")).toBe(true);
    expect(canTransition("unknown", "failed")).toBe(true);
    expect(canTransition("unknown", "submitting")).toBe(false);
    expect(canTransition("unknown", "queued")).toBe(false);
  });

  it("keeps terminal states terminal", () => {
    expect(canTransition("succeeded", "submitting")).toBe(false);
    expect(canTransition("failed", "queued")).toBe(false);
    expect(canTransition("cancelled", "queued")).toBe(false);
  });

  it("distinguishes errors proven not sent from indeterminate submissions", () => {
    expect(nextStateAfterSubmissionError({ requestMayHaveBeenSent: false })).toBe(
      "failed",
    );
  });
});
