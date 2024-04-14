# Jsonthis

[![npm version][npm-image]][npm-url]
[![npm download][download-image]][download-url]

[npm-image]: https://img.shields.io/npm/v/jsonthis?style=flat-square

[npm-url]: https://npmjs.org/package/jsonthis

[download-image]: https://img.shields.io/npm/dm/jsonthis?style=flat-square

[download-url]: https://npmjs.org/package/jsonthis

Jsonthis is a versatile TypeScript library designed to effortlessly convert your models into JSON objects.
It offers extensive support for custom property serializers, conditional property visibility, and more.

Jsonthis seamlessly integrates with the [Sequelize](https://sequelize.org/) ORM library, making it an ideal companion
for your data management needs. Explore the [Sequelize support](#sequelize-support) section for detailed instructions.

## Table of Contents

- [Getting Started](#getting-started)
- [Change Property Visibility](#change-property-visibility)
    * [Conditional Visibility](#conditional-visibility)
- [Customizing Serialization](#customizing-serialization)
    * [Change Property Name Casing](#change-property-name-casing)
    * [Custom serializers](#custom-serializers)
        + [Global Serializer](#global-serializer)
        + [Field-Specific Serializer](#field-specific-serializer)
    * [Contextual Field-Specific Serializer](#contextual-field-specific-serializer)
- [Circular References](#circular-references)
- [Sequelize support](#sequelize-support)

## Getting Started

Getting started with Jsonthis is quick and straightforward. Here's a simple example to get you going:

```typescript
import {Json, JsonField, Jsonthis} from "jsonthis";

@Json
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
}

const user = new User(1, "john.doe@gmail.com", "s3cret");

const jsonthis = new Jsonthis();
console.log(jsonthis.toJson(user));
// { id: 1, email: 'john.doe@gmail.com', registeredAt: 2024-04-13T15:29:35.583Z }
```

Additionally, the `@JsonField` decorator empowers you to fine-tune the serialization process of your properties
with Jsonthis. You can define custom serializers, change property visibility, and more.

## Change Property Visibility

You can hide a property from the JSON output by setting the `visible` option to `false`.
You can achieve this by passing `false` to the `@JsonField` decorator directly
or by using the `JsonFieldOptions` object:

```typescript
@Json
class User {
    // ...
    @JsonField({visible: false})  // This has the same effect as @JsonField(false)
    password: string;
    // ...
}
```

### Conditional Visibility

Jsonthis supports conditional property visibility based on a user-defined context.
This allows you to dynamically show or hide properties as needed.

In the following example, the `email` property is only visible if the email owner is requesting it:

```typescript
type UserContext = {
    callerId?: number;
}

function showEmailOnlyToOwner(/* email */_: string, context?: UserContext, user?: User): boolean {
    return context?.callerId === user?.id;
}

@Json
class User {
    id: number;
    @JsonField({visible: showEmailOnlyToOwner})
    email: string;
    friend?: User;

    constructor(id: number, email: string) {
        this.id = id;
        this.email = email;
    }
}

const user = new User(1, "john.doe@gmail.com");

const jsonthis = new Jsonthis();
console.log(jsonthis.toJson(user, {callerId: 1}));
// { id: 1, email: 'john.doe@gmail.com' }

console.log(jsonthis.toJson(user, {callerId: 2}));
// { id: 1 }
```

This also works with nested objects:

```typescript
const user = new User(1, "john.doe@gmail.com");
user.friend = new User(2, "jane.doe@gmail.com");

const jsonthis = new Jsonthis();
console.log(jsonthis.toJson(user, {callerId: 1}));
// { id: 1, email: 'john.doe@gmail.com', friend: { id: 2 } }

console.log(jsonthis.toJson(user, {callerId: 2}));
// { id: 1, friend: { id: 2, email: 'jane.doe@gmail.com' } }
```

## Customizing Serialization

### Change Property Name Casing

Jsonthis allows you to enforce specific casing for property names in the JSON output.
By default, Jsonthis uses whatever casing you use in your TypeScript code,
but you can change it to `camelCase`, `snake_case`, or `PascalCase`:

```typescript
@Json
class User {
    id: number = 123;
    user_name: string = "john-doe";
    registeredAt: Date = new Date();
}

const user = new User();
console.log(new Jsonthis().toJson(user));
// { id: 123, user_name: 'john-doe', registeredAt: 2024-04-13T20:42:22.121Z }
console.log(new Jsonthis({case: "camel"}).toJson(user));
// { id: 123, userName: 'john-doe', registeredAt: 2024-04-13T20:42:22.121Z }
console.log(new Jsonthis({case: "snake"}).toJson(user));
// { id: 123, user_name: 'john-doe', registered_at: 2024-04-13T20:42:22.121Z }
console.log(new Jsonthis({case: "pascal"}).toJson(user));
// { Id: 123, UserName: 'john-doe', RegisteredAt: 2024-04-13T20:42:22.121Z }
```

### Custom serializers

Jsonthis allows you to define custom serializers to transform property values during serialization.
These can be either **global** or **field-specific**.

#### Global Serializer

Register a global serializer for a specific type using `Jsonthis.registerGlobalSerializer()`:

```typescript
function dateSerializer(value: Date): string {
    return value.toUTCString();
}

@Json
class User {
    id: number = 1;
    registeredAt: Date = new Date();
}

const jsonthis = new Jsonthis();
jsonthis.registerGlobalSerializer(Date, dateSerializer);

const user = new User();
console.log(jsonthis.toJson(user));
// { id: 1, registeredAt: 'Sat, 13 Apr 2024 15:50:35 GMT' }
```

#### Field-Specific Serializer

Utilize the `@JsonField` decorator to specify a custom serializer for a specific property:

```typescript
function maskEmail(value: string): string {
    return value.replace(/(?<=.).(?=[^@]*?.@)/g, "*");
}

@Json
class User {
    id: number = 1;
    @JsonField({serializer: maskEmail})
    email: string = "john.doe@gmail.com";
}

const jsonthis = new Jsonthis();
const user = new User();
console.log(jsonthis.toJson(user));
// { id: 1, email: 'j******e@gmail.com' }
```

### Contextual Field-Specific Serializer

Jsonthis serialization supports a user-defined context object that can be used to further influence the serialization
process:

```typescript
type MaskOptions = {
    maskChar?: string;
}

function maskEmail(value: string, context?: MaskOptions): string {
    return value.replace(/(?<=.).(?=[^@]*?.@)/g, context?.maskChar || "*");
}

@Json
class User {
    id: number = 1;
    @JsonField({serializer: maskEmail})
    email: string = "john.doe@gmail.com";
}

const jsonthis = new Jsonthis();
const user = new User();
console.log(jsonthis.toJson(user, {maskChar: "-"}));
// { id: 1, email: 'j------e@gmail.com' }
```

## Circular References

Jsonthis can detect circular references out of the box. When serializing an object with circular references, the default
behavior is to throw a `CircularReferenceError`. However, you can customize this behavior by providing a custom handler:

```typescript
function serializeCircularReference(value: any): any {
    return { $ref: `$${value.constructor.name}(${value.id})` };
}

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

const jsonthis = new Jsonthis({circularReferenceSerializer: serializeCircularReference});
console.log(jsonthis.toJson(user));
// {
//   id: 1,
//   name: 'John',
//   friend: { id: 2, name: 'Jane', friend: { '$ref': '$User(1)' } }
// }
```

## Sequelize support
Jsonthis seamlessly integrates with the [Sequelize](https://sequelize.org/) ORM library.
To utilize Jsonthis with Sequelize, simply specify it in the library constructor:

```typescript
const sequelize = new Sequelize({ ... });

const jsonthis = new Jsonthis({
    sequelize: sequelize
});
```

Now, Jsonthis will seamlessly intercept the serialization process when using the `toJSON()` method
with Sequelize models: 

```typescript
function maskEmail(value: string): string {
    return value.replace(/(?<=.).(?=[^@]*?.@)/g, "*");
}

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
    @Attribute(DataTypes.INTEGER)
    @PrimaryKey
    declare id: number;

    @Attribute(DataTypes.STRING)
    @NotNull
    @JsonField({serializer: maskEmail})
    declare email: string;

    @Attribute(DataTypes.STRING)
    @NotNull
    @JsonField(false)
    declare password: string;
}

const jsonthis = new Jsonthis({sequelize});

const user = await User.create({
    id: 1,
    email: "john.doe@gmail.com",
    password: "s3cret"
});

console.log(user.toJSON());
// {
//   id: 1,
//   email: 'j******e@gmail.com',
//   updatedAt: 2024-04-13T18:00:20.909Z,
//   createdAt: 2024-04-13T18:00:20.909Z
// }
```
