"use strict";
class ErrorPayload {
    constructor(textResponse, context) {
        this.textResponse = textResponse;
        this.context = context;
    }
    toJson() {
        return JSON.stringify({
            textResponse: this.textResponse,
            context: this.context
        });
    }
}
module.exports = { ErrorPayload };
//# sourceMappingURL=error_payload.js.map