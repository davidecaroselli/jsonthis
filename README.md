# Jsonthis

[![npm version][npm-image]][npm-url]
[![npm download][download-image]][download-url]

[npm-image]: https://img.shields.io/npm/v/jsonthis?style=flat-square

[npm-url]: https://npmjs.org/package/jsonthis

[download-image]: https://img.shields.io/npm/dm/jsonthis?style=flat-square

[download-url]: https://npmjs.org/package/jsonthis

Jsonthis is the perfect TypeScript library to convert your models to JSON objects.
It supports custom property serializers, conditionally-visible properties, and much more.

Jsonthis is also the perfect companion to the [Sequelize](https://sequelize.org/) ORM library.

## Getting Started

This is the simplest way to use Jsonthis:

```typescript
import {Json, JsonField, Jsonthis} from "jsonthis";

@Json
class User {
    id: number;
    email: string;
    @JsonField(false)
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

You can also use the `@JsonField` decorator to customize how `Jsonthis` serializes your properties.
In the example above, the `password` property is hidden from the JSON output.

Jsonthis also supports custom serializers and serialization options.

## Change property visibility

The simplest customization you can do is to hide a property from the JSON output.
As shown in the example above, you can use the `@JsonField` decorator to hide a property.

You can pass the visible option directly to the `@JsonField` decorator,
or you can use the `JsonFieldOptions` options object to specify more complex options:

```typescript
@Json
class User {
    // ...
    @JsonField({visible: false})  // This has the same effect as @JsonField(false)
    password: string;
    // ...
}
```

### Conditional visibility

Jsonthis serialization supports a user-defined context object that can be used to influence the serialization process.
You can use this feature to conditionally hide or show properties based on the context.

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

Note that this also works with nested objects:

```typescript
const user = new User(1, "john.doe@gmail.com");
user.friend = new User(2, "jane.doe@gmail.com");

const jsonthis = new Jsonthis();
console.log(jsonthis.toJson(user, {callerId: 1}));
// { id: 1, email: 'john.doe@gmail.com', friend: { id: 2 } }

console.log(jsonthis.toJson(user, {callerId: 2}));
// { id: 1, friend: { id: 2, email: 'jane.doe@gmail.com' } }
```

## Custom serializers

You can use custom serializers to transform your properties in the final JSON output.
Custom serializers can be **Global** or **Field-specific**.

### Global serializer

You can register a global serializer for a specific type using the `Jsonthis.registerGlobalSerializer()` method:

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

### Field-specific serializer

You can use the `@JsonField` decorator to specify a custom serializer for a specific property:

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

### Contextual field-specific serializer

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
