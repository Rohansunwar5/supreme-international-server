import { CustomError } from './custom.error';

export class ConflictErrorJSON extends CustomError {
  statusCode = 409;

  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, ConflictErrorJSON.prototype);
  }

  serializeErrors() {
    return [{ message: this.message }];
  }
}
