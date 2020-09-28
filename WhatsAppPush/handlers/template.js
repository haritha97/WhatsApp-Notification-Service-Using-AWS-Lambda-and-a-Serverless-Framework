const uuid = require("uuid"); // Used to generate unique UUID
const Joi = require("@hapi/joi"); // Used to validate input request parameter
const HttpStatus = require("http-status"); // Used to streamline http status code
const DynamoDBClient = require("../libs/dynamoDb-client.js"); // Reusable dynamoDB client api
const { handleSuccess, handleError } = require("../libs/response-handler.js"); // Reusable success and error handler

exports.create = async (event) => {
  // Make sure body exist otherwise throw error
  if (!event.body) throw new Error("Missing Parameter");

  try {
    // Parse request body
    const requestBody = JSON.parse(event.body);

    // Create schema shape to validate the request body
    const schema = Joi.object({
      template_name: Joi.string().required(),
      template_message: Joi.string().required(),
      user_id: Joi.string().required(),

      // idempotent key
      idempotent_key: Joi.string().required(),
    });

    // Validate the request body
    const { error, value } = schema.validate(requestBody);

    // Process request
    if (!error) {
      // Make sure record doesn't exist in Templates table with same details
      const templateQueryResults = await DynamoDBClient.query({
        TableName: process.env.DDB_TEMPLATES_TABLE_NAME,
        Limit: 1,
        KeyConditionExpression: "user_id = :user_id",
        FilterExpression: "idempotent_key = :idempotent_key",
        ExpressionAttributeValues: {
          ":user_id": value.user_id,
          ":idempotent_key": value.idempotent_key,
        },
      });

      if (
        !!templateQueryResults &&
        templateQueryResults.Count &&
        templateQueryResults.Items.length
      ) {
        return handleSuccess(templateQueryResults.Items[0]);
      }

      const params = {
        TableName: process.env.DDB_TEMPLATES_TABLE_NAME,
        Item: {
          user_id: value.user_id,
          template_id: uuid.v1(),
          template_message: value.template_message,
          template_name: value.template_name,
          created_at: Date.now(),
          idempotent_key: value.idempotent_key,
        },
      };

      // Add templates record in dynamoDB
      await DynamoDBClient.put(params);

      // Return success status code along with newly created template details
      return handleSuccess(params.Item);
    }
    return handleError(
      HttpStatus.BAD_REQUEST,
      `[Template:Create:Error]:${HttpStatus[HttpStatus.BAD_REQUEST]}: ${error}`
    );
  } catch (error) {
    return handleError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      `[Template:Create:Error]: ${error.stack}`
    );
  }
};

exports.update = async (event) => {
  // Make sure body exist
  if (!event.body || !event.pathParameters)
    throw new Error("Missing Parameter");

  try {
    // Retrieve template_id and user_id from path parameter
    const { template_id, user_id } = event.pathParameters;

    // Parse request body
    const requestBody = JSON.parse(event.body);

    if (!template_id || !user_id) {
      return handleError(
        HttpStatus.BAD_REQUEST,
        `[Template:Update:Error]:${
          HttpStatus[HttpStatus.BAD_REQUEST]
        }: Invalid Parameter`
      );
    }

    // Create Schema shape to validate the request body
    const schema = Joi.object({
      template_name: Joi.string().required(),
      template_message: Joi.string().required(),
    });

    // Validate the request body
    const { error, value } = schema.validate(requestBody);

    // Process request
    if (!error) {
      const params = {
        TableName: process.env.DDB_TEMPLATES_TABLE_NAME,
        Key: {
          user_id,
          template_id,
        },
        UpdateExpression:
          "set template_message = :message, template_name = :name",
        ExpressionAttributeValues: {
          ":message": value.template_message,
          ":name": value.template_name,
        },
        ReturnValues: "ALL_NEW",
      };

      // Update templates record in dynamoDB Templates table
      const result = await DynamoDBClient.update(params);

      if (!result) {
        throw new Error("Template not found.");
      }

      // Return success status code along with updated template details
      return handleSuccess(result.Attributes);
    }
    return handleError(
      HttpStatus.BAD_REQUEST,
      `[Template:Update:Error]:${HttpStatus[HttpStatus.BAD_REQUEST]}: ${error}`
    );
  } catch (error) {
    return handleError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      `[Template:Update:Error]: ${error}`
    );
  }
};

exports.delete = async (event) => {
  if (!event.pathParameters) throw new Error("Missing Parameter");

  try {
    // Retrieve template_id from path parameter
    const { template_id, user_id } = event.pathParameters;

    if (!template_id || !user_id) {
      return handleError(
        HttpStatus.BAD_REQUEST,
        `[Template:Delete:Error]:${
          HttpStatus[HttpStatus.BAD_REQUEST]
        }: "Invalid parameter"`
      );
    }

    const params = {
      TableName: process.env.DDB_TEMPLATES_TABLE_NAME,
      Key: {
        user_id,
        template_id,
      },
    };

    // Delete templates record in dynamoDB Templates table
    await DynamoDBClient.delete(params);

    // Return success status code along with truthy value {data: true}
    return handleSuccess(true);
  } catch (error) {
    return handleError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      `[Template:Delete:Error]: ${error}`
    );
  }
};

exports.details = async (event) => {
  if (!event.pathParameters) throw new Error("Missing Parameter");

  try {
    // Retrieve template_id and user_id from path parameter
    const { template_id, user_id } = event.pathParameters;

    if (!template_id || !user_id) {
      return handleError(
        HttpStatus.BAD_REQUEST,
        `[Template:Details:Error]:${
          HttpStatus[HttpStatus.BAD_REQUEST]
        }: "Invalid parameter"`
      );
    }

    const params = {
      TableName: process.env.DDB_TEMPLATES_TABLE_NAME,
      Key: {
        user_id,
        template_id,
      },
    };

    // Get template details from Templates dynamoDB table
    const result = await DynamoDBClient.get(params);

    if (result && !result.Item) {
      throw new Error("Template not found.");
    }

    // Return success status code along with template details
    return handleSuccess(result.Item);
  } catch (error) {
    return handleError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      `[Template:Details:Error]: ${error}`
    );
  }
};

exports.list = async (event) => {
  // Make sure body exist
  if (!event.pathParameters) throw new Error("Missing Parameter");

  try {
    // Retrieve user_id from path parameter
    const { user_id } = event.pathParameters;

    if (!user_id) {
      return handleError(
        HttpStatus.BAD_REQUEST,
        `[Template:List:Error]:${
          HttpStatus[HttpStatus.BAD_REQUEST]
        }: Invalid user_id`
      );
    }

    const params = {
      TableName: process.env.DDB_TEMPLATES_TABLE_NAME,
      KeyConditionExpression: "user_id = :userId",
      ExpressionAttributeValues: {
        ":userId": user_id,
      },
    };

    // Get templates record from dynamoDB Templates table
    const result = await DynamoDBClient.query(params);

    // Return success status code along with templates list
    return handleSuccess(result.Items || []);
  } catch (error) {
    return handleError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      `[Template:List:Error]: ${error}`
    );
  }
};
