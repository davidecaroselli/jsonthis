import {camelCase, pascalCase, snakeCase} from "case-anything";
import {Model, Sequelize} from "@sequelize/core";
import {JsonTraversalState, JsonTraversalFn, JsonFieldOptions, JsonSchema, evaluateJsonTraversalFn} from "./schema";


function isNull(value: any): boolean {
    return value === null || value === undefined;
}

/**
 * Options for the Jsonthis constructor.
 */
export type JsonthisOptions = {
    keepNulls?: boolean;  // Whether to keep null values or not (default is false).
    case?: "camel" | "snake" | "pascal";  // The case to use for field names, default is to keep field name as is.
    sequelize?: Sequelize; // Install Jsonthis to this Sequelize instance.
    circularReferenceSerializer?: JsonTraversalFn<any>; // The custom serializer function for circular references, default it to throw an error.
}

/**
 * Options for the toJson() method.
 */
export type ToJsonOptions = {
    context?: any; // The user-defined context object to pass to the serializers.
}

export class CircularReferenceError extends Error {
    public ref: any;
    public state: JsonTraversalState;

    constructor(ref: any, state: JsonTraversalState) {
        super("Circular reference detected");
        this.ref = ref;
        this.state = state;
    }
}

/**
 * The main class to convert objects to JSON.
 */
export class Jsonthis {
    private readonly options: JsonthisOptions;
    private readonly serializers: Map<Function, JsonTraversalFn<any>> = new Map();

    constructor(options?: JsonthisOptions) {
        this.options = options || {};

        if (this.options.sequelize)
            this.sequelizeInstall(this.options.sequelize);
    }

    /**
     * Register a global serializer for a class.
     * @param target The class to register the serializer for.
     * @param serializer The serializer function.
     */
    registerGlobalSerializer(target: Function, serializer: JsonTraversalFn<any>): void {
        if (this.serializers.has(target))
            throw new Error(`Serializer already registered for "${target.name}"`);
        this.serializers.set(target, serializer);
    }

    private propertyNameToString(name: PropertyKey): string {
        const value = name.toString();
        switch (this.options.case) {
            case "camel":
                return camelCase(value);
            case "snake":
                return snakeCase(value);
            case "pascal":
                return pascalCase(value);
            default:
                return value;
        }
    }

    /**
     * Convert an object to JSON following the schema defined with Jsonthis decorators.
     * @param target The object to convert.
     * @param options The options for the JSON serialization.
     * @param state The traversal state (useful for chaining toJson() calls in custom serializers).
     * @param schema The schema to use for the serialization, by default is the schema of the target object computed with JsonSchema.get().
     */
    toJson(target: any, options?: ToJsonOptions, state?: JsonTraversalState, schema?: JsonSchema): any {
        // Special cases (null or array)
        if (isNull(target)) return this.options.keepNulls ? null : undefined;
        if (Array.isArray(target)) return target.map(e => this.toJson(e, options, state, schema));

        // Ensure we have a schema and a state
        if (!schema) schema = JsonSchema.get(target.constructor);
        if (!state) state = {
            visited: new Set()
        };

        // If this is the root element, add it to the visited set
        if (state.visited.size === 0)
            state.visited.add(target);

        // Before traversing the object, check if it has a custom serializer...
        const customSerializer = this.serializers.get(target.constructor);
        if (customSerializer) return evaluateJsonTraversalFn(customSerializer, target, state, options);

        // ...or is a trivial type to serialize
        const [value, trivial] = this.serializeTrivialValue(target);
        if (trivial) return value;

        // Traverse the object
        state.parent = target;

        const json: { [key: string]: any } = {};
        for (const propertyName in target) {
            if (!Object.hasOwn(target, propertyName)) continue;

            const value = target[propertyName];
            const field: JsonFieldOptions = schema?.definedFields.get(propertyName) || {};

            // Check if the field is visible
            const visible = evaluateJsonTraversalFn(field.visible, value, state, options);
            if (visible === false) continue;

            // Begin value serialization
            const key = this.propertyNameToString(propertyName);
            const serializer = field.serializer || this.serializers.get(value?.constructor)

            const serializedValue = this.serialize(value, state, serializer, options);
            if (serializedValue !== undefined)
                json[key] = serializedValue;
        }

        return json;
    }

    private serialize(value: any, state: JsonTraversalState, serializer?: JsonTraversalFn<any>, options?: ToJsonOptions): any {
        if (isNull(value)) return this.options.keepNulls ? null : undefined;
        if (Array.isArray(value)) return value.map(e => this.serialize(e, state, serializer, options) || null);

        // Check for circular references
        // TODO: remove hack on date
        if (typeof value === "object" && !(value instanceof Date)) {
            if (state.visited.has(value)) {
                if (this.options.circularReferenceSerializer)
                    return this.options.circularReferenceSerializer(value, state);
                throw new CircularReferenceError(value, state);
            }
            state.visited.add(value);
        }

        if (serializer) return evaluateJsonTraversalFn(serializer, value, state, options);

        const [result, trivial] = this.serializeTrivialValue(value);
        if (trivial)
            return result;
        else
            return this.toJson(value, options, state!);
    }

    private serializeTrivialValue(value: any): [any, boolean] {
        switch (typeof value) {
            case "object":
                if ('toJSON' in value && typeof value.toJSON === "function")
                    return [value, true]
                else
                    return [value, false];
            case "bigint":
                if (value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER)
                    return [value.toString(), true];
                else
                    return [Number(value), true];
            case "symbol":
            case "function":
                return [undefined, true];
            case "string":
            case "number":
            case "boolean":
            default:
                return [value, true];
        }

    }

    private sequelizeInstall(sequelize: Sequelize) {
        for (const model of sequelize.models) {
            const schema = JsonSchema.get(model);

            this.registerGlobalSerializer(model, (model: Model, state: JsonTraversalState, options?: ToJsonOptions) => {
                return this.toJson(model.get(), options, state, schema);
            });
        }

    }
}
