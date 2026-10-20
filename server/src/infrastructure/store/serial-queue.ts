/**
 * Returns an `enqueue` function that runs async jobs strictly one after another,
 * in call order. A failing job rejects its own promise without blocking later jobs.
 */
export const createSerialQueue = () => {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(job: () => Promise<T>): Promise<T> => {
    const run = tail.then(job);
    tail = run.catch(() => undefined);
    return run;
  };
};
