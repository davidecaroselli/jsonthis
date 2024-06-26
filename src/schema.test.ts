import {JsonField, JsonSchema} from "./schema";

describe("JsonSchema class", () => {
    describe("getOrCreate() method", () => {
        class User {
        }

        it("should return a new instance of JsonSchema", () => {
            const schema = JsonSchema.getOrCreate(User);
            expect(schema).toBeDefined();
            expect(schema).toBeInstanceOf(JsonSchema);
            expect(schema.definedFields.size).toBe(0);
        });
    });

    describe("get() method", () => {
        class User {
        }

        it("should return undefined if schema is not present", () => {
            const schema = JsonSchema.get(User);
            expect(schema).toBeUndefined();
        });

        it("should return schema if present", () => {
            const schema = JsonSchema.getOrCreate(User);
            expect(schema).toBeDefined();
            expect(schema).toBeInstanceOf(JsonSchema);
            expect(schema.definedFields.size).toBe(0);

            const schema2 = JsonSchema.get(User);
            expect(schema2).toBeDefined();
            expect(schema2).toBeInstanceOf(JsonSchema);
            expect(schema2!.definedFields.size).toBe(0);
        });
    });

    describe("isPresent() method", () => {
        class User {
        }

        it("should return false if schema is not present", () => {
            expect(JsonSchema.isPresent(User)).toBeFalsy();
        });

        it("should return true if schema is present", () => {
            JsonSchema.getOrCreate(User);  // Force schema creation
            expect(JsonSchema.isPresent(User)).toBeTruthy();
        });
    });
});

describe("@JsonField decorator", () => {
    describe("with options as boolean", () => {
        it("should set visibility to true when options is true", () => {
            class User {
                @JsonField(true)
                public name: string = "John Doe";
            }

            const schema = JsonSchema.getOrCreate(User);
            const fieldOptions = schema.definedFields.get('name');

            expect(fieldOptions).toBeDefined();
            expect(fieldOptions!.visible).toBe(true);
        });

        it("should set visibility to false when options is false", () => {
            class User {
                @JsonField(false)
                public name: string = "John Doe";
            }

            const schema = JsonSchema.getOrCreate(User);
            const fieldOptions = schema.definedFields.get('name');

            expect(fieldOptions).toBeDefined();
            expect(fieldOptions!.visible).toBe(false);
        });
    });

    describe("with options as JsonFieldOptions", () => {
        it("should set visibility and serializer when provided", () => {
            const serializer = (value: any) => value.toString();

            class User {
                @JsonField({visible: false, serializer: serializer})
                public age: number = 25;
            }

            const schema = JsonSchema.getOrCreate(User);
            const fieldOptions = schema.definedFields.get('age');

            expect(fieldOptions).toBeDefined();
            expect(fieldOptions!.visible).toBe(false);
            expect(fieldOptions!.serializer).toBe(serializer);
        });

        it("should set visibility to true and serializer to undefined when not provided", () => {
            class User {
                @JsonField({})
                public age: number = 25;
            }

            const schema = JsonSchema.getOrCreate(User);
            const fieldOptions = schema.definedFields.get('age');

            expect(fieldOptions).toBeDefined();
            expect(fieldOptions!.visible).toBe(true);
            expect(fieldOptions!.serializer).toBeUndefined();
        });

        it("should set visibility to function when provided", () => {
            const isVisible = (value: any) => value > 18;

            class User {
                @JsonField({visible: isVisible})
                public age: number = 25;
            }

            const schema = JsonSchema.getOrCreate(User);
            const fieldOptions = schema.definedFields.get('age');

            expect(fieldOptions).toBeDefined();
            expect(fieldOptions!.visible).toBe(isVisible);
        });
    });

    describe("without options", () => {
        it("should set visibility to true and serializer to undefined", () => {
            class User {
                @JsonField()
                public age: number = 25;
            }

            const schema = JsonSchema.getOrCreate(User);
            const fieldOptions = schema.definedFields.get('age');

            expect(fieldOptions).toBeDefined();
            expect(fieldOptions!.visible).toBe(true);
            expect(fieldOptions!.serializer).toBeUndefined();
        });
    });
});