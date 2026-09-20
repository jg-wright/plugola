# @plugola/query-params

Parses search query parameters

## Examples

### Strings

```javascript
parseQueryParams('?foo=bar&mung=face')
// { foo: 'bar', mung: 'face' }
```

### Booleans

```javascript
parseQueryParams('foo&!bar')
// { foo: true, bar: false }
```

### Arrays

```javascript
parseQueryParams('foo[]=foo,bar')
// { foo: ['foo', 'bar'] }
```

#### Prepending to arrays

```javascript
parseQueryParams('foo[^]=bar,face', { into: { foo: ['mung'] } })
// { foo: ['bar', 'face', 'mung'] }
```

#### Appending to arrays

```javascript
parseQueryParams('foo[+]=bar,face', { into: { foo: ['mung'] } })
// { foo: ['mung', 'bar', 'face'] }
```

#### Subtracting from arrays

```javascript
parseQueryParams('foo[-]=mung', { into: { foo: ['bar', 'mung'] } })
// { foo: ['bar'] }
```

### Flags

```javascript
parseQueryParams('foo{x}=mung,!face')
/* { 
  foo: { mung: true, face: false }
} */
```

### JSON

```javascript
parseQueryParams('foo{}={"bar": [1, 2]}')
/* {
  foo: {
    bar: [1, 2]
  }
} */
```

### Merge query params in to an existing object

```javascript
const config = { foo: '' }

// Or achieving a similar thing with `set` prop.
parseQueryParams('cfg.foo=bar', {
  // merge in to the `config` property
  into: config,
  set: (queryParams, key, value) =>
    // ... but only use query params that start with `cfg.`
    key.startsWith('cfg.')
      ? // ... and remove `cfg.` from the property name
        { ...queryParams, [key.substr(4)]: value }
      : queryParams,
})
// { foo: 'bar' }
```
