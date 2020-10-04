const AWS = require("aws-sdk");
const SQS = new AWS.SQS();

const messageQueueUrl = process.env.SMS_MESSAGE_QUEUE_URL;

exports.enqueueMessage = async (message) => {
  if (!message) throw new Error("Invalid Message Body");

  return new Promise((resolve, reject) => {
    SQS.sendMessage(
      {
        MessageBody: JSON.stringify({
          ...message,
        }),
        QueueUrl: messageQueueUrl,
      },
      function (err, data) {
        if (err) {
          console.log("Error", err);
          reject(err);
        } else {
          resolve(true);
        }
      }
    );
  });
};

exports.deleteProcessedMessageFromQueue = async (receiptHandle) => {
  if (!receiptHandle) throw new Error("Invalid ReceiptHandle");

  const deleteParams = {
    QueueUrl: messageQueueUrl,
    ReceiptHandle: receiptHandle,
  };

  return new Promise((resolve, reject) => {
    SQS.deleteMessage(deleteParams, function (err, data) {
      if (err) {
        console.log("Error", err);
        reject(err);
      } else {
        resolve(true);
      }
    });
  });
};
