import {camelCase, snakeCase, pascalCase} from "case-anything";
import {Model, Sequelize} from "@sequelize/core";

export type JsonFieldFunction<R> = (value: any, context?: any, parent?: any) => R;

function evaluateJsonFieldFn<R>(fn: R | JsonFieldFunction<R> | undefined, value: any, context?: any, parent?: any): R | undefined {
    return (typeof fn === "function") ? (fn as JsonFieldFunction<R>)(value, context, parent) : fn;
}

export type JsonFieldOptions = {
    visible?: boolean | JsonFieldFunction<boolean>;  // Whether the field is visible or not.
    serializer?: JsonFieldFunction<any>;  // The custom serializer function for the column.
}

interface JsonifiedConstructor extends FunctionConstructor {
    __json_schema?: JsonSchema;
}

class JsonSchema {
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

export const Json = function (target: Object): void {
    JsonSchema.getOrCreate(target);
}

export const JsonField = function (options?: boolean | JsonFieldOptions): Function {
    return function JsonField(target: Object, propertyName: PropertyKey): void {
        if (options === undefined) options = {};
        if (typeof options === "boolean") options = {visible: options};

        const key = propertyName.toString();
        const schema = JsonSchema.getOrCreate(target.constructor);
        schema.definedFields.set(key, options);
    }
}

function isNull(value: any): boolean {
    return value === null || value === undefined;
}

export type JsonthisOptions = {
    keepNulls?: boolean;  // Whether to keep null values or not (default is false).
    case?: "camel" | "snake" | "pascal";  // The case to use for field names, default is to keep field name as is.
    sequelize?: Sequelize; // Install Jsonthis to this Sequelize instance.
}

export class Jsonthis {
    private readonly options: JsonthisOptions;
    private readonly serializers: Map<Function, JsonFieldFunction<any>> = new Map();

    constructor(options?: JsonthisOptions) {
        this.options = options || {};

        if (this.options.sequelize)
            this.sequelizeInstall(this.options.sequelize);
    }

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

    toJson(target: any, context?: any): any {
        if (isNull(target)) return this.options.keepNulls ? null : undefined;
        const schema = JsonSchema.get(target.constructor);
        return this.toJsonWithSchema(target, schema, context);
    }

    toJsonWithSchema(target: any, schema?: JsonSchema, context?: any, parent?: any): any {
        if (isNull(target)) return this.options.keepNulls ? null : undefined;

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
                        json[key] = value.map(e => this.toJson(e, context));
                } else if (serializer) {
                    json[key] = evaluateJsonFieldFn(serializer, value, context, target)
                } else {
                    json[key] = this.toJson(value, context);
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
