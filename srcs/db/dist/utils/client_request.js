"use strict";
class ClientRequest {
    printInfo() {
        console.log(this.endpoint);
        console.log(this.payload);
        console.log(this.user_id);
        console.log(this.targetContainer);
    }
    constructor(endpoint, payload, clienTID, targetContainer) {
        this.endpoint = endpoint;
        this.payload = payload;
        this.user_id = clienTID;
        this.targetContainer = targetContainer;
    }
    static fromHTTP(request, user_id, targetContainer) {
        const instance = new ClientRequest();
        instance.endpoint = request.method;
        instance.payload = request.body;
        instance.user_id = user_id;
        instance.targetContainer = targetContainer;
        return instance;
    }
    static fromWebsocketMessage(stringmessage, user_id, targetContainer) {
        console.log("Parsing message: " + stringmessage);
        let message = {};
        try {
            message = JSON.parse(stringmessage);
        }
        catch (e) {
        }
        const instance = new ClientRequest();
        instance.endpoint = message.endpoint;
        instance.payload = message.payload;
        instance.user_id = user_id;
        instance.targetContainer = targetContainer;
        return instance;
    }
}
module.exports = { ClientRequest };
