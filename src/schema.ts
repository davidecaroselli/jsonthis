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

export type JsonFieldFunction<R> = (value: any, options?: ToJsonOptions, parent?: any) => R;

export interface JsonifiedConstructor extends FunctionConstructor {
    __json_schema?: JsonSchema;
}

/**
 * Options for the @JsonField decorator.
 */
export type JsonFieldOptions = {
    visible?: boolean | JsonFieldFunction<boolean>;  // Whether the field is visible or not.
    serializer?: JsonFieldFunction<any>;  // The custom serializer function for the column.
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

    static isPresent(target: unknown): boolean {
        return JsonSchema.get(target) !== undefined;
    }
}