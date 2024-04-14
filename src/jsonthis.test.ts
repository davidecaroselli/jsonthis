import {Json, JsonField, Jsonthis, JsonthisOptions} from "./Jsonthis";

test("serialize simple data types", () => {
    const jsonthis = new Jsonthis({keepNulls: true});

    expect(jsonthis.toJson("hello word")).toBe("hello word");
    expect(jsonthis.toJson(123)).toBe(123);
    expect(jsonthis.toJson(BigInt(9007199254740991))).toBe(BigInt(9007199254740991));
    expect(jsonthis.toJson(true)).toBe(true);
    expect(jsonthis.toJson(undefined)).toBe(null);
    expect(jsonthis.toJson(null)).toBe(null);

    const date = new Date();
    expect(jsonthis.toJson(date)).toBe(date);
    expect(jsonthis.toJson({value: 123})).toStrictEqual({value: 123});
    expect(jsonthis.toJson([1, "hello"])).toStrictEqual([1, "hello"]);
})

test("serialize null and undefined values", () => {
    const knJsonthis = new Jsonthis({keepNulls: true});
    expect(knJsonthis.toJson(undefined)).toStrictEqual(null);
    expect(knJsonthis.toJson(null)).toStrictEqual(null);

    const skJsonthis = new Jsonthis({keepNulls: false});
    expect(skJsonthis.toJson(undefined)).toStrictEqual(undefined);
    expect(skJsonthis.toJson(null)).toStrictEqual(undefined);
})

test("serialize simple data types in @Json object", () => {
    @Json
    class User {
        id: number = 123;
        name: string = "John";
        deleted: boolean = false;
        registeredAt: Date = new Date();
        deletedAt: Date | null = null;
    }

    const user = new User();

    expect(new Jsonthis().toJson(user)).toStrictEqual({
        id: 123,
        name: "John",
        deleted: false,
        registeredAt: user.registeredAt
    });

    expect(new Jsonthis({keepNulls: true}).toJson(user)).toStrictEqual({
        id: 123,
        name: "John",
        deleted: false,
        deletedAt: null,
        registeredAt: user.registeredAt
    });
})

test("serialize nested @Json objects", () => {
    @Json
    class User {
        id: number;
        name: string;
        friend?: User;

        constructor(id: number, name: string) {
            this.id = id;
            this.name = name;
        }
    }

    const user = new User(1, "John");
    user.friend = new User(2, "Jane");

    expect(new Jsonthis().toJson(user)).toStrictEqual({
        id: 1,
        name: "John",
        friend: {
            id: 2,
            name: "Jane"
        }
    });
})

test("serialize with custom global serializers", () => {
    @Json
    class User {
        id: number = 123;
        registeredAt: Date = new Date();
    }

    const user = new User();
    const jsonthis = new Jsonthis();

    expect(jsonthis.toJson(user)).toStrictEqual({
        id: 123,
        registeredAt: user.registeredAt
    });

    jsonthis.registerGlobalSerializer(Date, (value: Date) => value.toISOString());

    expect(jsonthis.toJson(user)).toStrictEqual({
        id: 123,
        registeredAt: user.registeredAt.toISOString()
    });
})

test("serialize with custom field serializers", () => {
    function maskEmail(value: string): string {
        return value.replace(/(?<=.).(?=[^@]*?.@)/g, "*");
    }

    @Json
    class User {
        id: number = 123;
        @JsonField({serializer: maskEmail})
        email: string = "john.doe@gmail.com";
        @JsonField({serializer: maskEmail})
        aliases: string[] = ["john.doe-1@gmail.com", "john.doe-2@hotmail.com"];
    }

    const user = new User();
    expect(new Jsonthis().toJson(user)).toStrictEqual({
        id: 123,
        email: "j******e@gmail.com",
        aliases: ["j********1@gmail.com", "j********2@hotmail.com"]
    });
});

