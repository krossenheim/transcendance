class MessageFromService {
	constructor(httpStatus, recipients, endpoint, payload) 
	{
        this.httpStatus = httpStatus;
		this.recipients = recipients;
		this.endpoint = endpoint;
		this.payload = payload; 
	}
    
}

module.exports = { MessageFromService };