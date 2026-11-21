import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fetchSiteAllowed } from './fetch-site';

/* Baseline review 2026-11-21: the BFF answers only the web's own pages and direct navigation. */
describe('fetchSiteAllowed', () => {
  it('answers the web pages, <video> sources and links of the same origin', () => {
    assert.equal(fetchSiteAllowed('same-origin'), true);
  });

  it('answers a URL the owner opened from the address bar or a bookmark', () => {
    assert.equal(fetchSiteAllowed('none'), true);
  });

  it('refuses another port on 127.0.0.1, which the browser calls same-site, for every method', () => {
    assert.equal(fetchSiteAllowed('same-site'), false);
  });

  it('refuses a request from another site', () => {
    assert.equal(fetchSiteAllowed('cross-site'), false);
  });

  it('refuses a request without the header, since no caller of the BFF omits it', () => {
    assert.equal(fetchSiteAllowed(null), false);
  });

  it('refuses unknown or differently cased values instead of guessing', () => {
    assert.equal(fetchSiteAllowed('Same-Origin'), false);
    assert.equal(fetchSiteAllowed(''), false);
  });
});
