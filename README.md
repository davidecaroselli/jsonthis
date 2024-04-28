# 🚀 Jsonthis!

[![npm version][npm-image]][npm-url]
[![npm download][download-image]][download-url]
[![github prs][github-prs-image]][github-prs-url]
[![npm license][license-image]][license-url]

[npm-image]: https://img.shields.io/npm/v/jsonthis
[npm-url]: https://npmjs.org/package/jsonthis
[download-image]: https://img.shields.io/npm/dm/jsonthis
[download-url]: https://npmjs.org/package/jsonthis
[license-image]: https://img.shields.io/npm/l/jsonthis
[license-url]: https://github.com/davidecaroselli/jsonthis/blob/main/LICENSE
[github-prs-image]: https://img.shields.io/github/issues-pr-closed/davidecaroselli/jsonthis
[github-prs-url]: https://github.com/davidecaroselli/jsonthis/pulls


Jsonthis! is a versatile TypeScript library designed to effortlessly convert your models into JSON objects.
It offers extensive support for custom property serializers, conditional property visibility, and more.

Jsonthis! seamlessly integrates with the [Sequelize](https://sequelize.org/) ORM library, making it an ideal companion
for your data management needs. Explore the [Sequelize support](#sequelize-support) section for detailed instructions.

## Table of Contents

- [Installation](#installation)
- [Getting Started](#getting-started)
    * [JSON Serialization](#json-serialization)
- [Change Property Visibility](#change-property-visibility)
    * [Conditional Visibility](#conditional-visibility)
- [Customizing Serialization](#customizing-serialization)
    * [Change Property Name Casing](#change-property-name-casing)
    * [Custom serializers](#custom-serializers)
        + [Global Serializer](#global-serializer)
        + [Field-Specific Serializer](#field-specific-serializer)
    * [Contextual Field-Specific Serializer](#contextual-field-specific-serializer)
    * [Limit Serialization Depth](#limit-serialization-depth)
- [Circular References](#circular-references)
- [JSON Stringify compatibility](#json-stringify-compatibility)
- [Sequelize support](#sequelize-support)
- [Let's Contribute Together!](#lets-contribute-together)
    * [How You Can Help](#how-you-can-help)
    * [Some Tips](#some-tips)
    * [Got Ideas?](#got-ideas)

## Installation

To install Jsonthis!, simply run:

```bash
npm install jsonthis
```

## Getting Started

Getting started with Jsonthis! is quick and straightforward. Here's a simple example to get you going:

```typescript
import {JsonField, Jsonthis} from "jsonthis";

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
```

The `@JsonField` decorator empowers you to fine-tune the serialization process of your properties
with Jsonthis!: you can define custom serializers, change property visibility, and more.

### JSON Serialization

Jsonthis! offer a `toJson(target, options?)` method, as well as the `toJSON()` method on your classes
via the `models` options in the constructor. The first allows for more flexibility and customization (such as 
conditional-serialization - see [Conditional Visibility](#conditional-visibility) for more details),
while the latter is a more straightforward approach that makes your classes compatible with `JSON.stringify()`.

```typescript
class User {
    // (...) properties and methods
    
    // This prevent TypeScript from throwing an error when calling toJSON() on the User class
    declare toJSON: () => any;
}

const jsonthis = new Jsonthis({
    models: [User]  // This will instruct Jsonthis! to implement the toJSON() method on the User class
});
```

You can then use the `toJSON()` method on your class instances, or stringify them directly with `JSON.stringify()`:

```typescript
const user = new User();
console.log(user.toJSON());  // This will return a JSON-compatible object
console.log(JSON.stringify(user));  // This will return the JSON string of the object
```

Alternatively, you can use the `toJson()` method on the Jsonthis! instance, which allows for more customization:

```typescript
const user = new User();
const jsonUser = jsonthis.toJson(user, /* options */);
console.log(jsonUser);  // The object resulting from the serialization process
console.log(JSON.stringify(jsonUser));  // This will return the JSON string of the object
```

## Change Property Visibility

You can hide a property from the JSON output by setting the `visible` option to `false`.
You can achieve this by passing `false` to the `@JsonField` decorator directly
or by using the `JsonFieldOptions` object:

```typescript
class User {
    // ...
    @JsonField({visible: false})  // This has the same effect as @JsonField(false)
    password: string;
    // ...
}
```

### Conditional Visibility

Jsonthis! supports conditional property visibility based on a user-defined context.
This allows you to dynamically show or hide properties as needed.

In the following example, the `email` property is only visible if the email owner is requesting it:

```typescript
function showEmailOnlyToOwner(/* email */_: string, state: JsonTraversalState, opts?: ToJsonOptions): boolean {
    return opts?.context?.callerId === (state.parent as User)?.id;
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
```

This also works with nested objects:

```typescript
const user = new User(1, "john.doe@gmail.com");
user.friend = new User(2, "jane.doe@gmail.com");

const jsonthis = new Jsonthis({models: [User]});
console.log(jsonthis.toJson(user, {context: {callerId: 1}}));
// { id: 1, email: 'john.doe@gmail.com', friend: { id: 2 } }

console.log(jsonthis.toJson(user, {context: {callerId: 2}}));
// { id: 1, friend: { id: 2, email: 'jane.doe@gmail.com' } }
```

## Customizing Serialization

### Change Property Name Casing

Jsonthis! allows you to enforce specific casing for property names in the JSON output.
By default, Jsonthis! uses whatever casing you use in your TypeScript code,
but you can change it to `camelCase`, `snake_case`, or `PascalCase`:

```typescript
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
```

### Custom serializers

Jsonthis! allows you to define custom serializers to transform property values during serialization.
These can be either **global** or **field-specific**.

#### Global Serializer

Register a global serializer for a specific type using `Jsonthis.registerGlobalSerializer()`:

```typescript
function dateSerializer(value: Date): string {
    return value.toUTCString();
}

class User {
    id: number = 1;
    registeredAt: Date = new Date();

    declare toJSON: () => any;
}

const jsonthis = new Jsonthis({models: [User]});
jsonthis.registerGlobalSerializer(Date, dateSerializer);

const user = new User();
console.log(user.toJSON());
// { id: 1, registeredAt: 'Sat, 27 Apr 2024 17:03:52 GMT' }
```

#### Field-Specific Serializer

Utilize the `@JsonField` decorator to specify a custom serializer for a specific property:

```typescript
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
```

### Contextual Field-Specific Serializer

Jsonthis! serialization supports a user-defined context object that can be used to further influence the serialization
process:

```typescript
function maskEmail(value: string, state: JsonTraversalState, opts?: ToJsonOptions): string {
    return value.replace(/(?<=.).(?=[^@]*?.@)/g, opts?.context?.maskChar || "*");
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
```

### Limit Serialization Depth

You can limit the depth of serialization by setting the `maxDepth` option at global level in `JsonthisOptions`
at construction time:

```typescript
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
```

You can also set the `maxDepth` option at the method level in `ToJsonOptions`:

```typescript
const jsonthis = new Jsonthis({models: [User]});

console.log(jsonthis.toJson(user, {maxDepth: 1}));
// { id: 1, name: 'John', friend: { id: 2, name: 'Jane' } }
```

## Circular References

Jsonthis! can detect circular references out of the box. When serializing an object with circular references, the default
behavior is to throw a `CircularReferenceError`. However, you can customize this behavior by providing a custom handler:

```typescript
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
```

## Sequelize support
Jsonthis! seamlessly integrates with the [Sequelize](https://sequelize.org/) ORM library.
To utilize Jsonthis! with Sequelize, simply specify it in the library constructor:

```typescript
const sequelize = new Sequelize({ ... });

const jsonthis = new Jsonthis({
    sequelize: sequelize
});
```

Now, Jsonthis! will seamlessly intercept the serialization process when using the `toJSON()` method
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

const jsonthis = new Jsonthis({case: "snake", sequelize});

const user = await User.create({
    id: 1,
    email: "john.doe@gmail.com",
    password: "s3cret"
});

console.log(user.toJSON());  // or jsonthis.toJson(user)
// {
//   id: 1,
//   email: 'j******e@gmail.com',
//   updated_at: 2024-04-20T12:58:10.229Z,
//   created_at: 2024-04-20T12:58:10.229Z
// }
```

## Let's Contribute Together!

I'm excited to have you contribute and share your ideas to make this library even better!

### How You Can Help

1. Fork the repository.
2. Create a new branch for your changes.
3. Make your improvements, test them, and commit your work.
4. Push your branch to your fork.
5. Send us a pull request!

### Some Tips

- Keep the coding style consistent.
- Write clear and friendly commit messages.
- Don't forget tests and documentation!
- Be kind and respectful in your interactions.

### Got Ideas?

Share your thoughts! I'd love to hear your suggestions. Just open an issue and let's chat!

Thanks a bunch for considering lending a hand! 🌟