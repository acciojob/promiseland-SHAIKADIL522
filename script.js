class CustomPromise {
  constructor(executor) {
    this.state = "pending";
    this.value = undefined;
    this.handlers = [];
    this._locked = false;

    this.resolve = this.resolve.bind(this);
    this.reject = this.reject.bind(this);

    // optional: support new CustomPromise((res, rej) => ...)
    if (typeof executor === "function") {
      try {
        executor(this.resolve, this.reject);
      } catch (err) {
        this.reject(err);
      }
    }
  }

  resolve(value) {
    if (this._locked) return this;
    this._locked = true;
    this._adopt(value);
    return this;
  }

  reject(reason) {
    if (this._locked) return this;
    this._locked = true;
    this._settle("rejected", reason);
    return this;
  }

  // if value is a promise/thenable, follow it; else fulfill
  _adopt(value) {
    if (value === this) {
      return this._settle("rejected", new TypeError("Cannot resolve a promise with itself"));
    }
    if (value !== null && (typeof value === "object" || typeof value === "function")) {
      let then;
      try { then = value.then; } catch (e) { return this._settle("rejected", e); }
      if (typeof then === "function") {
        let called = false;
        try {
          then.call(
            value,
            (v) => { if (called) return; called = true; this._adopt(v); },
            (r) => { if (called) return; called = true; this._settle("rejected", r); }
          );
        } catch (e) {
          if (!called) { called = true; this._settle("rejected", e); }
        }
        return;
      }
    }
    this._settle("fulfilled", value);
  }

  _settle(state, value) {
    if (this.state !== "pending") return;
    this.state = state;
    this.value = value;
    this.handlers.forEach((h) => this._run(h));
    this.handlers = [];
  }

  _run({ onFulfilled, onRejected, child }) {
    queueMicrotask(() => {
      const cb = this.state === "fulfilled" ? onFulfilled : onRejected;
      if (typeof cb !== "function") {
        // no handler: pass result straight to the child
        this.state === "fulfilled" ? child.resolve(this.value) : child.reject(this.value);
        return;
      }
      try {
        child.resolve(cb(this.value));
      } catch (err) {
        child.reject(err);
      }
    });
  }

  then(onFulfilled, onRejected) {
    const child = new CustomPromise();
    const handler = { onFulfilled, onRejected, child };
    if (this.state === "pending") this.handlers.push(handler);
    else this._run(handler);
    return child;
  }

  catch(onRejected) {
    return this.then(null, onRejected);
  }

  finally(onFinally) {
    if (typeof onFinally !== "function") return this.then(onFinally, onFinally);
    return this.then(
      (value) => {
        const r = onFinally();
        return r && typeof r.then === "function" ? r.then(() => value) : value;
      },
      (reason) => {
        const r = onFinally();
        const rethrow = () => { throw reason; };
        return r && typeof r.then === "function" ? r.then(rethrow) : rethrow();
      }
    );
  }
}

window.CustomPromise = CustomPromise;