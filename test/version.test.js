const test = require('node:test');
const assert = require('node:assert/strict');
const { parseVersion, isNewer, parseRelease } = require('../src/version');

test('parseVersion handles tags, plain versions and junk', () => {
  assert.deepEqual(parseVersion('v1.2.3'), [1, 2, 3]);
  assert.deepEqual(parseVersion('1.10.0'), [1, 10, 0]);
  assert.deepEqual(parseVersion('v2.0.0-beta.1'), [2, 0, 0]);
  assert.equal(parseVersion('latest'), null);
  assert.equal(parseVersion(undefined), null);
});

test('isNewer compares numerically, not as text', () => {
  assert.equal(isNewer('v1.0.2', '1.0.1'), true);
  assert.equal(isNewer('1.10.0', '1.9.9'), true);
  assert.equal(isNewer('2.0.0', '1.99.99'), true);
  assert.equal(isNewer('1.0.1', '1.0.1'), false);
  assert.equal(isNewer('1.0.0', '1.0.1'), false, 'never "update" to an older version');
  assert.equal(isNewer('garbage', '1.0.0'), false);
});

test('parseRelease reads GitHub latest-release JSON and skips drafts/pre-releases', () => {
  const ok = { tag_name: 'v1.1.0', html_url: 'https://github.com/x/y/releases/tag/v1.1.0', draft: false, prerelease: false };
  assert.deepEqual(parseRelease(ok), { version: '1.1.0', url: ok.html_url });
  assert.equal(parseRelease({ ...ok, draft: true }), null);
  assert.equal(parseRelease({ ...ok, prerelease: true }), null);
  assert.equal(parseRelease({ ...ok, tag_name: 'nightly' }), null);
  assert.equal(parseRelease({ message: 'Not Found' }), null);
  assert.equal(parseRelease(null), null);
});
