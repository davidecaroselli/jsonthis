import {ToJsonOptions} from "./jsonthis";

/**
 * @deprecated This decorator is no longer necessary.
 */
export const Json = function (target: Object): void {
    // no-op
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

export class VisitMap {
    private depths: Array<Map<any, Array<any>>> = [new Map<any, Array<any>>()]
    private currentDepth: number = 0

    public get depth(): number {
        return this.currentDepth;
    }

    private has(value: any): boolean {
        for (const map of this.depths) {
            const values = map.get(value);
            if (values === undefined) continue;
            for (const v of values)
                if (v === value) return true;
        }

        return false;
    }

    private add(value: any): void {
        const map = this.depths[this.currentDepth];
        let values = map.get(value);
        if (values === undefined) {
            values = [];
            map.set(value, values);
        }
        values.push(value);
    }

    // Go down a level in the depth
    public dive(): void {
        this.depths.push(new Map<any, Array<any>>());
        this.currentDepth++;
    }

    // Go up a level in the depth
    public arise(): void {
        this.depths.pop();
        this.currentDepth--;
    }

    /**
     * Visit a value and return whether it has been visited before.
     * @param value
     */
    public visit(value: any): boolean {
        if (typeof value === "object") {
            if (this.has(value))
                return true;

            this.add(value);
        }

        return false;
    }
}

/**
 * A state object is carried through the traversal of the JSON object and can be used to store stateful information.
 * (This can be used to detect circular references, for example.)
 */
export type JsonTraversalState = {
    parent?: any;
    visited: VisitMap;
}

export type SimpleJsonTraversalFn<R> = (value: any) => R;
export type ComplexJsonTraversalFn<R> = (value: any, state: JsonTraversalState, options?: ToJsonOptions) => R;
/**
 * You can use a traversal function to customize the serialization of a value.
 *  - A "serializer" is a JsonTraversalFn that is invoked whenever a field has a type that matches the
 *  type of the serializer.
 *  - A "visible" property can (optionally) be a JsonTraversalFn that determines whether the field is visible or not
 *  while traversing the object.
 */
export type JsonTraversalFn<R> = SimpleJsonTraversalFn<R> | ComplexJsonTraversalFn<R>;

export function evaluateJsonTraversalFn<R>(fn: JsonTraversalFn<R> | undefined | R,
                                           value: any, state: JsonTraversalState, options?: ToJsonOptions): R | undefined {
    if (fn === undefined) return undefined;
    if (typeof fn === "function") {
        if (fn.length === 1) return (fn as SimpleJsonTraversalFn<R>)(value);
        else return (fn as ComplexJsonTraversalFn<R>)(value, state, options);
    }
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