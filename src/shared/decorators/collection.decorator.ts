// src/shared/decorators/collection.decorator.ts
import 'reflect-metadata';

export function Collection(name: string) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    return function (constructor: Function) {
        Reflect.defineMetadata('collection', name, constructor);
    };
}