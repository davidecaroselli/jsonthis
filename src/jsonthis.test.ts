import {CircularReferenceError, Jsonthis, ToJsonOptions} from "./Jsonthis";
import {JsonField, JsonSchema, JsonTraversalState} from "./schema";

function sequelize(jsonthis: Jsonthis, ...models: any) {
    for (const model of models) {
        // Define get() function used in sequelizeInstall()
        model.prototype.get = function () {
            return Object.assign({}, this);
        }
    }
    (jsonthis as any).sequelizeInstall(models);
}

type ToJsonFn = (jsonthis: Jsonthis, value: any, options?: ToJsonOptions) => any;

const Jsonthis_toJson: ToJsonFn = function (jsonthis: Jsonthis, value: any, options?: ToJsonOptions): any {
    return jsonthis.toJson(value, options);
}

const model_toJSON: ToJsonFn = function (jsonthis: Jsonthis, value: any, options?: ToJsonOptions): any {
    return value.toJSON(options);
}

describe("Jsonthis class", () => {
    it("should create schema for model classes", () => {
        class User {
        }

        const jsonthis = new Jsonthis({models: [User]});
        expect(JsonSchema.isPresent(User)).toBeTruthy();
    });

    describe.each([
        ["Jsonthis.toJson()", Jsonthis_toJson],
        ["Model.toJSON()", model_toJSON]
    ])("%s method", (_, toJson: ToJsonFn) => {
        describe("with global serializer", () => {
            function dateSerializer(value: Date): string {
                return value.toISOString();
            }

            it("should register a global serializer for a class", () => {
                class User {
                    public registeredAt: Date = new Date();
                }

                const user = new User();

                expect(toJson(new Jsonthis({models: [User]}), user)).toStrictEqual({
                    registeredAt: user.registeredAt
                });

                const jsonthis = new Jsonthis({models: [User]});
                jsonthis.registerGlobalSerializer(Date, dateSerializer);

                expect(toJson(jsonthis, user)).toStrictEqual({
                    registeredAt: user.registeredAt.toISOString()
                });
            });

            it("should throw an error when trying to register a serializer for a class that already has one", () => {
                const jsonthis = new Jsonthis();
                jsonthis.registerGlobalSerializer(Date, dateSerializer);

                expect(() => jsonthis.registerGlobalSerializer(Date, dateSerializer))
                    .toThrow("Serializer already registered for \"Date\"");
            });

            it("should override a global serializer for a class if the override option is set", () => {
                function overridingDateSerializer(value: Date): string {
                    return value.toUTCString();
                }

                class User {
                    public registeredAt: Date = new Date();
                }

                const user = new User();

                const jsonthis = new Jsonthis({models: [User]});

                jsonthis.registerGlobalSerializer(Date, dateSerializer);
                expect(toJson(jsonthis, user)).toStrictEqual({
                    registeredAt: user.registeredAt.toISOString()
                });

                jsonthis.registerGlobalSerializer(Date, overridingDateSerializer, true);
                expect(toJson(jsonthis, user)).toStrictEqual({
                    registeredAt: user.registeredAt.toUTCString()
                });
            });
        });

        describe("with Objects", () => {
            function dateSerializer(value: Date): string {
                return value.toISOString();
            }

            it("should serialize simple data types in Object", () => {
                class User {
                    id: BigInt = 123n;
                    serial: BigInt = 9007199254740992n;
                    age: number = 25;
                    name: string = "John";
                    deleted: boolean = false;
                    registeredAt: Date = new Date();
                    address: object = {city: "New York", country: "USA"};
                    aliases: string[] = ["John Doe", "Johny"];
                }

                const user = new User();

                expect(toJson(new Jsonthis({models: [User]}), user)).toStrictEqual({
                    id: 123,
                    serial: "9007199254740992",
                    age: 25,
                    name: "John",
                    deleted: false,
                    registeredAt: user.registeredAt,
                    address: {city: "New York", country: "USA"},
                    aliases: ["John Doe", "Johny"]
                });
            });

            it("should serialize nested Objects", () => {
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

                const jsonthis = new Jsonthis({models: [User]});
                jsonthis.registerGlobalSerializer(Date, dateSerializer);

                expect(toJson(jsonthis, user)).toStrictEqual({
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

                    expect(toJson(new Jsonthis({models: [User]}), new User())).toStrictEqual({
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

                    expect(toJson(new Jsonthis({models: [User]}), new User())).toStrictEqual({
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

                    expect(toJson(new Jsonthis({models: [User]}), new User(), {context: {callerId: 1}})).toStrictEqual({
                        id: 1,
                        email: "john.doe@gmail.com"
                    });
                    expect(toJson(new Jsonthis({models: [User]}), new User(), {context: {callerId: 2}})).toStrictEqual({
                        id: 1
                    });
                });
            });

            describe("with custom serializers", () => {
                it("should serialize simple data types fields with custom serializer", () => {
                    function intToHex(value: number): string {
                        return '0x' + value.toString(16);
                    }

                    class User {
                        id: number = 1;
                        @JsonField({serializer: intToHex})
                        serial: number = 435297235;
                    }

                    expect(toJson(new Jsonthis({models: [User]}), new User())).toStrictEqual({
                        id: 1,
                        serial: "0x19f21bd3"
                    });
                });

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

                    expect(toJson(new Jsonthis({models: [User]}), new User())).toStrictEqual({
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

                    expect(toJson(new Jsonthis({models: [User]}), new User())).toStrictEqual({
                        id: 1,
                        email: "j******e@gmail.com",
                        aliases: ["j********1@gmail.com", "j********2@hotmail.com"]
                    });
                    expect(toJson(new Jsonthis({models: [User]}), new User(), {context: {maskChar: "-"}})).toStrictEqual({
                        id: 1,
                        email: "j------e@gmail.com",
                        aliases: ["j--------1@gmail.com", "j--------2@hotmail.com"]
                    });
                });
            });
        });

        describe("with keepNulls option", () => {
            class User {
                id: number = 1;
                name: string | null = null;
            }

            it("should serialize null values when keepNulls is true", () => {
                const jsonthis = new Jsonthis({keepNulls: true, models: [User]});
                expect(toJson(jsonthis, new User())).toStrictEqual({id: 1, name: null});
            });

            it("should skip null values when keepNulls is false", () => {
                const jsonthis = new Jsonthis({keepNulls: false, models: [User]});
                expect(toJson(jsonthis, new User())).toStrictEqual({id: 1});
            });
        });

        describe("with case option", () => {
            class User {
                id: number = 1;
                user_name: string = "john-doe";
                registeredAt: Date = new Date();
            }

            const user = new User();

            it("should serialize with camel casing", () => {
                expect(toJson(new Jsonthis({case: "camel", models: [User]}), user)).toStrictEqual({
                    id: 1,
                    userName: "john-doe",
                    registeredAt: user.registeredAt
                });
            });

            it("should serialize with snake casing", () => {
                expect(toJson(new Jsonthis({case: "snake", models: [User]}), user)).toStrictEqual({
                    id: 1,
                    user_name: "john-doe",
                    registered_at: user.registeredAt
                });
            });

            it("should serialize with pascal casing", () => {
                expect(toJson(new Jsonthis({case: "pascal", models: [User]}), user)).toStrictEqual({
                    Id: 1,
                    UserName: "john-doe",
                    RegisteredAt: user.registeredAt
                });
            });
        });

        describe.each([
            ["simple Objects", false],
            ["Sequelize models", true]
        ])("with context on %s", (_, withSequelize) => {
            function contextualMaskEmail(value: string, state: JsonTraversalState, opts?: ToJsonOptions): string {
                const maskChar = opts?.context?.maskChar || "*";
                return value.replace(/(?<=.).(?=[^@]*?.@)/g, maskChar);
            }

            it("should serializer using context", () => {
                class User {
                    id: number;
                    @JsonField({serializer: contextualMaskEmail})
                    email: string = "john.doe@gmail.com"

                    constructor(id: number) {
                        this.id = id;
                    }
                }

                const user = new User(1);

                const jsonthis = new Jsonthis({models: [User]});
                if (withSequelize) sequelize(jsonthis, User);

                expect(toJson(jsonthis, user)).toStrictEqual({
                    id: 1,
                    email: "j******e@gmail.com"
                });

                expect(toJson(jsonthis, user, {context: {maskChar: "-"}})).toStrictEqual({
                    id: 1,
                    email: "j------e@gmail.com"
                });
            });

            it("should pass context to nested objects", () => {
                class User {
                    id: number;
                    @JsonField({serializer: contextualMaskEmail})
                    email: string
                    friend?: User;

                    constructor(id: number, email: string) {
                        this.id = id;
                        this.email = email;
                    }
                }

                const user = new User(1, "john.doe@gmail.com");
                user.friend = new User(2, "bob.doe@hotmail.com");

                const jsonthis = new Jsonthis({models: [User]});
                if (withSequelize) sequelize(jsonthis, User);

                expect(toJson(jsonthis, user)).toStrictEqual({
                    id: 1,
                    email: "j******e@gmail.com",
                    friend: {
                        id: 2,
                        email: "b*****e@hotmail.com"
                    }
                });

                expect(toJson(jsonthis, user, {context: {maskChar: "-"}})).toStrictEqual({
                    id: 1,
                    email: "j------e@gmail.com",
                    friend: {
                        id: 2,
                        email: "b-----e@hotmail.com"
                    }
                });
            });
        });

        describe.each([
            ["simple Objects", false, false],
            ["simple Objects and custom C-REF serializer", false, true],
            ["Sequelize models", true, false],
            ["Sequelize models and custom C-REF serializer", true, true]
        ])("with circular references on %s", (_, withSequelize, withCRSerializer) => {
            function circularReferenceSerializer(ref: any) {
                return {"$ref": `$${ref.constructor.name}(${ref.value || ref.id})`}
            }

            it("with direct circular reference", () => {
                class Node {
                    public value: number;
                    public next?: Node;

                    constructor(value: number) {
                        this.value = value;
                    }
                }

                const node = new Node(1);
                node.next = new Node(2);
                node.next.next = node;

                const jsonthis = new Jsonthis(Object.assign({models: [Node]}, withCRSerializer ? {circularReferenceSerializer} : {}));
                if (withSequelize) sequelize(jsonthis, Node);

                if (withCRSerializer) {
                    expect(() => toJson(jsonthis, node)).not.toThrow(CircularReferenceError);
                    expect(toJson(jsonthis, node)).toStrictEqual({
                        value: 1,
                        next: {
                            value: 2,
                            next: {"$ref": "$Node(1)"}
                        }
                    });
                } else {
                    expect(() => toJson(jsonthis, node)).toThrow(CircularReferenceError);
                }

            });

            it("with nested circular reference", () => {
                class Node {
                    public value: number;
                    public next?: Node;

                    constructor(value: number) {
                        this.value = value;
                    }
                }

                const node = new Node(1);
                node.next = new Node(2);
                node.next.next = new Node(3);
                node.next.next.next = node;

                const jsonthis = new Jsonthis(Object.assign({models: [Node]}, withCRSerializer ? {circularReferenceSerializer} : {}));
                if (withSequelize) sequelize(jsonthis, Node);

                if (withCRSerializer) {
                    expect(() => toJson(jsonthis, node)).not.toThrow(CircularReferenceError);
                    expect(toJson(jsonthis, node)).toStrictEqual({
                        value: 1,
                        next: {
                            value: 2,
                            next: {
                                value: 3,
                                next: {"$ref": "$Node(1)"}
                            }
                        }
                    });
                } else {
                    expect(() => toJson(jsonthis, node)).toThrow(CircularReferenceError);
                }
            });

            it("should be able to serialize a direct duplicated property", () => {
                class User {
                    public id: number;
                    public registeredAt: Date;
                    public updatedAt: Date;

                    constructor(id: number) {
                        this.id = id;
                        this.registeredAt = this.updatedAt = new Date();
                    }
                }

                const user = new User(1);

                const jsonthis = new Jsonthis(Object.assign({models: [User]}, withCRSerializer ? {circularReferenceSerializer} : {}));
                if (withSequelize) sequelize(jsonthis, User);

                expect(() => toJson(jsonthis, user)).not.toThrow(CircularReferenceError);
                expect(toJson(jsonthis, user)).toStrictEqual({
                    id: 1,
                    registeredAt: user.registeredAt,
                    updatedAt: user.updatedAt
                });
            });

            it("should be able to serialize a nested duplicated property", () => {
                const date = new Date();

                class User {
                    public id: number;
                    public registeredAt: Date;
                    public friend?: User;

                    constructor(id: number, date: Date) {
                        this.id = id;
                        this.registeredAt = date;
                    }
                }

                const user = new User(1, date);
                user.friend = new User(2, date);

                const jsonthis = new Jsonthis(Object.assign({models: [User]}, withCRSerializer ? {circularReferenceSerializer} : {}));
                if (withSequelize) sequelize(jsonthis, User);

                expect(() => toJson(jsonthis, user)).not.toThrow(CircularReferenceError);
                expect(toJson(jsonthis, user)).toStrictEqual({
                    id: 1,
                    registeredAt: date,
                    friend: {
                        id: 2,
                        registeredAt: date
                    }
                });
            });

            it("should be able to serialize an Object referenced twice", () => {
                class User {
                    public id: number;
                    public roommate?: User;
                    public friend?: User;

                    constructor(id: number) {
                        this.id = id;
                    }
                }

                const user = new User(1);
                user.roommate = user.friend = new User(2);

                const jsonthis = new Jsonthis(Object.assign({models: [User]}, withCRSerializer ? {circularReferenceSerializer} : {}));
                if (withSequelize) sequelize(jsonthis, User);

                expect(() => toJson(jsonthis, user)).not.toThrow(CircularReferenceError);
                expect(toJson(jsonthis, user)).toStrictEqual({
                    id: 1,
                    roommate: {id: 2},
                    friend: {id: 2}
                });
            });

            it("should be able to serialize an Object referenced twice in different sub-trees", () => {
                class User {
                    public id: number;
                    public roommate?: User;
                    public friend?: User;

                    constructor(id: number) {
                        this.id = id;
                    }
                }

                const user = new User(1);
                user.roommate = new User(2);
                user.friend = new User(3);
                user.roommate.friend = user.friend.friend = new User(4);

                const jsonthis = new Jsonthis(Object.assign({models: [User]}, withCRSerializer ? {circularReferenceSerializer} : {}));
                if (withSequelize) sequelize(jsonthis, User);

                expect(() => toJson(jsonthis, user)).not.toThrow(CircularReferenceError);
                expect(toJson(jsonthis, user)).toStrictEqual({
                    id: 1,
                    roommate: {
                        id: 2,
                        friend: {id: 4}
                    },
                    friend: {
                        id: 3,
                        friend: {id: 4}
                    }
                });
            });
        });

        describe("with maxDepth option", () => {
            class User {
                id: number;
                friend?: User;

                constructor(id: number, friend?: User) {
                    this.id = id;
                    if (friend) this.friend = friend;
                }
            }

            const user = new User(1, new User(2, new User(3, new User(4))));

            it("should serialize to unlimited depth by default", () => {
                const jsonthis = new Jsonthis({models: [User]});
                expect(toJson(jsonthis, user)).toStrictEqual({
                    id: 1,
                    friend: {
                        id: 2,
                        friend: {
                            id: 3,
                            friend: {id: 4}
                        }
                    }
                });
            });

            it("should stop serialization to global maxDepth", () => {
                const jsonthis = new Jsonthis({maxDepth: 2, models: [User]});
                expect(toJson(jsonthis, user)).toStrictEqual({
                    id: 1,
                    friend: {
                        id: 2,
                        friend: {id: 3}
                    }
                });
            });

            it("should stop serialization to field's maxDepth", () => {
                const jsonthis = new Jsonthis({models: [User]});
                expect(toJson(jsonthis, user, {maxDepth: 1})).toStrictEqual({
                    id: 1,
                    friend: {id: 2}
                });
            });

            it("should stop serialization to field's maxDepth over global maxDepth", () => {
                const jsonthis = new Jsonthis({maxDepth: 2, models: [User]});
                expect(toJson(jsonthis, user, {maxDepth: 1})).toStrictEqual({
                    id: 1,
                    friend: {id: 2}
                });
            });
        });
    });

    describe("Jsonthis.toJson() with simple data types", () => {
        it("should serialize a string", () => {
            expect(new Jsonthis().toJson("hello word")).toBe("hello word");
        });
        it("should serialize a number", () => {
            expect(new Jsonthis().toJson(123)).toBe(123);
        });
        it("should serialize a BigInt (number)", () => {
            expect(new Jsonthis().toJson(123n)).toBe(123);
        });
        it("should serialize a BigInt (unsafe)", () => {
            expect(new Jsonthis().toJson(9007199254740992n)).toBe("9007199254740992");
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

    describe("Jsonthis and Javascript JSON.stringify() compatibility", () => {
        it("should default-serialize a non-Jsonthis model", () => {
            class User {
                id: number = 1;
                userName: string = "john-doe";
                @JsonField(false)
                password: string = "s3cret";
            }

            const jsonthis = new Jsonthis({case: "snake"});

            const user = new User();
            expect(jsonthis.toJson(user)).toStrictEqual({"id": 1, "user_name": "john-doe"});
            expect(JSON.stringify(user)).toStrictEqual('{"id":1,"userName":"john-doe","password":"s3cret"}');
        });

        it("should use Jsonthis serialization when a Jsonthis model is passed", () => {
            class User {
                id: number = 1;
                userName: string = "john-doe";
                @JsonField(false)
                password: string = "s3cret";

                toJSON(): any {
                    throw new Error("Method not implemented.");
                }
            }

            const jsonthis = new Jsonthis({
                case: "snake",
                models: [User]
            });

            const user = new User();
            expect(jsonthis.toJson(user)).toStrictEqual({"id": 1, "user_name": "john-doe"});
            expect(user.toJSON()).toStrictEqual({"id": 1, "user_name": "john-doe"});
            expect(JSON.stringify(user)).toStrictEqual('{"id":1,"user_name":"john-doe"}');
        });
    });
});