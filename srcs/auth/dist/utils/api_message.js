"use strict";
class MessageFromService {
    constructor(httpStatus, recipients, endpoint, payload) {
        this.httpStatus = httpStatus;
        this.recipients = recipients;
        this.endpoint = endpoint;
        this.payload = payload;
    }
    toString() {
        const safeStringify = (val) => {
            try {
                return JSON.stringify(val, null, 2);
            }
            catch (e) {
                return "[Unserializable: " + e.message + "]";
            }
        };
        return ("Human readable 'MessageFromServer' instance:\n" +
            "httpStatus: " + this.httpStatus + "\n" +
            "recipients: " + Array.isArray(this.recipients) && this.recipients ? this.recipients.join(", ") : this.recipients + "\n" +
            "endpoint: " + this.endpoint + "\n" +
            "payload: " + safeStringify(this.payload) + "\n");
    }
    isForHub() {
        if (this.recipients !== null) {
            return (false);
        }
        if (!this.endpoint.startsWith("/inter_api/")) {
            return (false);
        }
        return (true);
    }
    isForUsers() {
        if (!this.recipients instanceof Array) {
            return (false);
        }
        if (this.endpoint.startsWith("/inter_api/")) {
            return (false);
        }
        return (true);
    }
}
module.exports = { MessageFromService };
