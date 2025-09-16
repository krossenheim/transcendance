class MessageFromService {
    toString() {
    return `Status: ${this.httpStatus}, ` +
           `ContainerFrom: ${this.containerFrom}, ` +
           `Payload: ${JSON.stringify(this.payload)}`;
    }

	constructor(httpStatus, recipients, containerFrom, payload) 
	{
        this.httpStatus = httpStatus;
		this.recipients = recipients;
		this.containerFrom = containerFrom;
		this.payload = payload; 
	}
    
}

module.exports = { MessageFromService };