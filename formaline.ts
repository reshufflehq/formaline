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

  interface Options {
    onValidate?: (name: string, value: string) => Promise<string | void>
    validateEndpoint?: string
    onSubmit?: (data: Data) => Promise<void>
    submitEndpoint?: string
    submitLabel?: string
    successlabel?: string
  }

  class Formaline {
    private $form: HTMLFormElement
    private $submit: HTMLElement
    private $success: HTMLElement
    private $error: HTMLElement
    private $stages: HTMLElement[] = []
    private canValidate = false
    private cookies: Record<string, string> = {}
    private statestamp = 0
    private state?: number

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
        throw new Error('Only one of onSubmit and submitEndpoint allowed')
      }

      this.$form = document.createElement('form')

      this.$submit = createElement('button', {
        name: 'submit',
        innerText: options?.submitLabel || 'Submit',
      })
      setDisplay(this.$submit, false)
      this.$form.appendChild(this.$submit)

      this.$success = createElement('div', {
        className: 'success',
        innerText: options?.successlabel || 'Submitted',
      })
      this.$form.appendChild(this.$success)

      this.$error = createElement('div', { className: 'error' })
      this.$error.appendChild(createElement('div', {
        className: 'errorMessage',
        innerText: 'Something went wrong',
      }))
      this.$error.appendChild(createElement('button', {
        className: 'errorButton',
        innerText: 'Try again',
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

    private defer(
      promise: Promise<string | void>,
      onSuccess?: (response: string) => void,
    ) {
      const baseline = this.statestamp
      const state = this.state!
      promise.then((res: any) => {
        this.setState(state + 1, baseline)
        if (typeof onSuccess === 'function') {
          onSuccess(res)
        }
      }).catch(() => {
        this.setState(-state, baseline)
      })
    }

    private onSubmit() {
      if (this.state === undefined) {
        throw new Error('Unable to submit form with no fields')
      }

      if (this.state < 0) {
        window.location.reload()
      }

      setDisabled(
        this.state < this.$stages.length ?
          this.$stages[this.state] :
          this.$submit,
        true,
      )

      if (
        0 < this.state &&
        this.$stages[this.state - 1] instanceof HTMLInputElement
      ) {
        setTimeout(() => this.$stages[this.state! - 1].blur(), 0)
      }

      if (this.state < this.$stages.length) {
        if (this.state === 0) {
          throw new Error('No inputs to validate')
        }
        const $input = this.$stages[this.state - 1]
        if (!($input instanceof HTMLInputElement)) {
          throw new Error(`Unable to validate non-input field: ${$input}`)
        }
        if ($input.value.trim().length === 0) {
          throw new Error(`Unable to validate empty field: ${$input}`)
        }

        const setCookie = (cookie: any) => {
          if (typeof cookie === 'string') {
            this.cookies[$input.name] = cookie
          }
        }
        if (this.options?.onValidate) {
          this.defer(
            this.options.onValidate($input.name, $input.value),
            setCookie,
          )
        }
        if (this.options?.validateEndpoint) {
          const nv = { name: $input.name, value: $input.value }
          this.defer(
            this.post(this.options.validateEndpoint, nv),
            setCookie,
          )
        }
      }

      if (this.state === this.$stages.length) {
        const data = this.getData()
        if (this.options?.onSubmit) {
          this.defer(this.options?.onSubmit(data))
        }
        if (this.options?.submitEndpoint) {
          this.defer(this.post(this.options.submitEndpoint, data))
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
      for (let i = 0; i < this.$stages.length; i++) {
        const $st = this.$stages[i]
        setDisabled($st, false)
        const dis = $st instanceof HTMLInputElement ? i <= abs : i === state
        setDisplay($st, dis)
      }
      setDisplay(this.$submit, this.$stages.length === state)
      setDisplay(this.$success, this.$stages.length < state)
      setDisplay(this.$error, state < 0)

      if (
        this.$stages[state] instanceof HTMLInputElement && (
          state === 0 || (
            0 < state &&
            !(this.$stages[state - 1] instanceof HTMLInputElement)
          )
        )
      ) {
        setTimeout(() => this.$stages[state].focus(), 0)
      }
    }

    private stage($: HTMLElement) {
      setDisplay($, false)
      this.$form.insertBefore($, this.$submit)
      this.$stages.push($)
      if (this.state === undefined) {
        this.setState(0)
      }
    }

    private input(type: string, regex: RegExp, name?: string, label?: string) {
      if (name !== undefined) {
        if (!/^[a-zA-Z]\w*$/.test(name)) {
          throw new Error(`Invalid name: ${name}`)
        }
        if (this.$stages.find(
          $ => $ instanceof HTMLInputElement && $.name === name
        )) {
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

      const index = this.$stages.length
      $input.addEventListener('input', () =>
        this.setState(regex.test($input.value) ? index + 1 : index)
      )

      return $input
    }

    public phone(name: string, label: string, validate = false) {
      if (validate && !this.canValidate) {
        throw new Error('No means to validate: ' +
          'either onValidate or validateEndpoint options required')
      }
      this.stage(this.input('tel', /^\d{10}$/, name, label))
      if (validate) {
        this.stage(createElement('button', { innerText: 'Validate' }))
        const $code = this.input('number', /^\d{4}$/)
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

    public getData() {
      const data: Data = { fields: {}, codes: {}, cookies: this.cookies }
      for (const $ of this.$stages) {
        if ($ instanceof HTMLInputElement) {
          if ($.name) {
            data.fields[$.name] = $.value
          } else {
            const ref = $.getAttribute('for')
            if (ref) {
              data.codes[ref] = $.value
            }
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
