const uuid = require("uuid"); // Used to generate unique UUID
const Joi = require("@hapi/joi"); // Used to validate Schema
const HttpStatus = require("http-status"); // Used to stream line http status code
const DynamoDBClient = require("../libs/dynamoDb-client.js"); // Reusable dynamodb client api
const { handleSuccess, handleError } = require("../libs/response-handler.js");
const { enqueueMessage } = require("../libs/sqs-client.js");
const csvToJson = require("csvtojson");
const AWS = require("aws-sdk");
const xlsx = require("node-xlsx");
const S3 = new AWS.S3();

exports.create = async (event) => {
  // Make sure body exist
  if (!event.body) throw new Error("Missing Parameters");

  try {
    // Parse request body
    const requestBody = JSON.parse(event.body);

    // Create schema shape to validate the request body
    const schema = Joi.object({
      user_id: Joi.string().required(),
      message: Joi.string(),
      message_template_id: Joi.string(),
      recipient: Joi.string(),
      recipient_list_file: Joi.string(),
      // Idempotent key
      idempotent_key: Joi.string().required(),
    })
      .xor("message", "message_template_id")
      .xor("recipient", "recipient_list_file");

    // Validate the request body
    const { error, value } = schema.validate(requestBody);

    // Process request
    if (!error) {
      // Make sure record doesn't exist in NotificationTask table with same details
      const notificationQueryResults = await DynamoDBClient.query({
        TableName: process.env.DDB_NOTIFICATION_TASK_TABLE_NAME,
        Limit: 1,
        KeyConditionExpression: "user_id = :user_id",
        FilterExpression: "idempotent_key = :idempotent_key",
        ExpressionAttributeValues: {
          ":user_id": value.user_id,
          ":idempotent_key": value.idempotent_key,
        },
      });

      if (
        !!notificationQueryResults &&
        notificationQueryResults.Count &&
        notificationQueryResults.Items.length
      ) {
        return handleSuccess(notificationQueryResults.Items[0]);
      }

      const params = {
        TableName: process.env.DDB_NOTIFICATION_TASK_TABLE_NAME,
        Item: {
          user_id: value.user_id,
          notification_id: uuid.v1(),
          message: value.message,
          message_template_id: value.message_template_id,
          recipient: value.recipient,
          recipient_list_file: value.recipient_list_file,
          created_at: Date.now(),
          idempotent_key: value.idempotent_key,
        },
      };

      // Add record in NotificationTask dynamoDB table
      await DynamoDBClient.put(params);

      const { notification_id, user_id } = params.Item;
      const {
        message,
        recipient,
        message_template_id,
        recipient_list_file,
      } = value;
      const messageText =
        message || (await getMessageTextBy(message_template_id, user_id));
      const recipients = recipient
        ? [recipient]
        : await getRecipientsFromFile(recipient_list_file);

      // Publish message over queue
      if (messageText && recipients.length) {
        const enqueueMessagesJobs = recipients.map(
          async (phone_number) =>
            await enqueueMessage({
              notification_id,
              user_id,
              sent_from: "+1999999999", // Twilio Sandbox number
              sent_to: phone_number,
              message: messageText,
            })
        );

        await Promise.all(enqueueMessagesJobs);
      }

      return handleSuccess(params.Item);
    }
    return handleError(
      HttpStatus.BAD_REQUEST,
      `[CreateNotification:Create:Error]:${
        HttpStatus[HttpStatus.BAD_REQUEST]
      }: ${error}`
    );
  } catch (error) {
    return handleError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      `[CreateNotification:Create:Error]: ${error.stack}`
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
        `[ListNotifications:List:Error]:${
          HttpStatus[HttpStatus.BAD_REQUEST]
        }: Invalid user_id`
      );
    }

    const params = {
      TableName: process.env.DDB_NOTIFICATION_TASK_TABLE_NAME,
      KeyConditionExpression: "user_id = :userId",
      ExpressionAttributeValues: {
        ":userId": user_id,
      },
    };

    // Get notification task record from NotificationTask DynamoDB Table
    const result = await DynamoDBClient.query(params);

    if (result && !result.Items) {
      throw new Error("Notifications not found.");
    }

    // Return success status code along with Notifications list
    return handleSuccess(result.Items);
  } catch (error) {
    return handleError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      `[ListNotifications:List:Error]: ${error}`
    );
  }
};

async function getMessageTextBy(template_id, user_id) {
  const params = {
    TableName: process.env.DDB_TEMPLATES_TABLE_NAME,
    Key: {
      user_id,
      template_id,
    },
  };

  // Get Message template details from Templates dynamoDB table
  const result = await DynamoDBClient.get(params);

  if (result && !result.Item) {
    throw new Error("Template not found.");
  }

  return result.Item[0].template_message;
}

async function getRecipientsFromFile(recipient_list_file) {
  const fileType = recipient_list_file.substr(
    recipient_list_file.lastIndexOf(".") + 1
  );

  let recipient = [];

  if (fileType.toLowerCase() === "csv") {
    recipient = getRecipientsFromCSV(recipient_list_file);
  } else if (fileType.toLowerCase() === "xlsx") {
    recipient = await getRecipientsFromXLSX(recipient_list_file);
  }

  return recipient;
}

async function getRecipientsFromCSV(filePath) {
  const recipients = [];

  const params = {
    Bucket: process.env.RECIPIENT_S3_BUCKET_NAME,
    Key: filePath,
  };

  // get csv file and create stream
  const stream = S3.getObject(params).createReadStream();
  // convert csv file (stream) to JSON format data
  const json = await csvToJson().fromStream(stream);
  for (let index = 0, len = json.length; index < len; index++) {
    recipients.push(json[index]["Phone Number"]);
  }

  return recipients;
}

async function getRecipientsFromXLSX(filePath) {
  const recipients = [];

  const params = {
    Bucket: process.env.RECIPIENT_S3_BUCKET_NAME,
    Key: filePath,
  };

  return new Promise((resolve, reject) => {
    // get csv file and create stream
    const file = S3.getObject(params).createReadStream();
    const buffers = [];

    file.on("data", (data) => {
      buffers.push(data);
    });

    file.on("end", () => {
      const buffer = Buffer.concat(buffers);
      const workbook = xlsx.parse(buffer);
      const firstSheet = workbook[0].data;
      firstSheet.shift();

      firstSheet.forEach((data) => {
        data[0] && recipients.push(data[0]);
        return data;
      });

      resolve(recipients);
    });
  });
}
