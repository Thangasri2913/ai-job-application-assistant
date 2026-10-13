import { htmlToText, parseBoardList, titleMatchesAny, TtlCache } from './http.js';

describe('source HTTP helpers', () => {
  it('turns provider HTML (escaped or not) into readable text', () => {
    expect(
      htmlToText('&lt;p&gt;A &amp;amp; B&lt;/p&gt;&lt;ul&gt;&lt;li&gt;C&lt;/li&gt;&lt;/ul&gt;'),
    ).toBe('A & B\n- C');
    expect(htmlToText('<script>x()</script>Hi&nbsp;there &#8211; ok')).toBe('Hi there – ok');
  });

  it('parses board lists with optional employer names', () => {
    expect(parseBoardList(' acme, globex=Globex Corp ,acme,, ')).toEqual([
      { id: 'acme' },
      { id: 'globex', name: 'Globex Corp' },
    ]);
    expect(parseBoardList(undefined)).toEqual([]);
  });

  it('matches titles on whole words of any keyword', () => {
    expect(titleMatchesAny('Senior Front-End Engineer', ['frontend engineer'])).toBe(true);
    expect(titleMatchesAny('React.js Developer', ['React'])).toBe(true);
    expect(titleMatchesAny('JavaScript Developer', ['Java'])).toBe(false);
    expect(titleMatchesAny('Accountant', ['Developer', 'Engineer'])).toBe(false);
    expect(titleMatchesAny('Anything', [])).toBe(true);
  });

  it('caches successes for the TTL and never caches failures', async () => {
    let now = 0;
    const cache = new TtlCache<number>(1000, () => now);
    const load = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    expect(await cache.get('k', load)).toBe(1);
    expect(await cache.get('k', load)).toBe(1);
    now = 1000;
    expect(await cache.get('k', load)).toBe(2);
    const failing = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(3);
    await expect(cache.get('f', failing)).rejects.toThrow('x');
    expect(await cache.get('f', failing)).toBe(3);
  });
});
