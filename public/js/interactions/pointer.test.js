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

test('pointer bridge 拒绝未知 phase 与畸形坐标 payload', () => {
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
    const base = { __aioux: true, kind: 'frame-pointer', phase: 'down', x: 1, y: 2, w: 10, h: 10, nonce };

    assert.equal(isTrustedPointerMessage({ source: contentWindow, data: { ...base, phase: 'move' } }), false);
    assert.equal(isTrustedPointerMessage({ source: contentWindow, data: { ...base, x: Infinity } }), false);
    assert.equal(isTrustedPointerMessage({ source: contentWindow, data: { ...base, w: 0 } }), false);
    assert.equal(isTrustedPointerMessage({ source: contentWindow, data: { ...base, x: -1 } }), false);
    assert.equal(isTrustedPointerMessage({ source: contentWindow, data: { ...base, x: 11 } }), false);
    assert.equal(isTrustedPointerMessage({ source: contentWindow, data: { ...base, label: 123 } }), false);
    assert.equal(isTrustedPointerMessage({ source: contentWindow, data: { ...base, label: 'x'.repeat(81) } }), false);
  } finally {
    globalThis.document = previousDocument;
  }
});
