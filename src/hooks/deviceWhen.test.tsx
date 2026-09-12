/**
 * `deviceWhen` is the seam between "the device's clock" and every `When`-shaped query — a plain
 * function (not a hook: it calls no React hook itself) kept beside the hooks that consume it.
 */
import { deviceWhen } from './deviceWhen';

describe('deviceWhen', () => {
  it('reads the frozen test clock, not real wall-clock time', () => {
    const before = Date.now();
    const when = deviceWhen();
    expect(when.at).toBe(before);
  });

  it('reads the IANA zone the process is actually running in', () => {
    const when = deviceWhen();
    expect(when.timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it('is called fresh each time — advancing the clock changes the next result', () => {
    const first = deviceWhen();
    jest.setSystemTime(first.at + 60_000);
    const second = deviceWhen();
    expect(second.at).toBe(first.at + 60_000);
  });
});
