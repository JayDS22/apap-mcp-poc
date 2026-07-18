import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SubscriptionRegistry,
  isValidResourceUri,
  type NotificationSender,
  type NotificationPayload,
} from '../../src/services/subscriptionRegistry.js';

// Each test constructs a fresh registry so state does not leak between cases.
// The singleton `subscriptionRegistry` is not exercised here — it is a thin
// module-level instance and the handler tests cover its wiring.

describe('SubscriptionRegistry.subscribe / notify', () => {
  let registry: SubscriptionRegistry;
  let send: NotificationSender;

  beforeEach(() => {
    registry = new SubscriptionRegistry();
    send = vi.fn();
  });

  it('delivers a notification to a single subscribed URI', () => {
    registry.subscribe('sess-A', 'apap://templates/late-delivery', send, 'sub-1');
    registry.notify('apap://templates/late-delivery');

    expect(send).toHaveBeenCalledTimes(1);
    const payload = (send as any).mock.calls[0][0] as NotificationPayload;
    expect(payload.method).toBe('notifications/resources/updated');
    expect(payload.params.uri).toBe('apap://templates/late-delivery');
    expect(payload.params.io_modelcontextprotocol_subscriptionId).toBe('sub-1');
  });

  it('does not notify subscribers of a different URI', () => {
    registry.subscribe('sess-A', 'apap://templates/late-delivery', send, 'sub-1');
    registry.notify('apap://templates/hello-world');

    expect(send).not.toHaveBeenCalled();
  });

  it('delivers to every subscriber of the same URI across sessions', () => {
    const sendA = vi.fn();
    const sendB = vi.fn();

    registry.subscribe('sess-A', 'apap://agreements/1', sendA, 'sub-A');
    registry.subscribe('sess-B', 'apap://agreements/1', sendB, 'sub-B');

    registry.notify('apap://agreements/1');

    expect(sendA).toHaveBeenCalledTimes(1);
    expect(sendB).toHaveBeenCalledTimes(1);
    // Each subscriber gets its own subscriptionId echoed back.
    expect((sendA as any).mock.calls[0][0].params.io_modelcontextprotocol_subscriptionId).toBe('sub-A');
    expect((sendB as any).mock.calls[0][0].params.io_modelcontextprotocol_subscriptionId).toBe('sub-B');
  });

  it('is idempotent: subscribing the same (session, uri) twice does not double-deliver', () => {
    // First subscribe registers `send`, second replaces it with a different callback.
    // Only the newest send should be invoked on notify.
    const first = vi.fn();
    const second = vi.fn();

    registry.subscribe('sess-A', 'apap://templates/x', first, 'sub-1');
    registry.subscribe('sess-A', 'apap://templates/x', second, 'sub-2');

    registry.notify('apap://templates/x');

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('swallows subscriber errors so notify() does not throw to the caller', () => {
    const throwing: NotificationSender = () => {
      throw new Error('subscriber blew up');
    };
    const working = vi.fn();

    registry.subscribe('sess-A', 'apap://agreements/9', throwing, 'sub-t');
    registry.subscribe('sess-B', 'apap://agreements/9', working, 'sub-w');

    // Must not throw even though the first subscriber fails.
    expect(() => registry.notify('apap://agreements/9')).not.toThrow();
    // Working subscriber still receives its notification.
    expect(working).toHaveBeenCalledTimes(1);
  });
});

describe('SubscriptionRegistry.unsubscribe', () => {
  let registry: SubscriptionRegistry;

  beforeEach(() => {
    registry = new SubscriptionRegistry();
  });

  it('removes a single subscription and stops delivery on that URI', () => {
    const send = vi.fn();
    registry.subscribe('sess-A', 'apap://templates/x', send, 'sub-1');

    registry.unsubscribe('sess-A', 'apap://templates/x');
    registry.notify('apap://templates/x');

    expect(send).not.toHaveBeenCalled();
    expect(registry.subscriberCount('apap://templates/x')).toBe(0);
  });

  it('leaves other subscriptions on the same session intact', () => {
    const send = vi.fn();
    registry.subscribe('sess-A', 'apap://templates/x', send, 'sub-x');
    registry.subscribe('sess-A', 'apap://templates/y', send, 'sub-y');

    registry.unsubscribe('sess-A', 'apap://templates/x');

    expect(registry.sessionSubscriptions('sess-A')).toEqual(['apap://templates/y']);
  });

  it('is safe to call for a subscription that does not exist', () => {
    expect(() => registry.unsubscribe('sess-A', 'apap://templates/missing')).not.toThrow();
  });
});

describe('SubscriptionRegistry.clearSession', () => {
  let registry: SubscriptionRegistry;

  beforeEach(() => {
    registry = new SubscriptionRegistry();
  });

  it('removes every subscription for a session across multiple URIs', () => {
    const send = vi.fn();
    registry.subscribe('sess-A', 'apap://templates/x', send, 'sub-x');
    registry.subscribe('sess-A', 'apap://agreements/1', send, 'sub-1');
    registry.subscribe('sess-A', 'apap://agreements/2', send, 'sub-2');

    registry.clearSession('sess-A');

    expect(registry.sessionSubscriptions('sess-A')).toEqual([]);
    expect(registry.subscriberCount('apap://templates/x')).toBe(0);
    expect(registry.subscriberCount('apap://agreements/1')).toBe(0);
    expect(registry.subscriberCount('apap://agreements/2')).toBe(0);

    // Nothing fires on notify after clearSession.
    registry.notify('apap://agreements/1');
    expect(send).not.toHaveBeenCalled();
  });

  it('leaves subscribers on other sessions untouched', () => {
    const sendA = vi.fn();
    const sendB = vi.fn();

    registry.subscribe('sess-A', 'apap://agreements/1', sendA, 'sub-A');
    registry.subscribe('sess-B', 'apap://agreements/1', sendB, 'sub-B');

    registry.clearSession('sess-A');
    registry.notify('apap://agreements/1');

    expect(sendA).not.toHaveBeenCalled();
    expect(sendB).toHaveBeenCalledTimes(1);
  });

  it('is safe to call for a session with no subscriptions', () => {
    expect(() => registry.clearSession('unknown-session')).not.toThrow();
  });
});

describe('isValidResourceUri', () => {
  it('accepts apap://templates/* URIs', () => {
    expect(isValidResourceUri('apap://templates/late-delivery')).toBe(true);
    expect(isValidResourceUri('apap://templates/')).toBe(true);
  });

  it('accepts apap://agreements/* URIs', () => {
    expect(isValidResourceUri('apap://agreements/42')).toBe(true);
  });

  it('rejects the schema resource (immutable, not subscribable)', () => {
    expect(isValidResourceUri('apap://schema/protocol.cto')).toBe(false);
  });

  it('rejects unknown schemes', () => {
    expect(isValidResourceUri('http://example.com/agreement/1')).toBe(false);
    expect(isValidResourceUri('urn:foo:bar')).toBe(false);
    expect(isValidResourceUri('')).toBe(false);
  });
});
