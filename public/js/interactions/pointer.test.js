import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderFull,
  getCurrentBridgeNonce,
} from '../stage.js';
import {
  isTrustedPointerMessage,
} from './pointer.js';

test('pointer bridge 拒绝伪造的 iframe pointer 消息', () => {
  const previousDocument = globalThis.document;
  const contentWindow = {};
  const frame = {
    attributes: {},
    srcdoc: '',
    contentWindow,
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
  globalThis.document = { getElementById: () => frame };

  try {
    renderFull('<button data-explorable>ok</button>');
    const nonce = getCurrentBridgeNonce();
    const payload = { __aioux: true, kind: 'frame-pointer', phase: 'down', x: 1, y: 2, w: 10, h: 10, nonce };

    assert.equal(isTrustedPointerMessage({ source: {}, data: payload }), false);
    assert.equal(isTrustedPointerMessage({ source: contentWindow, data: { ...payload, nonce: 'bad' } }), false);
    assert.equal(isTrustedPointerMessage({ source: contentWindow, data: payload }), true);
  } finally {
    globalThis.document = previousDocument;
  }
});
