class ClientRequest 
{
  printInfo()
  {
    console.log(this.endpoint);
    console.log(this.payload);
    console.log(this.clientID);
    console.log(this.targetContainer);
    
  }
  constructor(endpoint, payload, clienTID, targetContainer) 
  {
    this.endpoint = endpoint;
    this.payload = payload;
    this.clientID = clienTID;
    this.targetContainer = targetContainer;
  }

  static fromHTTP(request, clientID, targetContainer)
  {
    const instance = new ClientRequest();
    instance.endpoint = request.method;
    instance.payload = request.body;
    instance.clientID = clientID;
    instance.targetContainer = targetContainer;
    return instance;
  }

  static fromWebsocketMessage(stringmessage, clientID, targetContainer)
  {
    console.log("Parsing message: " + stringmessage);
    let message = {}
    try {
          message = JSON.parse(stringmessage);

    } catch (e) {
    }
    const instance = new ClientRequest();
    instance.endpoint = message.endpoint;
    instance.payload = message.payload;
    instance.clientID = clientID;
    instance.targetContainer = targetContainer;
    return instance;
  }
}

module.exports = { ClientRequest };