test("serialize with custom context-dependant field serializers", () => {
    type MaskEmailContext = {
        maskChar?: string;
    }

    function maskEmail(value: string, context?: MaskEmailContext): string {
        const maskChar = context?.maskChar || "*";
        return value.replace(/(?<=.).(?=[^@]*?.@)/g, maskChar);
    }

    @Json
    class User {
        id: number = 123;
        @JsonField({serializer: maskEmail})
        email: string = "john.doe@gmail.com";
        @JsonField({serializer: maskEmail})
        aliases: string[] = ["john.doe-1@gmail.com", "john.doe-2@hotmail.com"];
    }

    const user = new User();
    expect(new Jsonthis().toJson(user)).toStrictEqual({
        id: 123,
        email: "j******e@gmail.com",
        aliases: ["j********1@gmail.com", "j********2@hotmail.com"]
    });
    expect(new Jsonthis().toJson(user, {maskChar: "-"})).toStrictEqual({
        id: 123,
        email: "j------e@gmail.com",
        aliases: ["j--------1@gmail.com", "j--------2@hotmail.com"]
    });
});

test("serialize hidden fields", () => {
    @Json
    class User {
        id: number = 123;
        name: string = "John";
        @JsonField(false)
        password: string = "s3cret";
    }

    const user = new User();
    expect(new Jsonthis().toJson(user)).toStrictEqual({
        id: 123,
        name: "John"
    });
})

test("serialize context-dependant hidden fields", () => {
    type UserContext = {
        callerId?: number;
    }

    function showEmailOnlyToOwner(/* email */_: string, context?: UserContext, user?: User): boolean {
        return context?.callerId === user?.id;
    }

    @Json
    class User {
        id: number;
        name: string;
        @JsonField({visible: showEmailOnlyToOwner})
        email: string;
        friend?: User;

        constructor(id: number, name: string, email: string) {
            this.id = id;
            this.name = name;
            this.email = email;
        }
    }

    const user = new User(1, "John", "john.doe@gmail.com");
    user.friend = new User(2, "Jane", "jane.doe@gmail.com");

    expect(new Jsonthis().toJson(user, {callerId: 1})).toStrictEqual({
        id: 1,
        name: "John",
        email: "john.doe@gmail.com",
        friend: {
            id: 2,
            name: "Jane"
        }
    });

    expect(new Jsonthis().toJson(user, {callerId: 2})).toStrictEqual({
        id: 1,
        name: "John",
        friend: {
            id: 2,
            name: "Jane",
            email: "jane.doe@gmail.com"
        }
    });

    expect(new Jsonthis().toJson(user, {callerId: 3})).toStrictEqual({
        id: 1,
        name: "John",
        friend: {
            id: 2,
            name: "Jane"
        }
    });
})

test("should fail on duplicate global serializer", () => {
    function dateSerializer(value: Date): string {
        return value.toISOString();
    }

    const jsonthis = new Jsonthis();
    jsonthis.registerGlobalSerializer(Date, dateSerializer);
    expect(() => jsonthis.registerGlobalSerializer(Date, dateSerializer))
        .toThrow("Serializer already registered for \"Date\"");
});

test("serialize with different casing options", () => {
    @Json
    class User {
        id: number = 123;
        user_name: string = "john-doe";
        registeredAt: Date = new Date();
    }

    const user = new User();
    expect(new Jsonthis().toJson(user)).toStrictEqual({
        id: 123,
        user_name: "john-doe",
        registeredAt: user.registeredAt
    });
    expect(new Jsonthis({case: "camel"}).toJson(user)).toStrictEqual({
        id: 123,
        userName: "john-doe",
        registeredAt: user.registeredAt
    });
    expect(new Jsonthis({case: "snake"}).toJson(user)).toStrictEqual({
        id: 123,
        user_name: "john-doe",
        registered_at: user.registeredAt
    });
    expect(new Jsonthis({case: "pascal"}).toJson(user)).toStrictEqual({
        Id: 123,
        UserName: "john-doe",
        RegisteredAt: user.registeredAt
    });
});

test("should serialize circular references", () => {
    @Json
    class User {
        id: number;
        name: string;
        friend?: User;

        constructor(id: number, name: string) {
            this.id = id;
            this.name = name;
        }
    }

    const user = new User(1, "John");
    user.friend = new User(2, "Jane");
    user.friend.friend = user;

    const jsonthis = new Jsonthis();
    expect(jsonthis.toJson(user)).toStrictEqual({
        id: 1,
        name: "John",
        friend: {
            id: 2,
            name: "Jane",
            friend: {
                $ref: "$1"
            }
        }
    });
});