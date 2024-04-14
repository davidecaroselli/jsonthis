import {camelCase, pascalCase, snakeCase} from "case-anything";
import {Model, Sequelize} from "@sequelize/core";
import {JsonFieldFunction, JsonFieldOptions, JsonSchema} from "./schema";

function evaluateJsonFieldFn<R>(fn: R | JsonFieldFunction<R> | undefined, value: any, context?: any, parent?: any): R | undefined {
    return (typeof fn === "function") ? (fn as JsonFieldFunction<R>)(value, context, parent) : fn;
}

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
    circularReferenceSerializer?: JsonFieldFunction<any>; // The custom serializer function for circular references, default it to throw an error.
}

export class CircularReferenceError extends Error {
    public parent: any;
    public ref: any;

    constructor(ref: any, parent: any) {
        super("Circular reference detected");
        this.parent = parent;
        this.ref = ref;
    }
}

/**
 * The main class to convert objects to JSON.
 */
export class Jsonthis {
    private readonly options: JsonthisOptions;
    private readonly serializers: Map<Function, JsonFieldFunction<any>> = new Map();

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
    registerGlobalSerializer(target: Function, serializer: JsonFieldFunction<any>): void {
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

    private serializeCircularReference(value: any, context?: any, parent?: any): any {
        if (this.options.circularReferenceSerializer)
            return this.options.circularReferenceSerializer(value, context, parent);
        throw new CircularReferenceError(value, parent);
    }

    /**
     * Convert an object to JSON following the schema defined with Jsonthis decorators.
     * @param target The object to convert.
     * @param context An optional user-defined context object to pass to the serializers.
     */
    toJson(target: any, context?: any): any {
        if (isNull(target)) return this.options.keepNulls ? null : undefined;
        const schema = JsonSchema.get(target.constructor);
        return this.toJsonWithSchema(target, schema, context);
    }

    private toJsonWithSchema(target: any, schema?: JsonSchema, context?: any, parent?: any, visited?: Set<any>): any {
        if (isNull(target)) return this.options.keepNulls ? null : undefined;
        if (!visited) visited = new Set();

        if (visited.has(target)) return this.serializeCircularReference(target, context, parent);
        visited.add(target);

        const customSerializer = this.serializers.get(target.constructor);
        if (customSerializer) return customSerializer(target, context, parent);
        if (schema === undefined) return target;

        const json: { [key: string]: any } = {};
        for (const propertyName in target) {
            if (!Object.hasOwn(target, propertyName)) continue;

            const value = target[propertyName];

            const fieldOpts: JsonFieldOptions = schema.definedFields.get(propertyName) || {};
            const visible = evaluateJsonFieldFn(fieldOpts.visible, value, context, target);
            if (visible === false) continue;

            const key = this.propertyNameToString(propertyName);

            if (isNull(value)) {
                if (!this.options.keepNulls) continue;
                json[key] = null;
            } else {
                const serializer = fieldOpts.serializer;

                if (Array.isArray(value)) {
                    if (serializer)
                        json[key] = value.map(e => evaluateJsonFieldFn(serializer, e, context, target));
                    else
                        json[key] = value.map(e => this.toJsonWithSchema(e, JsonSchema.get(e.constructor), context, target, visited));
                } else if (serializer) {
                    json[key] = evaluateJsonFieldFn(serializer, value, context, target)
                } else {
                    json[key] = this.toJsonWithSchema(value, JsonSchema.get(value.constructor), context, target, visited);
                }
            }
        }

        return json;
    }

    private sequelizeInstall(sequelize: Sequelize) {
        for (const model of sequelize.models) {
            const schema = JsonSchema.getOrCreate(model); // ensure schema is created

            const jsonthis = this;
            model.prototype.toJSON = function (context?: any): any {
                return jsonthis.toJsonWithSchema(this.get(), schema, context);
            }

            this.registerGlobalSerializer(model, (model: Model, context?: any, parent?: any) => {
                return jsonthis.toJsonWithSchema(model.get(), schema, context, parent);
            });
        }

    }
}
