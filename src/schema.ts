import {ToJsonOptions} from "./jsonthis";

/**
 * Decorator to mark a class as a Jsonthis-serializable class.
 */
export const Json = function (target: Object): void {
    JsonSchema.getOrCreate(target);
}

/**
 * Decorator to mark a field as a Jsonthis-serializable field.
 * @param options The serialization options for the field (or just a boolean to set visibility).
 */
export const JsonField = function (options?: boolean | JsonFieldOptions): Function {
    return function JsonField(target: Object, propertyName: PropertyKey): void {
        if (options === undefined) options = {};
        if (typeof options === "boolean") options = {visible: options};

        if (options.visible === undefined) options.visible = true;

        const key = propertyName.toString();
        const schema = JsonSchema.getOrCreate(target.constructor);
        schema.definedFields.set(key, options);
    }
}

/**
 * A state object is carried through the traversal of the JSON object and can be used to store stateful information.
 * (This can be used to detect circular references, for example.)
 */
export type JsonTraversalState = {
    parent?: any;
    visited: Set<any>;
}

/**
 * You can use a traversal function to customize the serialization of a value.
 *  - A "serializer" is a JsonTraversalFn that is invoked whenever a field has a type that matches the
 *  type of the serializer.
 *  - A "visible" property can (optionally) be a JsonTraversalFn that determines whether the field is visible or not
 *  while traversing the object.
 */
export type JsonTraversalFn<R> = (state: JsonTraversalState, value: any, options?: ToJsonOptions) => R;

export function evaluateJsonTraversalFn<R>(fn: JsonTraversalFn<R> | undefined | R,
                                           state: JsonTraversalState, value: any, options?: ToJsonOptions): R | undefined {
    if (fn === undefined) return undefined;
    if (typeof fn === "function") return (fn as JsonTraversalFn<R>)(state, value, options);
    return fn;
}

export interface JsonifiedConstructor extends FunctionConstructor {
    __json_schema?: JsonSchema;
}

/**
 * Options for the @JsonField decorator.
 */
export type JsonFieldOptions = {
    visible?: boolean | JsonTraversalFn<boolean>;  // Whether the field is visible or not.
    serializer?: JsonTraversalFn<any>;  // The custom serializer function for the column.
}

export class JsonSchema {
    definedFields: Map<string, JsonFieldOptions> = new Map();

    static getOrCreate(target: unknown): JsonSchema {
        const constructor = (target as JsonifiedConstructor)
        return constructor["__json_schema"] = constructor["__json_schema"] || new JsonSchema();
    }

    static get(target: unknown): JsonSchema | undefined {
        if (!(target instanceof Function)) return undefined
        if (!Object.hasOwn(target, "__json_schema")) return undefined;
        return (target as JsonifiedConstructor)["__json_schema"];
    }

}