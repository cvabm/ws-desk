import test from 'node:test';
import assert from 'node:assert/strict';

import {
  guessBodyType,
  methodOmitsBody,
  requestDefinitionURL,
  requestURLForEnvironment,
  toCurl,
} from './http-ui.js';

test('request definition removes its source environment prefix', () => {
  assert.equal(
    requestDefinitionURL(
      'http://old.example/gateway/users?id=1#row',
      'http://old.example/gateway',
    ),
    '/users?id=1#row',
  );
});

test('request definition is combined with the selected environment prefix', () => {
  assert.equal(
    requestURLForEnvironment('/users?id=1#row', 'http://new.example/api'),
    'http://new.example/api/users?id=1#row',
  );
});

test('relative definitions remain environment independent', () => {
  assert.equal(requestDefinitionURL('/health?full=1'), '/health?full=1');
  assert.equal(
    requestURLForEnvironment('/health?full=1', 'https://example.com/gateway/'),
    'https://example.com/gateway/health?full=1',
  );
});

test('DELETE and OPTIONS support request bodies', () => {
  assert.equal(methodOmitsBody('DELETE'), false);
  assert.equal(methodOmitsBody('OPTIONS'), false);
  assert.equal(guessBodyType({}, '', 'DELETE'), 'json');
  assert.match(toCurl({
    method: 'DELETE',
    url: 'http://example.test/item',
    headers: {},
    body: '{"id":1}',
    followRedirects: false,
  }), /--data-raw/);
});

test('GET and HEAD omit request bodies', () => {
  assert.equal(methodOmitsBody('GET'), true);
  assert.equal(methodOmitsBody('HEAD'), true);
  assert.equal(guessBodyType({}, '', 'GET'), 'none');
  assert.doesNotMatch(toCurl({
    method: 'GET',
    url: 'http://example.test/items',
    headers: {},
    body: '{"ignored":true}',
    followRedirects: false,
  }), /--data-raw/);
});
