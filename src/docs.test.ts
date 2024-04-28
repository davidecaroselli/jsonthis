import timemachine from "timemachine";
import {JsonField, JsonTraversalState} from "./schema";
import {Jsonthis, ToJsonOptions} from "./jsonthis";

timemachine.config({
    dateString: '2024-04-27T17:03:52.158Z'
});

const Console = {
    _results: [] as any[],

    log: console.log,

    drain: function (): any[] {
        const results = ([] as any[]).concat(Console._results);
        Console._results.length = 0;
        return results;
    }
}

console.log = function (message?: any, ...optionalParams: any[]): void {
    Console._results.push(message);
    for (const param of optionalParams)
        Console._results.push(param);
    Console.log(message, ...optionalParams);
};

function test(fn: () => any, ...expected: any): () => void {
    return () => {
        fn();
        const results = Console.drain();
        expect(results).toStrictEqual(expected);
    }
}

describe("README.md", () => {
    it("Getting Started", test(() => {
            class User {
                id: number;
                email: string;
                @JsonField(false)  // visible=false - the "password" property will not be included in the JSON output
                password: string;
                registeredAt: Date = new Date();

                constructor(id: number, email: string, password: string) {
                    this.id = id;
                    this.email = email;
                    this.password = password;
                }

                declare toJSON: () => any;
            }

            const user = new User(1, "john.doe@gmail.com", "s3cret");

            const jsonthis = new Jsonthis({models: [User]});
            console.log(user.toJSON());
            // {
            //   id: 1,
            //   email: 'john.doe@gmail.com',
            //   registeredAt: 2024-04-27T17:03:52.158Z
            // }
        },
        {id: 1, email: 'john.doe@gmail.com', registeredAt: new Date()}
    ));

    describe("Conditional visibility", () => {
        it("with simple example", test(() => {
                function showEmailOnlyToOwner(jsonthis: Jsonthis, state: JsonTraversalState, value: string, options?: ToJsonOptions): boolean {
                    return options?.context?.callerId === (state.parent as User)?.id;
                }

                class User {
                    id: number;
                    @JsonField({visible: showEmailOnlyToOwner})
                    email: string;
                    friend?: User;

                    constructor(id: number, email: string) {
                        this.id = id;
                        this.email = email;
                    }

                    declare toJSON: () => any;
                }

                const user = new User(1, "john.doe@gmail.com");

                const jsonthis = new Jsonthis({models: [User]});
                console.log(jsonthis.toJson(user, {context: {callerId: 1}}));
                // { id: 1, email: 'john.doe@gmail.com' }

                console.log(jsonthis.toJson(user, {context: {callerId: 2}}));
                // { id: 1 }
            },
            {id: 1, email: 'john.doe@gmail.com'}, {id: 1}
        ));

        it("with nested objects", test(() => {
                function showEmailOnlyToOwner(jsonthis: Jsonthis, state: JsonTraversalState, value: string, options?: ToJsonOptions): boolean {
                    return options?.context?.callerId === (state.parent as User)?.id;
                }

                class User {
                    id: number;
                    @JsonField({visible: showEmailOnlyToOwner})
                    email: string;
                    friend?: User;

                    constructor(id: number, email: string) {
                        this.id = id;
                        this.email = email;
                    }

                    declare toJSON: () => any;
                }

                // ------------------

                const user = new User(1, "john.doe@gmail.com");
                user.friend = new User(2, "jane.doe@gmail.com");

                const jsonthis = new Jsonthis({models: [User]});
                console.log(jsonthis.toJson(user, {context: {callerId: 1}}));
                // { id: 1, email: 'john.doe@gmail.com', friend: { id: 2 } }

                console.log(jsonthis.toJson(user, {context: {callerId: 2}}));
                // { id: 1, friend: { id: 2, email: 'jane.doe@gmail.com' } }
            },
            {id: 1, email: 'john.doe@gmail.com', friend: {id: 2}}, {id: 1, friend: {id: 2, email: 'jane.doe@gmail.com'}}
        ));
    });

    describe("Customizing Serialization", () => {
        it("Change Property Name Casing", test(() => {
                class User {
                    id: number = 123;
                    user_name: string = "john-doe";
                    registeredAt: Date = new Date();

                    declare toJSON: () => any;
                }

                const user = new User();

                new Jsonthis({models: [User]});
                console.log(user.toJSON());
                // { id: 123, user_name: 'john-doe', registeredAt: 2024-04-27T17:03:52.158Z }

                new Jsonthis({case: "camel", models: [User]});
                console.log(user.toJSON());
                // { id: 123, userName: 'john-doe', registeredAt: 2024-04-27T17:03:52.158Z }

                new Jsonthis({case: "snake", models: [User]});
                console.log(user.toJSON());
                // { id: 123, user_name: 'john-doe', registered_at: 2024-04-27T17:03:52.158Z }

                new Jsonthis({case: "pascal", models: [User]});
                console.log(user.toJSON());
                // { Id: 123, UserName: 'john-doe', RegisteredAt: 2024-04-27T17:03:52.158Z }
            },
            {id: 123, user_name: 'john-doe', registeredAt: new Date()},
            {id: 123, userName: 'john-doe', registeredAt: new Date()},
            {id: 123, user_name: 'john-doe', registered_at: new Date()},
            {Id: 123, UserName: 'john-doe', RegisteredAt: new Date()}
        ));

        it("Global Serializer", test(() => {
                function dateSerializer(value: Date): string {
                    return value.toUTCString();
                }

                class User {
                    id: number = 1;
                    registeredAt: Date = new Date();

                    declare toJSON: () => any;
                }

                const jsonthis = new Jsonthis({models: [User]});
                jsonthis.registerGlobalSerializer(new Date().constructor /* Date */, dateSerializer);

                const user = new User();
                console.log(user.toJSON());
                // { id: 1, registeredAt: 'Sat, 27 Apr 2024 17:03:52 GMT' }
            },
            {id: 1, registeredAt: 'Sat, 27 Apr 2024 17:03:52 GMT'}
        ));

        it("Field-Specific Serializer", test(() => {
                function maskEmail(value: string): string {
                    return value.replace(/(?<=.).(?=[^@]*?.@)/g, "*");
                }

                class User {
                    id: number = 1;
                    @JsonField({serializer: maskEmail})
                    email: string = "john.doe@gmail.com";

                    declare toJSON: () => any;
                }

                const jsonthis = new Jsonthis({models: [User]});

                const user = new User();
                console.log(user.toJSON());
                // { id: 1, email: 'j******e@gmail.com' }
            },
            {id: 1, email: 'j******e@gmail.com'}
        ));

        it("Contextual Field-Specific Serializer", test(() => {
                function maskEmail(value: string, options?: ToJsonOptions): string {
                    return value.replace(/(?<=.).(?=[^@]*?.@)/g, options?.context?.maskChar || "*");
                }

                class User {
                    id: number = 1;
                    @JsonField({serializer: maskEmail})
                    email: string = "john.doe@gmail.com";

                    declare toJSON: () => any;
                }

                const jsonthis = new Jsonthis({models: [User]});

                const user = new User();
                console.log(jsonthis.toJson(user, {context: {maskChar: "-"}}));
                // { id: 1, email: 'j------e@gmail.com' }
            },
            {id: 1, email: 'j------e@gmail.com'}
        ));

        describe("Limit Serialization Depth", () => {
            it("from Jsonthis", test(() => {
                    class User {
                        id: number;
                        name: string;
                        friend?: User;

                        constructor(id: number, name: string) {
                            this.id = id;
                            this.name = name;
                        }

                        declare toJSON: () => any;
                    }

                    const user = new User(1, "John");
                    user.friend = new User(2, "Jane");
                    user.friend.friend = new User(3, "Bob");

                    const jsonthis = new Jsonthis({maxDepth: 1, models: [User]});

                    console.log(user.toJSON());
                    // { id: 1, name: 'John', friend: { id: 2, name: 'Jane' } }
                },
                {id: 1, name: 'John', friend: {id: 2, name: 'Jane'}}
            ));

            it("from toJson()", test(() => {
                    class User {
                        id: number;
                        name: string;
                        friend?: User;

                        constructor(id: number, name: string) {
                            this.id = id;
                            this.name = name;
                        }

                        declare toJSON: () => any;
                    }

                    const user = new User(1, "John");
                    user.friend = new User(2, "Jane");
                    user.friend.friend = new User(3, "Bob");

                    // --------------------

                    const jsonthis = new Jsonthis({models: [User]});

                    console.log(jsonthis.toJson(user, {maxDepth: 1}));
                    // { id: 1, name: 'John', friend: { id: 2, name: 'Jane' } }
                },
                {id: 1, name: 'John', friend: {id: 2, name: 'Jane'}}
            ));
        });
    });

    it("Circular References", test(() => {
            function serializeCircularReference(value: any): any {
                return {$ref: `$${value.constructor.name}(${value.id})`};
            }

            class User {
                id: number;
                name: string;
                friend?: User;

                constructor(id: number, name: string) {
                    this.id = id;
                    this.name = name;
                }

                declare toJSON: () => any;
            }

            const jsonthis = new Jsonthis({models: [User], circularReferenceSerializer: serializeCircularReference});

            const user = new User(1, "John");
            user.friend = new User(2, "Jane");
            user.friend.friend = user;

            console.log(user.toJSON());
            // {
            //   id: 1,
            //   name: 'John',
            //   friend: { id: 2, name: 'Jane', friend: { '$ref': '$User(1)' } }
            // }
        },
        {
            id: 1,
            name: 'John',
            friend: {id: 2, name: 'Jane', friend: {'$ref': '$User(1)'}}
        }
    ));
});