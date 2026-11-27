import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { catalogFiltersFrom, catalogTabHref, hasNonKindFilters } from './catalog-query';

/* design/telas/02: the kind tabs are links on `?tipo=` that keep the other filters (and the section). */
describe('catalogTabHref', () => {
  const filters = catalogFiltersFrom({
    q: 'gancho',
    tipo: 'music',
    status: 'active',
    ordem: 'nota',
    'nota-min': '4',
    'execucoes-min': '3',
    cursor: 'abc123',
  });

  it('keeps q, status, ordem, nota-min and execucoes-min, sets tipo and drops the cursor', () => {
    const href = new URL(catalogTabHref(filters, 'skill'), 'http://127.0.0.1');
    assert.equal(href.pathname, '/catalogo');
    assert.equal(href.searchParams.get('tipo'), 'skill');
    assert.equal(href.searchParams.get('q'), 'gancho');
    assert.equal(href.searchParams.get('status'), 'active');
    assert.equal(href.searchParams.get('ordem'), 'nota');
    assert.equal(href.searchParams.get('nota-min'), '4');
    assert.equal(href.searchParams.get('execucoes-min'), '3');
    assert.equal(href.searchParams.has('cursor'), false);
  });

  it('removes tipo and keeps the section for the All tab', () => {
    const href = new URL(catalogTabHref(filters, null), 'http://127.0.0.1');
    assert.equal(href.searchParams.has('tipo'), false);
    assert.equal(href.searchParams.get('secao'), 'midia-e-marca');
    assert.equal(href.searchParams.get('q'), 'gancho');
  });

  it('keeps only modo, tipo and status in search by meaning', () => {
    const meaning = catalogFiltersFrom({ modo: 'significado', q: 'gancho', status: 'draft', ordem: 'nota', tipo: 'music' });
    assert.equal(catalogTabHref(meaning, 'skill'), '/catalogo?modo=significado&tipo=skill&status=draft');
    assert.equal(catalogTabHref(meaning, null), '/catalogo?modo=significado&secao=midia-e-marca&status=draft');
  });

  it('is the bare path for the default section when nothing else is set', () => {
    assert.equal(catalogTabHref(catalogFiltersFrom({ tipo: 'reference' }), null), '/catalogo');
  });
});

describe('hasNonKindFilters', () => {
  it('ignores the kind and the sort', () => {
    assert.equal(hasNonKindFilters(catalogFiltersFrom({ tipo: 'music', ordem: 'nota' })), false);
  });

  it('counts the text, status and score filters', () => {
    assert.equal(hasNonKindFilters(catalogFiltersFrom({ q: 'gancho' })), true);
    assert.equal(hasNonKindFilters(catalogFiltersFrom({ status: 'draft' })), true);
    assert.equal(hasNonKindFilters(catalogFiltersFrom({ 'nota-min': '4' })), true);
    assert.equal(hasNonKindFilters(catalogFiltersFrom({ 'execucoes-min': '3' })), true);
  });
});
