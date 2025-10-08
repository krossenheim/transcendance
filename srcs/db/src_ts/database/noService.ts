export class NoService {
  name: string;

  constructor(name: string) {
    this.name = name;

    return new Proxy(this, {
      get: (target, prop, receiver) => {
        // If the property exists (like `name`), return it normally
        if (Reflect.has(target, prop)) {
          return Reflect.get(target, prop, receiver);
        }

        // Otherwise, retun a function that prints the method name
        return (...args: any[]) => {
          console.error(`Service named:'${this.name}' failed to initialize.`);
          console.error(`Called method: ${prop.toString()}()`);
          console.error(`Arguments:`, args);
          console.error(`Instance name: ${target.name}`);
        };
      },
    });
  }
}
