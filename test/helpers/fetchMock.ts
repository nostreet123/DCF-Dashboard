const noopPreconnect: typeof fetch.preconnect = () => {};

export const asFetchMock = (
  fn: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>,
): typeof fetch => Object.assign(fn, { preconnect: noopPreconnect });

export const createMockFetch = asFetchMock;
