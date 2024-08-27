import {camelCase, pascalCase, snakeCase} from "case-anything";
import {
    evaluateJsonTraversalFn,
    JsonFieldOptions,
    JsonSchema,
    JsonTraversalFn,
    JsonTraversalState,
    VisitMap
} from "./schema";


function isNull(value: any): boolean {
    return value === null || value === undefined;
}

/**
 * Options for the Jsonthis constructor.
 */
export type JsonthisOptions = {
    keepNulls?: boolean;  // Whether to keep null values or not (default is false).
    case?: "camel" | "snake" | "pascal";  // The case to use for field names, default is to keep field name as is.
    sequelize?: /* Sequelize */ any; // Install Jsonthis to this Sequelize instance.
    circularReferenceSerializer?: JsonTraversalFn<any>; // The custom serializer function for circular references, default it to throw an error.
    maxDepth?: number; // The maximum depth to traverse the object, default is unlimited.
    models?: Function[]; // The model classes to install Jsonthis' toJSON() method.
    transformBigInt?: boolean; // Whether to transform BigInt values to strings or not (default is true).
}

/**
 * Options for the toJson() method.
 */
export type ToJsonOptions = {
    context?: any; // The user-defined context object to pass to the serializers.
    maxDepth?: number; // The maximum depth to traverse the object, default is the global maxDepth in JsonthisOptions.
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

        if (this.options.models) {
            const self = this;

            for (const model of this.options.models) {
                const schema = JsonSchema.getOrCreate(model);
                model.prototype.toJSON = function (options?: ToJsonOptions) {
                    return self.toJson(this, options, undefined, schema);
                }
            }
        }

        if (this.options.sequelize)
            this.sequelizeInstall(this.options.sequelize.models);
    }

    /**
     * Register a global serializer for a class.
     * @param target The class to register the serializer for.
     * @param serializer The serializer function.
     * @param allowOverride Whether to allow overriding an existing serializer (default is false).
     */
    registerGlobalSerializer(target: Function, serializer: JsonTraversalFn<any>, allowOverride: boolean = false): void {
        if (this.serializers.has(target) && !allowOverride)
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
            visited: new VisitMap(),
        }

        // If this is the root element, add it to the visited set
        if (!state.parent)
            state.visited.visit(target);

        // Before traversing the object, check if it has a custom serializer...
        const schemaSerializer = schema?.serializer;
        if (schemaSerializer) return evaluateJsonTraversalFn(schemaSerializer, this, state, target, options);

        const customSerializer = this.serializers.get(target.constructor);
        if (customSerializer) return evaluateJsonTraversalFn(customSerializer, this, state, target, options);

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
            const visible = evaluateJsonTraversalFn(field.visible, this, state, value, options);
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

        if (!serializer) {
            const [result, trivial] = this.serializeTrivialValue(value);
            if (trivial) return result;
        }

        try {
            state.visited.dive();

            const maxDepth = options?.maxDepth || this.options.maxDepth || Infinity;
            if (state.visited.depth > maxDepth)
                return undefined;

            // Check for circular references
            if (state.visited.visit(value)) {
                if (this.options.circularReferenceSerializer)
                    return evaluateJsonTraversalFn(this.options.circularReferenceSerializer, this, state, value, options);
                throw new CircularReferenceError(value, state);
            }

            if (serializer)
                return evaluateJsonTraversalFn(serializer, this, state, value, options);
            else
                return this.toJson(value, options, state!);
        } finally {
            state.visited.arise();
        }
    }

    private serializeTrivialValue(value: any): [any, boolean] {
        switch (typeof value) {
            case "object":
                if ('toJSON' in value && typeof value.toJSON === "function" && !JsonSchema.isPresent(value.constructor))
                    return [value, true]
                else
                    return [value, false];
            case "bigint":
                if (this.options.transformBigInt === false)
                    return [value, true];
                else if (value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER)
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

    private sequelizeInstall(models: Iterable<any>) {
        for (const model of models) {
            const schema = JsonSchema.get(model);

            this.registerGlobalSerializer(model, (jsonthis: Jsonthis, state: JsonTraversalState, value: /* Model */ any, options?: ToJsonOptions) => {
                return jsonthis.toJson(value.get(), options, state, schema);
            });

            const jsonthis = this;
            model.prototype.toJSON = function (options?: ToJsonOptions) {
                return jsonthis.toJson(this, options);
            }
        }
    }
}
