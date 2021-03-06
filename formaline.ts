;const formaline: any = (() => {

  type Jsonable = Record<string, any>
  interface Data {
    fields: Jsonable
    codes: Jsonable
    cookies: Jsonable
  }

  const URL = new RegExp('^https?:\\/\\/([^:]+(:[^@]+)?@)?[\\w\\-]+' +
                         '(\\.[\\w\\-]+)*(\\/[\\.\\w\\-]+)*\\/?' +
                         '(\\?[\\w\\-]+=[^&]*(&[\\w\\-]+=[^&]*)*)?$')

  const EMAIL = new RegExp(
    '^(?:[a-z0-9!#$%&\'*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&\'*+/=?^_`{|}~-]' +
    '+)*|"(?:[\\x01-\\x08\\x0b\\x0c\\x0e-\\x1f\\x21\\x23-\\x5b\\x5d-\\x7' +
    'f]|\\\\[\\x01-\\x09\\x0b\\x0c\\x0e-\\x7f])*")@(?:(?:[a-z0-9](?:[a-z' +
    '0-9-]*[a-z0-9])?\\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\\[(?:(?:(2(5[' +
    '0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\\.){3}(?:(2(5[0-5]|[0-4]' +
    '[0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\\x01-\\x08' +
    '\\x0b\\x0c\\x0e-\\x1f\\x21-\\x5a\\x53-\\x7f]|\\\\[\\x01-\\x09\\x0b' +
    '\\x0c\\x0e-\\x7f])+)\\])$'
  )

  class Stage {
    private readonly $input?: HTMLInputElement

    constructor(
      public readonly $: HTMLElement,
      $input?: HTMLInputElement,
      private readonly getInputValue?: () => string,
    ) {
      if ($input) {
        this.$input = $input
      } else if ($ instanceof HTMLInputElement) {
        this.$input = $
      } else if ($.firstChild instanceof HTMLInputElement) {
        this.$input = $.firstChild
      }
    }

    public getAttribute(attr: string) {
      return this.getInputElement().getAttribute(attr)
    }

    public getInputElement(): HTMLInputElement {
      if (!this.$input) {
        throw new Error('No input element')
      }
      return this.$input
    }

    public getName() {
      return this.$input && this.$input.name
    }

    public getValue() {
      return this.getInputValue ?
        this.getInputValue() :
        this.getInputElement().value
    }

    public isInput() {
      return this.$input !== undefined
    }
  }

  interface Labels {
    code?: string
    error?: string
    retry?: string
    submit?: string
    success?: string
    validate?: string
  }

  const defaultLabels: Labels = {
    code: 'Validation code',
    error: 'Something went wrong',
    retry: 'Try again',
    submit: 'Submit',
    success: 'Submitted',
    validate: 'Validate',
  }

  class Language {
    private labels: Labels

    constructor(labels: Labels = {}) {
      this.labels = { ...defaultLabels, ...labels }
    }

    get(name: string): string {
      return this.labels[name]
    }
  }

  interface Options {
    onValidate?: (name: string, value: string) => Promise<string | void>
    validateEndpoint?: string
    onSubmit?: (data: Data) => Promise<void>
    submitEndpoint?: string
    onSuccess?: () => void
    labels?: Labels,
  }

  class Formaline {
    private $form: HTMLFormElement
    private $submit: HTMLElement
    private $success?: HTMLElement
    private $error: HTMLElement
    private stages: Stage[] = []
    private canValidate = false
    private cookies: Record<string, string> = {}
    private statestamp = 0
    private state?: number
    private lang: Language

    constructor(private options?: Options) {
      const onValidate = this.options?.onValidate
      if (
        typeof onValidate !== 'undefined' &&
        typeof onValidate !== 'function'
      ) {
        throw new Error(`Invalid onValidate option: ${onValidate}`)
      }
      const ve = this.options?.validateEndpoint
      if (typeof ve !== 'undefined' && !URL.test(ve)) {
        throw new Error(`Invalid validate endpoint option: ${ve}`)
      }
      if (onValidate && ve) {
        throw new Error('Only one of onValidate and validateEndpoint allowed')
      }
      if (onValidate || ve) {
        this.canValidate = true
      }

      const onSubmit = this.options?.onSubmit
      if (
        typeof onSubmit !== 'undefined' &&
        typeof onSubmit !== 'function'
      ) {
        throw new Error(`Invalid onSubmit option: ${onSubmit}`)
      }
      const se = this.options?.submitEndpoint
      if (typeof se !== 'undefined' && !URL.test(se)) {
        throw new Error(`Invalid submit endpoint option: ${se}`)
      }
      if (onSubmit && se) {
        throw new Error(
          'Only one of onSubmit and submitEndpoint options allowed'
        )
      }

      const onSuccess = this.options?.onSuccess
      if (
        typeof onSuccess !== 'undefined' &&
        typeof onSuccess !== 'function'
      ) {
        throw new Error(`Invalid onSuccess option: ${onSuccess}`)
      }

      this.lang = new Language(this.options?.labels)

      this.$form = document.createElement('form')

      this.$submit = createElement('button', {
        name: 'submit',
        innerText: this.lang.get('submit'),
      })
      setDisplay(this.$submit, false)
      this.$form.appendChild(this.$submit)

      if (!this.options?.onSuccess) {
        this.$success = createElement('div', {
          className: 'success',
          innerText: this.lang.get('success'),
        })
        this.$form.appendChild(this.$success)
      }

      this.$error = createElement('div', { className: 'error' })
      this.$error.appendChild(createElement('div', {
        className: 'errorMessage',
        innerText: this.lang.get('error'),
      }))
      this.$error.appendChild(createElement('button', {
        className: 'errorButton',
        innerText: this.lang.get('retry'),
      }))
      this.$form.appendChild(this.$error)

      this.$form.addEventListener('submit', event => {
        event.preventDefault()
        this.onSubmit()
      })
    }

    private async post(endpoint: string, obj: Jsonable) {
      const res = await fetch(endpoint, {
        method: 'POST',
        mode: 'cors',
        cache: 'no-cache',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(obj),
      })
      if (res.status !== 200) {
        throw new Error(`Post failed: ${res.status}`)
      }
      return res.text()
    }

    private defer(promise: any, onSuccess?: (response: string) => void) {
      const state = this.state!
      const baseline = this.statestamp
      const success = (res: any) => {
        this.setState(state + 1, baseline)
        if (typeof onSuccess === 'function') {
          onSuccess(res)
        }
      }
      if (promise instanceof Promise) {
        promise.then(success).catch(() => this.setState(-state, baseline))
      } else {
        success(promise)
      }
    }

    private onSubmit() {
      const state = this.state
      if (state === undefined) {
        throw new Error('Unable to submit form with no fields')
      }

      if (state < 0) {
        window.location.reload()
      }

      setDisabled(
        state < this.stages.length ? this.stages[state].$ : this.$submit,
        true,
      )

      if (0 < state && this.stages[state - 1].isInput()) {
        setTimeout(() => this.stages[state - 1].getInputElement().blur(), 0)
      }

      if (state < this.stages.length) {
        if (state === 0) {
          throw new Error('No inputs to validate')
        }
        const name = this.stages[state - 1].getName()
        const value = this.stages[state - 1].getValue()
        if (value.trim().length === 0) {
          throw new Error(`Unable to validate empty field: ${name}`)
        }

        const setCookie = (cookie: any) => {
          if (typeof cookie === 'string') {
            this.cookies[name] = cookie
          }
        }
        if (this.options?.onValidate) {
          this.defer(this.options.onValidate(name, value), setCookie)
        }
        if (this.options?.validateEndpoint) {
          this.defer(
            this.post(this.options.validateEndpoint, { name, value }),
            setCookie,
          )
        }
      }

      if (state === this.stages.length) {
        const data = this.getData()
        if (this.options?.onSubmit) {
          this.defer(this.options?.onSubmit(data))
        }
        if (this.options?.submitEndpoint) {
          this.defer(
            this.post(this.options.submitEndpoint, data),
            () => {
              if (this.options?.onSuccess) {
                this.options?.onSuccess()
              }
            },
          )
        }
      }
    }

    private setState(state: number, statestamp = this.statestamp) {
      if (state === this.state || statestamp !== this.statestamp) {
        return
      }
      this.state = state
      this.statestamp++

      const abs = Math.abs(state)
      for (let i = 0; i < this.stages.length; i++) {
        const $st = this.stages[i].$
        setDisabled($st, false)
        const dis = this.stages[i].isInput() ? i <= abs : i === state
        setDisplay($st, dis)
      }
      setDisplay(this.$submit, this.stages.length === state)
      if (this.$success) {
        setDisplay(this.$success, this.stages.length < state)
      }
      setDisplay(this.$error, state < 0)

      if (
        (0 <= state && state < this.stages.length) &&
        this.stages[state].isInput() &&
        (state === 0 || !this.stages[state - 1].isInput())
      ) {
        setTimeout(() => this.stages[state].getInputElement().focus(), 0)
      }
    }

    private insertStage($: HTMLElement) {
      this.$form.insertBefore($, this.$submit)
    }

    private stage(
      $: HTMLElement,
      $input?: HTMLInputElement,
      doNotInsert = false,
      getInputValue?: () => string,
    ) {
      setDisplay($, false)
      if (!doNotInsert) {
        this.insertStage($)
      }
      this.stages.push(new Stage($, $input, getInputValue))
      if (this.state === undefined) {
        this.setState(0)
      }
    }

    private input(
      type: string,
      validator: RegExp | ((value: string) => boolean),
      name?: string,
      label?: string,
    ) {
      if (name !== undefined) {
        if (!/^[a-zA-Z]\w*$/.test(name)) {
          throw new Error(`Invalid name: ${name}`)
        }
        if (this.stages.find(s => s.getName() === name)) {
          throw new Error(`Duplicate field name: ${name}`)
        }
      }

      const $input = createElement('input', { type }) as HTMLInputElement
      if (name) {
        $input.name = name
      }
      if (label) {
        $input.setAttribute('placeholder', label)
      }

      const isValid = validator instanceof RegExp ?
        (value: string) => validator.test(value) :
        validator
      const index = this.stages.length
      $input.addEventListener('input', () => {
        this.setState(isValid($input.value) ? index + 1 : index)
      })

      return $input
    }

    // Fields /////////////////////////////////////////////

    public check(name: string, label: string) {
      const $input = this.input('hidden', /^yes$/, name)

      const $button = createElement('button')
      $button.addEventListener('click', (event) => {
        event.preventDefault()
        if ($input.value === 'yes') {
          $button.innerText = $input.value = ''
        } else {
          $button.innerHTML = '&check;'
          $input.value = 'yes'
        }
        $input.dispatchEvent(new Event('input'))
      })

      this.stage(
        createElement('div', { className: 'check' },
          $input,
          $button,
          createElement('div', { className: 'label', innerText: label }),
        )
      )
      return this
    }

    public email(name: string, label: string) {
      this.stage(this.input('email', EMAIL, name, label))
      return this
    }

    public phone(
      name: string,
      label: string,
      options: { validate?: boolean, country?: string } = {},
    ) {
      if (options.validate && !this.canValidate) {
        throw new Error('No means to validate: ' +
          'either onValidate or validateEndpoint options required')
      }
      if (options.country && (window as any).intlTelInput) {
        const $input = this.input('tel', isValid, name, label)
        this.insertStage($input)
        const iti = (window as any).intlTelInput($input, {
          autoPlaceholder: 'aggressive',
          initialCountry: options.country,
          nationalMode: true,
          utilsScript: 'intlTelUtil.js',
        })
        function isValid(value) {
          return iti.isValidNumber()
        }
        this.stage(
          $input.parentNode as HTMLElement,
          $input,
          true,
          () => iti.getNumber()
        )
      } else {
        this.stage(this.input('tel', /^\d{10}$/, name, label))
      }
      if (options.validate) {
        this.stage(createElement('button', {
          innerText: this.lang.get('validate'),
        }))
        const $code = this.input(
          'number',
          /^\d{4}$/,
          undefined,
          this.lang.get('code'),
        )
        $code.setAttribute('autocomplete', 'one-time-code')
        $code.setAttribute('for', 'phone')
        this.stage($code)
      }
      return this
    }

    public text(name: string, label: string) {
      this.stage(this.input('text', /^(?!\s*$).+/, name, label))
      return this
    }

    // Accessors //////////////////////////////////////////

    public getData() {
      const data: Data = { fields: {}, codes: {}, cookies: this.cookies }
      for (const stage of this.stages) {
        if (stage.isInput()) {
          if (stage.getName()) {
            data.fields[stage.getName()] = stage.getValue()
          } else if (stage.getAttribute('for')) {
            data.codes[stage.getAttribute('for')] = stage.getValue()
          }
        }
      }
      return data
    }

    public getElement() {
      return this.$form
    }
  }

  // Helper functions ///////////////////////////////////////////////

  function setDisabled($: HTMLElement, shouldDisable: boolean) {
    if (shouldDisable) {
      $.setAttribute('disabled', 'disabled')
    } else {
      $.removeAttribute('disabled')
    }
  }

  function setDisplay($: HTMLElement, shouldDisplay: boolean) {
    if (shouldDisplay) {
      $.removeAttribute('style')
    } else {
      $.setAttribute('style', 'display:none')
    }
  }

  function createElement(
    tag: string,
    options: Record<string, string | undefined> = {},
    ...$children: HTMLElement[]
  ): HTMLElement {
    const $ = document.createElement(tag)
    for (const [key, value] of Object.entries(options)) {
      if (value) {
        if (['className', 'id', 'innerText', 'innerHTML'].includes(key)) {
          ($ as any)[key] = value
        } else {
          $.setAttribute(key, value)
        }
      }
    }
    for (const $c of $children) {
      $.appendChild($c)
    }
    return $
  }

  // Main function //////////////////////////////////////////////////

  return function formaline($parent?: HTMLElement, options?: Options) {
    const sf = new Formaline(options)
    if ($parent) {
      $parent.appendChild(sf.getElement())
    }
    return sf
  }

})();
