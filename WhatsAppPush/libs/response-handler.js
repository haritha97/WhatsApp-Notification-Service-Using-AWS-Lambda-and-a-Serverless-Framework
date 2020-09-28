const HttpStatus = require("http-status"); // Used to stream line http status code

// Generic function to handle success response
exports.handleSuccess = (data) => {
  return {
    statusCode: HttpStatus.OK,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  };
};

// Generic function to handle error
exports.handleError = (statusCode, message, ...rest) => {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ error: message, ...rest }),
  };
};
