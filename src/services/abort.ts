// Browser permission prompts cannot be dismissed programmatically. Release the UI
// immediately on cancellation, and dispose resources if permission is granted later.
export function withAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  dispose?: (value: T) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("Measurement cancelled."));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) dispose?.(value);
        else resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}
