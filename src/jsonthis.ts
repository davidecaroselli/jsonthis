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
    public state: JsonTraversalState;
    public ref: any;

    constructor(state: JsonTraversalState, ref: any) {
        super("Circular reference detected");
        this.state = state;
        this.ref = ref;
    }
}

function newTraversalState(): JsonTraversalState {
    return {
        visited: new Set()
    };
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

    private serializeCircularReference(state: JsonTraversalState, value: any, options?: ToJsonOptions): any {
        if (this.options.circularReferenceSerializer)
            return this.options.circularReferenceSerializer(state, value, options);
        throw new CircularReferenceError(state, value);
    }

    /**
     * Convert an object to JSON following the schema defined with Jsonthis decorators.
     * @param target The object to convert.
     * @param options The options for the JSON serialization.
     * @param state The traversal state (useful for chaining toJson() calls in custom serializers).
     */
    toJson(target: any, options?: ToJsonOptions, state?: JsonTraversalState): any {
        if (isNull(target)) return this.options.keepNulls ? null : undefined;
        const schema = JsonSchema.get(target.constructor);

        if (!state) state = newTraversalState();
        return this.traverseJson(state, target, schema, options);
    }

    traverseJson(state: JsonTraversalState, target: any, schema: JsonSchema | undefined, options?: ToJsonOptions): any {
        if (isNull(target)) return this.options.keepNulls ? null : undefined;

        // JsonTraversalState - update visited set
        if (state.visited.has(target))
            return this.serializeCircularReference(state, target, options);
        state.visited.add(target);
        // -----------------------------------

        const customSerializer = this.serializers.get(target.constructor);
        if (customSerializer) return evaluateJsonTraversalFn(customSerializer, state, target, options);

        if (schema === undefined) return target;

        // JsonTraversalState - update parent
        state.parent = target;
        // -----------------------------------

        const json: { [key: string]: any } = {};
        for (const propertyName in target) {
            if (!Object.hasOwn(target, propertyName)) continue;

            const value = target[propertyName];

            const fieldOpts: JsonFieldOptions = schema.definedFields.get(propertyName) || {};
            const visible = evaluateJsonTraversalFn(fieldOpts.visible, state, value, options);
            if (visible === false) continue;

            const key = this.propertyNameToString(propertyName);

            if (isNull(value)) {
                if (!this.options.keepNulls) continue;
                json[key] = null;
            } else {
                const serializer = fieldOpts.serializer;

                if (Array.isArray(value)) {
                    if (serializer)
                        json[key] = value.map(e => evaluateJsonTraversalFn(serializer, state, e, options));
                    else
                        json[key] = value.map(e => this.traverseJson(state, e, JsonSchema.get(e.constructor), options));
                } else if (serializer) {
                    json[key] = evaluateJsonTraversalFn(serializer, state, value, options)
                } else {
                    json[key] = this.traverseJson(state, value, JsonSchema.get(value.constructor), options);
                }
            }
        }

        return json;
    }

    private sequelizeInstall(sequelize: Sequelize) {
        for (const model of sequelize.models) {
            const schema = JsonSchema.getOrCreate(model); // ensure schema is created

            const jsonthis = this;
            model.prototype.toJSON = function (options?: ToJsonOptions): any {
                return jsonthis.traverseJson(newTraversalState(), this.get(), schema, options);
            }

            this.registerGlobalSerializer(model, (state: JsonTraversalState, model: Model, options?: ToJsonOptions) => {
                return jsonthis.traverseJson(state, model.get(), schema, options);
            });
        }

    }
}
