/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ControllerRouteMetadata } from '@shadow-library/app';
import { InternalError, Logger, ValidationError, withThis } from '@shadow-library/common';
import { FastifyInstance, fastify } from 'fastify';

/**
 * Importing user defined packages
 */
import { HTTP_CONTROLLER_TYPE } from '@lib/constants';
import { ChildRouteResponse, ContextService, FastifyModule, FastifyRouter, HttpMethod, ServerMetadata } from '@shadow-library/fastify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('FastifyRouter', () => {
  let router: FastifyRouter;
  let instance: FastifyInstance;
  const config = FastifyModule['getDefaultConfig']();
  const Class = class {};
  const classInstance = new Class();
  const context = new ContextService();
  const handler = jest.fn();
  const handlerName = handler.name;

  beforeEach(() => {
    jest.clearAllMocks();
    instance = fastify();
    router = new FastifyRouter(config, instance, context);
  });

  it('should return the fastify instance', () => {
    expect(router.getInstance()).toBe(instance);
  });

  it('should start the server', async () => {
    const listen = jest.spyOn(instance, 'listen').mockReturnThis();
    await router.start();
    expect(listen).toBeCalledWith({ port: 8080, host: 'localhost' });
  });

  it('should stop the server', async () => {
    const close = jest.spyOn(instance, 'close').mockReturnThis();
    await router.stop();
    expect(close).toBeCalled();
  });

  it('should register raw body parser', () => {
    const request = { routeOptions: { config: { metadata: { rawBody: true } } } } as any;
    const buffer = Buffer.from('{"key": "value"}');
    const instance = router.getInstance();
    const done = () => {};
    const parser = jest.fn();
    jest.spyOn(instance, 'getDefaultJsonParser').mockReturnValue(parser);
    const addContentTypeParser = jest.spyOn(instance, 'addContentTypeParser').mockReturnThis();

    router['registerRawBody']();
    const handler = addContentTypeParser.mock.lastCall?.[2];
    handler?.(request, buffer, done);

    expect(addContentTypeParser).toHaveBeenCalledWith('application/json', { parseAs: 'buffer' }, expect.any(Function));
    expect(parser).toHaveBeenCalledWith(request, buffer.toString(), done);
    expect(request.rawBody).toBe(buffer);
  });

  describe('mockRequest', () => {
    it('should mock with options', () => {
      const fn = jest.spyOn(instance, 'inject').mockReturnThis();
      router.mockRequest({});
      expect(fn).toBeCalledWith({});
    });

    it('should mock using chain', () => {
      const fn = jest.spyOn(instance, 'inject').mockReturnThis();
      router.mockRequest();
      expect(fn).toBeCalledWith();
    });
  });

  describe('parseControllers', () => {
    const parseControllers = (controllers: ControllerRouteMetadata[]) => router['parseControllers'](controllers);
    class Middleware {
      use = jest.fn();
      generate = jest.fn(withThis((ctx: Middleware) => ctx.use()));
    }
    const middleware = new Middleware();

    it('should throw error if controller type is not supported', () => {
      const controller = { metadata: { [HTTP_CONTROLLER_TYPE]: 'unknown' } } as any;
      expect(() => parseControllers([controller])).toThrow(InternalError);
    });

    it('should parse router controller', () => {
      const metadata = { [HTTP_CONTROLLER_TYPE]: 'router', path: '/api' } as const;
      const parsedControllers = parseControllers([
        { metadata, metatype: Class, instance: classInstance, routes: [{ metadata: { path: '/single' }, handler, handlerName, paramtypes: [] }] },
      ]);

      expect(parsedControllers.routes).toHaveLength(1);
      expect(parsedControllers.middlewares).toHaveLength(0);
      expect(parsedControllers.routes[0]).toStrictEqual({ metatype: Class, instance: classInstance, paramtypes: [], handler, handlerName, metadata: { path: '/api/single' } });
    });

    it('should add default path if path is not provided', () => {
      const metadata = { [HTTP_CONTROLLER_TYPE]: 'router' } as const;
      const parsedControllers = parseControllers([{ metadata, metatype: Class, instance: classInstance, routes: [{ metadata: {}, handler, handlerName, paramtypes: [] }] }]);

      expect(parsedControllers.routes[0]?.metadata).toStrictEqual({ path: '/' });
    });

    it('should parse generate middleware controller', () => {
      const metadata = { [HTTP_CONTROLLER_TYPE]: 'middleware', type: 'preHandler', generates: true, weight: 0 } as const;
      const parsedControllers = parseControllers([{ metadata, metatype: Middleware, instance: middleware, routes: [] }]);
      parsedControllers.middlewares[0]?.handler();

      expect(middleware.use).toBeCalled();
      expect(parsedControllers.routes).toHaveLength(0);
      expect(parsedControllers.middlewares).toHaveLength(1);
      expect(parsedControllers.middlewares[0]).toStrictEqual({
        metatype: Middleware,
        instance: middleware,
        paramtypes: [],
        handler: expect.any(Function),
        handlerName: 'generate',
        metadata,
      });
    });

    it('should parse use middleware controller', () => {
      const metadata = { [HTTP_CONTROLLER_TYPE]: 'middleware', type: 'preHandler', generates: false, weight: 0 } as const;
      const parsedControllers = parseControllers([{ metadata, metatype: Middleware, instance: middleware, routes: [] }]);
      parsedControllers.middlewares[0]?.handler();

      expect(middleware.generate).not.toBeCalled();
      expect(parsedControllers.routes).toHaveLength(0);
      expect(parsedControllers.middlewares).toHaveLength(1);
      expect(parsedControllers.middlewares[0]).toStrictEqual({
        metatype: Middleware,
        instance: middleware,
        paramtypes: [],
        handler: expect.any(Function),
        handlerName: 'use',
        metadata,
      });
    });

    it('should sort middlewares by weight', () => {
      const metadata1 = { [HTTP_CONTROLLER_TYPE]: 'middleware', type: 'preHandler', generates: true, weight: 1 } as const;
      const metadata2 = { [HTTP_CONTROLLER_TYPE]: 'middleware', type: 'preHandler', generates: false, weight: 0 } as const;
      const parsedControllers = parseControllers([
        { metadata: metadata1, metatype: Middleware, instance: middleware, routes: [] },
        { metadata: metadata2, metatype: Middleware, instance: middleware, routes: [] },
      ]);

      expect(parsedControllers.middlewares[0]?.metadata).toStrictEqual(metadata1);
      expect(parsedControllers.middlewares[1]?.metadata).toStrictEqual(metadata2);
    });
  });

  describe('generateRouteHandler', () => {
    const data = { msg: 'Hello World' };
    const handler = jest.fn().mockReturnValue(data);
    const mockFn = () => jest.fn().mockReturnThis();
    const request = { params: {}, query: {}, body: {} } as any;
    const response = { sent: false, status: mockFn(), send: mockFn(), header: mockFn(), redirect: mockFn(), viewAsync: mockFn() } as any;
    const generateRouteHandler = (metadata: ServerMetadata) =>
      router['generateRouteHandler']({ metatype: Class, instance: classInstance, metadata, handler, handlerName, paramtypes: [] });

    it('should set the provided status code', async () => {
      const routeHandler = generateRouteHandler({ status: 204, method: HttpMethod.POST });
      await routeHandler(request, response);
      expect(response.status).toBeCalledWith(204);
    });

    it('should set the status code from the response schema if there is only one exact schema match', async () => {
      const routeHandler = generateRouteHandler({ schemas: { response: { 200: {} } }, method: HttpMethod.GET });
      await routeHandler(request, response);
      expect(response.status).toBeCalledWith(200);
    });

    it('should set the default status code', async () => {
      const getHandler = generateRouteHandler({ method: HttpMethod.GET, schemas: { response: { 201: {}, 202: {} } } });
      await getHandler(request, response);
      expect(response.status).toBeCalledWith(200);

      const postHandler = generateRouteHandler({ method: HttpMethod.POST });
      await postHandler(request, response);
      expect(response.status).toBeCalledWith(201);
    });

    it('should set the provided headers', async () => {
      const headers = { 'Content-Type': 'application/json', 'X-Test': () => 'test' };
      const routeHandler = generateRouteHandler({ headers });
      await routeHandler(request, response);
      expect(response.header).toHaveBeenNthCalledWith(1, 'Content-Type', 'application/json');
      expect(response.header).toHaveBeenNthCalledWith(2, 'X-Test', 'test');
    });

    it('should call the handler with the correct arguments', async () => {
      Reflect.getMetadata = jest.fn().mockReturnValue(['params', 'request', class {}, 'query', Object, 'response', 'body']);
      const routeHandler = generateRouteHandler({});
      await routeHandler(request, response);
      expect(handler).toBeCalledWith(request.params, request, undefined, request.query, undefined, response, request.body);
    });

    it('should redirect if redirect is provided', async () => {
      const routeHandler = generateRouteHandler({ redirect: '/redirect' });
      await routeHandler(request, response);
      expect(response.status).toBeCalledWith(301);
      expect(response.redirect).toBeCalledWith('/redirect');
    });

    it('should render the static template', async () => {
      const data = { msg: 'Hello World' };
      handler.mockReturnValue(data);
      const routeHandler = generateRouteHandler({ render: 'template' });
      await routeHandler(request, response);
      expect(response.viewAsync).toBeCalledWith('template', data);
    });

    it('should render the dynamic template', async () => {
      const data = { template: 'sample', data: { msg: 'Hello World' } };
      handler.mockReturnValue(data);
      const routeHandler = generateRouteHandler({ render: true });
      await routeHandler(request, response);
      expect(response.viewAsync).toBeCalledWith('sample', data.data);
    });
  });

  describe('register', () => {
    const route = { metadata: { path: '/', method: HttpMethod.GET, rawBody: true } } as any;

    beforeEach(() => {
      config.responseSchema = undefined;
      router['parseControllers'] = jest.fn().mockReturnValue({ routes: [route], middlewares: [] }) as any;
      router['generateRouteHandler'] = jest.fn().mockReturnValue(jest.fn()) as any;
      instance.route = jest.fn().mockReturnThis() as any;
    });

    it('should register raw body parser', async () => {
      const registerRawBody = jest.spyOn(router, 'registerRawBody' as any).mockReturnThis();
      await router.register([]);
      expect(registerRawBody).toBeCalled();
    });

    it('should register single method route', async () => {
      await router.register([]);
      expect(instance.route).toBeCalledWith({
        config: { metadata: route.metadata },
        attachValidation: false,
        handler: expect.any(Function),
        method: ['GET'],
        url: '/',
        schema: { response: {} },
      });
    });

    it('should register multiple method route', async () => {
      const route = { metadata: { path: '/', method: HttpMethod.ALL } } as any;
      jest.mocked(router['parseControllers']).mockReturnValue({ routes: [route], middlewares: [] });
      await router.register([]);
      expect(instance.route).toBeCalledWith(expect.objectContaining({ method: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'] }));
    });

    it('should apply the middleware if generator returns a function', async () => {
      handler.mockReturnValue(jest.fn());
      const middleware = { metatype: Class, metadata: { type: 'preHandler', generates: true }, handler, instance: {} } as any;
      jest.mocked(router['parseControllers']).mockReturnValue({ routes: [route], middlewares: [middleware] });
      await router.register([]);
      expect(instance.route).toBeCalledWith(expect.objectContaining({ preHandler: [expect.any(Function)] }));
    });

    it('should not apply the middleware if generator returns false', async () => {
      handler.mockReturnValue(false);
      const middleware = { metatype: Class, metadata: { type: 'preHandler', generates: true }, handler, instance: {} } as any;
      jest.mocked(router['parseControllers']).mockReturnValue({ routes: [route], middlewares: [middleware] });
      await router.register([]);
      expect(instance.route).toBeCalledWith(expect.not.objectContaining({ preHandler: expect.anything() }));
    });

    it('should apply the use middleware', async () => {
      const middleware = { metatype: Class, metadata: { type: 'preHandler', generates: false }, handler } as any;
      jest.mocked(router['parseControllers']).mockReturnValue({ routes: [route], middlewares: [middleware] });
      await router.register([]);
      expect(handler).not.toBeCalled();
      expect(instance.route).toBeCalledWith(expect.objectContaining({ preHandler: [expect.any(Function)] }));
    });

    it('should apply multiple middlewares of the same type', async () => {
      const middleware1 = { metatype: Class, metadata: { type: 'preHandler', generates: false }, handler } as any;
      const middleware2 = { metatype: Class, metadata: { type: 'preHandler', generates: false }, handler } as any;
      jest.mocked(router['parseControllers']).mockReturnValue({ routes: [route], middlewares: [middleware1, middleware2] });
      await router.register([]);
      expect(instance.route).toBeCalledWith(expect.objectContaining({ preHandler: [expect.any(Function), expect.any(Function)] }));
    });

    it('should apply the cached middleware for the same key', async () => {
      const instance = { cacheKey: () => 'test-key' };
      handler.mockReturnValue(() => {});
      const middleware1 = { metatype: Class, metadata: { type: 'preHandler', generates: true }, handler, instance } as any;
      const middleware2 = { metatype: Class, metadata: { type: 'preHandler', generates: true }, handler, instance } as any;
      jest.mocked(router['parseControllers']).mockReturnValue({ routes: [route], middlewares: [middleware1, middleware2] });
      await router.register([]);
      expect(handler).toBeCalledTimes(1);
    });

    it('should apply the response schema', async () => {
      config.responseSchema = { 200: { type: 'object' } as any };
      await router.register([]);
      expect(instance.route).toBeCalledWith(expect.objectContaining({ schema: { response: { 200: { type: 'object' } } } }));
    });

    it('should apply the body schema', async () => {
      route.metadata.schemas = { body: { type: 'object' } as any };
      await router.register([]);
      expect(instance.route).toBeCalledWith(expect.objectContaining({ schema: { body: { type: 'object' }, response: {} } }));
    });

    it('should apply the params schema', async () => {
      route.metadata.schemas = { params: { type: 'object' } as any };
      await router.register([]);
      expect(instance.route).toBeCalledWith(expect.objectContaining({ schema: { params: { type: 'object' }, response: {} } }));
    });

    it('should apply the query schema', async () => {
      route.metadata.schemas = { query: { type: 'object' } as any };
      await router.register([]);
      expect(instance.route).toBeCalledWith(expect.objectContaining({ schema: { querystring: { type: 'object' }, response: {} } }));
    });
  });

  describe('child routes', () => {
    const handler = jest.fn<() => Promise<any>>();

    beforeEach(() => {
      router = new FastifyRouter({ ...config, enableChildRoutes: true }, instance, context);
      router['generateRouteHandler'] = jest.fn().mockReturnValue(handler) as any;
    });

    it('should throw error if child routes are not enabled', async () => {
      const nonChildRouter = new FastifyRouter({ ...config, enableChildRoutes: false }, instance, context);
      await expect(nonChildRouter.resolveChildRoute('/child')).rejects.toThrow(InternalError);
    });

    it('should throw error if the router is not found', async () => {
      await expect(router.resolveChildRoute('/non-existent')).rejects.toThrow(InternalError);
    });

    it('should execute child routes without making actual HTTP requests', async () => {
      const route = { metadata: { path: '/child', method: HttpMethod.GET }, handler, instance } as any;
      const context = jest.fn();
      const requestLogger = jest.fn();
      router['parseControllers'] = jest.fn().mockReturnValue({ routes: [route], middlewares: [] }) as any;
      router['context'].initChild = jest.fn().mockReturnValue(context) as any;
      router['getRequestLogger'] = jest.fn().mockReturnValue(requestLogger) as any;

      await router.register([]);
      await router.resolveChildRoute('/child');

      expect(context).toHaveBeenCalledWith({ url: '/child', method: 'GET', query: {}, params: {} });
      expect(requestLogger).toHaveBeenCalledWith({ url: '/child', method: 'GET', query: {}, params: {} }, expect.any(ChildRouteResponse));
      expect(handler).toHaveBeenCalledWith({ url: '/child', method: 'GET', query: {}, params: {} }, expect.any(ChildRouteResponse));
    });

    it('should validate child route parameters', async () => {
      const paramsSchema = { type: 'object', properties: { id: { type: 'string', pattern: '^[0-9]+$' } }, required: ['id'] };
      const querySchema = { type: 'object', properties: { search: { type: 'string' } } };
      const route = { metadata: { path: '/child/:id', method: HttpMethod.GET, schemas: { params: paramsSchema, query: querySchema } } } as any;
      router['parseControllers'] = jest.fn().mockReturnValue({ routes: [route], middlewares: [] }) as any;

      await router.register([]);
      await router.resolveChildRoute('/child/123?search=test');

      expect(handler).toHaveBeenCalledWith({ url: '/child/123', method: 'GET', query: { search: 'test' }, params: { id: '123' } }, expect.any(ChildRouteResponse));
    });

    it('should throw error for invalid child route parameters', async () => {
      const paramsSchema = { type: 'object', properties: { id: { type: 'string', pattern: '^[0-9]+$' } }, required: ['id'] };
      const route = { metadata: { path: '/child/:id', method: HttpMethod.GET, schemas: { params: paramsSchema } } } as any;
      router['parseControllers'] = jest.fn().mockReturnValue({ routes: [route], middlewares: [] }) as any;

      await router.register([]);
      await expect(router.resolveChildRoute('/child/abc')).rejects.toThrow(ValidationError);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle errors in child routes', async () => {
      const middleware = { metatype: Class, metadata: { type: 'onError', generates: false }, handler: jest.fn() } as any;
      const route = { metadata: { path: '/child', method: HttpMethod.GET } } as any;
      const error = new Error('Test error');
      handler.mockRejectedValue(error);
      router['parseControllers'] = jest.fn().mockReturnValue({ routes: [route], middlewares: [middleware] }) as any;

      await router.register([]);
      await router.resolveChildRoute('/child');

      expect(middleware.handler).toHaveBeenCalledWith({ url: '/child', method: 'GET', query: {}, params: {} }, expect.any(ChildRouteResponse), error);
    });
  });

  describe('getRequestLogger', () => {
    let httpLogger: jest.Spied<Logger['http']>;
    let contextSpy: jest.Spied<ContextService['get']>;

    beforeEach(() => {
      httpLogger = jest.spyOn(router['logger'], 'http').mockReturnValue();
      contextSpy = jest.spyOn(context, 'get').mockImplementation((key: string | symbol) => (key.toString() === 'Symbol(rid)' ? 'test-rid' : null));
    });

    it('should log request metadata when logging is enabled', () => {
      const req = {
        url: '/test',
        method: 'GET',
        socket: { remoteAddress: '127.0.0.1' },
        headers: { 'x-service': 'test-service', 'content-length': '123' },
        query: { key: 'value' },
        body: { data: 'test' },
      } as any;
      const res = {
        statusCode: 200,
        raw: { on: jest.fn((_, callback: () => void) => callback()) },
        getHeader: jest.fn().mockReturnValue('456'),
      } as any;

      const logger = router['getRequestLogger']();
      logger.call({} as any, req, res);

      expect(res.raw.on).toHaveBeenCalledWith('finish', expect.any(Function));
      expect(httpLogger).toHaveBeenCalledWith('http', {
        rid: 'test-rid',
        url: '/test',
        method: 'GET',
        status: 200,
        service: 'test-service',
        reqLen: '123',
        reqIp: '127.0.0.1',
        resLen: '456',
        timeTaken: expect.any(String),
        query: { key: 'value' },
        body: { data: 'test' },
      });
    });

    it('should not log request metadata when logging is disabled', () => {
      contextSpy.mockReturnValueOnce(true);
      const req = {} as any;
      const res = { raw: { on: jest.fn((_, callback: () => void) => callback()) } } as any;

      const logger = router['getRequestLogger']();
      logger.call({} as any, req, res);

      expect(res.raw.on).toHaveBeenCalledWith('finish', expect.any(Function));
      expect(httpLogger).not.toHaveBeenCalled();
    });
  });
});
