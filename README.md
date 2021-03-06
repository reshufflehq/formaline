# Formaline
## The Form Builder

### Usage

Formaline can be used to create forms in web applications. The following
example creates a form requesting the user's name and phone number:

```js
const form = formaline(document.body, {
  submitEndpoint: 'https://api.example.com/submit',
})
form.text('name', 'Your name')
form.phone('phone', 'Your phone number')
```

or using cascading initialization:

```js
formaline({ ... })
  .text('name', 'Your name')
  .phone('phone', 'Your phone number')
```

### Validation

Formaline supports validation for fields like phone numbers. While it
does not handle the backend part of the validation, it will display a
"Validate" button and a field for the user to enter the validation
code:

```js
const form = formaline(document.body, {
  validateEndpoint: 'https://api.example.com/validate',
  submitEndpoint: 'https://api.example.com/submit',
})
form.text('name', 'Your name')
form.phone('phone', 'Your phone number', true)
```

When the user hits the "Validate" button, the name of the field being
validated (in this case "phone") and its value are POSTed to the
`validateEndpoint` URL. The server can then send a validation code,
e.g. via a text message (SMS).

### Arguments

The `formaline` function receives the parent element for the form
and a set of options:

```ts
interface Options {
  // A callback trigerred when the user clicks "Validate"
  onValidate?: (name: string, value: string) => Promise<string | void>

  // Validate endpoint URL
  validateEndpoint?: string

  // A callback for trigerred when the form is submitted
  onSubmit?: (data: Data) => Promise<void>

  // Submission endpoint URL
  submitEndpoint?: string

  // Button and message labels (for internationalization)
  labels?: string
```

Callbacks and endpoints are multually exclusive. Each of validation and
submission can only have one of them (although you can mix between them
and use, for example, a validation endpoint and submission callback).
