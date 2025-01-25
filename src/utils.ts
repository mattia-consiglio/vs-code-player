/**
 * Creates a throttled function that only invokes `func` at most once per
 * every `wait` milliseconds.
 *
 * @param func - The function to throttle
 * @param wait - The number of milliseconds to throttle invocations to
 * @param options - The options object
 * @param options.leading - Specify invoking on the leading edge of the timeout
 * @param options.trailing - Specify invoking on the trailing edge of the timeout
 * @returns Returns the new throttled function
 */
export function throttle<Args extends unknown[], R>(
  func: (...args: Args) => R,
  wait: number,
  options: { leading?: boolean; trailing?: boolean } = {}
): ((...args: Args) => R) & { cancel: () => void; flush: () => R | undefined } {
  let leading = true;
  let trailing = true;

  if (typeof func !== 'function') {
    throw new TypeError('Expected a function');
  }

  if (options) {
    leading = 'leading' in options ? !!options.leading : leading;
    trailing = 'trailing' in options ? !!options.trailing : trailing;
  }

  return debounce(func, wait, {
    leading,
    maxWait: wait,
    trailing,
  }) as ((...args: Args) => R) & { cancel: () => void; flush: () => R | undefined };
}

/**
 * Creates a debounced function that delays invoking `func` until after `wait`
 * milliseconds have elapsed since the last time the debounced function was
 * invoked.
 *
 * @param func - The function to debounce
 * @param wait - The number of milliseconds to delay
 * @param options - The options object
 * @returns Returns the new debounced function
 */
function debounce<Args extends unknown[], R>(
  func: (...args: Args) => R,
  wait: number,
  options: {
    leading?: boolean;
    maxWait?: number;
    trailing?: boolean;
  } = {}
): ((...args: Args) => R) & { cancel: () => void; flush: () => R | undefined } {
  let lastArgs: Args | undefined;
  let lastThis: unknown;
  let maxWait: number | undefined;
  let result: R;
  let timerId: NodeJS.Timeout | undefined;
  let lastCallTime: number | undefined;
  let lastInvokeTime = 0;
  let leading = false;
  let maxing = false;
  let trailing = true;

  const waitMs = Number(wait) || 0;

  if (options) {
    leading = !!options.leading;
    maxing = 'maxWait' in options;
    maxWait = maxing ? Math.max(Number(options.maxWait) || 0, waitMs) : undefined;
    trailing = 'trailing' in options ? !!options.trailing : trailing;
  }

  function invokeFunc(time: number) {
    const args = lastArgs;
    const thisArg = lastThis;

    lastArgs = lastThis = undefined;
    lastInvokeTime = time;
    return func.apply(thisArg, args as Parameters<typeof func>);
  }

  function startTimer(pendingFunc: () => void, wait: number) {
    return setTimeout(pendingFunc, wait);
  }

  function cancelTimer(id: NodeJS.Timeout) {
    clearTimeout(id);
  }

  function leadingEdge(time: number) {
    lastInvokeTime = time;
    timerId = startTimer(timerExpired, waitMs);
    return leading ? invokeFunc(time) : result;
  }

  function remainingWait(time: number) {
    const timeSinceLastCall = time - (lastCallTime as number);
    const timeSinceLastInvoke = time - lastInvokeTime;
    const timeWaiting = waitMs - timeSinceLastCall;

    return maxing
      ? Math.min(timeWaiting, (maxWait as number) - timeSinceLastInvoke)
      : timeWaiting;
  }

  function shouldInvoke(time: number) {
    const timeSinceLastCall = time - (lastCallTime as number);
    const timeSinceLastInvoke = time - lastInvokeTime;

    return (
      lastCallTime === undefined ||
      timeSinceLastCall >= waitMs ||
      timeSinceLastCall < 0 ||
      (maxing && timeSinceLastInvoke >= (maxWait as number))
    );
  }

  function timerExpired() {
    const time = Date.now();
    if (shouldInvoke(time)) {
      return trailingEdge(time);
    }
    timerId = startTimer(timerExpired, remainingWait(time));
  }

  function trailingEdge(time: number) {
    timerId = undefined;

    if (trailing && lastArgs) {
      return invokeFunc(time);
    }
    lastArgs = lastThis = undefined;
    return result;
  }

  function cancel() {
    if (timerId !== undefined) {
      cancelTimer(timerId);
    }
    lastInvokeTime = 0;
    lastArgs = lastCallTime = lastThis = timerId = undefined;
  }

  function flush() {
    return timerId === undefined ? result : trailingEdge(Date.now());
  }

  function debounced(this: unknown, ...args: Parameters<typeof func>) {
    const time = Date.now();
    const isInvoking = shouldInvoke(time);

    lastArgs = args as Args;
    lastThis = this;
    lastCallTime = time;

    if (isInvoking) {
      if (timerId === undefined) {
        return leadingEdge(lastCallTime);
      }
      if (maxing) {
        timerId = startTimer(timerExpired, waitMs);
        return invokeFunc(lastCallTime);
      }
    }
    if (timerId === undefined) {
      timerId = startTimer(timerExpired, waitMs);
    }
    return result;
  }

  debounced.cancel = cancel;
  debounced.flush = flush;

  return debounced as ((...args: Args) => R) & {
    cancel: () => void;
    flush: () => R | undefined;
  };
} 