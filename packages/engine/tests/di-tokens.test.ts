import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DiTokens } from '../src/di/DiTokens';

test('token factories support higher-order DI registration without a receiver', () => {
  for (const [kind, factory] of Object.entries({
    element: DiTokens.element, component: DiTokens.component, action: DiTokens.action,
    command: DiTokens.command, service: DiTokens.service,
  })) {
    const token = factory('Example');
    assert.deepEqual(token, { kind, name: 'Example', key: `${kind}:Example` });
    assert.equal(Object.isFrozen(token), true);
  }
});
