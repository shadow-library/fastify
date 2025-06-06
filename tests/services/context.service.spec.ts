/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { InternalError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { ContextService } from '@shadow-library/fastify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('Context', () => {
  let context: ContextService;
  const data = { req: { id: 1 }, res: {}, get: 'GET', set: 'SET' };
  const store = { get: jest.fn().mockReturnValue(data.get), set: jest.fn().mockReturnValue(data.set) };
  const storage = { enterWith: jest.fn(), getStore: jest.fn().mockReturnValue(store) };

  beforeEach(() => {
    jest.clearAllMocks();
    context = new ContextService();
    // @ts-expect-error setting private readonly storage
    context['storage'] = storage;
  });

  it('should initialize the context', () => {
    const middleware = context.init();
    middleware(data.req as any, data.res as any);

    expect(storage.enterWith).toHaveBeenCalledWith(expect.any(Map));
  });

  describe('set()', () => {
    it('should throw an error if context is not inited', () => {
      storage.getStore.mockReturnValueOnce(undefined);
      expect(() => context['set']('key', 'value')).toThrowError(InternalError);
    });

    it('should set the context value', () => {
      context['set']('key', 'value');
      expect(store.set).toHaveBeenCalledWith('key', 'value');
    });
  });

  describe('get', () => {
    it('should get the context value', () => {
      const req = context.getRequest();
      expect(store.get).toHaveBeenCalledWith(expect.any(Symbol));
      expect(req).toBe(data.get);
    });

    it('should throw an error if context is not inited', () => {
      storage.getStore.mockReturnValueOnce(undefined);
      expect(() => context.getResponse()).toThrowError(InternalError);
    });

    it('should throw an error if value not present when throwIfMissing is true', () => {
      store.get.mockReturnValueOnce(undefined);
      expect(() => context.getRID()).toThrowError(InternalError);
    });

    it('should return null if value not present when throwIfMissing is false', () => {
      store.get.mockReturnValueOnce(undefined);
      expect(context['get']('random')).toBeNull();
    });
  });
});
