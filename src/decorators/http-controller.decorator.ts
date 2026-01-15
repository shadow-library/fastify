/**
 * Importing npm packages
 */
import { Controller } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { HTTP_CONTROLLER_TYPE } from '../constants';
import { ApiOperation } from './api-operation.decorator';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const controllerNameSuffixes = ['Controller', 'API', 'Api', 'Handler', 'Resource', 'Endpoint', 'Route'];

export function HttpController(path = ''): ClassDecorator {
  return target => {
    let tag = target.name;
    for (const suffix of controllerNameSuffixes) tag = tag.replace(suffix, '');
    tag = tag.replace(/([a-z])([A-Z])/g, '$1 $2');

    Controller({ [HTTP_CONTROLLER_TYPE]: 'router', path })(target);
    ApiOperation({ tags: [tag] })(target);
  };
}
