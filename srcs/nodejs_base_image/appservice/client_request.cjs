class ClientRequest 
{
  constructor() 
  {
    this.url = null;
    this.method = null;
    this.arguments = {};
    this.clientID = null;
  }

  static fromHTTP(request, clientID)
  {
    const instance = new ClientRequest();
    instance.method = request.method;
    instance.url = request.url;
    instance.arguments = request.body;
    instance.clientID = clientID;
    return instance;
  }

  static fromWebsocketMessage(stringmessage, clientID)
  {
    console.log("Parsing message: " + stringmessage);
    let message = {}
    try {
          message = JSON.parse(stringmessage);

    } catch (e) {
    }
    const instance = new ClientRequest();
    instance.method = message.method;
    instance.url = message.url;
    instance.arguments = message.arguments;
    instance.clientID = clientID;
    return instance;
  }
}

module.exports = { ClientRequest };