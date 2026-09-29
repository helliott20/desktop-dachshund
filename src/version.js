/*
 * Version helpers for the update check. Pure, so they're unit tested.
 */
'use strict';

/** "v1.2.3" / "1.2.3-beta.1" -> [1, 2, 3] (pre-release suffix ignored). Null if unparseable. */
function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(v || '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** True when `candidate` is a strictly newer version than `current`. */
function isNewer(candidate, current) {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

/**
 * Read the fields we need from GitHub's "latest release" API response.
 * Drafts and pre-releases never count as updates.
 */
function parseRelease(json) {
  if (!json || typeof json !== 'object' || json.draft || json.prerelease) return null;
  const version = parseVersion(json.tag_name);
  if (!version || typeof json.html_url !== 'string') return null;
  return { version: version.join('.'), url: json.html_url };
}

module.exports = { parseVersion, isNewer, parseRelease };
