import {CircularReferenceError, Jsonthis, ToJsonOptions} from "./Jsonthis";
import {Json, JsonField, JsonSchema, JsonTraversalState} from "./schema";

describe("Jsonthis class", () => {
    describe("registerGlobalSerializer method", () => {
        function dateSerializer(value: Date): string {
            return value.toISOString();
        }

        it("should register a global serializer for a class", () => {
            @Json
            class User {
                public registeredAt: Date = new Date();
            }

            const user = new User();

            expect(new Jsonthis().toJson(user)).toStrictEqual({
                registeredAt: user.registeredAt
            });

            const jsonthis = new Jsonthis();
            jsonthis.registerGlobalSerializer(Date, dateSerializer);

            expect(jsonthis.toJson(user)).toStrictEqual({
                registeredAt: user.registeredAt.toISOString()
            });
        });

        it("should throw an error when trying to register a serializer for a class that already has one", () => {
            const jsonthis = new Jsonthis();
            jsonthis.registerGlobalSerializer(Date, dateSerializer);

            expect(() => jsonthis.registerGlobalSerializer(Date, dateSerializer))
                .toThrow("Serializer already registered for \"Date\"");
        });
    });

    describe("toJson method", () => {
        describe("with simple data types", () => {
            it("should serialize a string", () => {
                expect(new Jsonthis().toJson("hello word")).toBe("hello word");
            });
            it("should serialize a number", () => {
                expect(new Jsonthis().toJson(123)).toBe(123);
            });
            it("should serialize a BigInt", () => {
                expect(new Jsonthis().toJson(BigInt(9007199254740991))).toBe(BigInt(9007199254740991));
            });
            it("should serialize a boolean", () => {
                expect(new Jsonthis().toJson(true)).toBe(true);
            });
            it("should serialize a Date", () => {
                const date = new Date();
                expect(new Jsonthis().toJson(date)).toBe(date);
            });
            it("should serialize an object", () => {
                expect(new Jsonthis().toJson({value: 123})).toStrictEqual({value: 123});
            });
            it("should serialize an array", () => {
                expect(new Jsonthis().toJson([1, "hello"])).toStrictEqual([1, "hello"]);
            });
        });

        describe("with @Json decorated class", () => {
            function dateSerializer(value: Date): string {
                return value.toISOString();
            }

            it("should serialize simple data types in @Json decorated class", () => {
                @Json
                class User {
                    id: BigInt = BigInt(123);
                    age: number = 25;
                    name: string = "John";
                    deleted: boolean = false;
                    registeredAt: Date = new Date();
                    address: object = {city: "New York", country: "USA"};
                    aliases: string[] = ["John Doe", "Johny"];
                }

                const user = new User();

                expect(new Jsonthis().toJson(user)).toStrictEqual({
                    id: BigInt(123),
                    age: 25,
                    name: "John",
                    deleted: false,
                    registeredAt: user.registeredAt,
                    address: {city: "New York", country: "USA"},
                    aliases: ["John Doe", "Johny"]
                });
            });

            it("should serialize nested @Json decorated class", () => {
                @Json
                class User {
                    id: number;
                    name: string;
                    registeredAt: Date = new Date();
                    friend?: User;

                    constructor(id: number, name: string) {
                        this.id = id;
                        this.name = name;
                    }
                }

                const user = new User(1, "John");
                user.friend = new User(2, "Jane");

                const jsonthis = new Jsonthis();
                jsonthis.registerGlobalSerializer(Date, dateSerializer);

                expect(jsonthis.toJson(user)).toStrictEqual({
                    id: 1,
                    name: "John",
                    registeredAt: user.registeredAt.toISOString(),
                    friend: {
                        id: 2,
                        name: "Jane",
                        registeredAt: user.friend.registeredAt.toISOString()
                    }
                });
            });
        });

        describe("with @JsonField decorated class", () => {
            describe("with visible fields", () => {
                it("should serialize visible fields", () => {
                    class User {
                        id: number = 123;
                        @JsonField(true)
                        name: string = "John";
                    }

                    expect(new Jsonthis().toJson(new User())).toStrictEqual({
                        id: 123,
                        name: "John"
                    });
                });

                it("should not serialize hidden fields", () => {
                    class User {
                        id: number = 123;
                        @JsonField(false)
                        password: string = "s3cret";
                    }

                    expect(new Jsonthis().toJson(new User())).toStrictEqual({
                        id: 123
                    });
                });

                it("should serialize fields with custom visible function", () => {
                    function showEmailOnlyToOwner(email: string, state: JsonTraversalState, opts?: ToJsonOptions): boolean {
                        return opts?.context?.callerId === (state.parent as User)?.id;
                    }

                    class User {
                        id: number = 1;
                        @JsonField({visible: showEmailOnlyToOwner})
                        email: string = "john.doe@gmail.com";
                    }

                    expect(new Jsonthis().toJson(new User(), {context: {callerId: 1}})).toStrictEqual({
                        id: 1,
                        email: "john.doe@gmail.com"
                    });
                    expect(new Jsonthis().toJson(new User(), {context: {callerId: 2}})).toStrictEqual({
                        id: 1
                    });
                });
            });

            describe("with custom serializers", () => {
                it("should serialize fields with custom serializer", () => {
                    function maskEmail(value: string): string {
                        return value.replace(/(?<=.).(?=[^@]*?.@)/g, "*");
                    }

                    class User {
                        id: number = 1;
                        @JsonField({serializer: maskEmail})
                        email: string = "john.doe@gmail.com";
                        @JsonField({serializer: maskEmail})
                        aliases: string[] = ["john.doe-1@gmail.com", "john.doe-2@hotmail.com"];
                    }

                    expect(new Jsonthis().toJson(new User())).toStrictEqual({
                        id: 1,
                        email: "j******e@gmail.com",
                        aliases: ["j********1@gmail.com", "j********2@hotmail.com"]
                    });
                });

                it("should serialize fields with custom context-dependant serializer", () => {
                    function maskEmail(value: string, state: JsonTraversalState, opts?: ToJsonOptions): string {
                        const maskChar = opts?.context?.maskChar || "*";
                        return value.replace(/(?<=.).(?=[^@]*?.@)/g, maskChar);
                    }

                    class User {
                        id: number = 1;
                        @JsonField({serializer: maskEmail})
                        email: string = "john.doe@gmail.com";
                        @JsonField({serializer: maskEmail})
                        aliases: string[] = ["john.doe-1@gmail.com", "john.doe-2@hotmail.com"];
                    }

                    expect(new Jsonthis().toJson(new User())).toStrictEqual({
                        id: 1,
                        email: "j******e@gmail.com",
                        aliases: ["j********1@gmail.com", "j********2@hotmail.com"]
                    });
                    expect(new Jsonthis().toJson(new User(), {context: {maskChar: "-"}})).toStrictEqual({
                        id: 1,
                        email: "j------e@gmail.com",
                        aliases: ["j--------1@gmail.com", "j--------2@hotmail.com"]
                    });
                });
            });
        });

        describe("with options", () => {
            describe("keepNulls option", () => {
                @Json
                class User {
                    id: number = 1;
                    name: string | null = null;
                }

                it("should serialize null values when keepNulls is true", () => {
                    const jsonthis = new Jsonthis({keepNulls: true});
                    expect(jsonthis.toJson(new User())).toStrictEqual({id: 1, name: null});
                });

                it("should skip null values when keepNulls is false", () => {
                    const jsonthis = new Jsonthis({keepNulls: false});
                    expect(jsonthis.toJson(new User())).toStrictEqual({id: 1});
                });
            });

            describe("case option", () => {
                @Json
                class User {
                    id: number = 1;
                    user_name: string = "john-doe";
                    registeredAt: Date = new Date();
                }

                const user = new User();

                it("should serialize with camel casing", () => {
                    expect(new Jsonthis({case: "camel"}).toJson(user)).toStrictEqual({
                        id: 1,
                        userName: "john-doe",
                        registeredAt: user.registeredAt
                    });
                });

                it("should serialize with snake casing", () => {
                    expect(new Jsonthis({case: "snake"}).toJson(user)).toStrictEqual({
                        id: 1,
                        user_name: "john-doe",
                        registered_at: user.registeredAt
                    });
                });

                it("should serialize with pascal casing", () => {
                    expect(new Jsonthis({case: "pascal"}).toJson(user)).toStrictEqual({
                        Id: 1,
                        UserName: "john-doe",
                        RegisteredAt: user.registeredAt
                    });
                });
            });

            describe("circularReferenceSerializer option", () => {
                @Json
                class Node {
                    public value: number;
                    public next?: Node;

                    constructor(value: number) {
                        this.value = value;
                    }
                }

                it("should throw an error when encountering a circular reference without a circularReferenceSerializer", () => {
                    const node1 = new Node(1);
                    const node2 = new Node(2);
                    node2.next = node1;
                    node1.next = node2;

                    const jsonthis = new Jsonthis();
                    expect(() => jsonthis.toJson(node1)).toThrow(CircularReferenceError);
                });

                it("should handle circular references using the provided circularReferenceSerializer", () => {
                    const node1 = new Node(1);
                    const node2 = new Node(2);
                    node2.next = node1;
                    node1.next = node2;

                    const jsonthis = new Jsonthis({
                        circularReferenceSerializer: function (node: Node) {
                            return {"$ref": `$${node.constructor.name}(${node.value})`}
                        }
                    });

                    expect(jsonthis.toJson(node1)).toStrictEqual({
                        value: 1,
                        next: {
                            value: 2,
                            next: {
                                "$ref": "$Node(1)"
                            }
                        }
                    });
                });

                it("should handle circular references using the provided circularReferenceSerializer with Sequelize integration", () => {
                    const node1 = new Node(1);
                    const node2 = new Node(2);
                    node2.next = node1;
                    node1.next = node2;

                    const jsonthis = new Jsonthis({
                        circularReferenceSerializer: function (node: Node) {
                            return {"$ref": `$${node.constructor.name}(${node.value})`}
                        }
                    });

                    // This is a mock of what happens when using Sequelize.
                    jsonthis.registerGlobalSerializer(Node, (node: Node, state: JsonTraversalState, options?: ToJsonOptions) => {
                        const data = Object.assign({}, node);
                        const schema = JsonSchema.get(Node);
                        return (jsonthis as any).traverseJson(state, data, schema, options);
                    });

                    expect(jsonthis.toJson(node1)).toStrictEqual({
                        value: 1,
                        next: {
                            value: 2,
                            next: {
                                "$ref": "$Node(1)"
                            }
                        }
                    });
                });

                it("should not throw CircularReferenceError when encountering a duplicated property", () => {
                    @Json
                    class User {
                        public id: number;
                        public registeredAt: Date;
                        public updatedAt: Date;

                        constructor(id: number) {
                            this.id = id;
                            this.registeredAt = this.updatedAt = new Date();
                        }
                    }

                    expect(() => new Jsonthis().toJson(new User(1))).not.toThrow(CircularReferenceError);
                });
            });
        });
    });
});