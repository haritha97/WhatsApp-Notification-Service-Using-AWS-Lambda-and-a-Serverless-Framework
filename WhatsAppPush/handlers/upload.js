const Joi = require("@hapi/joi"); // Used to validate Schema
const HttpStatus = require("http-status"); // Used to streamline http status code
const { handleSuccess, handleError } = require("../libs/response-handler.js");
const AWS = require("aws-sdk");
const s3Client = new AWS.S3({
  signatureVersion: "v4",
});

exports.getSignedUrl = async (event) => {
  // Make sure body exist
  if (!event.body) throw new Error("Missing Parameter");

  try {
    const { user_id } = event.pathParameters;

    if (!user_id) {
      return handleError(
        HttpStatus.BAD_REQUEST,
        `[Upload:GetSignedUrl:Error]:${
          HttpStatus[HttpStatus.BAD_REQUEST]
        }: "Invalid parameter user_id"`
      );
    }

    // Parse request body
    const requestBody = JSON.parse(event.body);

    // Create Schema shape to validate the request body
    const schema = Joi.object({
      file_name: Joi.string().required(),
    });

    // Validate the request body
    const { error, value } = schema.validate(requestBody);

    // Process request
    if (!error) {
      // Your Get Signed URL Logic will go here

      // Date in yyyy-mm-dd format
      const date = new Date().toJSON().slice(0, 10);
      // Create relative file path in user_id/data/file_name format
      const filePath = `${user_id}/${date}/${value.file_name}`;

      // Read s3 bucket name from environment variable RECIPIENT_S3_BUCKET_NAME
      const bucketName = process.env.RECIPIENT_S3_BUCKET_NAME;

      const params = {
        Bucket: bucketName,
        Key: filePath,
        Expires: 6000, // Url is going to expire in 10 minute
      };

      const result = await new Promise((resolve, reject) => {
        s3Client.getSignedUrl("putObject", params, function (err, url) {
          if (err) {
            return reject(err);
          } else {
            return resolve(url);
          }
        });
      });

      // Return success status code along with signed url to upload file
      return handleSuccess({
        signed_upload_url: result,
        s3_file_path: filePath,
      });
    } else {
      return handleError(
        HttpStatus.BAD_REQUEST,
        `[Upload:GetSignedUrl:Error]:${
          HttpStatus[HttpStatus.BAD_REQUEST]
        }: ${error}`
      );
    }
  } catch (error) {
    return handleError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      `[Upload:GetSignedUrl:Error]: ${error.stack}`
    );
  }
};
